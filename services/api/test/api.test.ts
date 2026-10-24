import { beforeEach, describe, expect, it } from "vitest";
import { ResultOf, Snapshot } from "@vortex/contracts";
import * as F from "@vortex/fixtures";
import { createApp } from "../src/app";
import { createSigner } from "../src/auth";
import { createFixtureHarness, type FixtureHarness } from "../src/fixtureClient";
import { createFixtureServices } from "../src/fixtureServices";

const SECRET = "test-secret-test-secret-test-secret-1234";

async function rawApp(now = Date.now) {
  const signer = await createSigner(SECRET, now);
  const app = createApp({ services: createFixtureServices(now), signer });
  const tokenFor = (d: (typeof F.devices)[keyof typeof F.devices]) =>
    signer.sign({ userId: d.userId, deviceId: d.id, deviceKind: d.kind });
  return { app, signer, tokenFor };
}

describe("authentication", () => {
  it("rejects missing, malformed, forged and expired tokens with UNAUTHORIZED envelopes", async () => {
    let clock = Date.parse("2026-10-25T18:00:00Z");
    const { app, tokenFor } = await rawApp(() => clock);
    const path = `/v1/snapshot?deviceId=${F.devices.samDesktop.id}`;

    const missing = await app.request(path);
    expect(missing.status).toBe(401);
    const body = await missing.json();
    expect(body).toMatchObject({ schemaVersion: "1.0", ok: false, error: { code: "UNAUTHORIZED", retryable: false } });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);

    expect((await app.request(path, { headers: { Authorization: "Bearer nope" } })).status).toBe(401);

    const other = await createSigner("a-completely-different-secret-value-xyz");
    const forged = await other.sign({ userId: F.users.sam.id, deviceId: F.devices.samDesktop.id, deviceKind: "desktop" });
    expect((await app.request(path, { headers: { Authorization: `Bearer ${forged}` } })).status).toBe(401);

    const token = await tokenFor(F.devices.samDesktop);
    expect((await app.request(path, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    clock += 13 * 3600_000;
    expect((await app.request(path, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
  });

  it("refuses short secrets", async () => {
    await expect(createSigner("short")).rejects.toThrow();
  });

  it("returns a contract-valid snapshot envelope labeled as fixture data", async () => {
    const { app, tokenFor } = await rawApp();
    const res = await app.request(`/v1/snapshot?deviceId=${F.devices.samDesktop.id}`, {
      headers: { Authorization: `Bearer ${await tokenFor(F.devices.samDesktop)}` },
    });
    expect(res.headers.get("X-Vortex-Services")).toBe("fixture");
    const parsed = ResultOf(Snapshot).parse(await res.json());
    expect(parsed.ok).toBe(true);
  });
});

describe("authorization through the typed fixture client", () => {
  let h: FixtureHarness;
  beforeEach(async () => {
    h = await createFixtureHarness();
  });

  it("phone scope cannot plan or read snapshots", async () => {
    const phone = h.as("samPhone");
    const plan = await phone.createPlan({
      commandId: crypto.randomUUID(),
      text: "focus this task",
      deviceId: F.devices.samPhone.id,
      snapshotRevision: 7,
      selectedResourceIds: [],
    });
    expect(plan.ok || plan.error.code).toBe("FORBIDDEN");
    const snap = await phone.getSnapshot(F.devices.samDesktop.id);
    expect(snap.ok || snap.error.code).toBe("FORBIDDEN");
  });

  it("request JSON cannot choose another device identity", async () => {
    const res = await h.as("samDesktop").getSnapshot(F.devices.samPhone.id);
    expect(res.ok || res.error.code).toBe("FORBIDDEN");
  });

  it("rejects invalid bodies with VALIDATION_ERROR", async () => {
    const res = await h.as("samDesktop").createPlan({
      commandId: "not-a-uuid",
      text: "",
      deviceId: F.devices.samDesktop.id,
      snapshotRevision: 7,
      selectedResourceIds: [],
    });
    expect(res.ok || res.error.code).toBe("VALIDATION_ERROR");
  });

  it("owner and paired phone read the brief; an unrelated user is FORBIDDEN (fixture 13)", async () => {
    expect((await h.as("samDesktop").getBrief(F.briefs.reading.id)).ok).toBe(true);
    expect((await h.as("samPhone").getBrief(F.briefs.reading.id)).ok).toBe(true);
    const mallory = await h.as("malloryPhone").getBrief(F.briefs.reading.id);
    expect(mallory.ok || mallory.error.code).toBe("FORBIDDEN");
  });

  it("teammate reads only the shared handoff brief (fixture 18)", async () => {
    const jo = h.as("joPhone");
    const shared = await jo.getBrief(F.briefs.teammateHandoff.id);
    expect(shared.ok).toBe(true);
    if (shared.ok) expect(shared.data.sources.every((s) => !("text" in s))).toBe(true);
    const personal = await jo.getBrief(F.briefs.reading.id);
    expect(personal.ok || personal.error.code).toBe("FORBIDDEN");
  });

  it("plan -> approve -> execute, with approval required and stale revision rejected", async () => {
    const desktop = h.as("samDesktop");
    const plan = await desktop.createPlan({
      commandId: crypto.randomUUID(),
      text: "focus this task",
      deviceId: F.devices.samDesktop.id,
      snapshotRevision: 7,
      selectedResourceIds: [F.resources.heatArticle.id],
    });
    if (!plan.ok || plan.data.kind !== "plan") throw new Error("expected a plan");

    const unapproved = await desktop.executePlan(plan.data.id, { operationId: crypto.randomUUID(), expectedRevision: 7 });
    expect(unapproved.ok || unapproved.error.code).toBe("APPROVAL_REQUIRED");

    const wrongHash = await desktop.approvePlan(plan.data.id, { planHash: "tampered", confirmed: true });
    expect(wrongHash.ok || wrongHash.error.code).toBe("STALE_STATE");

    const approval = await desktop.approvePlan(plan.data.id, { planHash: plan.data.planHash, confirmed: true });
    if (!approval.ok) throw new Error(approval.error.message);

    const stale = await desktop.executePlan(plan.data.id, {
      operationId: crypto.randomUUID(),
      expectedRevision: 6,
      approvalId: approval.data.approvalId,
    });
    expect(stale.ok || stale.error.code).toBe("STALE_STATE");

    const op = await desktop.executePlan(plan.data.id, {
      operationId: crypto.randomUUID(),
      expectedRevision: 7,
      approvalId: approval.data.approvalId,
    });
    expect(op.ok && op.data.status).toBe("succeeded");
  });

  it("ambiguous article command returns a clarification, not a plan (fixture 1)", async () => {
    const res = await h.as("samDesktop").createPlan({
      commandId: crypto.randomUUID(),
      text: "send the heat article to my phone",
      deviceId: F.devices.samDesktop.id,
      snapshotRevision: 7,
      selectedResourceIds: [],
    });
    expect(res.ok && res.data.kind).toBe("clarification");
  });

  it("same operationId replays one receipt; changed payload is IDEMPOTENCY_CONFLICT (fixture 12)", async () => {
    const desktop = h.as("samDesktop");
    const req = {
      operationId: crypto.randomUUID(),
      briefId: F.briefs.reading.id,
      briefVersion: 1,
      recipient: { deviceId: F.devices.samPhone.id },
    };
    const first = await desktop.createDelivery(req);
    const again = await desktop.createDelivery(req);
    if (!first.ok || !again.ok) throw new Error("delivery failed");
    expect(again.data.id).toBe(first.data.id);

    const changed = await desktop.createDelivery({ ...req, recipient: { deviceId: F.devices.joPhone.id } });
    expect(changed.ok || changed.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("cannot deliver a personal brief to another device owner", async () => {
    const res = await h.as("samDesktop").createDelivery({
      operationId: crypto.randomUUID(),
      briefId: F.briefs.reading.id,
      briefVersion: 1,
      recipient: { deviceId: F.devices.malloryPhone.id },
    });
    expect(res.ok || res.error.code).toBe("FORBIDDEN");
  });

  it("read progress uses revisions and only the calling device", async () => {
    const phone = h.as("samPhone");
    const base = { briefId: F.briefs.reading.id, briefVersion: 1, deviceId: F.devices.samPhone.id };
    const stale = await phone.updateReadProgress({ ...base, fraction: 0.5, expectedRevision: 0 });
    expect(stale.ok || stale.error.code).toBe("STALE_STATE");
    const next = await phone.updateReadProgress({ ...base, fraction: 0.5, expectedRevision: F.readProgress.revision });
    expect(next.ok && next.data.revision).toBe(F.readProgress.revision + 1);
    const spoof = await phone.updateReadProgress({ ...base, deviceId: F.devices.joPhone.id, fraction: 1, expectedRevision: 0 });
    expect(spoof.ok || spoof.error.code).toBe("FORBIDDEN");
  });

  it("revoking the phone blocks its future brief retrieval", async () => {
    expect((await h.as("samPhone").getBrief(F.briefs.reading.id)).ok).toBe(true);
    expect((await h.as("samDesktop").revokeDevice(F.devices.samPhone.id)).ok).toBe(true);
    const after = await h.as("samPhone").getBrief(F.briefs.reading.id);
    expect(after.ok || after.error.code).toBe("UNAUTHORIZED");
  });
});

describe("pairing (fixture 14)", () => {
  it("single-use nonce, desktop confirms, replay and expiry are denied", async () => {
    let clock = Date.parse("2026-10-25T18:00:00Z");
    const h = await createFixtureHarness(() => clock);
    const desktop = h.as("samDesktop");
    const pairing = await desktop.createPairing({ desktopDeviceId: F.devices.samDesktop.id });
    if (!pairing.ok) throw new Error(pairing.error.message);
    expect(pairing.data.nonce.length).toBeGreaterThanOrEqual(32);

    const wrongUser = await h.as("malloryPhone").claimPairing(pairing.data.pairingId, { nonce: pairing.data.nonce, phoneDeviceName: "x" });
    expect(wrongUser.ok || wrongUser.error.code).toBe("FORBIDDEN");

    const claim = await h.as("samPhone").claimPairing(pairing.data.pairingId, { nonce: pairing.data.nonce, phoneDeviceName: "Sam's Pixel" });
    expect(claim.ok && claim.data.status).toBe("pending_confirmation");
    const replay = await h.as("samPhone").claimPairing(pairing.data.pairingId, { nonce: pairing.data.nonce, phoneDeviceName: "again" });
    expect(replay.ok || replay.error.code).toBe("EXPIRED");

    const device = await desktop.confirmPairing(pairing.data.pairingId);
    expect(device.ok && device.data.scopes).toEqual(["brief:read", "progress:write"]);

    const late = await desktop.createPairing({ desktopDeviceId: F.devices.samDesktop.id });
    if (!late.ok) throw new Error(late.error.message);
    clock += 3 * 60_000;
    const expired = await h.as("samPhone").claimPairing(late.data.pairingId, { nonce: late.data.nonce, phoneDeviceName: "late" });
    expect(expired.ok || expired.error.code).toBe("EXPIRED");
  });
});
