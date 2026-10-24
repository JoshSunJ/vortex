# Owner B API and canonical-schema integration

This slice connects Owner B's resolver to Andrew's actual `Services.createPlan`
interface and Hono authentication routes. Content drafts now use the actual
`@vortex/contracts` runtime schemas instead of injected test validators.

## Enabled entrypoints and ownership

The desktop command endpoint and default API server now use B's shared bounded
workspace resolver. This hookup starts from integrated main `1478868`; it adds no
dependencies, wire fields, routes, store or executor.

- `apps/desktop/src/commands.ts`: transcript/typed focus and resume resolve the
  locally saved workspace through B, then request A's existing stored preview.
  Local search, direct native-title focus, partial-name choices and create/note
  forms retain their existing paths. The renderer and voice IPC are unchanged.
- `services/api/src/server.ts`: wraps its existing fixture Services object with
  `withApiPlanner`. Authentication, labels and non-planning methods are preserved.
- `services/intelligence/src/api-planner.ts`: shared authenticated API adapter.

Only explicit approval/execution through A's existing service changes the desktop.
This is deterministic workspace routing. It does not enable Gemini interpretation,
cloud summaries, real phone delivery, or automatic source capture.

## Demonstrate the contribution without cloud costs

Use Node 24+ (required by the shared root configuration). Install the existing
lockfile dependencies with `npm ci --ignore-scripts`. This skips the Electron
binary download; this runbook does not launch Electron. Then run:

```powershell
node --import tsx services/intelligence/api-demo.mjs
```

It runs in-process, without a server port, microphone or API key:

1. An actual HMAC-signed development identity is verified by the existing API.
2. `POST /v1/plans` receives `resume Group Project`.
3. Owner B resolves the saved workspace using server-scoped records.
4. The shared fixture planner returns a canonical, stored preview plan.
5. Owner B also generates a source-grounded synthetic checkpoint through the
   actual canonical validators and a labeled mock model/consent policy.

Every fixture/model/consent dependency is explicitly MOCK. This proves integration
and schema compatibility, not a real user login, Gemini call, real source
extraction, desktop action, persisted summary, phone delivery or sponsor evidence.
No key or signed token is printed. No local environment file is loaded.

## Compose into Andrew's existing API

```ts
import { withApiPlanner } from './services/intelligence/src/api-planner';
// sharedServices is Andrew's existing authenticated Services implementation.
const services = withApiPlanner(sharedServices);
const app = createApp({ services, signer });
```

Do not relabel fixtures as `live`. The adapter preserves the supplied service
label and never chooses a fixture fallback. `withApiPlanner` also preserves method
receivers, including non-planning methods. The default API server uses this
composition but still accepts only `VORTEX_SERVICES=fixture`. The plain
`createFixtureServices`/fixture-client harness remains a development fixture;
consumers needing production-style B routing should use the wrapper explicitly.

`focus`, `switch to`, `resume`, and `continue` resolve complete saved workspace
names, including reviewed `Please`, `workspace`, and matched-quote forms. Duplicate
names return canonical Clarification options. An unknown
workspace returns NOT_FOUND. Unsupported/create/save/send/search requests never
fall through to Andrew's canned focus plan: they return guidance to use the
existing dedicated service/form. This planning endpoint does not mutate state.

All inputs use the existing API request schema. Identity comes from AuthContext,
inventory/workspaces come from authorized shared services, and device/revision/
selected-resource checks run before requesting a plan. Returned plans must match
the requested workspace, device and snapshot and exclude deferred actions.

The adapter preserves the exact shared plan ID, command ID, hash and action order
so its existing approval record remains valid. The current shared workspace
planning methods allocate their own commandId (their signature has no caller
commandId). Correlate through the returned stored plan; do not rewrite its fields
after hashing. End-to-end caller-command correlation remains an A/C integration
detail to agree before production. No schema change is introduced here.

## Canonical content generation

`createCanonicalContentDrafts({hashText, authorize, model, clock?})` binds the
existing builder to Workspace/Resource/Source/Checkpoint/Brief schemas imported
from `@vortex/contracts`. It adds no new data model, store or creation endpoint.
See HANDOFF.md for consent, source loading, immutable-version and operation-worker
requirements. The shared service must persist the validated draft and manage
the real operation receipt; draft creation alone is not delivery.

## Checks

Run `npm run check` for both TypeScript projects, all Vitest integration cases and
the separate Node unit suites. New hookup cases exercise the actual default API
process and authenticated local command endpoint with real SQLite/planning code
and mock platform adapters. They check exact/ambiguous names, safe native fallback,
authorization, stored hashes and explicit approval before the mock effect.
Current result: 104 Vitest tests passed; 105 Node tests passed with one Windows
symlink-privilege skip. No dependency/model version changed or billable call ran.

### Plan timestamp race found during integration

An unmodified desktop workspace test intermittently failed because `savePlan`
read `new Date()` for creation and `Date.now()` separately for expiry. A 1 ms tick
between reads produced a lifetime of 120001 ms, rejected by the executor's
existing 120000 ms upper bound. The deterministic regression in
`test/plan-expiry.integration.spec.mjs` failed before the fix and passes after it.

The fix captures `Date.now()` once and derives both timestamps from that reading.
The two-minute policy, action vocabulary, approval rules and wire fields are
unchanged. The regression uses an in-memory journal and mock native adapter;
it never focuses a real window. Josh should review this small control-file change.

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.json
node node_modules/typescript/bin/tsc -p apps/desktop/tsconfig.json
node node_modules/vitest/vitest.mjs run services/intelligence/test/api-planner.integration.test.ts services/intelligence/test/desktop-routing.integration.spec.mjs services/intelligence/test/api-bootstrap.integration.spec.mjs
```

The new integration suite covers the actual HMAC/API/schema path, workspace
routing, missing/forged/phone/cross-user access, device mismatch, stale snapshots,
ambiguous names, injected records, invalid service plans, preserved approval
hashes, exact notes/quotes, source hashes, canonical-record rejection and native
identity exclusion from model messages. No external provider is called.

Legacy B `.test.mjs` files use Node's test runner; the shared TS tests use Vitest.
Run these suites with their respective runners rather than treating Node tests
as Vitest tests. Andrew coordinates any future unified root test configuration.
