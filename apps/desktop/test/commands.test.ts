import { afterEach, describe, expect, it } from "vitest";
import { Journal } from "../src/journal.ts";
import { BrowserBridge } from "../src/browser.ts";
import { ControlEngine } from "../src/control.ts";
import { LocalWorkspaces } from "../src/workspaces.ts";
import { LocalCommands } from "../src/commands.ts";
import { createControlServer } from "../src/server.ts";

const journals: Journal[] = [];
afterEach(() => { for (const journal of journals.splice(0)) journal.close(); });
async function setup() {
  const journal = new Journal(":memory:"); journals.push(journal);
  let calls = 0;
  const windows = { list: async () => [{ handle: "42", processId: 100, processStartedAt: "2026-10-25T00:00:00.000Z", title: "Project notes", appName: "editor", active: true }], focus: async () => { calls++; } };
  const engine = new ControlEngine(journal, new BrowserBridge(), windows), store = new LocalWorkspaces(engine), commands = new LocalCommands(engine);
  const snapshot = await engine.getSnapshot(), native = snapshot.resources[0]!;
  const create = async (name: string) => store.create({ name, goal: "Compare sources", selectedResourceIds: [native.id], primaryWindowId: native.id, expectedSnapshotRevision: snapshot.revision });
  return { engine, store, commands, native, create, calls: () => calls };
}
describe("bounded local command previews", () => {
  it("finds from live metadata without focusing anything", async () => {
    const ctx = await setup(), result = await ctx.commands.resolve({ text: "Please find project editor." });
    expect(result).toMatchObject({ kind: "find", resources: [{ id: ctx.native.id }] });
    expect(ctx.calls()).toBe(0);
  });
  it("resolves a saved workspace to the existing exact approval plan", async () => {
    const ctx = await setup(), workspace = await ctx.create("Research");
    const result = await ctx.commands.resolve({ text: 'Resume "Research".' });
    expect(result).toMatchObject({ kind: "plan", plan: { workspaceId: workspace.id, approvalRequired: true, finalFocusResourceId: ctx.native.id } });
    expect(ctx.calls()).toBe(0);
    expect(ctx.store.operations().operations).toEqual([]);
  });
  it("does not silently select partial or duplicate workspace names", async () => {
    const ctx = await setup(); await ctx.create("Research"); await ctx.create("Research papers");
    expect(await ctx.commands.resolve({ text: "focus rese" })).toMatchObject({ kind: "clarification", choices: expect.arrayContaining([expect.objectContaining({ label: "Research" }), expect.objectContaining({ label: "Research papers" })]) });
    await ctx.create("Research");
    const duplicate = await ctx.commands.resolve({ text: "focus Research" });
    expect(duplicate).toMatchObject({ kind: "clarification", choices: [{ label: "Research" }, { label: "Research" }] });
    expect(ctx.calls()).toBe(0);
  });
  it("prepares creation without inventing membership or persisting a workspace", async () => {
    const ctx = await setup();
    expect(await ctx.commands.resolve({ text: "create workspace called Biology" })).toEqual({ kind: "create_workspace", name: "Biology" });
    expect(ctx.store.list().workspaces).toEqual([]);
  });
  it("returns an explicit checkpoint draft without saving or rewriting the note", async () => {
    const ctx = await setup(), workspace = await ctx.create("Research");
    expect(await ctx.commands.resolve({ text: "save checkpoint for Research saying Next: compare the costs." })).toEqual({ kind: "checkpoint", workspaceId: workspace.id, workspaceName: "Research", userNote: "Next: compare the costs." });
    expect(ctx.store.list().workspaces[0]!.latestCheckpoint).toBeUndefined();
  });
  it("clarifies vague targets and unsupported control instead of executing", async () => {
    const ctx = await setup();
    expect(await ctx.commands.resolve({ text: "focus notes" })).toMatchObject({ kind: "clarification", choices: [{ kind: "resource", id: ctx.native.id }] });
    expect(await ctx.commands.resolve({ text: "focus Project notes" })).toMatchObject({ kind: "plan" });
    expect(await ctx.commands.resolve({ text: "delete all files and close every window" })).toMatchObject({ kind: "clarification", choices: [] });
    expect(await ctx.commands.resolve({ text: "send this to my phone" })).toMatchObject({ kind: "clarification", message: expect.stringContaining("not connected") });
    expect(ctx.calls()).toBe(0);
  });
  it("validates command size and unknown fields", async () => {
    const ctx = await setup();
    await expect(ctx.commands.resolve({ text: "" })).rejects.toThrow();
    await expect(ctx.commands.resolve({ text: "a".repeat(2401) })).rejects.toThrow();
    await expect(ctx.commands.resolve({ text: "focus notes", execute: true })).rejects.toThrow();
  });
  it("keeps the command endpoint authenticated and returns previews only", async () => {
    const ctx = await setup(), token = "x".repeat(64), server = createControlServer(ctx.engine, { token });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/control/commands/preview`;
    try {
      expect((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "focus Project notes" }) })).status).toBe(401);
      const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: "focus Project notes" }) });
      expect(await response.json()).toMatchObject({ ok: true, data: { kind: "plan", plan: { approvalRequired: true } } });
      expect(ctx.calls()).toBe(0);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
