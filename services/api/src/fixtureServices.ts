// FIXTURE SERVICES: in-memory stand-ins so dashboard, desktop and phone can integrate before
// Nova's intelligence, Josh's executor and the Spacetime module exist. Ownership and expiry rules
// are real here (they are what the API promises); content and plans are canned fixture data.
import type { Action, Checkpoint, Clarification, Delivery, Operation, Plan, ReadProgress, Resource, Snapshot, Source, Workspace } from "@vortex/contracts";
import * as F from "@vortex/fixtures";
import { DEFAULT_SCOPES, type AuthContext } from "./auth";
import { ApiError } from "./envelope";
import type { Device, Pairing } from "./schemas";
import type { Services } from "./services";

const APPROVAL_TTL_MS = 2 * 60_000;
const PAIRING_TTL_MS = 2 * 60_000;
const DELIVERY_TTL_MS = 24 * 3600_000;

type Owned<T> = T & { ownerUserId: string };

export type FixtureOptions = {
  /** Override the desktop snapshot, e.g. to simulate a closed native window. */
  snapshot?: Snapshot;
};

export function createFixtureServices(now: () => number = Date.now, options: FixtureOptions = {}): Services {
  const iso = (ms = now()) => new Date(ms).toISOString();
  const clone = <T>(v: T): T => structuredClone(v);
  const snapshot = clone(options.snapshot ?? F.snapshot);

  const devices = new Map<string, Device & { revoked: boolean }>(
    Object.values(F.devices).map((d) => [
      d.id,
      { id: d.id, userId: d.userId, name: d.name, kind: d.kind, scopes: DEFAULT_SCOPES[d.kind], pairedAt: "2026-10-25T18:00:00.000Z", revoked: false },
    ]),
  );
  const plans = new Map<string, Owned<Plan>>();
  const approvals = new Map<string, { planId: string; planHash: string; userId: string; deviceId: string; expiresAt: number }>();
  const operations = new Map<string, Owned<Operation>>(
    Object.values(F.operations).map((o) => [o.id, { ...clone(o), ownerUserId: F.users.sam.id }]),
  );
  const briefs = new Map(Object.values(F.briefs).map((b) => [b.id, { ...clone(b), ownerUserId: F.users.sam.id as string }]));
  const deliveries = new Map<string, Owned<Delivery>>(
    Object.values(F.deliveries).map((d) => [d.id, { ...clone(d), ownerUserId: F.users.sam.id }]),
  );
  const progress = new Map<string, ReadProgress>([[`${F.readProgress.briefId}:${F.readProgress.deviceId}`, clone(F.readProgress)]]);
  const pairings = new Map<string, { pairing: Pairing; userId: string; desktopDeviceId: string; claimed?: { name: string; userId: string } ; used: boolean }>();

  const workspaces = new Map<string, Owned<Workspace>>(
    (Object.values(F.workspaces) as Workspace[]).map((w) => [w.id, { ...clone(w), ownerUserId: F.users.sam.id }]),
  );
  const checkpoints = new Map<string, Owned<Checkpoint>>([[F.checkpoint.id, { ...clone(F.checkpoint), ownerUserId: F.users.sam.id }]]);
  const knownSources = Object.values(F.sources) as Source[];

  const strip = <T extends { ownerUserId: string }>({ ownerUserId: _, ...rest }: T) => rest;
  const liveResource = (resourceId: string): Resource | undefined => snapshot.resources.find((r) => r.id === resourceId);

  function ownedWorkspace(auth: AuthContext, workspaceId: string) {
    const ws = workspaces.get(workspaceId);
    if (!ws) throw new ApiError("NOT_FOUND", "Workspace not found");
    if (ws.ownerUserId !== auth.userId) throw new ApiError("FORBIDDEN", "Workspace belongs to another user");
    return ws;
  }

  function ownedCheckpoint(auth: AuthContext, checkpointId: string) {
    const cp = checkpoints.get(checkpointId);
    if (!cp || cp.ownerUserId !== auth.userId) throw new ApiError("NOT_FOUND", "Checkpoint not found");
    return cp;
  }

  /** New members must be live resources on the workspace's device; no automatic additions. */
  function validateNewMembers(deviceId: string, resourceIds: string[], existing: string[] = []) {
    if (new Set(resourceIds).size !== resourceIds.length) throw new ApiError("VALIDATION_ERROR", "Duplicate workspace members");
    for (const rid of resourceIds) {
      if (existing.includes(rid)) continue;
      const r = liveResource(rid);
      if (!r) throw new ApiError("VALIDATION_ERROR", `Resource ${rid} is not in the current snapshot`);
      if (r.deviceId !== deviceId) throw new ApiError("VALIDATION_ERROR", `Resource ${rid} belongs to another device`);
    }
  }

  /** Primary targets must be selected members of the matching kind. */
  function validatePrimary(resourceIds: string[], primaryId: string | undefined, kind: Resource["kind"], unchanged: boolean) {
    if (primaryId === undefined) return;
    if (!resourceIds.includes(primaryId)) throw new ApiError("VALIDATION_ERROR", `Primary ${kind} must be a selected member`);
    const r = liveResource(primaryId);
    if (r ? r.kind !== kind : !unchanged) throw new ApiError("VALIDATION_ERROR", `Primary ${kind} must be a live resource of kind ${kind}`);
  }

  function storePlan(auth: AuthContext, plan: Plan) {
    plan.planHash = `fixture-${plan.id}`;
    plans.set(plan.id, { ...plan, ownerUserId: auth.userId });
    return plan;
  }

  // Stand-in for Josh's planWorkspaceFocus/planWorkspaceResume: only the saved primary tab is
  // activated and only the saved primary window is focused. Missing members are reported as
  // unavailable, never replaced by a title match. No primary targets -> ask the user.
  function workspacePlan(auth: AuthContext, ws: Owned<Workspace>, req: { deviceId: string; snapshotRevision: number }, mode: "focus" | "resume"): Plan | Clarification {
    if (req.deviceId !== ws.deviceId) throw new ApiError("VALIDATION_ERROR", "Workspace belongs to another device");
    if (req.snapshotRevision !== snapshot.revision) throw new ApiError("STALE_STATE", "Workspace changed; refresh the snapshot");

    const cp = mode === "resume" && ws.latestCheckpointId ? checkpoints.get(ws.latestCheckpointId) : undefined;
    const savedTitle = (rid: string) => cp?.resourceSnapshots.find((r) => r.id === rid)?.title;
    const tab = ws.primaryTabId ? liveResource(ws.primaryTabId) : undefined;
    const win = ws.primaryWindowId ? liveResource(ws.primaryWindowId) : undefined;
    const unavailable: string[] = [];
    if (ws.primaryTabId && !tab) unavailable.push(savedTitle(ws.primaryTabId) ?? "the saved primary tab");
    if (ws.primaryWindowId && !win) unavailable.push(savedTitle(ws.primaryWindowId) ?? "the saved primary window");

    const actions: { actionId: string; action: Action }[] = [];
    if (cp) {
      for (const sourceId of cp.sourceIds) {
        const src = knownSources.find((s) => s.id === sourceId);
        if (!src || (src.resourceId && liveResource(src.resourceId))) continue;
        actions.push({
          actionId: crypto.randomUUID(),
          action: { kind: "open_saved_url", checkpointId: cp.id, sourceId, url: src.url, expectedSourceHash: src.contentHash },
        });
      }
    }
    if (tab) actions.push({ actionId: crypto.randomUUID(), action: { kind: "activate_tab", target: { resourceId: tab.id, expectedRevision: tab.revision } } });
    if (win) actions.push({ actionId: crypto.randomUUID(), action: { kind: "focus_window", target: { resourceId: win.id, expectedRevision: win.revision } } });

    const final = win ?? tab;
    if (!final) {
      const live = ws.resourceIds.map(liveResource).filter((r): r is Resource => r !== undefined);
      return {
        kind: "clarification",
        commandId: crypto.randomUUID(),
        question:
          unavailable.length > 0
            ? `${unavailable.join(" and ")} ${unavailable.length > 1 ? "are" : "is"} no longer open. Which member should ${ws.name} open to?`
            : `${ws.name} has no saved primary tab or window. Which one should it open to?`,
        options: live.map((r) => ({ id: crypto.randomUUID(), label: r.title, resourceIds: [r.id] })),
      };
    }

    const reopened = actions.filter((a) => a.action.kind === "open_saved_url").length;
    const parts = [
      tab && `Activate "${tab.title}".`,
      win && `Focus "${win.title}". Vortex doesn't read or restore what's inside it.`,
      reopened > 0 && `Reopen ${reopened} saved source${reopened > 1 ? "s" : ""} from the checkpoint.`,
      unavailable.length > 0 && `Unavailable: ${unavailable.join(", ")}.`,
      `Keyboard focus ends on "${final.title}".`,
    ];
    return storePlan(auth, {
      kind: "plan",
      id: crypto.randomUUID(),
      commandId: crypto.randomUUID(),
      workspaceId: ws.id,
      deviceId: req.deviceId,
      snapshotRevision: snapshot.revision,
      finalFocusResourceId: final.id,
      actions,
      explanation: `FIXTURE PLAN. ${parts.filter(Boolean).join(" ")}`,
      approvalRequired: reopened > 0,
      planHash: "",
      createdAt: iso(),
      expiresAt: iso(now() + APPROVAL_TTL_MS),
    });
  }

  function ownDevice(auth: AuthContext, deviceId: string) {
    const device = devices.get(deviceId);
    if (!device || device.revoked || device.userId !== auth.userId) throw new ApiError("FORBIDDEN", "Device not authorized for this user");
    return device;
  }

  function requireActiveCaller(auth: AuthContext) {
    const device = devices.get(auth.deviceId);
    if (device?.revoked) throw new ApiError("UNAUTHORIZED", "Device access was revoked");
  }

  function canReadBrief(auth: AuthContext, briefId: string): boolean {
    const brief = briefs.get(briefId);
    if (!brief) return false;
    if (brief.ownerUserId === auth.userId) return true;
    return [...deliveries.values()].some(
      (d) =>
        d.briefId === briefId &&
        d.status !== "revoked" &&
        d.status !== "expired" &&
        Date.parse(d.expiresAt) > now() &&
        ("userId" in d.recipient ? d.recipient.userId === auth.userId : d.recipient.deviceId === auth.deviceId),
    );
  }

  function ownedOperation(auth: AuthContext, operationId: string) {
    const op = operations.get(operationId);
    if (!op) throw new ApiError("NOT_FOUND", "Operation not found");
    if (op.ownerUserId !== auth.userId) throw new ApiError("FORBIDDEN", "Operation belongs to another user");
    return op;
  }

  function newOperation(auth: AuthContext, op: Omit<Operation, "updatedAt">): Operation {
    const stored: Owned<Operation> = { ...op, updatedAt: iso(), ownerUserId: auth.userId };
    operations.set(op.id, stored);
    return strip(stored);
  }

  return {
    label: "fixture",

    async getSnapshot(auth, deviceId) {
      requireActiveCaller(auth);
      ownDevice(auth, deviceId);
      if (deviceId !== snapshot.deviceId) throw new ApiError("NOT_FOUND", "No snapshot for this device");
      return clone(snapshot);
    },

    async listWorkspaces(auth, deviceId) {
      requireActiveCaller(auth);
      if (deviceId !== undefined) ownDevice(auth, deviceId);
      const cards = [...workspaces.values()]
        .filter((ws) => ws.ownerUserId === auth.userId && (deviceId === undefined || ws.deviceId === deviceId))
        .map((ws) => {
          const cp = ws.latestCheckpointId ? checkpoints.get(ws.latestCheckpointId) : undefined;
          return { workspace: strip(ws), ...(cp ? { latestCheckpoint: strip(cp) } : {}) };
        });
      return { workspaces: cards };
    },

    async createWorkspace(auth, req) {
      requireActiveCaller(auth);
      ownDevice(auth, req.deviceId);
      if (req.deviceId !== snapshot.deviceId) throw new ApiError("NOT_FOUND", "No snapshot for this device");
      if (req.expectedSnapshotRevision !== snapshot.revision) throw new ApiError("STALE_STATE", "Workspace changed; refresh the snapshot");
      validateNewMembers(req.deviceId, req.selectedResourceIds);
      validatePrimary(req.selectedResourceIds, req.primaryTabId, "tab", false);
      validatePrimary(req.selectedResourceIds, req.primaryWindowId, "window", false);
      const at = iso();
      const ws: Owned<Workspace> = {
        id: crypto.randomUUID(),
        name: req.name,
        goal: req.goal,
        deviceId: req.deviceId,
        resourceIds: req.selectedResourceIds,
        ...(req.primaryTabId ? { primaryTabId: req.primaryTabId } : {}),
        ...(req.primaryWindowId ? { primaryWindowId: req.primaryWindowId } : {}),
        revision: 1,
        createdAt: at,
        updatedAt: at,
        ownerUserId: auth.userId,
      };
      workspaces.set(ws.id, ws);
      return strip(ws);
    },

    async updateWorkspace(auth, workspaceId, req) {
      requireActiveCaller(auth);
      const ws = ownedWorkspace(auth, workspaceId);
      if (req.expectedRevision !== ws.revision) throw new ApiError("STALE_STATE", "Workspace was edited elsewhere; refetch it");
      const members = req.selectedResourceIds ?? ws.resourceIds;
      if (req.selectedResourceIds) validateNewMembers(ws.deviceId, req.selectedResourceIds, ws.resourceIds);
      const pick = (next: string | null | undefined, current: string | undefined) => (next === undefined ? current : (next ?? undefined));
      const primaryTabId = pick(req.primaryTabId, ws.primaryTabId);
      const primaryWindowId = pick(req.primaryWindowId, ws.primaryWindowId);
      validatePrimary(members, primaryTabId, "tab", primaryTabId === ws.primaryTabId);
      validatePrimary(members, primaryWindowId, "window", primaryWindowId === ws.primaryWindowId);
      const next: Owned<Workspace> = {
        ...ws,
        name: req.name ?? ws.name,
        goal: req.goal ?? ws.goal,
        resourceIds: members,
        revision: ws.revision + 1,
        updatedAt: iso(),
      };
      delete next.primaryTabId;
      delete next.primaryWindowId;
      if (primaryTabId) next.primaryTabId = primaryTabId;
      if (primaryWindowId) next.primaryWindowId = primaryWindowId;
      workspaces.set(ws.id, next);
      return strip(next);
    },

    async planWorkspaceFocus(auth, workspaceId, req) {
      requireActiveCaller(auth);
      return workspacePlan(auth, ownedWorkspace(auth, workspaceId), req, "focus");
    },

    async planWorkspaceResume(auth, workspaceId, req) {
      requireActiveCaller(auth);
      return workspacePlan(auth, ownedWorkspace(auth, workspaceId), req, "resume");
    },

    async createPlan(auth, req) {
      requireActiveCaller(auth);
      if (/\b(which|article)\b/i.test(req.text) && req.selectedResourceIds.length === 0) {
        return { ...clone(F.clarification), commandId: req.commandId };
      }
      const plan: Plan = {
        ...clone(F.plans.focusTask),
        id: crypto.randomUUID(),
        commandId: req.commandId,
        deviceId: req.deviceId,
        snapshotRevision: req.snapshotRevision,
        createdAt: iso(),
        expiresAt: iso(now() + APPROVAL_TTL_MS),
      };
      plan.planHash = `fixture-${plan.id}`;
      plans.set(plan.id, { ...plan, ownerUserId: auth.userId });
      return plan;
    },

    async approvePlan(auth, planId, req) {
      const plan = plans.get(planId);
      if (!plan) throw new ApiError("NOT_FOUND", "Plan not found");
      if (plan.ownerUserId !== auth.userId) throw new ApiError("FORBIDDEN", "Plan belongs to another user");
      if (Date.parse(plan.expiresAt) <= now()) throw new ApiError("EXPIRED", "Plan expired; plan again");
      if (req.planHash !== plan.planHash) throw new ApiError("STALE_STATE", "Plan changed since preview");
      const approvalId = crypto.randomUUID();
      const expiresAt = now() + APPROVAL_TTL_MS;
      approvals.set(approvalId, { planId, planHash: plan.planHash, userId: auth.userId, deviceId: auth.deviceId, expiresAt });
      return { approvalId, expiresAt: iso(expiresAt) };
    },

    async executePlan(auth, planId, req) {
      const plan = plans.get(planId);
      if (!plan) throw new ApiError("NOT_FOUND", "Plan not found");
      if (plan.ownerUserId !== auth.userId) throw new ApiError("FORBIDDEN", "Plan belongs to another user");
      if (plan.approvalRequired) {
        const approval = req.approvalId ? approvals.get(req.approvalId) : undefined;
        if (!approval) throw new ApiError("APPROVAL_REQUIRED", "This plan needs approval first");
        if (approval.planId !== planId || approval.userId !== auth.userId || approval.deviceId !== auth.deviceId) {
          throw new ApiError("FORBIDDEN", "Approval does not match this plan, user and device");
        }
        if (approval.expiresAt <= now()) throw new ApiError("EXPIRED", "Approval expired");
      }
      if (req.expectedRevision !== snapshot.revision) throw new ApiError("STALE_STATE", "Workspace changed since the plan was made");
      return newOperation(auth, {
        id: req.operationId,
        planId,
        status: "succeeded",
        results: plan.actions.map((a) => ({ actionId: a.actionId, status: "succeeded" as const })),
      });
    },

    async getOperation(auth, operationId) {
      return strip(ownedOperation(auth, operationId));
    },

    async cancelOperation(auth, operationId) {
      const op = ownedOperation(auth, operationId);
      if (op.status === "queued" || op.status === "running") {
        op.status = "cancelled";
        op.updatedAt = iso();
      }
      return strip(op);
    },

    // Metadata + explicit note only: no summary is invented here. Nova's grounded summary replaces this.
    async createCheckpoint(auth, req) {
      requireActiveCaller(auth);
      const ws = ownedWorkspace(auth, req.taskId);
      const nonMember = req.resourceIds.find((rid) => !ws.resourceIds.includes(rid));
      if (nonMember) throw new ApiError("VALIDATION_ERROR", `Resource ${nonMember} is not a member of this workspace`);
      const unknown = req.sourceIds.find((sid) => !knownSources.some((s) => s.id === sid));
      if (unknown) throw new ApiError("NOT_FOUND", `Source ${unknown} not found`);
      const cp: Owned<Checkpoint> = {
        id: crypto.randomUUID(),
        taskId: ws.id,
        ...(req.userNote ? { userNote: req.userNote } : {}),
        createdAt: iso(),
        version: 1,
        resourceSnapshots: req.resourceIds.map(liveResource).filter((r): r is Resource => r !== undefined),
        sourceIds: req.sourceIds,
        summary: [],
        ownerUserId: auth.userId,
      };
      checkpoints.set(cp.id, cp);
      ws.latestCheckpointId = cp.id;
      ws.revision += 1;
      ws.updatedAt = iso();
      return newOperation(auth, {
        id: crypto.randomUUID(),
        status: "succeeded",
        results: [{ actionId: crypto.randomUUID(), status: "succeeded", workspaceId: ws.id, checkpointId: cp.id }],
      });
    },

    async deleteCheckpoint(auth, checkpointId) {
      requireActiveCaller(auth);
      const cp = ownedCheckpoint(auth, checkpointId);
      checkpoints.delete(checkpointId);
      const ws = workspaces.get(cp.taskId);
      if (ws?.latestCheckpointId === checkpointId) {
        delete ws.latestCheckpointId;
        ws.revision += 1;
        ws.updatedAt = iso();
      }
      return { checkpointId, deleted: true, searchProjection: "pending" };
    },

    async resumeCheckpoint(auth, checkpointId, req) {
      requireActiveCaller(auth);
      const cp = ownedCheckpoint(auth, checkpointId);
      const ws = ownedWorkspace(auth, cp.taskId);
      if (ws.latestCheckpointId !== checkpointId) throw new ApiError("STALE_STATE", "A newer checkpoint exists; resume the workspace instead");
      return workspacePlan(auth, ws, req, "resume");
    },

    async createBrief(auth, req) {
      requireActiveCaller(auth);
      const brief = req.audience === "selected_teammate" ? F.briefs.teammateHandoff : F.briefs.reading;
      return newOperation(auth, {
        id: crypto.randomUUID(),
        status: "succeeded",
        results: [{ actionId: crypto.randomUUID(), status: "succeeded", briefId: brief.id }],
      });
    },

    async getBrief(auth, briefId, version) {
      requireActiveCaller(auth);
      const brief = briefs.get(briefId);
      if (!brief) throw new ApiError("NOT_FOUND", "Brief not found");
      if (!canReadBrief(auth, briefId)) throw new ApiError("FORBIDDEN", "Brief not shared with this identity");
      if (version !== undefined && version !== brief.version) throw new ApiError("NOT_FOUND", "Brief version not found");
      const sources = (Object.values(F.sources) as Source[])
        .filter((s) => brief.sourceIds.includes(s.id))
        .map(({ text: _text, ...meta }) => meta);
      return { brief: strip(brief), sources };
    },

    async createDelivery(auth, req) {
      requireActiveCaller(auth);
      const brief = briefs.get(req.briefId);
      if (!brief) throw new ApiError("NOT_FOUND", "Brief not found");
      if (brief.ownerUserId !== auth.userId) throw new ApiError("FORBIDDEN", "Only the brief owner can deliver it");
      if (req.briefVersion !== brief.version) throw new ApiError("STALE_STATE", "Brief version changed");
      if ("deviceId" in req.recipient) {
        ownDevice(auth, req.recipient.deviceId);
      } else if (req.recipient.userId !== auth.userId && brief.audience !== "selected_teammate") {
        throw new ApiError("FORBIDDEN", "Sharing with another person needs a teammate brief");
      }
      const delivery: Owned<Delivery> = {
        id: crypto.randomUUID(),
        operationId: req.operationId,
        briefId: req.briefId,
        briefVersion: req.briefVersion,
        recipient: req.recipient,
        expiresAt: iso(now() + DELIVERY_TTL_MS),
        status: "available",
        ownerUserId: auth.userId,
      };
      deliveries.set(delivery.id, delivery);
      return strip(delivery);
    },

    async updateReadProgress(auth, req) {
      requireActiveCaller(auth);
      if (req.deviceId !== auth.deviceId) throw new ApiError("FORBIDDEN", "Progress can only be written for the calling device");
      if (!canReadBrief(auth, req.briefId)) throw new ApiError("FORBIDDEN", "Brief not shared with this identity");
      const key = `${req.briefId}:${req.deviceId}`;
      const current = progress.get(key);
      const currentRevision = current?.revision ?? 0;
      if (req.expectedRevision !== currentRevision) throw new ApiError("STALE_STATE", "Progress changed; refetch before writing");
      const next: ReadProgress = {
        id: current?.id ?? crypto.randomUUID(),
        briefId: req.briefId,
        briefVersion: req.briefVersion,
        deviceId: req.deviceId,
        fraction: req.fraction,
        updatedAt: iso(),
        revision: currentRevision + 1,
      };
      progress.set(key, next);
      return next;
    },

    async createPairing(auth, desktopDeviceId) {
      requireActiveCaller(auth);
      if (desktopDeviceId !== auth.deviceId) throw new ApiError("FORBIDDEN", "Pairing must start on the calling desktop");
      const raw = crypto.getRandomValues(new Uint8Array(32));
      const nonce = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const pairing: Pairing = { pairingId: crypto.randomUUID(), nonce, expiresAt: iso(now() + PAIRING_TTL_MS) };
      pairings.set(pairing.pairingId, { pairing, userId: auth.userId, desktopDeviceId, used: false });
      return pairing;
    },

    async claimPairing(auth, pairingId, req) {
      const entry = pairings.get(pairingId);
      if (!entry || entry.pairing.nonce !== req.nonce) throw new ApiError("FORBIDDEN", "Invalid pairing code");
      if (entry.used || entry.claimed) throw new ApiError("EXPIRED", "Pairing code already used");
      if (Date.parse(entry.pairing.expiresAt) <= now()) throw new ApiError("EXPIRED", "Pairing code expired");
      if (auth.userId !== entry.userId) throw new ApiError("FORBIDDEN", "Pairing belongs to another user");
      entry.claimed = { name: req.phoneDeviceName, userId: auth.userId };
      return { pairingId, status: "pending_confirmation", phoneDeviceName: req.phoneDeviceName };
    },

    async confirmPairing(auth, pairingId) {
      const entry = pairings.get(pairingId);
      if (!entry) throw new ApiError("NOT_FOUND", "Pairing not found");
      if (entry.userId !== auth.userId || entry.desktopDeviceId !== auth.deviceId) throw new ApiError("FORBIDDEN", "Only the pairing desktop can confirm");
      if (!entry.claimed) throw new ApiError("VALIDATION_ERROR", "No phone has claimed this pairing yet");
      if (entry.used) throw new ApiError("EXPIRED", "Pairing already confirmed");
      if (Date.parse(entry.pairing.expiresAt) <= now()) throw new ApiError("EXPIRED", "Pairing code expired");
      entry.used = true;
      const device: Device = {
        id: crypto.randomUUID(),
        userId: auth.userId,
        name: entry.claimed.name,
        kind: "phone",
        scopes: DEFAULT_SCOPES.phone,
        pairedAt: iso(),
      };
      devices.set(device.id, { ...device, revoked: false });
      return device;
    },

    async revokeDevice(auth, deviceId) {
      const device = ownDevice(auth, deviceId);
      device.revoked = true;
      for (const d of deliveries.values()) {
        if ("deviceId" in d.recipient && d.recipient.deviceId === deviceId && d.status !== "read") d.status = "revoked";
      }
      return { revoked: true };
    },
  };
}
