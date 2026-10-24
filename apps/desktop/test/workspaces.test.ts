import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Journal } from "../src/journal.ts";
import { BrowserBridge } from "../src/browser.ts";
import { ControlEngine } from "../src/control.ts";
import { LocalWorkspaces } from "../src/workspaces.ts";

const journals: Journal[] = [];
afterEach(() => { for (const journal of journals.splice(0)) journal.close(); });
async function setup() {
  const journal = new Journal(":memory:"); journals.push(journal);
  const windows = { list: async () => [{ handle: "42", processId: 100, processStartedAt: "2026-10-25T00:00:00.000Z", title: "Notes", appName: "editor", active: true }], focus: async () => {} };
  const engine = new ControlEngine(journal, new BrowserBridge(), windows), store = new LocalWorkspaces(engine);
  const snapshot = await engine.getSnapshot(), native = snapshot.resources[0]!;
  return { journal, engine, store, snapshot, native, input: { name: "Research", goal: "Compare sources", selectedResourceIds: [native.id], primaryWindowId: native.id, expectedSnapshotRevision: snapshot.revision } };
}

describe("local workspace UI services", () => {
  it("stores a single canonical Workspace and returns saved cards", async () => {
    const ctx = await setup(), workspace = await ctx.store.create(ctx.input);
    expect(workspace.deviceId).toBe(ctx.engine.deviceId);
    expect(ctx.store.list().workspaces).toEqual([{ workspace }]);
    expect(ctx.journal.list("task:")).toEqual([]);
  });
  it("rejects missing, duplicate and wrong-kind primary membership", async () => {
    const ctx = await setup();
    await expect(ctx.store.create({ ...ctx.input, selectedResourceIds: [randomUUID()] })).rejects.toMatchObject({ code: "STALE_STATE" });
    await expect(ctx.store.create({ ...ctx.input, selectedResourceIds: [ctx.native.id, ctx.native.id] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(ctx.store.create({ ...ctx.input, primaryTabId: ctx.native.id })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("preserves the explicit note without inventing document contents", async () => {
    const ctx = await setup(), workspace = await ctx.store.create(ctx.input);
    const checkpoint = await ctx.store.save({ workspaceId: workspace.id, userNote: "Next: compare maintenance costs." });
    expect(checkpoint.taskId).toBe(workspace.id);
    expect(checkpoint.summary).toEqual([{ text: "Next: compare maintenance costs.", basis: "user_stated", sourceIds: [] }]);
    expect(checkpoint.sourceIds).toEqual([]);
    const reopened = new LocalWorkspaces(ctx.engine).list().workspaces[0]!;
    expect(reopened.workspace.latestCheckpointId).toBe(checkpoint.id);
    expect(reopened.latestCheckpoint?.userNote).toBe(checkpoint.userNote);
  });
  it("previews a saved primary instead of acting while saving", async () => {
    const ctx = await setup(), workspace = await ctx.store.create(ctx.input);
    const plan = await ctx.store.preview(workspace.id, "resume");
    expect(plan.workspaceId).toBe(workspace.id);
    expect(plan.finalFocusResourceId).toBe(ctx.native.id);
    expect(plan.approvalRequired).toBe(true);
    expect(ctx.store.operations().operations).toHaveLength(0);
  });
});
