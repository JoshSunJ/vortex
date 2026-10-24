import { BRIDGE_ORIGIN } from "./protocol.js";

const form = document.querySelector("#configuration");
const token = document.querySelector("#token");
const status = document.querySelector("#status");
document.querySelector("#extension-id").value = chrome.runtime.id;
document.querySelector("#origin").value = BRIDGE_ORIGIN;

function show(value, enabled) {
  status.textContent = !enabled ? "Stopped. No tab metadata is shared and no browser commands will start." : value ? `${value.message} · ${new Date(value.updatedAt).toLocaleTimeString()}` : "Starting the local bridge…";
}
async function refresh() {
  const config = await chrome.storage.local.get(["token", "enabled", "status"]);
  if (document.activeElement !== token) token.value = config.token ?? "";
  show(config.status, config.enabled);
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = token.value.trim();
  if (value.length < 32 || value.length > 512) { status.textContent = "Use the exact local token supplied by the desktop service (32-512 characters)."; return; }
  await chrome.storage.local.set({ token: value, bridgeOrigin: BRIDGE_ORIGIN, enabled: true });
  await refresh();
});
document.querySelector("#stop").addEventListener("click", async () => {
  await chrome.storage.local.set({ enabled: false });
  await refresh();
});
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") refresh(); });
refresh();
