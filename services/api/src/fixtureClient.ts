// FIXTURE CLIENT: the real API app running in-process on fixture services, so consumers exercise
// the same auth, validation and envelope path with no server or secrets. Development only; every
// response carries X-Vortex-Services: fixture and must never be shown as live sponsor evidence.
import * as F from "@vortex/fixtures";
import { createApp } from "./app";
import { createSigner } from "./auth";
import { createClient, type VortexClient } from "./client";
import { createFixtureServices, type FixtureOptions } from "./fixtureServices";

export type FixtureDevice = keyof typeof F.devices;

export type FixtureHarness = {
  /** Client authenticated as the given fixture device; clients share one in-memory state. */
  as(device: FixtureDevice): VortexClient;
  fixtures: typeof F;
};

// Public, fixture-only signing secret. Never use it for a real server.
const FIXTURE_SECRET = "vortex-fixture-only-secret-not-for-real-servers";

export async function createFixtureHarness(now: () => number = Date.now, options: FixtureOptions = {}): Promise<FixtureHarness> {
  const signer = await createSigner(FIXTURE_SECRET, now);
  const app = createApp({ services: createFixtureServices(now, options), signer });
  const fetchImpl: typeof fetch = async (input, init) => app.fetch(new Request(input, init));
  return {
    fixtures: F,
    as(name) {
      const device = F.devices[name];
      const token = signer.sign({ userId: device.userId, deviceId: device.id, deviceKind: device.kind });
      return createClient({ baseUrl: "http://fixture.local", token: () => token, fetch: fetchImpl });
    },
  };
}
