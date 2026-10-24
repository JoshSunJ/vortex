// Live privacy check for the Vortex sync module (SpacetimeDB).
//
// What this proves, in plain words:
//   The sync database is a private mailbox. Every table in it is hidden; a phone can only see
//   rows through two "views" (my_deliveries, my_briefs) that ask "who is looking?" and show only
//   what was sent to that phone. This script connects as three people at once against a real,
//   running server and checks that:
//     1. Sam's phone sees the brief the API sent to it.
//     2. Mallory's phone (a stranger) sees nothing, even though she is connected to the same DB.
//     3. Mallory cannot mark Sam's delivery as received; Sam can.
//     4. Once the API revokes Sam's phone, that phone instantly sees nothing anymore.
//   If any of this fails, someone could read or tamper with another person's brief.
//
// Who is who:
//   - ADMIN is the trusted Vortex API. In the module, the identity that published it is the admin,
//     so we connect with the SpacetimeDB CLI's own token. Get it with `spacetime login show --token`
//     and put it in the VORTEX_SYNC_ADMIN_TOKEN env var. This script never prints it.
//   - Sam's and Mallory's phones connect with NO token, so the server gives each a brand-new identity.
//
// Run (server on 127.0.0.1:3100 with database "vortex-sync" published by your CLI login):
//   VORTEX_SYNC_ADMIN_TOKEN=... npx tsx services/sync/scripts/privacy-check.ts
// Optional overrides: VORTEX_SYNC_URI (default http://127.0.0.1:3100), VORTEX_SYNC_DB (default vortex-sync).
//
// All data written here is FIXTURE data (fixture users/devices, a brief titled "FIXTURE ...").
// Each run uses a fresh briefId/deliveryId, so reruns never collide with immutable brief versions.
import { randomUUID } from "node:crypto";
import type { Identity } from "spacetimedb";
import { devices, users } from "@vortex/fixtures";
import { DbConnection, tables } from "../src/module_bindings";

const URI = process.env.VORTEX_SYNC_URI ?? "http://127.0.0.1:3100";
const DB = process.env.VORTEX_SYNC_DB ?? "vortex-sync";
const ADMIN_TOKEN = process.env.VORTEX_SYNC_ADMIN_TOKEN;
const TIMEOUT_MS = 10_000;

// ---------- tiny test harness ----------

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function withTimeout<T>(p: Promise<T>, what: string, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${what}`)), ms);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e))
    );
  });
}

/** Polls `pred` until it is true or the timeout passes. Returns whether it became true. */
async function waitFor(pred: () => boolean, ms = TIMEOUT_MS): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred();
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- connections ----------

type Client = { label: string; conn: DbConnection; identity: Identity };
const open: DbConnection[] = [];

function connect(label: string, token?: string): Promise<Client> {
  const p = new Promise<Client>((resolve, reject) => {
    const conn = DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((c, identity) => resolve({ label, conn: c, identity }))
      .onConnectError((_ctx, err) => reject(new Error(`${label} could not connect to ${URI}/${DB}: ${errText(err)}`)))
      .build();
    open.push(conn);
  });
  return withTimeout(p, `${label} connect`);
}

function subscribeViews(c: Client): Promise<void> {
  const p = new Promise<void>((resolve, reject) => {
    c.conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((ctx) => reject(new Error(`${c.label} subscription failed: ${errText((ctx as { event?: unknown }).event)}`)))
      .subscribe([tables.myDeliveries, tables.myBriefs]);
  });
  return withTimeout(p, `${c.label} subscribe`);
}

const deliveriesOf = (c: Client) => [...c.conn.db.myDeliveries.iter()];
const briefsOf = (c: Client) => [...c.conn.db.myBriefs.iter()];

// ---------- the check ----------

async function main() {
  if (!ADMIN_TOKEN) {
    console.error("VORTEX_SYNC_ADMIN_TOKEN is not set. Get it with `spacetime login show --token` (the identity that published vortex-sync).");
    process.exit(2);
  }

  const admin = await connect("admin", ADMIN_TOKEN);
  const sam = await connect("Sam's phone");
  const mallory = await connect("Mallory's phone");
  console.log(`connected: admin, Sam's phone, Mallory's phone to ${URI} db=${DB}`);

  // Step 1: the API pairs both phones.
  await withTimeout(
    admin.conn.reducers.bindDevice({ identity: sam.identity, userId: users.sam.id, deviceId: devices.samPhone.id, kind: "phone" }),
    "bindDevice(Sam)"
  );
  await withTimeout(
    admin.conn.reducers.bindDevice({
      identity: mallory.identity,
      userId: users.mallory.id,
      deviceId: devices.malloryPhone.id,
      kind: "phone",
    }),
    "bindDevice(Mallory)"
  );
  check("admin can bind both phones", true);

  // Step 2: the API publishes a FIXTURE brief for Sam and delivers it to Sam's phone.
  const briefId = randomUUID();
  const deliveryId = randomUUID();
  await withTimeout(
    admin.conn.reducers.publishBrief({
      briefId,
      version: 1,
      ownerUserId: users.sam.id,
      title: "FIXTURE privacy-check brief",
      format: "reading",
      audience: "self",
      pointsJson: "[]",
      originalUrls: ["https://example.org/fixture"],
      excerpt: "FIXTURE data written by services/sync/scripts/privacy-check.ts",
    }),
    "publishBrief"
  );
  await withTimeout(
    admin.conn.reducers.createDelivery({
      deliveryId,
      operationId: randomUUID(),
      briefId,
      briefVersion: 1,
      recipientDeviceId: devices.samPhone.id,
      recipientUserId: "",
    }),
    "createDelivery"
  );
  check("admin can publish a brief and create a delivery", true);

  // Step 3: both phones look at their views.
  await subscribeViews(sam);
  await subscribeViews(mallory);

  const samSees = await waitFor(
    () => deliveriesOf(sam).some((d) => d.deliveryId === deliveryId) && briefsOf(sam).some((b) => b.briefId === briefId)
  );
  check("Sam sees the delivery and brief sent to his phone", samSees);
  const samOwn = await waitFor(() => deliveriesOf(sam).filter((d) => d.deliveryId === deliveryId).length === 1);
  check("Sam sees that delivery exactly once", samOwn);
  const notSams = deliveriesOf(sam).filter((d) => d.recipientDeviceId !== devices.samPhone.id && d.recipientUserId !== users.sam.id);
  check("Sam sees nothing addressed to anyone else", notSams.length === 0, `${notSams.length} foreign rows`);
  const extras = deliveriesOf(sam).filter((d) => d.deliveryId !== deliveryId).length;
  if (extras) console.log(`note: Sam also sees ${extras} older delivery(ies) to his phone from earlier runs`);

  // Give Mallory's view a moment to (wrongly) receive anything before we assert it is empty.
  await new Promise((r) => setTimeout(r, 500));
  check(
    "Mallory sees none of Sam's deliveries",
    !deliveriesOf(mallory).some((d) => d.deliveryId === deliveryId),
    `${deliveriesOf(mallory).length} rows in her my_deliveries`
  );
  check(
    "Mallory sees none of Sam's briefs",
    !briefsOf(mallory).some((b) => b.briefId === briefId),
    `${briefsOf(mallory).length} rows in her my_briefs`
  );

  // Step 4: Mallory tries to acknowledge Sam's delivery; then Sam does.
  let malloryErr = "";
  try {
    await withTimeout(mallory.conn.reducers.acknowledgeDelivery({ deliveryId }), "Mallory acknowledgeDelivery");
  } catch (e) {
    malloryErr = errText(e);
  }
  await new Promise((r) => setTimeout(r, 300));
  const statusForSam = () => deliveriesOf(sam).find((d) => d.deliveryId === deliveryId)?.status;
  check(
    "Mallory cannot acknowledge Sam's delivery",
    statusForSam() === "available",
    malloryErr ? `rejected: ${malloryErr}` : `call succeeded; status now ${statusForSam()}`
  );

  let samErr = "";
  try {
    await withTimeout(sam.conn.reducers.acknowledgeDelivery({ deliveryId }), "Sam acknowledgeDelivery");
  } catch (e) {
    samErr = errText(e);
  }
  const received = await waitFor(() => statusForSam() === "received");
  check("Sam can acknowledge; status becomes received", received, samErr || `status ${statusForSam()}`);

  // Step 5: the API revokes Sam's phone; its views must go empty.
  await withTimeout(admin.conn.reducers.revokeDevice({ deviceId: devices.samPhone.id }), "revokeDevice(Sam)");
  const emptied = await waitFor(() => deliveriesOf(sam).length === 0 && briefsOf(sam).length === 0);
  check("after revoke, Sam's views are empty", emptied, `${deliveriesOf(sam).length} deliveries, ${briefsOf(sam).length} briefs left`);

  let revokedErr = "";
  try {
    await withTimeout(sam.conn.reducers.acknowledgeDelivery({ deliveryId }), "revoked Sam acknowledgeDelivery");
  } catch (e) {
    revokedErr = errText(e);
  }
  check("a revoked phone can no longer call reducers", revokedErr !== "", revokedErr || "call succeeded");
}

let crashed = false;
const hardStop = setTimeout(() => {
  console.log("FAIL  whole check took longer than 90s");
  process.exit(1);
}, 90_000);

try {
  await main();
} catch (e) {
  crashed = true;
  console.log(`FAIL  check aborted: ${errText(e)}`);
} finally {
  for (const c of open) {
    try {
      c.disconnect();
    } catch {}
  }
  clearTimeout(hardStop);
}

const failed = crashed || failures > 0;
console.log(failed ? `\nPRIVACY CHECK FAILED (${failures} failed checks${crashed ? ", aborted" : ""})` : "\nPRIVACY CHECK PASSED");
// Exit explicitly so a lingering websocket can never keep the process alive.
process.exit(failed ? 1 : 0);
