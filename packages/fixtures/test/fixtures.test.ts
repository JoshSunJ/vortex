import { describe, expect, it } from "vitest";
import * as C from "@vortex/contracts";
import * as F from "../src/index";

describe("fixtures parse with the canonical contracts", () => {
  it("snapshot, task, checkpoint, read progress", () => {
    expect(() => C.Snapshot.parse(F.snapshot)).not.toThrow();
    expect(() => C.Task.parse(F.task)).not.toThrow();
    expect(() => C.Checkpoint.parse(F.checkpoint)).not.toThrow();
    expect(() => C.ReadProgress.parse(F.readProgress)).not.toThrow();
  });

  it("collections", () => {
    for (const s of Object.values(F.sources)) C.Source.parse(s);
    for (const b of Object.values(F.briefs)) C.Brief.parse(b);
    for (const d of Object.values(F.deliveries)) C.Delivery.parse(d);
    for (const o of Object.values(F.operations)) C.Operation.parse(o);
    for (const p of Object.values(F.plans)) C.PlanOrClarification.parse(p);
    C.PlanOrClarification.parse(F.clarification);
  });

  it("only advertises enabled capabilities", () => {
    for (const kind of F.snapshot.capabilities) {
      expect(C.DEFERRED_ACTION_KINDS as readonly string[]).not.toContain(kind);
    }
  });
});

describe("contract guards", () => {
  it("rejects an arbitrary shell action (fixture 6)", () => {
    expect(C.Action.safeParse(F.invalidShellAction).success).toBe(false);
  });

  it("rejects extra fields smuggled into a known action", () => {
    const action = { ...F.plans.focusTask.actions[1]!.action, command: "calc.exe" };
    expect(C.Action.safeParse(action).success).toBe(false);
  });

  it("rejects non-HTTP(S) and credentialed URLs for reopen", () => {
    expect(C.HttpUrl.safeParse("file:///C:/secrets.txt").success).toBe(false);
    expect(C.HttpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(C.HttpUrl.safeParse("https://user:pw@example.org/").success).toBe(false);
    expect(C.HttpUrl.safeParse("https://example.org/a").success).toBe(true);
  });

  it("caps plans at ten mutations", () => {
    const action = F.plans.focusTask.actions[1]!;
    const plan = { ...F.plans.focusTask, actions: Array.from({ length: 11 }, () => action) };
    expect(C.Plan.safeParse(plan).success).toBe(false);
  });
});
