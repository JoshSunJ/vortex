// Demo: pair a phone page and send it a brief, through the real API rules and real SpacetimeDB.
// Usage: npm run demo:phone -w @vortex/api -- <phone identity hex from the phone page>
// Needs VORTEX_SYNC_ADMIN_TOKEN (from `spacetime login show --token`) and a local SpacetimeDB
// with vortex-sync published. The brief content is FIXTURE data.
import * as F from "@vortex/fixtures";
import { createFixtureHarness } from "../src/fixtureClient";
import { createSpacetimeSyncWriter } from "../src/sync";

const syncIdentity = process.argv[2];
const adminToken = process.env.VORTEX_SYNC_ADMIN_TOKEN;
if (!syncIdentity || !adminToken) {
  console.error("Usage: npm run demo:phone -w @vortex/api -- <phone identity hex>   (needs VORTEX_SYNC_ADMIN_TOKEN)");
  process.exit(1);
}

const sync = await createSpacetimeSyncWriter({
  uri: process.env.VORTEX_SYNC_URI ?? "http://127.0.0.1:3100",
  database: process.env.VORTEX_SYNC_DB ?? "vortex-sync",
  adminToken,
});
const h = await createFixtureHarness(Date.now, { sync });
const laptop = h.as("samDesktop");

try {
  // 1. The laptop starts pairing; the phone claims it with its identity; the laptop confirms.
  const pairing = await laptop.createPairing({ desktopDeviceId: F.devices.samDesktop.id });
  if (!pairing.ok) throw new Error(pairing.error.message);
  const claim = await h.as("samPhone").claimPairing(pairing.data.pairingId, {
    nonce: pairing.data.nonce,
    phoneDeviceName: "Sam's phone (demo)",
    syncIdentity,
  });
  if (!claim.ok) throw new Error(claim.error.message);
  const phone = await laptop.confirmPairing(pairing.data.pairingId);
  if (!phone.ok) throw new Error(phone.error.message);
  console.log(`1. Paired "${phone.data.name}" as device ${phone.data.id}`);

  // 2. The laptop sends the reading brief to that phone.
  const delivery = await laptop.createDelivery({
    operationId: crypto.randomUUID(),
    briefId: F.briefs.reading.id,
    briefVersion: F.briefs.reading.version,
    recipient: { deviceId: phone.data.id },
  });
  if (!delivery.ok) throw new Error(delivery.error.message);
  console.log(`2. Sent "${F.briefs.reading.title}" (delivery ${delivery.data.id}). Check the phone page.`);
} catch (err) {
  console.error("Demo failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  sync.close();
}
