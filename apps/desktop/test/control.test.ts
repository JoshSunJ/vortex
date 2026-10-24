import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ControlEngine, hashPlan } from "../src/control.ts";
import { BrowserBridge } from "../src/browser.ts";
import { Journal } from "../src/journal.ts";
import { ControlError } from "../src/errors.ts";
import { createControlServer } from "../src/server.ts";
import type { NativeWindow, WindowsAdapter } from "../src/windows.ts";
import type { Workspace } from "@vortex/contracts";

const WINDOW: NativeWindow = { handle: "1234", processId: 10, processStartedAt: "2026-10-25T00:00:00.000Z", title: "Project notes", appName: "editor", active: true };
class FakeWindows implements WindowsAdapter {
  rows = [{ ...WINDOW }]; calls: NativeWindow[] = []; denied = false;
  async list() { return structuredClone(this.rows); }
  async focus(value: NativeWindow) { if (this.denied) throw new ControlError("FOCUS_DENIED", "Denied"); this.calls.push(value); }
}
const journals: Journal[] = [];
afterEach(() => { for (const journal of journals.splice(0)) journal.close(); });
function setup() {
  const journal = new Journal(":memory:"); journals.push(journal);
  const windows = new FakeWindows(), browser = new BrowserBridge(100);
  const engine = new ControlEngine(journal, browser, windows);
  return { journal, windows, browser, engine };
}
async function approved(ctx: ReturnType<typeof setup>) {
  const snapshot = await ctx.engine.getSnapshot();
  const plan = await ctx.engine.planResourceFocus(snapshot.resources[0]!.id);
  const approval = ctx.engine.approvePlan(plan.id, plan.planHash);
  return { plan, req: { operationId: randomUUID(), expectedRevision: plan.snapshotRevision, approvalId: approval.approvalId } };
}

describe("live-control authority boundary", () => {
  it("does not expose native bindings and keeps IDs stable while activity changes", async () => {
    const ctx = setup(); const first = await ctx.engine.getSnapshot();
    ctx.windows.rows[0]!.active = false;
    const second = await ctx.engine.getSnapshot();
    expect(second.resources[0]!.id).toBe(first.resources[0]!.id);
    expect(second.resources[0]!.revision).toBe(first.resources[0]!.revision);
    expect(JSON.stringify(second)).not.toContain("handle");
    expect(JSON.stringify(second)).not.toContain("processId");
  });
  it("serializes duplicate execution and replays the receipt without repeating focus", async () => {
    const ctx = setup(); const { plan, req } = await approved(ctx);
    const [one, two] = await Promise.all([ctx.engine.executePlan(plan.id, req), ctx.engine.executePlan(plan.id, req)]);
    expect(one.status).toBe("succeeded"); expect(two).toEqual(one); expect(ctx.windows.calls).toHaveLength(1);
    await expect(ctx.engine.executePlan(plan.id, { ...req, expectedRevision: req.expectedRevision + 1 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("refuses a recycled HWND/process identity after preview", async () => {
    const ctx = setup(); const { plan, req } = await approved(ctx);
    ctx.windows.rows[0]!.processStartedAt = "2026-10-25T00:01:00.000Z";
    await expect(ctx.engine.executePlan(plan.id, req)).rejects.toMatchObject({ code: "STALE_STATE" });
    expect(ctx.windows.calls).toHaveLength(0);
  });
  it("requires exact approval and rejects modified/disabled plans", async () => {
    const ctx = setup(); const { plan, req } = await approved(ctx);
    await expect(ctx.engine.executePlan(plan.id, { ...req, approvalId: undefined })).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(() => ctx.engine.registerPlan({ ...plan, explanation: "modified" })).toThrow();
    const tooLong = { ...plan, id: randomUUID(), expiresAt: new Date(Date.now() + 600_000).toISOString() };
    tooLong.planHash = hashPlan(tooLong);
    expect(() => ctx.engine.registerPlan(tooLong)).toThrow();
    const disabled = { ...plan, id: randomUUID(), finalFocusResourceId: undefined, actions: [{ actionId: randomUUID(), action: { kind: "archive_tabs" as const, targets: [], checkpointId: randomUUID() } }] };
    disabled.planHash = hashPlan(disabled);
    expect(() => ctx.engine.registerPlan(disabled)).toThrow();
    expect(ctx.windows.calls).toHaveLength(0);
  });
  it("reports Windows focus denial as failure", async () => {
    const ctx = setup(); const { plan, req } = await approved(ctx); ctx.windows.denied = true;
    const result = await ctx.engine.executePlan(plan.id, req);
    expect(result.status).toBe("failed");
    expect(result.results[0]).toMatchObject({ status: "failed", code: "FOCUS_DENIED" });
  });
  it("does not guess another same-title window when a saved primary disappears", async () => {
    const ctx = setup(); const snapshot = await ctx.engine.getSnapshot();
    const workspace: Workspace = { id: randomUUID(), name: "Research", goal: "Compare", deviceId: ctx.engine.deviceId, revision: 0, resourceIds: [snapshot.resources[0]!.id], primaryWindowId: snapshot.resources[0]!.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const plan = await ctx.engine.planWorkspaceFocus(workspace, snapshot.revision);
    expect(plan.finalFocusResourceId).toBe(workspace.primaryWindowId);
    ctx.windows.rows[0]!.handle = "9999";
    const next = await ctx.engine.getSnapshot();
    await expect(ctx.engine.planWorkspaceFocus(workspace, next.revision)).rejects.toMatchObject({ code: "NEEDS_CLARIFICATION" });
  });
  it("rejects stale browser snapshots and exposes only ordinary validated tab data", () => {
    const ctx = setup(); const sessionId = randomUUID();
    ctx.browser.acceptSnapshot({ sessionId, sequence: 1, tabs: [] });
    expect(() => ctx.browser.acceptSnapshot({ sessionId, sequence: 1, tabs: [] })).toThrow();
    expect(() => ctx.browser.acceptSnapshot({ sessionId, sequence: 2, tabs: [{ tabId: 1, windowId: 1, title: "secret", url: "file:///secret", active: true, pinned: false, audible: false }] })).toThrow();
  });
  it("treats a timed-out browser effect as unknown, not success", async () => {
    const browser = new BrowserBridge(15);
    browser.acceptSnapshot({ sessionId: randomUUID(), sequence: 1, tabs: [] });
    await expect(browser.send({ kind: "open_saved_url", url: "https://example.org/" })).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    expect(browser.commands().commands).toHaveLength(0);
  });
});

it("recovers an interrupted durable effect without rerunning it", () => {
  const path = join(tmpdir(), `vortex-control-${randomUUID()}.sqlite`);
  const id = randomUUID(); const journal = new Journal(path);
  journal.set(`operation:${id}`, { hash: "saved-intent", operation: { id, status: "running", results: [{ actionId: randomUUID(), status: "running" }, { actionId: randomUUID(), status: "pending" }], updatedAt: new Date().toISOString() } });
  journal.close();
  const reopened = new Journal(path);
  const saved = reopened.get<any>(`operation:${id}`);
  expect(saved.operation.status).toBe("partial");
  expect(saved.operation.results.map((r: any) => r.status)).toEqual(["unknown", "skipped"]);
  reopened.close();
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) unlinkSync(path + suffix);
});

it("enforces loopback token and exact extension Origin, including preflight", async () => {
  const ctx = setup(); const token = "t".repeat(64), extensionId = "a".repeat(32);
  const server = createControlServer(ctx.engine, { token, extensionId });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const missing = await fetch(`${url}/control/snapshot`); expect(missing.status).toBe(401);
    const hostile = await fetch(`${url}/bridge/commands`, { headers: { Authorization: `Bearer ${token}`, Origin: "https://evil.example" } }); expect(hostile.status).toBe(403);
    const noOrigin = await fetch(`${url}/bridge/commands`, { headers: { Authorization: `Bearer ${token}` } }); expect(noOrigin.status).toBe(403);
    const good = await fetch(`${url}/control/snapshot`, { headers: { Authorization: `Bearer ${token}` } }); expect(good.status).toBe(200);
    const body = await good.text(); expect(body).not.toContain(token); expect(body).not.toContain("handle");
    const preflight = await fetch(`${url}/bridge/snapshot`, { method: "OPTIONS", headers: { Origin: `chrome-extension://${extensionId}` } }); expect(preflight.status).toBe(204);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
