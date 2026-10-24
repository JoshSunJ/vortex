import { describe, expect, it } from "vitest";
import { Plan, type Snapshot } from "@vortex/contracts";
import * as F from "@vortex/fixtures";
import { createFixtureHarness } from "../src/fixtureClient";

const desktopId = F.devices.samDesktop.id;
const rev = F.snapshot.revision;
const planReq = { deviceId: desktopId, snapshotRevision: rev };

const createReq = (overrides: Record<string, unknown> = {}) => ({
  name: "Group Project v2",
  goal: "Finish the heat island mitigation section",
  deviceId: desktopId,
  selectedResourceIds: [F.resources.heatArticle.id, F.resources.notesWindow.id],
  primaryTabId: F.resources.heatArticle.id,
  primaryWindowId: F.resources.notesWindow.id,
  expectedSnapshotRevision: rev,
  ...overrides,
});

function expectCode(res: { ok: boolean; error?: { code: string } }, code: string) {
  expect(res.ok ? "ok" : res.error?.code).toBe(code);
}

describe("workspace CRUD", () => {
  it("lists only the caller's workspaces with the latest checkpoint", async () => {
    const h = await createFixtureHarness();
    const sam = await h.as("samDesktop").listWorkspaces();
    if (!sam.ok) throw new Error(sam.error.message);
    expect(sam.data.workspaces.map((c) => c.workspace.name).sort()).toEqual(["Apartment Budget", "Group Project"]);
    const gp = sam.data.workspaces.find((c) => c.workspace.id === F.workspaces.groupProject.id)!;
    expect(gp.latestCheckpoint?.userNote).toBe("Next I need to compare costs.");

    const mallory = await h.as("malloryPhone").listWorkspaces();
    expectCode(mallory, "FORBIDDEN"); // phone has no metadata:read
  });

  it("creates with explicit membership; validates primaries and snapshot revision", async () => {
    const h = await createFixtureHarness();
    const desktop = h.as("samDesktop");
    const created = await desktop.createWorkspace(createReq());
    if (!created.ok) throw new Error(created.error.message);
    expect(created.data.resourceIds).toEqual([F.resources.heatArticle.id, F.resources.notesWindow.id]);
    expect(created.data.revision).toBe(1);

    // wrong-kind primary
    expectCode(await desktop.createWorkspace(createReq({ primaryTabId: F.resources.notesWindow.id })), "VALIDATION_ERROR");
    // non-member primary
    expectCode(await desktop.createWorkspace(createReq({ primaryTabId: F.resources.projectDoc.id })), "VALIDATION_ERROR");
    // resource not in the live snapshot
    expectCode(await desktop.createWorkspace(createReq({ selectedResourceIds: [F.closedWindow.id] , primaryWindowId: undefined, primaryTabId: undefined })), "VALIDATION_ERROR");
    // stale snapshot
    expectCode(await desktop.createWorkspace(createReq({ expectedSnapshotRevision: rev - 1 })), "STALE_STATE");
    // too long a name
    expectCode(await desktop.createWorkspace(createReq({ name: "x".repeat(101) })), "VALIDATION_ERROR");
  });

  it("idempotent create: same key replays, changed body conflicts", async () => {
    const h = await createFixtureHarness();
    const desktop = h.as("samDesktop");
    const key = crypto.randomUUID();
    const a = await desktop.createWorkspace(createReq(), key);
    const b = await desktop.createWorkspace(createReq(), key);
    if (!a.ok || !b.ok) throw new Error("create failed");
    expect(b.data.id).toBe(a.data.id);
    expectCode(await desktop.createWorkspace(createReq({ name: "Other" }), key), "IDEMPOTENCY_CONFLICT");
  });

  it("update rejects stale revisions and cross-user edits; null clears a primary", async () => {
    const h = await createFixtureHarness();
    const desktop = h.as("samDesktop");
    const id = F.workspaces.groupProject.id;
    const updated = await desktop.updateWorkspace(id, { expectedRevision: 1, goal: "New goal", primaryWindowId: null });
    if (!updated.ok) throw new Error(updated.error.message);
    expect(updated.data.revision).toBe(2);
    expect(updated.data.primaryWindowId).toBeUndefined();
    expect(updated.data.primaryTabId).toBe(F.resources.heatArticle.id);

    expectCode(await desktop.updateWorkspace(id, { expectedRevision: 1, goal: "again" }), "STALE_STATE");
    expectCode(
      await desktop.updateWorkspace(id, { expectedRevision: 2, selectedResourceIds: [F.resources.projectDoc.id] }),
      "VALIDATION_ERROR", // primary tab would no longer be a member
    );
  });
});

describe("focus, switch and resume", () => {
  it("focus activates only the primary tab, then focuses the primary window last", async () => {
    const h = await createFixtureHarness();
    const res = await h.as("samDesktop").focusWorkspace(F.workspaces.groupProject.id, planReq);
    if (!res.ok || res.data.kind !== "plan") throw new Error("expected a plan");
    const plan = Plan.parse(res.data);
    expect(plan.workspaceId).toBe(F.workspaces.groupProject.id);
    expect(plan.actions.map((a) => a.action.kind)).toEqual(["activate_tab", "focus_window"]);
    expect(plan.finalFocusResourceId).toBe(F.resources.notesWindow.id);
    expect(plan.approvalRequired).toBe(false);
  });

  it("3 PM gate: create -> checkpoint with note -> switch away -> resume the same workspace ID", async () => {
    const h = await createFixtureHarness();
    const desktop = h.as("samDesktop");
    const ws = await desktop.createWorkspace(createReq());
    if (!ws.ok) throw new Error(ws.error.message);

    const cp = await desktop.createCheckpoint({
      taskId: ws.data.id,
      resourceIds: ws.data.resourceIds,
      sourceIds: [F.sources.heatArticle.id],
      userNote: "Next I need to compare costs.",
      consentId: crypto.randomUUID(),
    });
    if (!cp.ok) throw new Error(cp.error.message);
    expect(cp.data.results[0]?.workspaceId).toBe(ws.data.id);
    const checkpointId = cp.data.results[0]?.checkpointId;

    const away = await desktop.focusWorkspace(F.workspaces.budget.id, planReq);
    expect(away.ok && away.data.kind === "plan" && away.data.finalFocusResourceId).toBe(F.resources.budgetSheet.id);

    const list = await desktop.listWorkspaces();
    if (!list.ok) throw new Error(list.error.message);
    const card = list.data.workspaces.find((c) => c.workspace.id === ws.data.id)!;
    expect(card.workspace.latestCheckpointId).toBe(checkpointId);
    expect(card.latestCheckpoint?.userNote).toBe("Next I need to compare costs.");
    expect(card.latestCheckpoint?.summary).toEqual([]); // no invented summary from metadata

    const resume = await desktop.resumeWorkspace(ws.data.id, planReq);
    if (!resume.ok || resume.data.kind !== "plan") throw new Error("expected a plan");
    expect(resume.data.workspaceId).toBe(ws.data.id);
    expect(resume.data.finalFocusResourceId).toBe(F.resources.notesWindow.id);

    // The plan runs through the ordinary execute path.
    const op = await desktop.executePlan(resume.data.id, { operationId: crypto.randomUUID(), expectedRevision: rev });
    expect(op.ok && op.data.status).toBe("succeeded");
  });

  it("closed native window is reported unavailable, never replaced by a title match", async () => {
    const snapshot: Snapshot = {
      ...F.snapshot,
      resources: F.snapshot.resources.filter((r) => r.id !== F.resources.notesWindow.id),
    };
    const h = await createFixtureHarness(Date.now, { snapshot });
    const res = await h.as("samDesktop").resumeWorkspace(F.workspaces.groupProject.id, planReq);
    if (!res.ok || res.data.kind !== "plan") throw new Error("expected a plan");
    expect(res.data.actions.map((a) => a.action.kind)).toEqual(["activate_tab"]);
    expect(res.data.finalFocusResourceId).toBe(F.resources.heatArticle.id);
    expect(res.data.explanation).toContain("Unavailable");
  });

  it("resume reopens checkpoint-bound URLs whose tab is gone, with approval", async () => {
    const snapshot: Snapshot = {
      ...F.snapshot,
      resources: F.snapshot.resources.filter((r) => r.id !== F.resources.heatArticle.id),
    };
    const h = await createFixtureHarness(Date.now, { snapshot });
    const res = await h.as("samDesktop").resumeWorkspace(F.workspaces.groupProject.id, planReq);
    if (!res.ok || res.data.kind !== "plan") throw new Error("expected a plan");
    expect(res.data.actions.map((a) => a.action.kind)).toEqual(["open_saved_url", "focus_window"]);
    expect(res.data.approvalRequired).toBe(true);
  });

  it("no live primary target -> clarification instead of a guess", async () => {
    const h = await createFixtureHarness();
    const desktop = h.as("samDesktop");
    const ws = await desktop.createWorkspace(createReq({ primaryTabId: undefined, primaryWindowId: undefined }));
    if (!ws.ok) throw new Error(ws.error.message);
    const res = await desktop.focusWorkspace(ws.data.id, planReq);
    expect(res.ok && res.data.kind).toBe("clarification");
  });

  it("stale snapshot, other users and phones cannot plan workspace focus", async () => {
    const h = await createFixtureHarness();
    const id = F.workspaces.groupProject.id;
    expectCode(await h.as("samDesktop").focusWorkspace(id, { ...planReq, snapshotRevision: rev - 1 }), "STALE_STATE");
    expectCode(await h.as("samPhone").focusWorkspace(id, planReq), "FORBIDDEN");
    expectCode(await h.as("samDesktop").focusWorkspace(F.duplicateNameWorkspace.id, planReq), "NOT_FOUND");
  });

  it("checkpoint rejects resources outside the workspace", async () => {
    const h = await createFixtureHarness();
    const res = await h.as("samDesktop").createCheckpoint({
      taskId: F.workspaces.budget.id,
      resourceIds: [F.resources.heatArticle.id],
      sourceIds: [],
      consentId: crypto.randomUUID(),
    });
    expectCode(res, "VALIDATION_ERROR");
  });
});
