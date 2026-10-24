// Node entry point for the API. Secrets come from the environment (.env at the repo root).
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSigner } from "./auth";
import { createFixtureServices } from "./fixtureServices";
import { createSpacetimeSyncWriter } from "./sync";

const secret = process.env.VORTEX_AUTH_SECRET;
if (!secret) {
  console.error("VORTEX_AUTH_SECRET is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const mode = process.env.VORTEX_SERVICES ?? "fixture";
if (mode !== "fixture") {
  console.error(`VORTEX_SERVICES=${mode} is not available yet; only "fixture" is implemented.`);
  process.exit(1);
}

const port = Number(process.env.VORTEX_API_PORT ?? 8787);
// Optional: also write pairing/deliveries to SpacetimeDB so paired phones receive them live.
const adminToken = process.env.VORTEX_SYNC_ADMIN_TOKEN;
const sync = adminToken
  ? await createSpacetimeSyncWriter({
      uri: process.env.VORTEX_SYNC_URI ?? "http://127.0.0.1:3100",
      database: process.env.VORTEX_SYNC_DB ?? "vortex-sync",
      adminToken,
    })
  : undefined;
console.log(sync ? "SpacetimeDB sync: on" : "SpacetimeDB sync: off (set VORTEX_SYNC_ADMIN_TOKEN to enable)");

const app = createApp({ services: createFixtureServices(Date.now, sync ? { sync } : {}), signer: await createSigner(secret) });

serve({ fetch: app.fetch, port }, () => {
  console.log(`Vortex API on http://localhost:${port}/v1 (services: FIXTURE, not live evidence)`);
});
