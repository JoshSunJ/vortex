import { describe, expect, it } from "vitest";
import { Checkpoint, Plan, Workspace, WorkspaceCommand } from "../src/index";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const now = "2026-10-25T18:00:00.000Z";

const basePlan = {
  kind: "plan" as const,
  id: id(1),
  commandId: id(2),
  workspaceId: id(3),
  deviceId: id(4),
  snapshotRevision: 1,
  actions: [
    { actionId: id(10), action: { kind: "activate_tab" as const, target: { resourceId: id(20), expectedRevision: 1 } } },
    { actionId: id(11), action: { kind: "focus_window" as const, target: { resourceId: id(21), expectedRevision: 1 } } },
  ],
  explanation: "test",
  approvalRequired: false,
  planHash: "h",
  createdAt: now,
  expiresAt: now,
};

describe("revision 1.3 workspace contracts", () => {
  it("finalFocusResourceId must be the last focus/activation target", () => {
    expect(Plan.safeParse({ ...basePlan, finalFocusResourceId: id(21) }).success).toBe(true);
    expect(Plan.safeParse({ ...basePlan, finalFocusResourceId: id(20) }).success).toBe(false);
    expect(Plan.safeParse({ ...basePlan, finalFocusResourceId: id(99) }).success).toBe(false);
    expect(Plan.safeParse(basePlan).success).toBe(true);
  });

  it("workspace bounds: name <= 100, goal <= 2000, membership <= 100", () => {
    const ws = {
      id: id(3),
      goal: "g",
      resourceIds: [id(20)],
      updatedAt: now,
      name: "Group Project",
      deviceId: id(4),
      revision: 1,
      createdAt: now,
    };
    expect(Workspace.safeParse(ws).success).toBe(true);
    expect(Workspace.safeParse({ ...ws, name: "x".repeat(101) }).success).toBe(false);
    expect(Workspace.safeParse({ ...ws, goal: "x".repeat(2_001) }).success).toBe(false);
    expect(Workspace.safeParse({ ...ws, resourceIds: Array.from({ length: 101 }, () => id(20)) }).success).toBe(false);
  });

  it("commands are a closed vocabulary", () => {
    expect(WorkspaceCommand.safeParse({ kind: "focus_workspace", workspaceId: id(3) }).success).toBe(true);
    expect(WorkspaceCommand.safeParse({ kind: "focus_workspace", workspaceId: id(3), shell: "x" }).success).toBe(false);
    expect(WorkspaceCommand.safeParse({ kind: "close_all", workspaceId: id(3) }).success).toBe(false);
  });

  it("checkpoint keeps an explicit userNote", () => {
    const cp = Checkpoint.parse({
      id: id(5),
      taskId: id(3),
      userNote: "Next I need to compare costs.",
      createdAt: now,
      version: 1,
      resourceSnapshots: [],
      sourceIds: [],
      summary: [],
    });
    expect(cp.userNote).toBe("Next I need to compare costs.");
  });
});
