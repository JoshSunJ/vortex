# Josh - Vortex teammate contract

Version 1.3 | 25 October 2026 | Windows | Wire schema 1.0

**Project context:** Vortex is a voice-controlled workspace manager for unfinished tasks. A named workspace collects selected browser tabs, references to still-open native windows, a user-stated goal and a checkpoint. It helps people switch tasks, preserve their place, take a selected brief to another device and resume. It is profession-agnostic; the demo is group-project research. Vortex manages the workspace around applications; arbitrary interaction inside applications and a separate tutoring platform are outside the MVP.

**Team:** Josh owns A (control/voice), Nova owns B (intelligence/providers/Fetch), Andrew owns C (dashboard/API/phone/sync/integration). Nathan is absent at kickoff and optional support only; no required feature or milestone depends on him.

**Team clock:** 11 AM-10 PM. Gates: 11:30 AM scope frozen; 1 PM real control; 3 PM saved workspace -> switch away -> resume; 5 PM grounded checkpoint + real phone brief + sponsor traces; 6:30 PM ASI:One parity/failure cases and feature freeze; 8 PM release candidate; 9:45 PM demo-ready; 9:45-10 PM buffer. These supplied times are not timezone-converted. Organizer submission deadlines are separate.

**Sponsors:** Cartesia = voice; Meta Llama = grounding/briefs plus a people-connection outcome; Elastic Agent Builder on Serverless = retrieval; Apify = requested public article extraction; SpacetimeDB = private real-time handoff; Fetch = registered ACP agent usable in ASI:One. Logos, fixtures and fallback paths do not prove a live integration or eligibility.

**Shared rules:** native windows expose identity/title/focus only, never document contents or arbitrary click/type actions. Membership is user-selected; AI may suggest resources and resolve intent. Never execute generated scripts or expose secrets; the local executor alone mutates the computer. Cloud content and sharing need scoped consent. Deferred archive/closing, layout changes and unattended automation remain disabled. Runtime-validate shared messages and preserve the existing teammate work.

**Read next:** [team index](../TEAM_CONTRACT.md), [agent instructions](../AGENTS.md), [wire types/execution contract](JOSH.md#wire-contract), [API/auth/sync contract](ANDREW.md#api-contract), [team schedule](ANDREW.md#team-schedule). Source numbers in migrated sections refer to [the source list](ANDREW.md#sources). Proposed architecture is not a claim of completed implementation.

## Your workflow - owner A

Branch: `feat/control`. Own `apps/desktop/`, `apps/extension/`, `native/windows/` and local execution. Edit `packages/contracts/` with Nova/Andrew review. Start with inventory and fixture plans; then real focus, voice and live intelligence. Provide Nova/Andrew a typed snapshot and executor adapter early.

- By 1 PM: real Chrome tab and supported Windows window focus; Cartesia access verified.
- By 3 PM: a named workspace can be saved, shown, switched away from and resumed using its primary tab/native window. Initial checkpoints may use only metadata and an explicit user note.
- By 5 PM: voice-driven workspace focus/resume participates in grounded checkpoint -> phone brief, with actual Cartesia evidence.
- 5-6:30 PM: stale target, storage, restart, duplicate-operation and cancellation checks.
- After freeze: execution/voice fixes, three rehearsals and Windows startup/reset instructions.

Depend on Nova for validated plans and Andrew for API/UI wiring; never depend on Nathan. Follow [Andrew's complete timed schedule](ANDREW.md#team-schedule). For privacy, shared fixtures, API routes and release gates, read [Andrew's contract](ANDREW.md); for planning/provider behavior read [Nova's contract](NOVA.md).

## 03 / Architecture and Windows feasibility

### One system, several interfaces

**Recommended stack:** Electron + React + TypeScript desktop; Manifest V3 Chrome extension; a small Windows helper using C#/.NET and Win32 APIs; TypeScript backend; Python uAgent adapter for Fetch; React mobile web app; shared Zod schemas. Pin versions at kickoff, not by model guess.

| Layer | Responsibility / boundary |
| --- | --- |
| Desktop renderer | Local dashboard, push-to-talk, transcript, plan preview and recovery controls. No provider keys or direct OS calls. |
| Desktop main + Windows helper | Single local command executor; persistent operation journal; ordinary top-level window identity/title/focus only; a single reviewed side-by-side layout is optional stretch. Use explicit handles and verified process identity. |
| Chrome extension | Track tabs/windows, group and activate tabs, capture permitted text. Native messaging host bridges to desktop; register only the known extension ID. |
| Backend / intelligence | Authenticate; route to Cartesia, Llama, Elastic Agent Builder and Apify; validate plans. Never execute generated scripts. |
| SpacetimeDB | Authorized shared state: devices, checkpoints, deliveries, progress and command receipts. Local desktop journal remains authoritative for local execution. |
| Phone / ASI:One | Phone reads delivered briefs; ASI:One invokes the same planning and execution services with a linked identity and scoped consent. |

#### Data flow

Voice or text -> transcript -> relevant tab/window snapshot -> validated plan -> required user approval -> executor -> journal + result -> dashboard / authorized phone subscription. Content retrieval and summarization happen only for selected sources.

#### Feasibility rules

- Do not try to identify all Chrome tabs from OS window titles. Chrome owns tab identity; Windows owns top-level windows. Maintain separate resource IDs.

- Chrome native messaging uses framed JSON and an installed host manifest [9]. Keep packets small; transfer selected text in bounded chunks rather than whole browsing history.

- Windows may deny foreground activation. Verify the result; return FOCUS_DENIED and highlight the target for a user click. Never claim success after merely calling an API [10].

- Use event-driven tracking and a five-minute candidate scan, not constant AI calls. Persist state because extension workers can stop. Reconcile on reconnect; do not infer that a missing event means a tab was closed [11].

**First 45-minute platform spike:** list real tabs, focus one tab, focus one native window, survive extension reconnect. If native messaging installation blocks progress, use a development-only authenticated loopback bridge with strict Origin checks; document the limitation.

## 04 / Josh (A) - desktop, browser and voice

### Josh: control the actual computer

**Mission:** make every claimed action affect the correct live resource, and make failures recoverable. Own apps/desktop, apps/extension, native/windows and local execution code.

#### Build in this order

- 1. Inventory: Chrome tabs/window events and Windows top-level windows. Generate app-owned IDs bound to current session IDs/handles. Persist firstObservedAt and lastActivatedAt; unknown age stays unknown.

- 2. Control: create/focus/resume a workspace through explicit tab activation/grouping, checkpoint-bound URL reopen and designated native-window focus. Do not read native app document contents or expose generic click/type tools. Only one reviewed side-by-side layout can be optional stretch; never close native apps.

- 3. Command runner: validate revision, resource identity, scope and approval; journal operations; process desktop mutations serially. Return per-action outcomes.

- 4. Voice: desktop push-to-talk -> backend Cartesia transcription -> final transcript. Speak short results through Cartesia; display identical text. Stop playback when recording to avoid self-triggering.

- 5. Recovery: save checkpoints, reopen saved HTTP(S) source URLs on resume, reconcile after reconnect, report failed focus, cancel between actions and recover operation status after restart. Tab-closing/archive execution is deferred; its future safety rules remain in the contract.

#### Interfaces you provide

getSnapshot(), planWorkspaceFocus(workspaceId), planWorkspaceResume(workspaceId), executePlan(planId, approvalId), getOperation(id), restoreCheckpoint(id), and capabilities(). Andrew persists workspaces; Nova resolves high-level intents. Browser adapter exports listTabs, activateTab, groupTabs and openSavedUrl. Windows adapter exports listWindows and focusWindow. archiveTabs and setWindowState are future capabilities and must not be advertised by the demo.

#### Acceptance demo

Create Group Project from user-selected research tabs plus a live notes window. Save primary tab/window IDs, switch to another workspace, then say "Continue Group Project." Verify the saved primary tab and native-window targets. A missing native window must appear unavailable rather than launching arbitrary applications. Navigate a selected tab before executing a saved plan: return STALE_STATE.

#### Dependencies and deliverables

Use B's fixture plan until intelligence is ready; expose mock adapter to C on hour one. Deliver setup instructions, host registration/unregistration script, .env.example without secrets, structured errors and an actual Windows test recording.

**Scope cap:** one Windows laptop, one Chrome profile and ordinary desktop windows. A process title match alone is never enough for a destructive action. No global key injection or arbitrary computer-use agent is needed for the main demo.

**Assigned owner: Josh.** Nova supplies typed plans; Andrew supplies API/UI integration. Nathan is not a dependency.

## 09 / Rules that prevent integration failures

### Identity, state and recovery

#### Data ownership

**Resource:** app-owned UUID, revision, session binding, kind (tab/window), device ID, display title, optional URL, firstObservedAt, lastActivatedAt, protection flags and capabilities. Chrome tab IDs and Windows handles are ephemeral bindings, never global identifiers.

**Workspace:** name, user-stated goal, selected resources, saved primary tab/native window, revision and latest checkpoint. Existing **Task** and `taskId` wire fields are compatible projections/references to that same entity, not a separate task store. **Checkpoint:** immutable source snapshot, source hashes, explicit user note, summary, labeled proposed next step, provenance and timestamp. Native titles supply identity, not evidence about document contents. **Brief:** versioned selected content and audience. **Delivery:** brief ID/version, recipient, expiry and receipt state. **ReadProgress:** resource/brief version, position and last update.

#### Execution state machine

Plan: draft -> awaiting_approval -> approved -> executing -> completed / partial / failed / cancelled / expired. An approved plan expires after two minutes. New tab navigation, changed target set or new content/audience invalidates approval. Approval is checked by code, never model confidence.

Operation: persist before effects; update each action as it completes. Archive: write URL/title/checkpoint durably -> revalidate live target -> close -> record outcome. If interrupted between close and receipt, reconcile actual tabs and mark unknown/partial where needed; never blindly repeat a close.

#### Concurrency and reconnect

- One writer per device executes desktop mutations. Backend idempotency key is (authenticated user, operationId). A retry returns the saved receipt; same key with different payload returns IDEMPOTENCY_CONFLICT.

- Compare the affected resource revisions and live bindings before each action. Reconcile inventory after restart/reconnect; rebind only verified live resources. Restore opens saved HTTP(S) URLs as new tabs when originals no longer exist.

- Retain a durable outbox for pending checkpoint/delivery updates. SpacetimeDB is the shared delivery record; Elastic is an eventually consistent search projection. Index lag never means the underlying checkpoint disappeared.

- For partial plans, keep completed action results and offer a new recovery plan. Reopening a URL cannot restore unsaved forms or application state. Layout restore is best effort if windows/displays have changed.

**Error vocabulary:** VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_STATE, PROTECTED, NEEDS_CLARIFICATION, APPROVAL_REQUIRED, EXPIRED, DEVICE_OFFLINE, FOCUS_DENIED, STORAGE_FAILED, PROVIDER_TIMEOUT, CONTENT_UNAVAILABLE, IDEMPOTENCY_CONFLICT, INTERNAL_ERROR.


<a id="workspace-model"></a>

## Workspace model and command boundary

The full Workspace type below extends the existing Task projection. Persist one workspace entity only: `Task.id`, `Workspace.id` and existing `taskId` fields are the same UUID. Keep `taskId` names on existing checkpoint/brief APIs to avoid an incompatible wire rename. New workspace APIs use `workspaceId` in route parameters. This is an additive wire-1.0 specification; all required implementations must add matching runtime schemas/JSON Schema and fixtures before enabling it.

Membership is explicit user selection. Primary target IDs must belong to the workspace, have the correct resource kind and belong to the requested authorized device. AI suggestions do not silently add members. A workspace is not a Windows virtual desktop or a copy of application memory.

`create_workspace` persists selected membership through Andrew's service and never changes app contents. `focus_workspace` reads that membership and produces a bounded plan of existing `activate_tab`, optional selected `group_tabs`, and `focus_window` operations. Only a designated primary tab is activated, and only a designated primary native window is focused; the UI states which receives final keyboard focus. `resume_workspace` uses the same rules, may reopen checkpoint-bound saved HTTP(S) URLs, and displays the checkpoint. It does not launch closed native apps or claim document/session recovery.

Checkpoint/brief creation and delivery use the existing shared services. Saving never closes resources. Before a live mutation, revalidate resource identity/revision and show any necessary approval. Keep title-based identification separate from native document contents. A closed/missing member is marked unavailable and the user gets per-target results; do not guess a replacement window by title.

The executor has no click-coordinate, arbitrary typing, shell, file-editing, form-submission or purchase tool. Missing capability returns a typed failure/clarification rather than expanding the action vocabulary.

When finalFocusResourceId is present, it must be a selected live member targeted by the plan; the last successful focus/activation action names it. The executor validates the field and action order and reports failure/partial results if the requested final focus cannot be achieved. A checkpoint command preserves the explicit userNote through its Action, service request and stored Checkpoint.

<a id="wire-contract"></a>

## Appendix C - Canonical wire types (starter specification)

These are design contracts, not an installed SDK or validated implementation. Put runtime validation in packages/contracts; generate JSON Schema for the Python service. Wire schema remains 1.0; document revision 1.3 defines bounded task workspaces and adds workspace services. Deferred action kinds are disabled in runtime capabilities. Timestamps are UTC ISO 8601 strings; elapsed age is calculated from them. IDs are UUID strings unless explicitly identified as provider IDs. Unknown optional values are omitted, never fabricated. Content sizes and URL schemes must be bounded by runtime schemas.

```ts
type Id = string;
type ISODate = string;
type Version = "1.0";
type Scope = "metadata:read" | "content:read" | "desktop:control"
  | "brief:read" | "brief:deliver" | "progress:write";

type Resource = {
  id: Id;
  deviceId: Id;
  sessionId: Id;
  revision: number;
  kind: "tab" | "window";
  title: string;
  url?: string;                  // HTTP(S) for reopen/delivery; local by default
  appName?: string;
  firstObservedAt: ISODate;      // not a claim about original creation time
  lastActivatedAt?: ISODate;
  active: boolean;
  protectedByUser: boolean;
  pinned?: boolean;
  audible?: boolean;
  capabilities: ActionKind[];
};

// Binding is private to A's executor; never send OS handles to an LLM.
type LocalBinding = {
  resourceId: Id;
  sessionId: Id;
  browserTabId?: number;
  browserWindowId?: number;
  nativeHandle?: string;         // string to avoid unsafe integer conversion
  processId?: number;
  processStartedAt?: ISODate;    // protects against PID/handle reuse
};

type Snapshot = {
  schemaVersion: Version;
  deviceId: Id;
  sessionId: Id;
  revision: number;
  capturedAt: ISODate;
  resources: Resource[];
  capabilities: ActionKind[];
};

type Task = {
  id: Id;
  goal: string;
  resourceIds: Id[];
  updatedAt: ISODate;
};

// Additive full entity. Existing Task is its legacy-compatible projection.
// Task.id, Workspace.id and all existing taskId fields name the same entity.
type Workspace = Task & {
  name: string;
  deviceId: Id;
  revision: number;
  primaryTabId?: Id;             // selected Resource.id of kind tab
  primaryWindowId?: Id;          // selected Resource.id of kind window
  latestCheckpointId?: Id;
  createdAt: ISODate;
};

// High-level service commands, not generic OS executor permissions.
type WorkspaceCommand =
  | { kind: "find"; query: string; workspaceId?: Id }
  | { kind: "create_workspace"; name: string; goal: string;
      deviceId: Id; selectedResourceIds: Id[];
      primaryTabId?: Id; primaryWindowId?: Id }
  | { kind: "focus_workspace"; workspaceId: Id }
  | { kind: "save_checkpoint"; workspaceId: Id; sourceIds: Id[];
      userNote?: string }
  | { kind: "send_brief"; workspaceId?: Id; sourceIds: Id[];
      recipient: { deviceId: Id } | { userId: Id } }
  | { kind: "resume_workspace"; workspaceId: Id };


type Source = {
  id: Id;
  resourceId?: Id;
  url: string;
  title: string;
  retrievedAt: ISODate;
  contentHash: string;           // SHA-256 of normalized selected text
  extraction: "metadata" | "extension" | "apify";
  availability: "ready" | "unavailable";
  text?: string;                 // bounded, selected, consented content only
  apifyRunId?: string;
};

type GroundedPoint = {
  text: string;
  sourceIds: Id[];
  basis: "observed" | "user_stated" | "inferred";
};

type Checkpoint = {
  id: Id;
  taskId: Id;                   // Workspace.id; field retained for compatibility
  userNote?: string;             // explicit user-provided context, never inferred
  createdAt: ISODate;
  version: number;
  resourceSnapshots: Resource[];
  sourceIds: Id[];
  summary: GroundedPoint[];
  proposedNextStep?: GroundedPoint;
};

type Brief = {
  id: Id;
  version: number;
  taskId?: Id;
  checkpointId?: Id;
  title: string;
  format: "reading" | "project_handoff";
  audience: "self" | "selected_teammate";
  sourceIds: Id[];
  points: GroundedPoint[];
  originalUrls: string[];
  excerpt?: string;
  createdAt: ISODate;
};

type Delivery = {
  id: Id;
  operationId: Id;
  briefId: Id;
  briefVersion: number;
  recipient: { deviceId: Id } | { userId: Id };
  expiresAt: ISODate;
  status: "queued" | "available" | "received" | "read"
    | "expired" | "revoked" | "failed";
};

type ReadProgress = {
  id: Id;
  briefId: Id;
  briefVersion: number;
  deviceId: Id;
  fraction: number;              // inclusive 0..1
  updatedAt: ISODate;
  revision: number;              // server monotonic; reject stale writes
};

type Target = { resourceId: Id; expectedRevision: number };
type Action =
  | { kind: "activate_tab"; target: Target }
  | { kind: "group_tabs"; targets: Target[]; label: string }
  | { kind: "focus_window"; target: Target }
  | { kind: "set_window_state"; target: Target;
      state: "minimized" | "normal" | "maximized" }
  | { kind: "create_checkpoint"; taskId: Id; sourceIds: Id[];
      userNote?: string; targets: Target[] }
  | { kind: "archive_tabs"; targets: Target[]; checkpointId: Id }
  | { kind: "open_saved_url"; checkpointId: Id; sourceId: Id;
      url: string; expectedSourceHash: string }
  | { kind: "create_brief"; sourceIds: Id[];
      format: Brief["format"]; audience: Brief["audience"] }
  | { kind: "deliver_brief"; briefId: Id; briefVersion: number;
      recipient: { deviceId: Id } | { userId: Id } };
type ActionKind = Action["kind"];

type Plan = {
  kind: "plan";
  id: Id;
  commandId: Id;
  workspaceId?: Id;              // additive link to the target workspace
  deviceId: Id;
  snapshotRevision: number;
  finalFocusResourceId?: Id;     // validated selected target; final focus action
  actions: { actionId: Id; action: Action }[];
  explanation: string;
  approvalRequired: boolean;     // derived by policy, not chosen by model
  planHash: string;
  createdAt: ISODate;
  expiresAt: ISODate;
};

type Clarification = {
  kind: "clarification";
  commandId: Id;
  question: string;
  options: { id: Id; label: string; resourceIds: Id[] }[];
};

type ErrorCode = "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN"
  | "NOT_FOUND" | "STALE_STATE" | "PROTECTED" | "NEEDS_CLARIFICATION"
  | "APPROVAL_REQUIRED" | "EXPIRED" | "DEVICE_OFFLINE" | "FOCUS_DENIED"
  | "STORAGE_FAILED" | "PROVIDER_TIMEOUT" | "CONTENT_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR";
type ActionResult = {
  actionId: Id;
  status: "pending" | "running" | "succeeded" | "failed"
    | "skipped" | "unknown";
  code?: ErrorCode;
  workspaceId?: Id;
  checkpointId?: Id;
  briefId?: Id;
  deliveryId?: Id;
};
type Operation = {
  id: Id;
  planId?: Id;
  status: "queued" | "running" | "partial" | "succeeded"
    | "failed" | "cancelled";
  results: ActionResult[];
  updatedAt: ISODate;
};
type Result<T> = {
  schemaVersion: Version; requestId: Id;
} & (
  | { ok: true; data: T }
  | { ok: false; error: {
      code: ErrorCode; message: string; retryable: boolean;
    } }
);
```

### Planning and action composition

- Each plan can include at most ten mutations. No arbitrary action names or executable source strings. The executor checks kind-specific capabilities and resource kind.
- V1 plans refer to existing checkpoint/brief IDs. If a command needs to create a brief then deliver it, the orchestrator waits for the first operation result, builds a second plan with the resulting brief ID, and obtains any required preview approval. Never guess a future ID or parse it out of free text.
- The resume endpoint expands into explicit `activate_tab` and/or `open_saved_url` actions. For `open_saved_url`, the executor checks checkpoint ownership, source membership, exact saved URL and expected source hash. The model cannot supply an unrelated URL. Only HTTP(S) URLs can reopen; reject embedded credentials and unsafe schemes. Resume may focus known live native windows but does not recreate closed native apps or recover unsaved documents.
- Desktop reorder/layout move is a stretch capability: add `move_window` with validated bounds and original layout snapshot only through contract review. Do not advertise it before implementation.
- Read-only search has no mutation plan. Cloud disclosure/consent is still enforced. Simple explicit focus commands may execute under a current local user invocation; bulk regroup/archive, minimizing unrelated windows and all cross-person delivery require a preview. Remote actions always require separately granted control scope.
- Hash canonical action JSON plus affected source hashes, audience/recipient, user, device, snapshot and expiry. Bind approval to that hash. Server issues approval IDs; clients cannot self-approve by setting a boolean.
- `archive_tabs` writes a durable URL/title archive entry before close. Protect active/pinned/audible/user-protected tabs and reject non-HTTP(S) targets. Unknown unsaved state is a stated limitation, not a detectable guarantee.


### One service implementation behind every interface

HTTP routes, desktop plan actions and the ASI:One adapter call the same checkpoint, brief, delivery and resume services. Nova owns their intelligence logic; Andrew owns authenticated route wiring and persistence integration; Josh owns local effects and operation recovery. Do not create separate implementations or contradictory data stores for each interface.

### Runtime capability tiers for this deadline

Required enabled actions: `activate_tab`, `group_tabs`, `focus_window`, `create_checkpoint`, `open_saved_url`, `create_brief`, `deliver_brief`. Planning/search and checkpoint resume use the documented endpoints. Deferred: `archive_tabs`, `set_window_state`, `move_window`, unattended automation. Deferred types may remain as design notes but must be excluded from live capabilities and rejected if proposed. Keep / Snooze suggestions do not close or minimize resources.
