# Josh - Vortex teammate contract

Version 1.2 | 25 October 2026 | Windows | Wire schema 1.0

**Project context:** Vortex is a voice-controlled Windows workspace assistant. Find and group browser tabs, focus supported native windows, save a source-backed task checkpoint, send a reading brief to a paired phone, and resume unfinished work. It is profession-agnostic; the demo story is group-project research. Workspace continuity is the focus; a separate tutoring platform is out of scope.

**Team:** Josh owns A (control/voice), Nova owns B (intelligence/providers/Fetch), Andrew owns C (dashboard/API/phone/sync/integration). Nathan is absent at kickoff and optional support only; no required feature or milestone depends on him.

**Team clock:** 11 AM-10 PM. Gates: 1 PM real control; 3 PM phone vertical slice; 5 PM sponsor evidence; 6:30 PM feature freeze; 8 PM release candidate; 9:45 PM demo-ready; 9:45-10 PM buffer. These supplied times are not timezone-converted. Organizer submission deadlines are separate.

**Sponsors:** Cartesia = voice; Meta Llama = grounding/briefs plus a people-connection outcome; Elastic Agent Builder on Serverless = retrieval; Apify = requested public article extraction; SpacetimeDB = private real-time handoff; Fetch = registered ACP agent usable in ASI:One. Logos, fixtures and fallback paths do not prove a live integration or eligibility.

**Shared rules:** never execute generated scripts or expose secrets; the local executor alone mutates the computer. Cloud content and sharing need scoped consent. Deferred archive/closing, layout changes and unattended automation remain disabled. Runtime-validate shared messages and preserve the existing teammate work.

**Read next:** [team index](../TEAM_CONTRACT.md), [agent instructions](../AGENTS.md), [wire types/execution contract](JOSH.md#wire-contract), [API/auth/sync contract](ANDREW.md#api-contract), [team schedule](ANDREW.md#team-schedule). Source numbers in migrated sections refer to [the source list](ANDREW.md#sources). Proposed architecture is not a claim of completed implementation.

## Your workflow - owner A

Branch: `feat/control`. Own `apps/desktop/`, `apps/extension/`, `native/windows/` and local execution. Edit `packages/contracts/` with Nova/Andrew review. Start with inventory and fixture plans; then real focus, voice and live intelligence. Provide Nova/Andrew a typed snapshot and executor adapter early.

- By 1 PM: real Chrome tab and supported Windows window focus; Cartesia access verified.
- By 3 PM: voice command reaches real control and the integrated checkpoint/phone slice.
- By 5 PM: grouping/resume/reconnect and actual Cartesia evidence.
- 5-6:30 PM: stale target, storage, restart, duplicate-operation and cancellation checks.
- After freeze: execution/voice fixes, three rehearsals and Windows startup/reset instructions.

Depend on Nova for validated plans and Andrew for API/UI wiring; never depend on Nathan. Follow [Andrew's complete timed schedule](ANDREW.md#team-schedule). For privacy, shared fixtures, API routes and release gates, read [Andrew's contract](ANDREW.md); for planning/provider behavior read [Nova's contract](NOVA.md).

## 03 / Architecture and Windows feasibility

### One system, several interfaces

**Recommended stack:** Electron + React + TypeScript desktop; Manifest V3 Chrome extension; a small Windows helper using C#/.NET and Win32 APIs; TypeScript backend; Python uAgent adapter for Fetch; React mobile web app; shared Zod schemas. Pin versions at kickoff, not by model guess.

| Layer | Responsibility / boundary |
| --- | --- |
| Desktop renderer | Local dashboard, push-to-talk, transcript, plan preview and recovery controls. No provider keys or direct OS calls. |
| Desktop main + Windows helper | Single local command executor; persistent operation journal; window enumeration/focus; minimize/restore/move are stretch features. Use explicit handles and verified process identity. |
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

- 2. Control: activate tab; group selected tabs; focus a supported native window. Minimize/restore/layout rearrangement are stretch features only after the main journey passes. Never close native apps in the MVP.

- 3. Command runner: validate revision, resource identity, scope and approval; journal operations; process desktop mutations serially. Return per-action outcomes.

- 4. Voice: desktop push-to-talk -> backend Cartesia transcription -> final transcript. Speak short results through Cartesia; display identical text. Stop playback when recording to avoid self-triggering.

- 5. Recovery: save checkpoints, reopen saved HTTP(S) source URLs on resume, reconcile after reconnect, report failed focus, cancel between actions and recover operation status after restart. Tab-closing/archive execution is deferred; its future safety rules remain in the contract.

#### Interfaces you provide

getSnapshot(), executePlan(planId, approvalId), getOperation(id), restoreCheckpoint(id), and capabilities(). Browser adapter exports listTabs, activateTab, groupTabs and openSavedUrl. Windows adapter exports listWindows and focusWindow. archiveTabs and setWindowState are future capabilities and must not be advertised by the demo.

#### Acceptance demo

With two Chrome windows and a native editor open, say "switch to my project notes." Resolve the intended tab, focus its browser window, and verify selection. Then focus the editor by voice. Navigate a selected tab before executing a saved plan: execution must return STALE_STATE.

#### Dependencies and deliverables

Use B's fixture plan until intelligence is ready; expose mock adapter to C on hour one. Deliver setup instructions, host registration/unregistration script, .env.example without secrets, structured errors and an actual Windows test recording.

**Scope cap:** one Windows laptop, one Chrome profile and ordinary desktop windows. A process title match alone is never enough for a destructive action. No global key injection or arbitrary computer-use agent is needed for the main demo.

**Assigned owner: Josh.** Nova supplies typed plans; Andrew supplies API/UI integration. Nathan is not a dependency.

## 09 / Rules that prevent integration failures

### Identity, state and recovery

#### Data ownership

**Resource:** app-owned UUID, revision, session binding, kind (tab/window), device ID, display title, optional URL, firstObservedAt, lastActivatedAt, protection flags and capabilities. Chrome tab IDs and Windows handles are ephemeral bindings, never global identifiers.

**Task:** UUID, user-stated goal and selected resource IDs. **Checkpoint:** immutable source snapshot, source hashes, summary, proposed next step, provenance, timestamp. **Brief:** versioned selected content and audience. **Delivery:** brief ID/version, recipient, expiry and receipt state. **ReadProgress:** resource/brief version, position and last update.

#### Execution state machine

Plan: draft -> awaiting_approval -> approved -> executing -> completed / partial / failed / cancelled / expired. An approved plan expires after two minutes. New tab navigation, changed target set or new content/audience invalidates approval. Approval is checked by code, never model confidence.

Operation: persist before effects; update each action as it completes. Archive: write URL/title/checkpoint durably -> revalidate live target -> close -> record outcome. If interrupted between close and receipt, reconcile actual tabs and mark unknown/partial where needed; never blindly repeat a close.

#### Concurrency and reconnect

- One writer per device executes desktop mutations. Backend idempotency key is (authenticated user, operationId). A retry returns the saved receipt; same key with different payload returns IDEMPOTENCY_CONFLICT.

- Compare the affected resource revisions and live bindings before each action. Reconcile inventory after restart/reconnect; rebind only verified live resources. Restore opens saved HTTP(S) URLs as new tabs when originals no longer exist.

- Retain a durable outbox for pending checkpoint/delivery updates. SpacetimeDB is the shared delivery record; Elastic is an eventually consistent search projection. Index lag never means the underlying checkpoint disappeared.

- For partial plans, keep completed action results and offer a new recovery plan. Reopening a URL cannot restore unsaved forms or application state. Layout restore is best effort if windows/displays have changed.

**Error vocabulary:** VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_STATE, PROTECTED, NEEDS_CLARIFICATION, APPROVAL_REQUIRED, EXPIRED, DEVICE_OFFLINE, FOCUS_DENIED, STORAGE_FAILED, PROVIDER_TIMEOUT, CONTENT_UNAVAILABLE, IDEMPOTENCY_CONFLICT, INTERNAL_ERROR.


<a id="wire-contract"></a>

## Appendix C - Canonical wire types (starter specification)

These are design contracts, not an installed SDK or validated implementation. Put runtime validation in packages/contracts; generate JSON Schema for the Python service. Wire schema remains 1.0; document revision 1.2 splits the team workflow into four named contracts. Deferred action kinds are disabled in runtime capabilities. Timestamps are UTC ISO 8601 strings; elapsed age is calculated from them. IDs are UUID strings unless explicitly identified as provider IDs. Unknown optional values are omitted, never fabricated. Content sizes and URL schemes must be bounded by runtime schemas.

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
  taskId: Id;
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
      targets: Target[] }
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
  deviceId: Id;
  snapshotRevision: number;
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
