// Mint a development access token for a fixture identity.
// Usage: npm run dev:token -- <samDesktop|samPhone|joPhone|malloryPhone> [ttlHours]
// Prints only the token. Replaced by pairing-issued device tokens for phones.
import * as F from "@vortex/fixtures";
import { createSigner } from "../src/auth";

const name = process.argv[2] as keyof typeof F.devices | undefined;
const device = name ? F.devices[name] : undefined;
if (!device) {
  console.error(`Usage: npm run dev:token -- <${Object.keys(F.devices).join("|")}> [ttlHours]`);
  process.exit(1);
}
const secret = process.env.VORTEX_AUTH_SECRET;
if (!secret) {
  console.error("VORTEX_AUTH_SECRET is not set (see .env.example).");
  process.exit(1);
}
const ttlHours = Number(process.argv[3] ?? 12);
const signer = await createSigner(secret);
console.log(await signer.sign({ userId: device.userId, deviceId: device.id, deviceKind: device.kind, ttlSeconds: ttlHours * 3600 }));
