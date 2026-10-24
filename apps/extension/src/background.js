import { BRIDGE_ORIGIN, BridgeError, assertCurrentTarget, interruptedReceipt, tabMetadata, validateCommand } from "./protocol.js";

let activeLoop = null;
let snapshotInFlight = null;
let connectionVersion = 0;
const RECEIPT_LIMIT = 200;
const POLL_DELAY = 1500;

async function settings() {
  const { enabled = false, token = "", bridgeOrigin = BRIDGE_ORIGIN } = await chrome.storage.local.get(["enabled", "token", "bridgeOrigin"]);
  if (bridgeOrigin !== BRIDGE_ORIGIN) throw new BridgeError("VALIDATION_ERROR", "Bridge address must be the fixed loopback development address");
  return { enabled, token, bridgeOrigin };
}

async function status(state, message) {
  await chrome.storage.local.set({ status: { state, message, updatedAt: new Date().toISOString() } });
  await chrome.action.setBadgeText({ text: state === "connected" ? "ON" : state === "stopped" ? "" : "!" });
  await chrome.action.setBadgeBackgroundColor({ color: state === "connected" ? "#087f8c" : "#946200" });
}

async function request(path, config, body) {
  const response = await fetch(`${BRIDGE_ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    headers: { Authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new BridgeError(response.status === 401 || response.status === 403 ? "FORBIDDEN" : "DEVICE_OFFLINE", "Local bridge rejected or could not complete the request");
  return response.status === 204 ? null : response.json();
}

async function identity() {
  const current = await chrome.storage.session.get(["sessionId", "sequence"]);
  if (!current.sessionId) {
    current.sessionId = crypto.randomUUID(); current.sequence = 0;
    await chrome.storage.session.set(current);
  }
  return current;
}

async function publishSnapshot(config) {
  if (snapshotInFlight) return snapshotInFlight;
  snapshotInFlight = (async () => {
    const state = await identity();
    const tabs = (await chrome.tabs.query({})).map(tabMetadata).filter(Boolean);
    // Persist sequence BEFORE sending; lost posts may create gaps, never backwards sequence.
    const sequence = (state.sequence ?? 0) + 1;
    await chrome.storage.session.set({ sequence });
    await request("/bridge/snapshot", config, { sessionId: state.sessionId, sequence, tabs });
  })().finally(() => { snapshotInFlight = null; });
  return snapshotInFlight;
}

async function readReceipts() { return (await chrome.storage.local.get("receipts")).receipts ?? {}; }
async function saveReceipt(id, value) {
  const receipts = await readReceipts();
  receipts[id] = { ...value, savedAt: Date.now() };
  const completed = Object.entries(receipts).filter(([, r]) => r.state === "done").sort((a, b) => a[1].savedAt - b[1].savedAt);
  while (Object.keys(receipts).length > RECEIPT_LIMIT && completed.length) delete receipts[completed.shift()[0]];
  await chrome.storage.local.set({ receipts });
}

async function mutate(command) {
  if (command.kind === "activate_tab") {
    const tab = await chrome.tabs.get(command.tabId).catch(() => null);
    assertCurrentTarget(tab, command);
    await chrome.tabs.update(command.tabId, { active: true });
    await chrome.windows.update(command.windowId, { focused: true });
    const current = await chrome.tabs.get(command.tabId);
    const window = await chrome.windows.get(command.windowId);
    if (!current.active || !window.focused) throw new BridgeError("FOCUS_DENIED", "Browser did not grant the requested focus");
    if (current.url !== command.expectedUrl || current.pendingUrl) throw new BridgeError("STALE_STATE", "Tab navigated during activation");
    return { tabId: command.tabId };
  }
  if (command.kind === "group_tabs") {
    // Check every target before the first mutation. Grouping never moves a tab to another window.
    const tabs = await Promise.all(command.tabs.map((t) => chrome.tabs.get(t.tabId).catch(() => null)));
    tabs.forEach((tab, i) => assertCurrentTarget(tab, command.tabs[i]));
    const groupId = await chrome.tabs.group({ tabIds: command.tabs.map((t) => t.tabId) });
    await chrome.tabGroups.update(groupId, { title: command.label });
    return {};
  }
  if (command.kind === "open_saved_url") {
    // Checkpoint ownership/hash authorization is performed by the trusted desktop before dispatch.
    const tab = await chrome.tabs.create({ url: command.url, active: false });
    return { tabId: tab.id };
  }
  throw new BridgeError("VALIDATION_ERROR", "Unsupported browser command");
}

async function execute(command, config) {
  let valid;
  try { valid = validateCommand(command); }
  catch { throw new BridgeError("VALIDATION_ERROR", "Bridge supplied an invalid command"); }
  const receipts = await readReceipts();
  const previous = receipts[valid.id];
  let result;
  if (previous?.state === "done") result = previous.result;
  else if (previous?.state === "pending") {
    result = interruptedReceipt(valid.id);
    await saveReceipt(valid.id, { state: "done", result });
  } else {
    // A worker restart after this write cannot blindly repeat a URL open/group mutation.
    await saveReceipt(valid.id, { state: "pending" });
    try { result = { id: valid.id, ok: true, ...await mutate(valid) }; }
    catch (error) {
      const known = error instanceof BridgeError;
      result = { id: valid.id, ok: false, code: known ? error.code : "INTERNAL_ERROR", message: known ? error.message : "Browser action failed; inspect the browser before retrying with a new operation" };
    }
    await saveReceipt(valid.id, { state: "done", result });
  }
  await request("/bridge/results", config, result);
  await publishSnapshot(config);
}

async function loop(version) {
  while (version === connectionVersion) {
    let config;
    try {
      config = await settings();
      if (!config.enabled || !config.token) { await status("stopped", "Bridge is stopped"); return; }
      await publishSnapshot(config);
      const response = await request("/bridge/commands", config);
      if (!response || !Array.isArray(response.commands) || response.commands.length > 10) throw new BridgeError("VALIDATION_ERROR", "Invalid command batch");
      for (const command of response.commands) {
        // Stop or a changed configuration prevents queued actions from starting.
        if (version !== connectionVersion || !(await settings()).enabled) return;
        await execute(command, config);
      }
      await status("connected", "Connected to the local development bridge");
    } catch (error) {
      await status("waiting", error instanceof BridgeError ? error.message : "Local bridge unavailable; check the desktop service and configuration");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY));
  }
}

function startLoop() {
  if (activeLoop) return;
  const version = connectionVersion;
  activeLoop = loop(version).finally(() => {
    activeLoop = null;
    // A configuration change while the old loop was winding down must restart it.
    if (version !== connectionVersion) startLoop();
  });
}

async function wake() {
  await chrome.alarms.create("vortex-watchdog", { periodInMinutes: 0.5 });
  startLoop();
}

function changed() { startLoop(); }
chrome.tabs.onCreated.addListener(changed);
chrome.tabs.onRemoved.addListener(changed);
chrome.tabs.onUpdated.addListener(changed);
chrome.tabs.onActivated.addListener(changed);
chrome.windows.onFocusChanged.addListener(changed);
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "vortex-watchdog") startLoop(); });
chrome.runtime.onInstalled.addListener(wake);
chrome.runtime.onStartup.addListener(wake);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.enabled || changes.token || changes.bridgeOrigin)) {
    connectionVersion += 1;
    startLoop();
  }
});
// Rehydrate each time Chrome recreates this worker. The alarm is a watchdog, not an
// assertion that the worker runs continuously or provides production native messaging.
wake().catch(() => {});
