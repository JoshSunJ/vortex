import { createHash, randomUUID } from "node:crypto";
import { Plan as PlanSchema, Workspace as WorkspaceSchema, Source as SourceSchema, Checkpoint as CheckpointSchema, type Resource, type Snapshot, type Plan, type Workspace, type Operation, type Checkpoint, type Source, type Action } from "@vortex/contracts";
import { Journal } from "./journal.ts";
import { BrowserBridge, type BrowserTab } from "./browser.ts";
import { type NativeWindow, type WindowsAdapter } from "./windows.ts";
import { ControlError, ensure } from "./errors.ts";

const LOCAL_CAPABILITIES = ["activate_tab", "group_tabs", "focus_window", "open_saved_url"] as const;
type Binding = { kind: "window"; window: NativeWindow } | { kind: "tab"; tab: BrowserTab; sessionId: string };
type Registered = { resource: Resource; binding: Binding; fingerprint: string };
type SavedOperation = { hash: string; operation: Operation };

/** Shared deterministic plan-hash algorithm for Andrew/Nova: recursive sorted object keys. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function hashPlan(plan: Omit<Plan, "planHash"> | Plan) {
  const { planHash: _ignored, ...content } = plan as Plan;
  return createHash("sha256").update(canonical(content)).digest("hex");
}

/** One local writer. It owns only desktop effects, not Andrew's task/brief persistence. */
export class ControlEngine {
  readonly deviceId: string;
  readonly sessionId = randomUUID();
  private revision: number;
  private inventory = new Map<string, Registered>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly journal: Journal, readonly browser: BrowserBridge, readonly windows: WindowsAdapter) {
    this.deviceId = journal.id("deviceId");
    this.revision = (journal.get<number>("revision") ?? 0) + 1;
    journal.set("revision", this.revision);
  }
  async getSnapshot(): Promise<Snapshot> {
    const next = new Map<string, Registered>();
    const now = new Date().toISOString();
    const add = (key: string, binding: Binding, fields: Partial<Resource>) => {
      const id = this.journal.id(`resource-id:${key}`);
      const previous = this.inventory.get(id);
      const saved = this.journal.get<{ firstObservedAt: string; revision: number; fingerprint: string }>(`resource:${id}`);
      const fingerprint = canonical({ ...fields, active: undefined, lastActivatedAt: undefined });
      const resource: Resource = {
        id, deviceId: this.deviceId, sessionId: this.sessionId,
        revision: (saved?.revision ?? 0) + (saved && saved.fingerprint !== fingerprint ? 1 : 0),
        kind: binding.kind, title: "", active: false, protectedByUser: previous?.resource.protectedByUser ?? false,
        firstObservedAt: saved?.firstObservedAt ?? now, capabilities: [], ...fields,
      };
      if (resource.active) resource.lastActivatedAt = now;
      else if (previous?.resource.lastActivatedAt) resource.lastActivatedAt = previous.resource.lastActivatedAt;
      this.journal.set(`resource:${id}`, { firstObservedAt: resource.firstObservedAt, revision: resource.revision, fingerprint });
      next.set(id, { resource, binding, fingerprint });
    };
    for (const window of await this.windows.list()) add(`window:${window.handle}:${window.processId}:${window.processStartedAt}`, { kind: "window", window }, {
      title: window.title, appName: window.appName, active: window.active, capabilities: ["focus_window"],
    });
    const live = this.browser.current();
    for (const tab of live?.tabs ?? []) {
      if (!tab.url) continue;
      add(`tab:${live!.sessionId}:${tab.tabId}`, { kind: "tab", tab, sessionId: live!.sessionId }, {
        title: tab.title, url: tab.url, active: tab.active, pinned: tab.pinned, audible: tab.audible,
        capabilities: ["activate_tab", "group_tabs"],
      });
    }
    const changed = next.size !== this.inventory.size || [...next].some(([id,r]) => r.fingerprint !== this.inventory.get(id)?.fingerprint);
    this.inventory = next;
    if (changed) { this.revision++; this.journal.set("revision", this.revision); }
    return { schemaVersion: "1.0", deviceId: this.deviceId, sessionId: this.sessionId, revision: this.revision, capturedAt: now, resources: [...next.values()].map(x => x.resource), capabilities: [...LOCAL_CAPABILITIES] };
  }
  registerPlan(input: unknown): Plan {
    const plan = PlanSchema.parse(input);
    ensure(plan.deviceId === this.deviceId, "FORBIDDEN", "Plan belongs to a different device.");
    ensure(Date.parse(plan.expiresAt) > Date.now() && Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) <= 120_000 && Date.parse(plan.createdAt) <= Date.now() + 5_000, "EXPIRED", "Plan must expire within two minutes of creation.");
    ensure(plan.planHash === hashPlan(plan), "VALIDATION_ERROR", "Plan hash does not match its exact contents.");
    ensure(plan.actions.length > 0 && plan.actions.every(a => (LOCAL_CAPABILITIES as readonly string[]).includes(a.action.kind)), "VALIDATION_ERROR", "This control slice supports only browser/native focus, grouping and authorized saved URLs.");
    const saved = this.journal.get<Plan>(`plan:${plan.id}`);
    ensure(!saved || saved.planHash === plan.planHash, "IDEMPOTENCY_CONFLICT", "Plan ID was reused with different actions.");
    this.journal.set(`plan:${plan.id}`, plan);
    return plan;
  }
  private savePlan(actions: Plan["actions"], snapshot: Snapshot, explanation: string, finalFocusResourceId?: string, workspaceId?: string): Plan {
    const plan: Plan = {
      kind: "plan", id: randomUUID(), commandId: randomUUID(), deviceId: this.deviceId,
      snapshotRevision: snapshot.revision, actions, explanation, approvalRequired: true,
      planHash: "", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(),
      ...(finalFocusResourceId ? { finalFocusResourceId } : {}), ...(workspaceId ? { workspaceId } : {}),
    };
    plan.planHash = hashPlan(plan);
    return this.registerPlan(plan);
  }
  async planResourceFocus(id: string): Promise<Plan> {
    const snapshot = await this.getSnapshot();
    const found = snapshot.resources.find(r => r.id === id);
    ensure(found, "NOT_FOUND", "Selected resource no longer exists.");
    const action: Action = { kind: found.kind === "tab" ? "activate_tab" : "focus_window", target: { resourceId: id, expectedRevision: found.revision } };
    return this.savePlan([{ actionId: randomUUID(), action }], snapshot, "Focus the explicitly selected live resource.", id);
  }
  async planWorkspaceFocus(input: unknown, expectedSnapshotRevision: number): Promise<Plan> {
    const workspace = WorkspaceSchema.parse(input);
    const snapshot = await this.getSnapshot();
    ensure(workspace.deviceId === this.deviceId, "FORBIDDEN", "Workspace belongs to a different device.");
    ensure(snapshot.revision === expectedSnapshotRevision, "STALE_STATE", "Refresh the snapshot before planning workspace focus.");
    const actions: Plan["actions"] = [];
    const missing: string[] = [];
    for (const [id, kind] of [[workspace.primaryTabId, "tab"], [workspace.primaryWindowId, "window"]] as const) {
      if (!id) continue;
      ensure(workspace.resourceIds.includes(id), "VALIDATION_ERROR", "Primary target is not a selected workspace member.");
      const resource = snapshot.resources.find(r => r.id === id);
      if (!resource) { missing.push(id); continue; }
      ensure(resource.kind === kind, "VALIDATION_ERROR", "Primary target has the wrong resource kind.");
      actions.push({ actionId: randomUUID(), action: { kind: kind === "tab" ? "activate_tab" : "focus_window", target: { resourceId: id, expectedRevision: resource.revision } } });
    }
    ensure(actions.length, "NEEDS_CLARIFICATION", "No saved primary target is live. Select an available member; no window was guessed by title.");
    const final = actions.at(-1)!.action;
    return this.savePlan(actions, snapshot, `Focus saved primary targets.${missing.length ? ` ${missing.length} native/tab target(s) unavailable.` : ""}`, "target" in final ? final.target.resourceId : undefined, workspace.id);
  }
  /** Called by the trusted checkpoint service, never a model or browser content script. */
  registerCheckpointSources(input: unknown, inputs: unknown[]) {
    const checkpoint = CheckpointSchema.parse(input);
    ensure(checkpoint.resourceSnapshots.every(r => r.deviceId === this.deviceId), "FORBIDDEN", "Checkpoint contains resources from a different device.");
    const sources = inputs.map(s => SourceSchema.parse(s));
    ensure(sources.every(s => checkpoint.sourceIds.includes(s.id)), "VALIDATION_ERROR", "Source is not part of the checkpoint.");
    this.journal.set(`checkpoint:${checkpoint.id}`, { checkpoint, sources: sources.map(({ text: _text, ...s }) => s) });
  }
  async planWorkspaceResume(input: unknown, expectedSnapshotRevision: number): Promise<Plan> {
    const workspace = WorkspaceSchema.parse(input);
    // First slice deliberately uses live primary members. Reopening needs a trusted registered checkpoint.
    return this.planWorkspaceFocus(workspace, expectedSnapshotRevision);
  }
  approvePlan(planId: string, planHash: string) {
    const plan = this.journal.get<Plan>(`plan:${planId}`);
    ensure(plan && plan.planHash === planHash, "NOT_FOUND", "Plan was not found or its contents changed.");
    ensure(Date.parse(plan.expiresAt) > Date.now(), "EXPIRED", "Plan expired; create a new preview.");
    const approval = { approvalId: randomUUID(), expiresAt: plan.expiresAt };
    this.journal.set(`approval:${approval.approvalId}`, { ...approval, planId, planHash });
    return approval;
  }
  getOperation(id: string) {
    const saved = this.journal.get<SavedOperation>(`operation:${id}`);
    ensure(saved, "NOT_FOUND", "Operation not found.");
    return saved.operation;
  }
  cancelOperation(id: string) { this.getOperation(id); this.journal.set(`cancel:${id}`, true); return this.getOperation(id); }
  executePlan(planId: string, req: { operationId: string; expectedRevision: number; approvalId?: string }): Promise<Operation> {
    const next = this.tail.then(() => this.executeSerial(planId, req));
    this.tail = next.catch(() => {});
    return next;
  }
  private async executeSerial(planId: string, req: { operationId: string; expectedRevision: number; approvalId?: string }): Promise<Operation> {
    const hash = canonical({ planId, ...req });
    const saved = this.journal.get<SavedOperation>(`operation:${req.operationId}`);
    if (saved) { ensure(saved.hash === hash, "IDEMPOTENCY_CONFLICT", "Operation ID was reused with different contents."); return saved.operation; }
    const plan = this.journal.get<Plan>(`plan:${planId}`);
    ensure(plan, "NOT_FOUND", "Plan not found.");
    ensure(Date.parse(plan.expiresAt) > Date.now(), "EXPIRED", "Plan expired; request a new preview.");
    const approval = req.approvalId ? this.journal.get<{ planId: string; planHash: string; expiresAt: string }>(`approval:${req.approvalId}`) : undefined;
    ensure(approval && approval.planId === plan.id && approval.planHash === plan.planHash && Date.parse(approval.expiresAt) > Date.now(), "APPROVAL_REQUIRED", "Approve this exact local plan before execution.");
    const snapshot = await this.getSnapshot();
    ensure(snapshot.revision === req.expectedRevision && snapshot.revision === plan.snapshotRevision, "STALE_STATE", "The inventory changed after preview. Refresh and approve a new plan.");
    const operation: Operation = { id: req.operationId, planId, status: "running", results: plan.actions.map(a => ({ actionId: a.actionId, status: "pending" })), updatedAt: new Date().toISOString() };
    const save = () => { operation.updatedAt = new Date().toISOString(); this.journal.set(`operation:${operation.id}`, { hash, operation }); };
    save(); // An unpersisted intent must never reach the browser or Windows.
    let stopped = false;
    for (let i = 0; i < plan.actions.length; i++) {
      const result = operation.results[i]!;
      if (stopped || this.journal.get(`cancel:${operation.id}`)) { result.status = "skipped"; stopped = true; save(); continue; }
      result.status = "running"; save();
      try { await this.perform(plan.actions[i]!.action); result.status = "succeeded"; }
      catch (err) { result.status = err instanceof ControlError && err.code === "PROVIDER_TIMEOUT" ? "unknown" : "failed"; result.code = err instanceof ControlError ? err.code : "INTERNAL_ERROR"; stopped = true; }
      save();
    }
    const succeeded = operation.results.filter(r => r.status === "succeeded").length;
    operation.status = this.journal.get(`cancel:${operation.id}`) ? "cancelled" : succeeded === operation.results.length ? "succeeded" : succeeded > 0 || operation.results.some(r => r.status === "unknown") ? "partial" : "failed";
    save(); return operation;
  }
  private async perform(action: Action) {
    await this.getSnapshot(); // Recheck before every effect, including after earlier actions in the plan.
    const target = (id: string, revision: number, kind: "tab" | "window") => {
      const found = this.inventory.get(id);
      ensure(found && found.resource.revision === revision && found.resource.kind === kind, "STALE_STATE", "Target disappeared, navigated or changed identity.");
      return found;
    };
    if (action.kind === "focus_window") {
      const found = target(action.target.resourceId, action.target.expectedRevision, "window");
      ensure(found.binding.kind === "window", "STALE_STATE", "Native binding missing.");
      await this.windows.focus(found.binding.window);
    } else if (action.kind === "activate_tab") {
      const found = target(action.target.resourceId, action.target.expectedRevision, "tab");
      ensure(found.binding.kind === "tab" && found.binding.tab.url, "STALE_STATE", "Browser binding missing.");
      const tab = found.binding.tab;
      await this.browser.send({ kind: "activate_tab", tabId: tab.tabId, windowId: tab.windowId, expectedUrl: tab.url! });
    } else if (action.kind === "group_tabs") {
      const tabs = action.targets.map(t => {
        const found = target(t.resourceId, t.expectedRevision, "tab");
        ensure(found.binding.kind === "tab" && found.binding.tab.url, "STALE_STATE", "Browser binding missing.");
        const tab = found.binding.tab;
        return { tabId: tab.tabId, windowId: tab.windowId, expectedUrl: tab.url! };
      });
      ensure(new Set(tabs.map(t => t.windowId)).size === 1, "VALIDATION_ERROR", "This slice groups tabs only within the same browser window.");
      await this.browser.send({ kind: "group_tabs", tabs, label: action.label });
    } else if (action.kind === "open_saved_url") {
      const saved = this.journal.get<{ checkpoint: Checkpoint; sources: Source[] }>(`checkpoint:${action.checkpointId}`);
      const source = saved?.sources.find(s => s.id === action.sourceId);
      ensure(source && saved!.checkpoint.sourceIds.includes(source.id) && source.url === action.url && source.contentHash === action.expectedSourceHash, "FORBIDDEN", "Saved URL is not authorized by the registered checkpoint.");
      await this.browser.send({ kind: "open_saved_url", url: action.url });
    } else throw new ControlError("VALIDATION_ERROR", "Action is disabled in this local control slice.");
  }
}
