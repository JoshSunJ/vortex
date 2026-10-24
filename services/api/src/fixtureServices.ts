// FIXTURE SERVICES: in-memory stand-ins so dashboard, desktop and phone can integrate before
// Nova's intelligence, Josh's executor and the Spacetime module exist. Ownership and expiry rules
// are real here (they are what the API promises); content and plans are canned fixture data.
import type { Delivery, Operation, Plan, ReadProgress, Source } from "@vortex/contracts";
import * as F from "@vortex/fixtures";
import { DEFAULT_SCOPES, type AuthContext } from "./auth";
import { ApiError } from "./envelope";
import type { Device, Pairing } from "./schemas";
import type { Services } from "./services";

const APPROVAL_TTL_MS = 2 * 60_000;
const PAIRING_TTL_MS = 2 * 60_000;
const DELIVERY_TTL_MS = 24 * 3600_000;

type Owned<T> = T & { ownerUserId: string };

export function createFixtureServices(now: () => number = Date.now): Services {
  const iso = (ms = now()) => new Date(ms).toISOString();
  const clone = <T>(v: T): T => structuredClone(v);

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

  const strip = <T extends { ownerUserId: string }>({ ownerUserId: _, ...rest }: T) => rest;

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
      if (deviceId !== F.snapshot.deviceId) throw new ApiError("NOT_FOUND", "No snapshot for this device");
      return clone(F.snapshot);
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
      if (req.expectedRevision !== F.snapshot.revision) throw new ApiError("STALE_STATE", "Workspace changed since the plan was made");
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

    async createCheckpoint(auth, _req) {
      requireActiveCaller(auth);
      return newOperation(auth, {
        id: crypto.randomUUID(),
        status: "succeeded",
        results: [{ actionId: crypto.randomUUID(), status: "succeeded", checkpointId: F.checkpoint.id }],
      });
    },

    async deleteCheckpoint(auth, checkpointId) {
      requireActiveCaller(auth);
      if (checkpointId !== F.checkpoint.id || auth.userId !== F.users.sam.id) throw new ApiError("NOT_FOUND", "Checkpoint not found");
      return { checkpointId, deleted: true, searchProjection: "pending" };
    },

    async resumeCheckpoint(auth, checkpointId, req) {
      requireActiveCaller(auth);
      if (checkpointId !== F.checkpoint.id || auth.userId !== F.users.sam.id) throw new ApiError("NOT_FOUND", "Checkpoint not found");
      const plan: Plan = {
        kind: "plan",
        id: crypto.randomUUID(),
        commandId: crypto.randomUUID(),
        deviceId: req.deviceId,
        snapshotRevision: req.snapshotRevision,
        actions: [
          {
            actionId: crypto.randomUUID(),
            action: {
              kind: "open_saved_url",
              checkpointId,
              sourceId: F.sources.heatArticle.id,
              url: F.sources.heatArticle.url,
              expectedSourceHash: F.sources.heatArticle.contentHash,
            },
          },
        ],
        explanation: "FIXTURE RESUME. Reopen the saved heat article.",
        approvalRequired: true,
        planHash: "",
        createdAt: iso(),
        expiresAt: iso(now() + APPROVAL_TTL_MS),
      };
      plan.planHash = `fixture-${plan.id}`;
      plans.set(plan.id, { ...plan, ownerUserId: auth.userId });
      return plan;
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
