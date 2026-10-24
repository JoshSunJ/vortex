// Node entry point for the API. Secrets come from the environment (.env at the repo root).
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSigner } from "./auth";
import { createFixtureServices } from "./fixtureServices";
import { withApiPlanner } from "../../intelligence/src/api-planner";

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
const app = createApp({ services: withApiPlanner(createFixtureServices()), signer: await createSigner(secret) });

serve({ fetch: app.fetch, port }, () => {
  console.log(`Vortex API on http://localhost:${port}/v1 (services: FIXTURE, not live evidence)`);
});
