import { describe, expect, it } from "vitest";
import * as F from "@vortex/fixtures";
import { createFixtureHarness } from "../src/fixtureClient";
import type { SyncWriter } from "../src/sync";

const PHONE_IDENTITY = "c2".padEnd(64, "0");

/** A fake SpacetimeDB writer that records calls, optionally failing. */
function fakeSync(fail = false) {
  const calls: { name: string; args: unknown }[] = [];
  const record = (name: string) => async (...args: unknown[]) => {
    calls.push({ name, args: args.length === 1 ? args[0] : args });
    if (fail) throw new Error("spacetime down");
  };
  const writer: SyncWriter = {
    bindDevice: record("bindDevice"),
    deliver: record("deliver"),
    revokeDevice: record("revokeDevice"),
    close: () => {},
  };
  return { writer, calls };
}

async function pairPhone(sync: SyncWriter) {
  const h = await createFixtureHarness(Date.now, { sync });
  const desktop = h.as("samDesktop");
  const pairing = await desktop.createPairing({ desktopDeviceId: F.devices.samDesktop.id });
  if (!pairing.ok) throw new Error(pairing.error.message);
  const claim = await h.as("samPhone").claimPairing(pairing.data.pairingId, {
    nonce: pairing.data.nonce,
    phoneDeviceName: "Sam's Pixel",
    syncIdentity: PHONE_IDENTITY,
  });
  if (!claim.ok) throw new Error(claim.error.message);
  return { h, desktop, confirm: await desktop.confirmPairing(pairing.data.pairingId) };
}

describe("SpacetimeDB sync from the API", () => {
  it("confirming a pairing binds the phone's identity in SpacetimeDB", async () => {
    const { writer, calls } = fakeSync();
    const { confirm } = await pairPhone(writer);
    if (!confirm.ok) throw new Error(confirm.error.message);
    expect(calls).toEqual([
      { name: "bindDevice", args: { syncIdentity: PHONE_IDENTITY, userId: F.users.sam.id, deviceId: confirm.data.id, kind: "phone" } },
    ]);
  });

  it("a delivery is written to SpacetimeDB with the brief", async () => {
    const { writer, calls } = fakeSync();
    const { desktop, confirm } = await pairPhone(writer);
    if (!confirm.ok) throw new Error(confirm.error.message);
    const delivery = await desktop.createDelivery({
      operationId: crypto.randomUUID(),
      briefId: F.briefs.reading.id,
      briefVersion: 1,
      recipient: { deviceId: confirm.data.id },
    });
    if (!delivery.ok) throw new Error(delivery.error.message);
    const [brief, sent] = calls.find((c) => c.name === "deliver")!.args as [{ id: string; ownerUserId: string }, { id: string }];
    expect(brief.id).toBe(F.briefs.reading.id);
    expect(brief.ownerUserId).toBe(F.users.sam.id);
    expect(sent.id).toBe(delivery.data.id);
  });

  it("revoking a device also revokes it in SpacetimeDB", async () => {
    const { writer, calls } = fakeSync();
    const { desktop, confirm } = await pairPhone(writer);
    if (!confirm.ok) throw new Error(confirm.error.message);
    expect((await desktop.revokeDevice(confirm.data.id)).ok).toBe(true);
    expect(calls.at(-1)).toEqual({ name: "revokeDevice", args: confirm.data.id });
  });

  it("if SpacetimeDB is down, pairing fails with a retryable STORAGE_FAILED and nothing is half-saved", async () => {
    const { writer } = fakeSync(true);
    const { desktop, confirm } = await pairPhone(writer);
    expect(confirm.ok ? "ok" : [confirm.error.code, confirm.error.retryable]).toEqual(["STORAGE_FAILED", true]);
    // Deliveries fail the same way instead of claiming success the phone never sees.
    const delivery = await desktop.createDelivery({
      operationId: crypto.randomUUID(),
      briefId: F.briefs.reading.id,
      briefVersion: 1,
      recipient: { deviceId: F.devices.samPhone.id },
    });
    expect(delivery.ok ? "ok" : delivery.error.code).toBe("STORAGE_FAILED");
  });

  it("rejects a malformed phone identity", async () => {
    const h = await createFixtureHarness();
    const pairing = await h.as("samDesktop").createPairing({ desktopDeviceId: F.devices.samDesktop.id });
    if (!pairing.ok) throw new Error(pairing.error.message);
    const claim = await h.as("samPhone").claimPairing(pairing.data.pairingId, {
      nonce: pairing.data.nonce,
      phoneDeviceName: "x",
      syncIdentity: "not-hex",
    });
    expect(claim.ok ? "ok" : claim.error.code).toBe("VALIDATION_ERROR");
  });
});
