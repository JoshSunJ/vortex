export const BRIDGE_ORIGIN = "http://127.0.0.1:8790";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BridgeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function isHttpUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
function fail(message = "Command did not match the local control protocol") {
  throw new BridgeError("VALIDATION_ERROR", message);
}
function keys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail();
}
function target(value) {
  keys(value, ["tabId", "windowId", "expectedUrl"]);
  if (!integer(value.tabId) || !integer(value.windowId) || !isHttpUrl(value.expectedUrl)) fail();
}

/** Never accept arbitrary actions, extra executable fields, or privileged URLs. */
export function validateCommand(value) {
  if (!value || typeof value !== "object" || !UUID.test(value.id ?? "")) fail();
  if (value.kind === "activate_tab") {
    keys(value, ["id", "kind", "tabId", "windowId", "expectedUrl"]);
    target({ tabId: value.tabId, windowId: value.windowId, expectedUrl: value.expectedUrl });
  } else if (value.kind === "group_tabs") {
    keys(value, ["id", "kind", "tabs", "label"]);
    if (!Array.isArray(value.tabs) || value.tabs.length < 1 || value.tabs.length > 100) fail();
    value.tabs.forEach(target);
    if (new Set(value.tabs.map((t) => t.tabId)).size !== value.tabs.length) fail("Duplicate tab targets");
    if (new Set(value.tabs.map((t) => t.windowId)).size !== 1) fail("Grouping tabs across windows is unsupported");
    if (typeof value.label !== "string" || value.label.length > 500) fail();
  } else if (value.kind === "open_saved_url") {
    keys(value, ["id", "kind", "url"]);
    if (!isHttpUrl(value.url)) fail();
  } else fail("Unsupported browser action");
  return value;
}

export function assertCurrentTarget(tab, expected) {
  if (!tab || tab.incognito || !isHttpUrl(tab.url)) {
    throw new BridgeError("PROTECTED", "Target is unavailable or not an ordinary web tab");
  }
  if (tab.id !== expected.tabId || tab.windowId !== expected.windowId || tab.url !== expected.expectedUrl || tab.pendingUrl) {
    throw new BridgeError("STALE_STATE", "Tab changed after the action was planned");
  }
}

/** Explicit metadata allowlist: never emit incognito, cookies, body text or privileged pages. */
export function tabMetadata(tab) {
  if (tab.incognito || !integer(tab.id) || !integer(tab.windowId) || !isHttpUrl(tab.url)) return null;
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    title: String(tab.title ?? "").slice(0, 500),
    url: tab.url,
    ...(isHttpUrl(tab.pendingUrl) ? { pendingUrl: tab.pendingUrl } : {}),
    active: Boolean(tab.active), pinned: Boolean(tab.pinned), audible: Boolean(tab.audible),
    ...(Number.isFinite(tab.lastAccessed) ? { lastAccessed: tab.lastAccessed } : {}),
  };
}

export function interruptedReceipt(id) {
  return { id, ok: false, code: "STALE_STATE", message: "Browser worker restarted during an action; inspect the browser before creating a new operation" };
}
