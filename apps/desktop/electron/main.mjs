import { app, BrowserWindow, ipcMain, shell, clipboard, session } from "electron";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { CartesiaVoice, VoiceError } from "./voice.mjs";
import { CartesiaReplies } from "./replies.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const desktop = resolve(here, "..");
const configPath = resolve(desktop, ".vortex/control.json");
const extensionPath = resolve(repo, "apps/extension");
const uiPath = resolve(desktop, "ui/index.html");
const uiUrl = pathToFileURL(uiPath).href;
const getCartesiaKey = () => {
  const fromEnvironment = process.env.CARTESIA_API_KEY?.trim();
  if (fromEnvironment) return fromEnvironment;
  try { return parseEnv(readFileSync(resolve(desktop, ".env.local"), "utf8")).CARTESIA_API_KEY?.trim() || undefined; }
  catch { return undefined; }
};
const voice = new CartesiaVoice(getCartesiaKey);
const replies = new CartesiaReplies(getCartesiaKey);
let window;
let backend;
let startupError;

app.setName("Vortex");
app.setAppUserModelId("com.vortex.desktop");
const appData = resolve(desktop, ".vortex/electron");
mkdirSync(appData, { recursive: true });
app.setPath("userData", appData);
app.setPath("sessionData", appData);
app.setPath("crashDumps", resolve(appData, "crash-dumps"));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on("second-instance", () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });

function config() { return JSON.parse(readFileSync(configPath, "utf8")); }
async function request(path, body) {
  const value = config();
  const response = await fetch(`http://127.0.0.1:8790${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${value.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  return response.json();
}
function localResult(data) { return { schemaVersion: "1.0", requestId: randomUUID(), ok: true, data }; }
function localError(message, code = "DEVICE_OFFLINE") { return { schemaVersion: "1.0", requestId: randomUUID(), ok: false, error: { code, message, retryable: ["DEVICE_OFFLINE", "PROVIDER_TIMEOUT"].includes(code) } }; }
function id(value) { if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw Error("Invalid resource identifier."); return value; }

async function startBackend() {
  try {
    if ((await request("/control/status")).ok) {
      const probe = await request("/control/commands/preview", { text: "help" });
      if (probe.ok) return;
      throw Error("Stop the older Vortex controller on port 8790, then reopen this app.");
    }
  } catch (error) { if (error.message?.startsWith("Stop the older")) throw error; }
  const node = process.env.VORTEX_NODE_PATH;
  if (!node) throw Error("Start Vortex using npm run desktop -w @vortex/desktop so its Node runtime is available.");
  backend = spawn(node, ["--import", "tsx", resolve(desktop, "src/cli.ts"), "start"], { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
  backend.on("error", () => { startupError = "The local controller could not start. Check the setup instructions."; });
  backend.stdout.on("data", () => {});
  backend.stderr.on("data", () => {}); // Do not forward process data, tokens or private titles to the renderer.
  for (let i = 0; i < 60; i++) {
    try { if ((await request("/control/status")).ok) return; } catch {}
    if (startupError) throw Error(startupError);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw Error("The local controller did not become ready. Port 8790 may be in use.");
}

const methods = {
  snapshot: () => request("/control/snapshot"),
  status: () => request("/control/status"),
  listWorkspaces: () => request("/control/workspaces"),
  createWorkspace: value => request("/control/workspaces", value),
  previewResource: resourceId => request("/control/focus", { resourceId: id(resourceId) }),
  previewWorkspace: (workspaceId, mode) => {
    if (!["focus", "resume"].includes(mode)) throw Error("Unsupported workspace action.");
    return request("/control/workspace-preview", { workspaceId: id(workspaceId), mode });
  },
  executeApproved: async (planId, planHash, expectedRevision) => {
    id(planId);
    if (typeof planHash !== "string" || !/^[a-f0-9]{64}$/.test(planHash) || !Number.isSafeInteger(expectedRevision)) throw Error("Invalid action approval.");
    const approval = await request(`/control/plans/${planId}/approve`, { planHash, confirmed: true });
    if (!approval.ok) return approval;
    return request(`/control/plans/${planId}/execute`, { operationId: randomUUID(), expectedRevision, approvalId: approval.data.approvalId });
  },
  saveCheckpoint: value => request("/control/checkpoints", value),
  previewCommand: text => request("/control/commands/preview", { text }),
  voiceStatus: () => localResult(voice.status()),
  beginVoiceCapture: value => {
    if (value?.consent !== true) throw new VoiceError("FORBIDDEN", "Agree to send this recording to Cartesia first.");
    replies.cancel();
    return localResult(voice.arm());
  },
  speakStatus: async code => {
    if (voice.canRecord() || voice.inflight) throw new VoiceError("PROTECTED", "Finish recording before starting a voice reply.");
    return localResult(await replies.speak(code));
  },
  cancelSpeech: () => localResult(replies.cancel()),
  transcribeVoice: async value => localResult(await voice.transcribe(value)),
  cancelVoice: captureId => localResult(voice.cancel(captureId)),
  listOperations: () => request("/control/operations"),
  setExtensionId: extensionId => request("/control/settings/extension", { extensionId }),
  copyBridgeToken: () => { clipboard.writeText(config().token); return localResult({ copied: true }); },
  openExtensionFolder: async () => {
    const error = await shell.openPath(extensionPath);
    if (error) throw Error("The extension folder could not be opened.");
    return localResult({ opened: true });
  },
};

for (const [name, method] of Object.entries(methods)) {
  ipcMain.handle(`vortex:${name}`, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== uiUrl) return localError("Request came from an untrusted page.");
    if (startupError) return localError(startupError);
    try { return await method(...args); } catch (error) {
      return error instanceof VoiceError ? localError(error.message, error.code) : localError("The local action could not be completed. Refresh the app and try again.");
    }
  });
}

// Let the ESM entry module finish before waiting for Electron's ready event.
app.whenReady().then(async () => {
const trustedMedia = (contents, details) => Boolean(window && contents === window.webContents && contents.getURL() === uiUrl && details.isMainFrame === true && details.requestingUrl === uiUrl && voice.canRecord());
session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
  callback(permission === "media" && trustedMedia(contents, details) && details.mediaTypes?.length === 1 && details.mediaTypes[0] === "audio");
});
session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => permission === "media" && details.mediaType === "audio" && trustedMedia(contents, details));
window = new BrowserWindow({
  width: 1280, height: 850, minWidth: 1020, minHeight: 700,
  title: "Vortex - Your work, ready to resume", backgroundColor: "#09121d", autoHideMenuBar: true, show: false,
  webPreferences: { preload: resolve(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
});
window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
window.webContents.on("will-navigate", (event, url) => { if (url !== uiUrl) event.preventDefault(); });
window.webContents.on("will-attach-webview", event => event.preventDefault());
window.once("ready-to-show", () => window.show());
try { await startBackend(); } catch (error) { startupError = error.message; }
await window.loadFile(uiPath);
}).catch(() => { console.error("Vortex could not initialize its desktop window."); app.quit(); });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { if (backend && backend.exitCode === null) backend.kill(); });
