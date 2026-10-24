"use strict";

const $ = (id) => document.getElementById(id);
const state = { snapshot: null, status: null, workspaces: [], operations: [], selected: new Set(), filter: "all", query: "", view: "workspaces", refreshing: false, pendingPlan: null, noteWorkspaceId: null };
const api = window.vortex;
const friendly = {
  FOCUS_DENIED: "Windows did not allow that window to take focus. It may be minimized; restore or choose it manually, then try again.",
  STALE_STATE: "Something changed since the preview. Refresh your desktop and review the action again.",
  DEVICE_OFFLINE: "The local control service or browser connection is unavailable. Check its setup and refresh.",
  APPROVAL_REQUIRED: "That preview needs a fresh confirmation. Review the action again.",
  EXPIRED: "The preview expired. Choose the action again to create a fresh preview.",
  NEEDS_CLARIFICATION: "No saved primary target is currently available. Open the original resource or create a workspace with an available target.",
  PROVIDER_TIMEOUT: "The browser did not confirm the action in time. Its result may be unknown—check the browser before trying again.",
};

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function notice(message, error = false) {
  $("notice").hidden = !message;
  $("notice").textContent = message || "";
  $("notice").classList.toggle("error", error);
  const dialog = document.querySelector("dialog[open]");
  if (dialog && error) {
    let inline = dialog.querySelector(".dialog-notice");
    if (!inline) { inline = node("p", "notice error dialog-notice"); inline.setAttribute("role", "alert"); dialog.querySelector("h2").after(inline); }
    inline.textContent = message;
  }
}
function errorMessage(error) { return friendly[error?.code] || error?.message || "The action could not be completed. Refresh and try again."; }
async function call(method, ...args) {
  if (!api || typeof api[method] !== "function") throw { code: "DEVICE_OFFLINE", message: "The desktop connection is not available. Launch Vortex through its desktop start command." };
  const result = await api[method](...args);
  if (!result || result.ok !== true) throw result?.error || { message: "The local service returned an unexpected response." };
  return result.data;
}
async function action(button, fn) {
  const previous = button.textContent;
  button.disabled = true;
  try { await fn(); }
  catch (error) { notice(errorMessage(error), true); }
  finally { button.disabled = false; button.textContent = previous; }
}
function resource(id) { return state.snapshot?.resources.find((r) => r.id === id); }
function resourceName(id) { return resource(id)?.title || "Unavailable saved resource"; }
function age(date) {
  const elapsed = Date.now() - Date.parse(date || "");
  if (!Number.isFinite(elapsed)) return "Saved locally";
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) return "Just saved";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
function displayDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString(); }
function empty(container, title, description) {
  const box = node("div", "empty-workspaces");
  box.append(node("span", "empty-symbol", "▦"));
  const copy = node("div"); copy.append(node("strong", "", title), node("p", "", description)); box.append(copy);
  container.append(box);
}

function setView(view) {
  state.view = view;
  for (const name of ["workspaces", "activity", "connect"]) $(`${name}-view`).hidden = name !== view;
  for (const button of document.querySelectorAll("[data-view]")) button.classList.toggle("active", button.dataset.view === view);
  const copy = {
    workspaces: ["Workspaces", "Pick up where you left off.", "Bring your tabs, windows and next steps together."],
    activity: ["Activity", "Every action, accounted for.", "See what happened and what still needs attention."],
    connect: ["Connect browser", "Connect once. Keep your place.", "Add browser tabs to your local desktop workspace."],
  }[view];
  $("view-breadcrumb").textContent = copy[0]; $("page-title").textContent = copy[1]; $("page-description").textContent = copy[2];
}
function renderStats() {
  const resources = state.snapshot?.resources || [];
  $("window-count").textContent = String(resources.filter((r) => r.kind === "window").length);
  $("tab-count").textContent = String(resources.filter((r) => r.kind === "tab").length);
  $("workspace-count").textContent = String(state.workspaces.length);
  $("nav-count").textContent = String(state.workspaces.length);
  const connected = state.status?.browserConnected === true;
  $("browser-status").textContent = connected ? "Browser connected" : "Browser not connected";
  $("browser-description").textContent = connected ? "Ordinary web tabs · local only" : "App windows are ready to use";
  $("browser-dot").classList.toggle("connected", connected); $("nav-browser").classList.toggle("connected", connected);
  $("connect-shortcut").textContent = connected ? "Settings →" : "Set up →";
  if (state.status?.extensionId && document.activeElement !== $("extension-id")) $("extension-id").value = state.status.extensionId;
}
function updateSelection() {
  $("selected-count").textContent = `${state.selected.size} selected`;
  $("clear-selection").disabled = state.selected.size === 0;
  $("create-open").disabled = state.selected.size === 0 || !state.snapshot;
}
function renderResources() {
  const container = $("resource-list"); container.replaceChildren();
  const all = state.snapshot?.resources || [];
  const query = state.query.trim().toLocaleLowerCase();
  const shown = all.filter((r) => (state.filter === "all" || r.kind === state.filter) && (!query || query.split(/\s+/).every(word => `${r.title} ${r.appName || ""} ${r.url || ""}`.toLocaleLowerCase().includes(word))));
  $("resource-count").textContent = String(all.length);
  if (!shown.length) container.append(node("div", "empty-resources", all.length ? "No matching windows or tabs. Try another search." : "No windows are available yet. Open an application, then refresh. Browser tabs need the extension connection."));
  for (const item of shown) {
    const card = node("article", "resource-card"); card.classList.toggle("selected", state.selected.has(item.id));
    const top = node("div", "resource-card-top");
    const kind = node("div", "resource-kind"); kind.append(node("span", "resource-icon", item.kind === "tab" ? "▤" : "▣"), node("span", "", item.kind === "tab" ? "Browser tab" : "App window"));
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = state.selected.has(item.id); checkbox.setAttribute("aria-label", `Select ${item.title || "untitled resource"}`);
    checkbox.addEventListener("change", () => { checkbox.checked ? state.selected.add(item.id) : state.selected.delete(item.id); card.classList.toggle("selected", checkbox.checked); updateSelection(); });
    top.append(kind, checkbox);
    const title = node("h3", "resource-title", item.title || "Untitled"); title.title = item.title || "Untitled";
    let detail = item.appName || "Windows application";
    if (item.kind === "tab") { try { detail = new URL(item.url).hostname; } catch { detail = "Web tab"; } }
    const foot = node("div", "resource-footer"), status = node("span", "resource-state", item.active ? "Active" : "Available");
    if (item.active) { status.classList.add("active"); status.prepend(node("span", "tiny-dot")); }
    const focus = node("button", "focus-button", "Focus ↗"); focus.type = "button";
    focus.addEventListener("click", () => action(focus, async () => showPreview(await call("previewResource", item.id))));
    foot.append(status, focus); card.append(top, title, node("p", "resource-detail", detail), foot); container.append(card);
  }
  updateSelection();
}
function renderWorkspaces() {
  const container = $("workspace-list"); container.replaceChildren();
  if (!state.workspaces.length) { empty(container, "Your next task starts here.", "Select open resources below, then create your first workspace. Nothing is closed or moved automatically."); return; }
  for (const entry of state.workspaces) {
    const workspace = entry.workspace || entry;
    const checkpoint = entry.latestCheckpoint;
    const card = node("article", "workspace-card");
    const top = node("div", "workspace-top"); top.append(node("span", "workspace-label", "TASK WORKSPACE"), node("span", "workspace-age", age(workspace.updatedAt)));
    const live = workspace.resourceIds.filter((id) => resource(id));
    const unavailable = workspace.resourceIds.length - live.length;
    const meta = node("div", "workspace-meta"); meta.append(node("span", "", `${workspace.resourceIds.length} resources`), node("span", "", `${live.length} available`));
    if (unavailable) meta.append(node("span", "", `${unavailable} unavailable`));
    card.append(top, node("h3", "", workspace.name), node("p", "workspace-goal", workspace.goal || "No goal added yet"), meta);
    card.append(node("p", "workspace-note", checkpoint?.userNote || "Leave a checkpoint to remember your next step."));
    const actions = node("div", "workspace-actions");
    const resume = node("button", "button primary", "Resume ↗"); resume.type = "button";
    resume.addEventListener("click", () => action(resume, async () => showPreview(await call("previewWorkspace", workspace.id, "resume"))));
    const note = node("button", "button secondary", "Save checkpoint"); note.type = "button";
    note.addEventListener("click", () => { state.noteWorkspaceId = workspace.id; $("note-description").textContent = `For ${workspace.name}. Save the context you want to return to.`; $("checkpoint-note").value = checkpoint?.userNote || ""; $("note-dialog").showModal(); });
    actions.append(resume, note); card.append(actions); container.append(card);
  }
}
function renderOperations() {
  const container = $("operation-list"); container.replaceChildren();
  if (!state.operations.length) { empty(container, "No actions yet.", "Approved focus and resume actions will appear here with their real outcomes."); return; }
  for (const operation of state.operations) {
    const row = node("article", "operation-row"), copy = node("div");
    const succeeded = (operation.results || []).filter((r) => r.status === "succeeded").length;
    const total = (operation.results || []).length;
    copy.append(node("strong", "", `${succeeded} of ${total} actions confirmed`), node("p", "", displayDate(operation.updatedAt)));
    const failed = (operation.results || []).find((r) => r.code);
    if (failed) copy.append(node("p", "", friendly[failed.code] || failed.code.replaceAll("_", " ").toLocaleLowerCase()));
    const chip = node("span", `status-chip ${operation.status}`, operation.status === "succeeded" ? "Completed" : operation.status.charAt(0).toUpperCase() + operation.status.slice(1));
    row.append(copy, chip); container.append(row);
  }
}
function fillPrimarySelect(id, resources, placeholder) {
  const select = $(id); select.replaceChildren();
  const none = document.createElement("option"); none.value = ""; none.textContent = placeholder; select.append(none);
  for (const item of resources) { const option = document.createElement("option"); option.value = item.id; option.textContent = item.title || "Untitled"; select.append(option); }
  select.disabled = resources.length === 0;
  if (resources.length) select.value = resources[0].id;
}
function createDialog() {
  const chosen = (state.snapshot?.resources || []).filter((r) => state.selected.has(r.id));
  if (!chosen.length) { notice("Select a window or tab first."); return; }
  $("create-description").textContent = `${chosen.length} selected resources. Choose the primary targets you want to return to.`;
  $("workspace-name").value = ""; $("workspace-goal").value = "";
  fillPrimarySelect("primary-tab", chosen.filter((r) => r.kind === "tab"), "No primary browser tab");
  fillPrimarySelect("primary-window", chosen.filter((r) => r.kind === "window"), "No primary app window");
  $("create-dialog").showModal();
}
function showPreview(plan) {
  state.pendingPlan = plan;
  $("preview-description").textContent = plan.explanation || "Review the exact resources below. No action has run yet.";
  const container = $("preview-actions"); container.replaceChildren();
  const labels = { activate_tab: "Activate browser tab", focus_window: "Focus app window", group_tabs: "Group selected browser tabs", open_saved_url: "Reopen saved source" };
  for (const entry of plan.actions || []) {
    const value = entry.action, row = node("div", "preview-row"); row.append(node("strong", "", labels[value.kind] || value.kind.replaceAll("_", " ")));
    let names = "";
    if (value.target) names = resourceName(value.target.resourceId);
    else if (value.targets) names = value.targets.map((t) => resourceName(t.resourceId)).join(" · ");
    else if (value.url) names = value.url;
    row.append(node("p", "", names)); container.append(row);
  }
  $("preview-final-focus").textContent = plan.finalFocusResourceId ? `Final keyboard focus: ${resourceName(plan.finalFocusResourceId)}. Windows may still refuse activation.` : "Only the listed actions will run. Closed native applications are not recreated.";
  $("preview-dialog").showModal();
}
function checkpointDraft(workspaceId, name, note) {
  state.noteWorkspaceId = workspaceId;
  $("note-description").textContent = `For ${name}. Review your note, then save it locally.`;
  $("checkpoint-note").value = note || "";
  $("note-dialog").showModal();
}
let commandGeneration = 0;
function requestReply(code) { document.dispatchEvent(new CustomEvent("vortex:reply", { detail: { code } })); }
async function reviewCommand(text, options = {}) {
  const generation = ++commandGeneration;
  const outcome = await call("previewCommand", text);
  if (generation !== commandGeneration || (options.canApply && !options.canApply())) return;
  options.beforeApply?.();
  const container = $("command-result"); container.replaceChildren(); container.hidden = false;
  let replyCode = "help";
  if (outcome.kind === "plan") { container.append(node("p", "field-note", "Target resolved. Review the exact focus actions.")); showPreview(outcome.plan); replyCode = "preview"; }
  else if (outcome.kind === "find") {
    setView("workspaces"); state.query = outcome.query; state.filter = "all"; $("search").value = outcome.query;
    for (const button of document.querySelectorAll("[data-filter]")) button.classList.toggle("active", button.dataset.filter === "all");
    await refresh(true); renderResources();
    container.append(node("p", "field-note", `${outcome.resources.length} matching open resources. Find does not change window focus.`));
    replyCode = outcome.resources.length ? "found" : "empty";
  } else if (outcome.kind === "create_workspace") {
    setView("workspaces"); createDialog();
    if ($("create-dialog").open) { $("workspace-name").value = outcome.name; replyCode = "create"; }
    else { container.append(node("p", "field-note", `Select the windows or tabs for “${outcome.name}”, then review this command again.`)); replyCode = "select"; }
  } else if (outcome.kind === "checkpoint") { checkpointDraft(outcome.workspaceId, outcome.workspaceName, outcome.userNote); replyCode = "checkpoint"; }
  else {
    container.append(node("p", "field-note", outcome.message));
    const choices = node("div", "command-choices");
    for (const choice of outcome.choices || []) {
      const button = node("button", "button secondary", choice.label); button.type = "button";
      button.addEventListener("click", () => action(button, async () => {
        if (outcome.intent === "checkpoint" && choice.kind === "workspace") checkpointDraft(choice.id, choice.label, outcome.userNote);
        else showPreview(await call(choice.kind === "workspace" ? "previewWorkspace" : "previewResource", choice.id, outcome.intent === "resume" ? "resume" : "focus"));
      }));
      choices.append(button);
    }
    container.append(choices);
    replyCode = outcome.choices?.length ? "choose" : "help";
  }
  if (generation === commandGeneration) requestReply(replyCode);
}
async function refresh(quiet = false) {
  if (state.refreshing || document.querySelector("dialog[open]")) return;
  state.refreshing = true; $("refresh").disabled = true;
  const results = await Promise.allSettled([call("snapshot"), call("status"), call("listWorkspaces"), call("listOperations")]);
  try {
    if (results[0].status === "fulfilled") {
      state.snapshot = results[0].value;
      const live = new Set((state.snapshot.resources || []).map((r) => r.id));
      for (const id of state.selected) if (!live.has(id)) state.selected.delete(id);
      $("last-refreshed").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Live local inventory`;
    } else { if (!quiet) notice(errorMessage(results[0].reason), true); $("last-refreshed").textContent = "Local inventory is unavailable; the last view may be out of date."; }
    if (results[1].status === "fulfilled") state.status = results[1].value;
    if (results[2].status === "fulfilled") state.workspaces = results[2].value.workspaces || [];
    if (results[3].status === "fulfilled") state.operations = results[3].value.operations || [];
    const failure = results.slice(1).find((r) => r.status === "rejected");
    if (!quiet && failure) notice(errorMessage(failure.reason), true);
    renderStats(); renderResources(); renderWorkspaces(); renderOperations();
  } finally { state.refreshing = false; $("refresh").disabled = false; }
}

for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => setView(button.dataset.view));
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => { stopSpokenReply(); $(button.dataset.close).close(); });
for (const dialog of document.querySelectorAll("dialog")) dialog.addEventListener("close", () => { dialog.querySelector(".dialog-notice")?.remove(); if (dialog.id === "preview-dialog") state.pendingPlan = null; });
for (const button of document.querySelectorAll("[data-filter]")) button.addEventListener("click", () => { state.filter = button.dataset.filter; for (const item of document.querySelectorAll("[data-filter]")) item.classList.toggle("active", item === button); renderResources(); });
$("search").addEventListener("input", () => { state.query = $("search").value; renderResources(); });
$("command-form").addEventListener("submit", event => { event.preventDefault(); action($("command-submit"), () => reviewCommand($("command-text").value.trim())); });
$("refresh").addEventListener("click", () => refresh());
$("connect-refresh").addEventListener("click", () => refresh());
$("connect-shortcut").addEventListener("click", () => setView("connect"));
$("clear-selection").addEventListener("click", () => { state.selected.clear(); renderResources(); });
$("create-open").addEventListener("click", createDialog);
$("create-form").addEventListener("submit", (event) => { event.preventDefault(); const button = event.submitter; action(button, async () => {
  const name = $("workspace-name").value.trim();
  if (!name) { $("workspace-name").focus(); return; }
  const primaryTabId = $("primary-tab").value || undefined, primaryWindowId = $("primary-window").value || undefined;
  if (!primaryTabId && !primaryWindowId) throw { message: "Choose at least one primary target so this workspace can be focused." };
  await call("createWorkspace", { name, goal: $("workspace-goal").value.trim(), selectedResourceIds: [...state.selected], ...(primaryTabId ? { primaryTabId } : {}), ...(primaryWindowId ? { primaryWindowId } : {}), expectedSnapshotRevision: state.snapshot.revision });
  $("create-dialog").close(); state.selected.clear(); notice(`“${name}” saved on this computer.`); await refresh(true);
}); });
$("confirm-action").addEventListener("click", () => action($("confirm-action"), async () => {
  const plan = state.pendingPlan; if (!plan) return;
  const operation = await call("executeApproved", plan.id, plan.planHash, plan.snapshotRevision);
  $("preview-dialog").close();
  if (operation.status === "succeeded") { notice("The approved focus actions completed."); requestReply("succeeded"); }
  else {
    const failed = (operation.results || []).find((r) => r.code);
    notice(failed ? (friendly[failed.code] || "The action was not fully confirmed. Check Activity for its outcome.") : "The action did not fully complete. Check Activity before retrying.", true);
    requestReply("failed");
  }
  await refresh(true);
}));
$("note-form").addEventListener("submit", (event) => { event.preventDefault(); action(event.submitter, async () => {
  await call("saveCheckpoint", { workspaceId: state.noteWorkspaceId, userNote: $("checkpoint-note").value.trim() });
  $("note-dialog").close(); notice("Checkpoint saved locally. Your note is ready when you return."); await refresh(true);
}); });
$("extension-form").addEventListener("submit", (event) => { event.preventDefault(); action(event.submitter, async () => {
  const id = $("extension-id").value.trim();
  if (!/^[a-p]{32}$/.test(id)) throw { message: "Paste the complete 32-character extension ID from Chrome or Edge’s extension page." };
  await call("setExtensionId", id); notice("Extension ID saved. Copy the local token, then start the connection in the extension’s options."); await refresh(true);
}); });
$("copy-token").addEventListener("click", () => action($("copy-token"), async () => { await call("copyBridgeToken"); notice("Local connection token copied. Paste it only into your Vortex extension options."); }));
$("open-extension-folder").addEventListener("click", () => action($("open-extension-folder"), async () => { await call("openExtensionFolder"); notice("Extension folder opened. Use Load unpacked on Chrome or Edge’s extensions page."); }));

setView("workspaces"); renderStats(); renderWorkspaces(); renderResources(); renderOperations();
refresh();
setInterval(() => { if (!document.hidden && !document.querySelector("dialog[open]")) refresh(true); }, 5000);
