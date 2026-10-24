// Canonical wire types, schema 1.0, document revision 1.3. Source: contracts/JOSH.md Appendix C ("wire-contract").
// Owner: Josh (A); Nova (B) and Andrew (C) review. Field names, states and action kinds are copied
// from the contract as written; change them only through a reviewed contract update.
// Size bounds come from contracts/ANDREW.md Appendix D validation bounds.
import { z } from "zod";

export const SCHEMA_VERSION = "1.0" as const;

export const Id = z.uuid();
export const ISODate = z.iso.datetime();
export const Version = z.literal(SCHEMA_VERSION);

const MAX_TITLE = 500;
const MAX_SOURCE_TEXT = 50_000;
const MAX_URL = 2_048;

/** HTTP(S) only, no embedded credentials. Used wherever a URL may be reopened or delivered. */
export const HttpUrl = z
  .url({ protocol: /^https?$/ })
  .max(MAX_URL)
  .refine((value) => {
    const url = new URL(value);
    return url.username === "" && url.password === "";
  }, "URL must not contain credentials");

export const Scope = z.enum([
  "metadata:read",
  "content:read",
  "desktop:control",
  "brief:read",
  "brief:deliver",
  "progress:write",
]);
export type Scope = z.infer<typeof Scope>;

export const ACTION_KINDS = [
  "activate_tab",
  "group_tabs",
  "focus_window",
  "set_window_state",
  "create_checkpoint",
  "archive_tabs",
  "open_saved_url",
  "create_brief",
  "deliver_brief",
] as const;
export const ActionKind = z.enum(ACTION_KINDS);
export type ActionKind = z.infer<typeof ActionKind>;

/** Runtime capability tier for this deadline. Deferred kinds must be rejected if proposed. */
export const ENABLED_ACTION_KINDS = [
  "activate_tab",
  "group_tabs",
  "focus_window",
  "create_checkpoint",
  "open_saved_url",
  "create_brief",
  "deliver_brief",
] as const satisfies readonly ActionKind[];
export const DEFERRED_ACTION_KINDS = ["set_window_state", "archive_tabs"] as const satisfies readonly ActionKind[];

export const Resource = z.object({
  id: Id,
  deviceId: Id,
  sessionId: Id,
  revision: z.number().int().nonnegative(),
  kind: z.enum(["tab", "window"]),
  title: z.string().max(MAX_TITLE),
  url: z.string().max(MAX_URL).optional(),
  appName: z.string().max(MAX_TITLE).optional(),
  firstObservedAt: ISODate,
  lastActivatedAt: ISODate.optional(),
  active: z.boolean(),
  protectedByUser: z.boolean(),
  pinned: z.boolean().optional(),
  audible: z.boolean().optional(),
  capabilities: z.array(ActionKind),
});
export type Resource = z.infer<typeof Resource>;

/** Private to A's executor; never sent to an LLM or over the API. */
export const LocalBinding = z.object({
  resourceId: Id,
  sessionId: Id,
  browserTabId: z.number().int().optional(),
  browserWindowId: z.number().int().optional(),
  nativeHandle: z.string().optional(),
  processId: z.number().int().optional(),
  processStartedAt: ISODate.optional(),
});
export type LocalBinding = z.infer<typeof LocalBinding>;

export const Snapshot = z.object({
  schemaVersion: Version,
  deviceId: Id,
  sessionId: Id,
  revision: z.number().int().nonnegative(),
  capturedAt: ISODate,
  resources: z.array(Resource),
  capabilities: z.array(ActionKind),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const Task = z.object({
  id: Id,
  goal: z.string().max(2_000),
  resourceIds: z.array(Id).max(100),
  updatedAt: ISODate,
});
export type Task = z.infer<typeof Task>;

// Revision 1.3, additive. Workspace is the full entity; Task is its legacy projection.
// Task.id, Workspace.id and every existing taskId field name the same entity.
export const Workspace = Task.extend({
  name: z.string().min(1).max(100),
  deviceId: Id,
  revision: z.number().int().nonnegative(),
  primaryTabId: Id.optional(),
  primaryWindowId: Id.optional(),
  latestCheckpointId: Id.optional(),
  createdAt: ISODate,
});
export type Workspace = z.infer<typeof Workspace>;

const UserNote = z.string().max(2_000);

/** High-level service commands, not generic OS executor permissions. */
export const WorkspaceCommand = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("find"), query: z.string().min(1).max(2_000), workspaceId: Id.optional() }),
  z.strictObject({
    kind: z.literal("create_workspace"),
    name: Workspace.shape.name,
    goal: Task.shape.goal,
    deviceId: Id,
    selectedResourceIds: z.array(Id).max(100),
    primaryTabId: Id.optional(),
    primaryWindowId: Id.optional(),
  }),
  z.strictObject({ kind: z.literal("focus_workspace"), workspaceId: Id }),
  z.strictObject({
    kind: z.literal("save_checkpoint"),
    workspaceId: Id,
    sourceIds: z.array(Id).max(5),
    userNote: UserNote.optional(),
  }),
  z.strictObject({
    kind: z.literal("send_brief"),
    workspaceId: Id.optional(),
    sourceIds: z.array(Id).min(1).max(5),
    recipient: z.union([z.strictObject({ deviceId: Id }), z.strictObject({ userId: Id })]),
  }),
  z.strictObject({ kind: z.literal("resume_workspace"), workspaceId: Id }),
]);
export type WorkspaceCommand = z.infer<typeof WorkspaceCommand>;

export const Source = z.object({
  id: Id,
  resourceId: Id.optional(),
  url: HttpUrl,
  title: z.string().max(MAX_TITLE),
  retrievedAt: ISODate,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 hex"),
  extraction: z.enum(["metadata", "extension", "apify"]),
  availability: z.enum(["ready", "unavailable"]),
  text: z.string().max(MAX_SOURCE_TEXT).optional(),
  apifyRunId: z.string().max(200).optional(),
});
export type Source = z.infer<typeof Source>;

export const GroundedPoint = z.object({
  text: z.string().max(2_000),
  sourceIds: z.array(Id),
  basis: z.enum(["observed", "user_stated", "inferred"]),
});
export type GroundedPoint = z.infer<typeof GroundedPoint>;

export const Checkpoint = z.object({
  id: Id,
  taskId: Id, // Workspace.id; field retained for compatibility
  userNote: UserNote.optional(), // explicit user-provided context, never inferred
  createdAt: ISODate,
  version: z.number().int().positive(),
  resourceSnapshots: z.array(Resource),
  sourceIds: z.array(Id),
  summary: z.array(GroundedPoint),
  proposedNextStep: GroundedPoint.optional(),
});
export type Checkpoint = z.infer<typeof Checkpoint>;

export const Brief = z.object({
  id: Id,
  version: z.number().int().positive(),
  taskId: Id.optional(),
  checkpointId: Id.optional(),
  title: z.string().max(MAX_TITLE),
  format: z.enum(["reading", "project_handoff"]),
  audience: z.enum(["self", "selected_teammate"]),
  sourceIds: z.array(Id).max(5),
  points: z.array(GroundedPoint),
  originalUrls: z.array(HttpUrl),
  excerpt: z.string().max(MAX_SOURCE_TEXT).optional(),
  createdAt: ISODate,
});
export type Brief = z.infer<typeof Brief>;

export const Recipient = z.union([
  z.strictObject({ deviceId: Id }),
  z.strictObject({ userId: Id }),
]);
export type Recipient = z.infer<typeof Recipient>;

export const Delivery = z.object({
  id: Id,
  operationId: Id,
  briefId: Id,
  briefVersion: z.number().int().positive(),
  recipient: Recipient,
  expiresAt: ISODate,
  status: z.enum(["queued", "available", "received", "read", "expired", "revoked", "failed"]),
});
export type Delivery = z.infer<typeof Delivery>;

export const ReadProgress = z.object({
  id: Id,
  briefId: Id,
  briefVersion: z.number().int().positive(),
  deviceId: Id,
  fraction: z.number().min(0).max(1),
  updatedAt: ISODate,
  revision: z.number().int().nonnegative(),
});
export type ReadProgress = z.infer<typeof ReadProgress>;

export const Target = z.strictObject({ resourceId: Id, expectedRevision: z.number().int().nonnegative() });
export type Target = z.infer<typeof Target>;

// Strict objects: a model proposing extra fields (e.g. a shell command) is rejected, not stripped.
export const Action = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("activate_tab"), target: Target }),
  z.strictObject({ kind: z.literal("group_tabs"), targets: z.array(Target).min(1).max(100), label: z.string().max(MAX_TITLE) }),
  z.strictObject({ kind: z.literal("focus_window"), target: Target }),
  z.strictObject({
    kind: z.literal("set_window_state"),
    target: Target,
    state: z.enum(["minimized", "normal", "maximized"]),
  }),
  z.strictObject({
    kind: z.literal("create_checkpoint"),
    taskId: Id,
    sourceIds: z.array(Id),
    userNote: UserNote.optional(),
    targets: z.array(Target),
  }),
  z.strictObject({ kind: z.literal("archive_tabs"), targets: z.array(Target), checkpointId: Id }),
  z.strictObject({
    kind: z.literal("open_saved_url"),
    checkpointId: Id,
    sourceId: Id,
    url: HttpUrl,
    expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    kind: z.literal("create_brief"),
    sourceIds: z.array(Id).min(1).max(5),
    format: Brief.shape.format,
    audience: Brief.shape.audience,
  }),
  z.strictObject({
    kind: z.literal("deliver_brief"),
    briefId: Id,
    briefVersion: z.number().int().positive(),
    recipient: Recipient,
  }),
]);
export type Action = z.infer<typeof Action>;

export const Plan = z
  .object({
    kind: z.literal("plan"),
    id: Id,
    commandId: Id,
    workspaceId: Id.optional(), // additive link to the target workspace
    deviceId: Id,
    snapshotRevision: z.number().int().nonnegative(),
    finalFocusResourceId: Id.optional(), // validated selected target; final focus action
    actions: z.array(z.strictObject({ actionId: Id, action: Action })).max(10),
    explanation: z.string().max(2_000),
    approvalRequired: z.boolean(),
    planHash: z.string().min(1).max(200),
    createdAt: ISODate,
    expiresAt: ISODate,
  })
  .refine(
    (plan) => {
      if (plan.finalFocusResourceId === undefined) return true;
      // The last focus/activation action must target finalFocusResourceId.
      const focusActions = plan.actions.filter((a) => a.action.kind === "activate_tab" || a.action.kind === "focus_window");
      const last = focusActions.at(-1)?.action;
      return last !== undefined && "target" in last && last.target.resourceId === plan.finalFocusResourceId;
    },
    { message: "finalFocusResourceId must be the target of the plan's last focus/activation action", path: ["finalFocusResourceId"] },
  );
export type Plan = z.infer<typeof Plan>;

export const Clarification = z.object({
  kind: z.literal("clarification"),
  commandId: Id,
  question: z.string().max(2_000),
  options: z.array(z.object({ id: Id, label: z.string().max(MAX_TITLE), resourceIds: z.array(Id) })),
});
export type Clarification = z.infer<typeof Clarification>;

export const PlanOrClarification = z.discriminatedUnion("kind", [Plan, Clarification]);
export type PlanOrClarification = z.infer<typeof PlanOrClarification>;

export const ErrorCode = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "STALE_STATE",
  "PROTECTED",
  "NEEDS_CLARIFICATION",
  "APPROVAL_REQUIRED",
  "EXPIRED",
  "DEVICE_OFFLINE",
  "FOCUS_DENIED",
  "STORAGE_FAILED",
  "PROVIDER_TIMEOUT",
  "CONTENT_UNAVAILABLE",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ActionResult = z.object({
  actionId: Id,
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped", "unknown"]),
  code: ErrorCode.optional(),
  workspaceId: Id.optional(),
  checkpointId: Id.optional(),
  briefId: Id.optional(),
  deliveryId: Id.optional(),
});
export type ActionResult = z.infer<typeof ActionResult>;

export const Operation = z.object({
  id: Id,
  planId: Id.optional(),
  status: z.enum(["queued", "running", "partial", "succeeded", "failed", "cancelled"]),
  results: z.array(ActionResult),
  updatedAt: ISODate,
});
export type Operation = z.infer<typeof Operation>;

export const ApiErrorBody = z.object({
  code: ErrorCode,
  message: z.string(),
  retryable: z.boolean(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/** Result envelope schema for a given data schema. */
export function ResultOf<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ schemaVersion: Version, requestId: Id, ok: z.literal(true), data }),
    z.object({ schemaVersion: Version, requestId: Id, ok: z.literal(false), error: ApiErrorBody }),
  ]);
}
export type Result<T> = { schemaVersion: typeof SCHEMA_VERSION; requestId: string } & (
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorBody }
);
