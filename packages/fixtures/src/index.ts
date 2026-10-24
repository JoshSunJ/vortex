// FIXTURE DATA: development aid only. Never present any of this as live sponsor evidence.
// Demo story: Sam researches a group project (urban heat islands) and shares a briefing with Jo.
// All lanes may add cases here; Andrew coordinates. Every value must parse with @vortex/contracts.
import type {
  Brief,
  Checkpoint,
  Clarification,
  Delivery,
  Operation,
  Plan,
  ReadProgress,
  Resource,
  Snapshot,
  Source,
  Task,
} from "@vortex/contracts";
import { ENABLED_ACTION_KINDS } from "@vortex/contracts";

export const FIXTURE_LABEL = "fixture" as const;

const T0 = "2026-10-25T18:00:00.000Z";
const T1 = "2026-10-25T18:05:00.000Z";
const T2 = "2026-10-25T18:06:00.000Z";

/** Readable fixed UUIDs (valid v4 layout) so tests and screenshots are stable. */
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const users = {
  sam: { id: id(1), name: "Sam" },
  jo: { id: id(2), name: "Jo" },
  /** Unrelated identity used for cross-user denial tests. */
  mallory: { id: id(3), name: "Mallory" },
} as const;

export const devices = {
  samDesktop: { id: id(11), userId: users.sam.id, name: "Sam's laptop", kind: "desktop" as const },
  samPhone: { id: id(12), userId: users.sam.id, name: "Sam's phone", kind: "phone" as const },
  joPhone: { id: id(13), userId: users.jo.id, name: "Jo's phone", kind: "phone" as const },
  malloryPhone: { id: id(14), userId: users.mallory.id, name: "Mallory's phone", kind: "phone" as const },
} as const;

export const sessionId = id(21);

const tab = (n: number, title: string, url: string, extra: Partial<Resource> = {}): Resource => ({
  id: id(100 + n),
  deviceId: devices.samDesktop.id,
  sessionId,
  revision: 1,
  kind: "tab",
  title,
  url,
  firstObservedAt: T0,
  active: false,
  protectedByUser: false,
  capabilities: ["activate_tab", "group_tabs"],
  ...extra,
});

export const resources = {
  heatArticle: tab(1, "How cities can beat extreme heat - Example News", "https://example.org/cities-extreme-heat", {
    lastActivatedAt: T1,
    active: true,
  }),
  heatArticleOther: tab(2, "Extreme heat and cities: what we know - Example Science", "https://example.com/science/heat-cities"),
  projectDoc: tab(3, "Group project outline - Docs", "https://docs.example.net/d/group-project-outline"),
  music: tab(4, "Lo-fi beats", "https://music.example.net/lofi", { audible: true }),
  notesWindow: {
    id: id(110),
    deviceId: devices.samDesktop.id,
    sessionId,
    revision: 1,
    kind: "window",
    title: "project-notes.txt - Notepad",
    appName: "Notepad",
    firstObservedAt: T0,
    active: false,
    protectedByUser: false,
    capabilities: ["focus_window"],
  },
} satisfies Record<string, Resource>;

export const snapshot: Snapshot = {
  schemaVersion: "1.0",
  deviceId: devices.samDesktop.id,
  sessionId,
  revision: 7,
  capturedAt: T1,
  resources: Object.values(resources),
  capabilities: [...ENABLED_ACTION_KINDS],
};

export const task: Task = {
  id: id(201),
  goal: "Group project research on urban heat islands",
  resourceIds: [resources.heatArticle.id, resources.heatArticleOther.id, resources.projectDoc.id],
  updatedAt: T1,
};

const sha = (c: string) => c.repeat(64);

export const sources = {
  heatArticle: {
    id: id(301),
    resourceId: resources.heatArticle.id,
    url: "https://example.org/cities-extreme-heat",
    title: "How cities can beat extreme heat",
    retrievedAt: T1,
    contentHash: sha("a"),
    extraction: "apify",
    availability: "ready",
    text: "FIXTURE TEXT. Cool roofs, street trees and shaded transit stops lower local temperatures...",
    apifyRunId: "FIXTURE-RUN-ID",
  },
  /** Paywalled/unavailable case (fixture 8): link + unavailable status, no invented summary. */
  paywalled: {
    id: id(302),
    url: "https://example.com/science/heat-cities",
    title: "Extreme heat and cities: what we know",
    retrievedAt: T1,
    contentHash: sha("b"),
    extraction: "metadata",
    availability: "unavailable",
  },
} satisfies Record<string, Source>;

export const plans = {
  focusTask: {
    kind: "plan",
    id: id(401),
    commandId: id(402),
    deviceId: devices.samDesktop.id,
    snapshotRevision: snapshot.revision,
    actions: [
      {
        actionId: id(403),
        action: {
          kind: "group_tabs",
          label: "Heat island project",
          targets: task.resourceIds.map((resourceId) => ({ resourceId, expectedRevision: 1 })),
        },
      },
      { actionId: id(404), action: { kind: "focus_window", target: { resourceId: resources.notesWindow.id, expectedRevision: 1 } } },
    ],
    explanation: "FIXTURE PLAN. Group the three research tabs and focus your notes window.",
    approvalRequired: true,
    planHash: "fixture-plan-hash-401",
    createdAt: T1,
    expiresAt: "2026-10-25T18:07:00.000Z",
  },
} satisfies Record<string, Plan>;

/** Fixture 1: two similar article titles -> clarification, no execution. */
export const clarification: Clarification = {
  kind: "clarification",
  commandId: id(405),
  question: "Which heat article did you mean?",
  options: [
    { id: id(406), label: resources.heatArticle.title, resourceIds: [resources.heatArticle.id] },
    { id: id(407), label: resources.heatArticleOther.title, resourceIds: [resources.heatArticleOther.id] },
  ],
};

export const checkpoint: Checkpoint = {
  id: id(501),
  taskId: task.id,
  createdAt: T2,
  version: 1,
  resourceSnapshots: [resources.heatArticle, resources.projectDoc],
  sourceIds: [sources.heatArticle.id],
  summary: [
    { text: "FIXTURE. Read the cool-roofs section of the heat article.", sourceIds: [sources.heatArticle.id], basis: "observed" },
    { text: "FIXTURE. Goal: finish the mitigation section of the outline.", sourceIds: [], basis: "user_stated" },
  ],
  proposedNextStep: { text: "FIXTURE. Compare street-tree data with the second article.", sourceIds: [sources.heatArticle.id], basis: "inferred" },
};

export const briefs = {
  reading: {
    id: id(601),
    version: 1,
    taskId: task.id,
    checkpointId: checkpoint.id,
    title: "How cities can beat extreme heat",
    format: "reading",
    audience: "self",
    sourceIds: [sources.heatArticle.id],
    points: [
      { text: "FIXTURE. Cool roofs reflect sunlight and lower indoor temperatures.", sourceIds: [sources.heatArticle.id], basis: "observed" },
      { text: "FIXTURE. Street trees shade sidewalks and cool the air around them.", sourceIds: [sources.heatArticle.id], basis: "observed" },
      { text: "FIXTURE. Shaded transit stops protect people waiting in the heat.", sourceIds: [sources.heatArticle.id], basis: "observed" },
    ],
    originalUrls: [sources.heatArticle.url],
    excerpt: "FIXTURE EXCERPT. Cool roofs, street trees and shaded transit stops...",
    createdAt: T2,
  },
  teammateHandoff: {
    id: id(602),
    version: 1,
    taskId: task.id,
    checkpointId: checkpoint.id,
    title: "Heat island project: where we are",
    format: "project_handoff",
    audience: "selected_teammate",
    sourceIds: [sources.heatArticle.id],
    points: [{ text: "FIXTURE. Mitigation section needs the street-tree comparison.", sourceIds: [sources.heatArticle.id], basis: "inferred" }],
    originalUrls: [sources.heatArticle.url],
    createdAt: T2,
  },
} satisfies Record<string, Brief>;

export const deliveries = {
  toSamPhone: {
    id: id(701),
    operationId: id(702),
    briefId: briefs.reading.id,
    briefVersion: 1,
    recipient: { deviceId: devices.samPhone.id },
    expiresAt: "2026-10-26T18:06:00.000Z",
    status: "available",
  },
  toJo: {
    id: id(703),
    operationId: id(704),
    briefId: briefs.teammateHandoff.id,
    briefVersion: 1,
    recipient: { userId: users.jo.id },
    expiresAt: "2026-10-26T18:06:00.000Z",
    status: "available",
  },
} satisfies Record<string, Delivery>;

export const readProgress: ReadProgress = {
  id: id(801),
  briefId: briefs.reading.id,
  briefVersion: 1,
  deviceId: devices.samPhone.id,
  fraction: 0.4,
  updatedAt: T2,
  revision: 3,
};

export const operations = {
  focusTaskSucceeded: {
    id: id(901),
    planId: plans.focusTask.id,
    status: "succeeded",
    results: [
      { actionId: id(403), status: "succeeded" },
      { actionId: id(404), status: "succeeded" },
    ],
    updatedAt: T2,
  },
} satisfies Record<string, Operation>;

/** Fixture 6: a model proposing an arbitrary shell action must fail schema validation. */
export const invalidShellAction = { kind: "run_shell", command: "del /s /q C:\\" };
