# @vortex/api

Authenticated v1 API (contracts/ANDREW.md section 08 + Appendix D). Owner: Andrew/C. Nova's
intelligence and Josh's executor plug in behind the `Services` interface in `src/services.ts`.

**Status:** skeleton on **fixture services**. Every response carries `X-Vortex-Services: fixture`.
That is development data, not live sponsor evidence.

## Run

```bash
npm ci                                 # repo root
cp .env.example .env                   # then set VORTEX_AUTH_SECRET (32+ chars)
npm run dev:api                        # http://localhost:8787/v1
npm run -s dev:token -- samDesktop     # prints a dev token: samDesktop | samPhone | joPhone | malloryPhone
curl -H "Authorization: Bearer <token>" "http://localhost:8787/v1/snapshot?deviceId=00000000-0000-4000-8000-000000000011"
```

## Use from code

```ts
// Real server
import { createClient } from "@vortex/api/client";
const api = createClient({ baseUrl: "http://localhost:8787", token });
const snap = await api.getSnapshot(deviceId);
if (snap.ok) snap.data.resources; else snap.error.code;

// No server: the same app in-process on fixture data (works in the browser too)
import { createFixtureHarness } from "@vortex/api/fixture-client";
const h = await createFixtureHarness();
const desktop = h.as("samDesktop"), phone = h.as("samPhone"), jo = h.as("joPhone");
```

Every method returns the Result envelope and validates the response against `@vortex/contracts`.
`createCheckpoint`/`createBrief` send an `Idempotency-Key` (pass your own when retrying);
`executePlan`/`createDelivery` are keyed by `operationId`.

## Rules enforced now

- Bearer token required everywhere (HMAC-SHA256, 12 h dev TTL). Identity comes from the token only.
  A `deviceId` in the body or query must match the token's device.
- Scopes: desktop = all; phone = `brief:read`, `progress:write`; agent (ASI:One) = command scope
  without `progress:write`. Phones can't plan, execute or read snapshots.
- Body validation and Appendix D bounds -> `VALIDATION_ERROR`. Unknown routes -> `NOT_FOUND`.
- Idempotency: same key + same body replays the receipt; changed body -> `IDEMPOTENCY_CONFLICT`.
- Fixture services also enforce: brief access only for the owner or a non-revoked, unexpired
  delivery recipient; approval required and bound to plan/user/device with 2-minute expiry; stale
  revisions -> `STALE_STATE`; read-progress revisions; single-use 2-minute pairing nonce confirmed
  by the desktop; revoked devices get `UNAUTHORIZED`.

## Workspaces (revision 1.3)

`GET /v1/workspaces` (cards with latest checkpoint), `POST /v1/workspaces` (Idempotency-Key),
`PATCH /v1/workspaces/:id` (`expectedRevision`; `null` clears a primary), and
`POST /v1/workspaces/:id/focus|resume` -> Plan or Clarification, executed through the normal
approve/execute routes. Checkpoints use `POST /v1/checkpoints` with `taskId = workspaceId` and an
optional `userNote`.

- Membership is explicit: new members must be live resources on that device; primaries must be
  selected members of the right kind. Stale snapshot or workspace revisions -> `STALE_STATE`.
- Focus activates only the primary tab and focuses only the primary window (last), and sets
  `finalFocusResourceId`. Resume also reopens checkpoint-bound URLs whose tab is gone (needs
  approval). Missing members are listed as unavailable, never replaced by a title match. No live
  primary -> a clarification.
- Fixture checkpoints store metadata + the user note with an empty summary. Nova's grounded summary
  and Josh's `planWorkspaceFocus/Resume` replace the fixture planner behind `Services`.

## Not done yet

- State is in memory (lost on restart). Durable state moves to the Spacetime module (`services/sync`).
- Pairing confirm returns the phone `Device` but doesn't hand the phone a token yet (1 PM milestone).
- `VORTEX_SERVICES=live` isn't wired; plans/briefs/checkpoints are canned fixtures.
- Dev tokens come from `npm run dev:token`, not a real sign-in.
