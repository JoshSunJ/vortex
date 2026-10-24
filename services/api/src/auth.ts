// Backend-verified access tokens. Identity always comes from the token, never from request JSON.
// Format: base64url(JSON claims) "." base64url(HMAC-SHA256). Web Crypto only, so the in-process
// fixture client also runs in a browser. Pairing (1 PM milestone) will mint device tokens through
// the same signToken; until then, scripts/token.ts mints dev tokens for fixture identities.
import { Scope } from "@vortex/contracts";
import { z } from "zod";
import { ApiError } from "./envelope";

export const DeviceKind = z.enum(["desktop", "phone", "agent"]);
export type DeviceKind = z.infer<typeof DeviceKind>;

const Claims = z.object({
  v: z.literal(1),
  sub: z.uuid(),
  dev: z.uuid(),
  kind: DeviceKind,
  scp: z.array(Scope),
  iat: z.number().int(),
  exp: z.number().int(),
});
type Claims = z.infer<typeof Claims>;

export type AuthContext = { userId: string; deviceId: string; deviceKind: DeviceKind; scopes: Scope[] };

/** Device scopes granted by the server. Phone v1 is read/progress only; ASI:One gets command scope separately. */
export const DEFAULT_SCOPES: Record<DeviceKind, Scope[]> = {
  desktop: ["metadata:read", "content:read", "desktop:control", "brief:read", "brief:deliver", "progress:write"],
  phone: ["brief:read", "progress:write"],
  agent: ["metadata:read", "content:read", "desktop:control", "brief:read", "brief:deliver"],
};

const MIN_SECRET_LENGTH = 32;
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export type Signer = {
  sign(input: { userId: string; deviceId: string; deviceKind: DeviceKind; scopes?: Scope[]; ttlSeconds?: number }): Promise<string>;
  verify(token: string): Promise<AuthContext>;
};

export async function createSigner(secret: string, now: () => number = Date.now): Promise<Signer> {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`VORTEX_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);

  return {
    async sign({ userId, deviceId, deviceKind, scopes = DEFAULT_SCOPES[deviceKind], ttlSeconds = 12 * 3600 }) {
      const iat = Math.floor(now() / 1000);
      const claims: Claims = { v: 1, sub: userId, dev: deviceId, kind: deviceKind, scp: scopes, iat, exp: iat + ttlSeconds };
      const body = b64url(enc.encode(JSON.stringify(claims)));
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
      return `${body}.${b64url(sig)}`;
    },

    async verify(token) {
      const [body, sig, extra] = token.split(".");
      if (!body || !sig || extra !== undefined) throw new ApiError("UNAUTHORIZED", "Malformed access token");
      let valid = false;
      try {
        valid = await crypto.subtle.verify("HMAC", key, fromB64url(sig), enc.encode(body));
      } catch {
        valid = false;
      }
      if (!valid) throw new ApiError("UNAUTHORIZED", "Invalid access token");
      let claims: Claims;
      try {
        claims = Claims.parse(JSON.parse(new TextDecoder().decode(fromB64url(body))));
      } catch {
        throw new ApiError("UNAUTHORIZED", "Invalid access token");
      }
      if (claims.exp <= Math.floor(now() / 1000)) throw new ApiError("UNAUTHORIZED", "Access token expired");
      return { userId: claims.sub, deviceId: claims.dev, deviceKind: claims.kind, scopes: claims.scp };
    },
  };
}

export function requireScopes(auth: AuthContext, required: readonly Scope[]): void {
  const missing = required.filter((s) => !auth.scopes.includes(s));
  if (missing.length > 0) throw new ApiError("FORBIDDEN", `Missing scope: ${missing.join(", ")}`);
}
