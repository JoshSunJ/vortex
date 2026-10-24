# Owner B Integration Handoff

## Implemented scope

- Deterministic tab title search/selection with ambiguity clarification.
- An internal resolver for the six WorkspaceCommand kinds in contract v1.3.
- A dispatch seam requiring authenticated context, canonical command validators,
  shared services, and command-specific output validation.
- Duplicate workspace name handling, rejection of request-injected records,
  device/member/primary-target checks, exact user-note preservation, and safe errors.
- Dependency-free console examples and Node.js tests. Demo data is labeled MOCK.
- English-only source messages, examples, documentation, and command patterns.
- Source-grounded checkpoint/brief draft builders with exact quote validation,
  note preservation, inferred next-step labels, and unavailable-source handling.
- Bounded model JSON validation with one shared repair/timeout retry, per-call
  deadlines, cancellation, and sanitized errors.
- SDK-free Gemini transport, local credential template/ignore rules, and an
  opt-in synthetic live check. Synthetic live access passed on October 24, 2026.
- Optional one-time loopback setup helper for storing the key without an editor.

## Contract baseline

Synced to `origin/main` commit `886e1dc` (Nathan retrieval ownership split):

- `contracts/NOVA.md` v1.3: bounded intents and Owner B responsibilities.
- `contracts/JOSH.md#workspace-model` and `#wire-contract`: WorkspaceCommand,
  Workspace, canonical wire types, and executor boundaries.
- `contracts/ANDREW.md#workspace-api` and `#api-contract`: services, API,
  authentication, consent, and persistence rules.
- `contracts/NATHAN.md`: Nathan owns Elastic retrieval and Apify extraction inside B.

Existing `taskId` fields reference the same entity as `Workspace.id`. Wire names
and version were not independently changed. No new HTTP API, database, or OS
executor was created. Root/shared contracts were not edited. The current feature
branch is `codex/owner-b-gemini`, created from the latest `origin/main` for this sync.
The subsequent local-key setup feature is stacked on that baseline as
`codex/owner-b-local-key-setup`, preserving its unmerged dependency.

## Ownership after the main update

- Nova owns intent routing, the user-selected Gemini adapter, checkpoint/brief
  generation, and Fetch/ASI:One integration.
- Nathan owns `services/intelligence/retrieval/` and `services/intelligence/extract/`.
  He supplies `searchSources(query, scope)` and `extractArticle(url)`, real Elastic
  Agent Builder traces, Apify run provenance, and provider failure/URL checks.
- Nova reviews and integrates Nathan's adapters. No duplicate Elastic/Apify
  implementations or changes to Nathan's reserved directories are included here.
- Andrew owns authentication, route wiring, shared persistence, and delivery.
- Josh owns canonical schemas, local execution, and operation recovery.

The ownership split requires no shared wire change. Exact query/scope/result
adapter details still need agreement with Nathan before live integration.

User-authorized model decision: Gemini replaces the originally planned Llama
generation adapter. The active model is `gemini-3.5-flash-lite`, provider
`google-gemini`. Root/shared contracts were not rewritten. Team coordination and
Meta eligibility review remain necessary; Gemini calls are not Meta/Llama evidence.

## Required A/C integration dependencies

Pass the following dependencies to `dispatchWorkspaceRequest(input, dependencies)`:

- `auth`: server-verified UUID `userId` and `deviceId`, never request-body identity.
- `workspaces`, `resources`: server-loaded records scoped to the authenticated user.
- `contracts.workspaceCommand.parse` and `contracts.clarification.parse`:
  canonical runtime validators maintained by Josh with B/C review.
- `services`: adapters listed below, each receiving `(command, {auth, commandId})`.
- `validateServiceResult(kind, result)`: command-specific canonical output
  validation; it must throw when the output is invalid.

| Command | Internal adapter | Implementation owner |
| --- | --- | --- |
| find | searchSources | Nathan retrieval, integrated/reviewed by Nova, with C authorization scope |
| create_workspace | createWorkspace | C membership validation and persistence |
| focus_workspace | planWorkspaceFocus | A/C shared plan service |
| save_checkpoint | createCheckpoint | B generation plus C persistence/receipts |
| send_brief | sendBrief | B brief generation plus C delivery/approval/receipts |
| resume_workspace | planWorkspaceResume | A/C shared plan service |

These are internal adapter suggestions, not requests to rename canonical functions
or HTTP routes. Translate arguments to existing service signatures inside each
adapter. In particular, map a save_checkpoint command's `workspaceId` to the
existing creation API's `taskId`. Preserve the original `userNote` in the action,
service request, and stored Checkpoint.

The dispatcher's internal search adapter receives `(command, {auth, commandId})`.
It must translate this to Nathan's `searchSources(command.query, trustedScope)`.
Build trustedScope from server-verified identity, selected workspace, and opt-in
authorization, never from model output. Consume Nathan's `extractArticle(url)`
through his agreed adapter rather than creating another extraction path.

Trusted services must enforce ownership, device scope, actual source membership,
consent, idempotency, current inventory/revisions, and remote command permissions.
Intent resolution does not grant access. Focus/resume return preview Plans only.
The sendBrief adapter must use the shared creation/approval/delivery flow, wait
for the actual brief ID, and never guess a future ID.

## Verification and remaining work

- Tested runtime: Node.js 22.17.0.
- Run all tests with `node --test` from the repository root: 85 passed, one skipped
  because Windows symlink creation privilege was unavailable. The environment
  requires loopback permission for the local setup tests.
- Verified tab, six-command workspace, and content-draft demos, including workspace
  interactive input. All model/consent/schema dependencies in the demos are mocks.
- Integration test validators/services are test doubles, not production schemas
  or proof of authentication enforcement.
- Missing: canonical runtime validators and real persistence/execution/phone integration.
- Verified: real Gemini returned one validated synthetic quote through the selected
  transport. The key was stored only in the Git-ignored local environment file.
  The project displayed Free tier; no billing setting changed or paid fallback ran.
- Missing: live Elastic/Apify/Fetch integration and real source-to-phone evidence.
- Each developer needs an approved local Free-tier Gemini key; do not share keys
  in chat, source, logs, or Git. The live check sent synthetic data only.
- Unchanged: root configuration, dependency/lockfile, shared contracts, and A/C apps.

Validate actual service input/output fixtures against the canonical schemas before
integration. Unit test success alone does not prove live execution or eligibility.

## Content draft integration

`createContentDrafts` is a B-owned builder used by the existing shared services,
not a second service/store. Its two methods receive an internal input object:

- `workspace`: the authorized canonical Workspace (taskId remains its UUID).
- `resources`: selected canonical Resource records, at most 100.
- `sources`, `sourceIds`: matching canonical Source records and explicit selection,
  at most five. Linked resource IDs must refer to selected browser tabs.
- `userNote?`: explicit user context, preserved exactly in the Checkpoint.
- `metadataOnly?`: permit a checkpoint without model inference; never a valid
  replacement for a grounded brief or sponsor evidence.
- For a brief: `format`, `audience`, and optional explicit `title`.

The trusted context supplies `userId`, `deviceId`, and optional AbortSignal.
Required injected dependencies:

- `contracts.workspace/resource/source/checkpoint/brief.parse`: canonical validators.
- `hashText(text)`: the team's shared normalization/hash implementation. No new
  content-hash convention is imposed. Changed source hashes fail with STALE_STATE.
- `authorize(context, disclosure)`: trusted check returning exactly true only after
  validating ownership, selected source membership, and purpose-specific consent.
  Disclosure includes source hashes, audience, model/provider identifiers, field
  names, and exact goal/note hashes for cloud calls. No request boolean is consent.
- `model`: createGeminiModel({apiKey, modelId}) supplies providerId/modelId and
  `complete({messages, signal})`. Load the key in a trusted service process only.
  `.env.local` is service-locally ignored; the empty `.env.example` is safe to share.
- Optional `clock()`: returns a Date, for reproducible jobs/tests.

The model-only DTO selects quotes by source ID and an optional proposed next step.
It is not a competing wire schema. No arbitrary model-generated claims, URLs,
resource IDs, or actions enter a saved draft. Verbatim evidence is labeled observed,
explicit goal/note is user_stated, and a proposed next step is inferred. Exact
quotation does not establish article truth or complete semantic grounding.

Draft methods return Result<Checkpoint> or Result<Brief> only after canonical output
validation. The worker must persist through the existing service and issue/update
the actual operation receipt. Creating a brief does not deliver it. Retry/idempotency
and immutable version allocation remain in that shared persistence service; a new
draft has version 1 and must not overwrite an existing version.

For cancellation, stop the worker on helper-local ABORTED and mark the existing
Operation cancelled. Do not expose ABORTED as a new wire ErrorCode. Errors/invalid
model bodies are sanitized and not echoed to repair prompts or logs.

The production adapter is fixed to Google's HTTPS compatibility endpoint and
the one selected model. It sends structured JSON requests with no tools, rejects
redirects, truncation, tool calls/refusals, mismatched models, and oversized response
bodies. It has no internal retries: the shared helper owns the two-call budget and
deadlines. 401/403 become sanitized FORBIDDEN; 429 stops with CONTENT_UNAVAILABLE.
The client cannot enforce Google account billing status; confirm Free tier before
live use. See README for readiness and explicit synthetic live-check commands.

## API integration slice

The `codex/owner-b-api-integration` branch adds `src/api-planner.ts` as an
implementation of Andrew's existing `Services.createPlan` method for bounded
workspace focus/resume. It uses authenticated shared inventory/workspace services,
canonical command/response schemas, stale-state checks and duplicate-name
clarification. It delegates plan creation and preserves the stored plan/hash;
it does not approve or execute actions. Other command kinds receive guidance to
their dedicated service/form rather than a canned focus plan.

`src/canonical-content.ts` binds existing content generation to the actual shared
schemas. Canonical compatibility is now tested, using synthetic content and a
mock model/consent policy. Real model access was verified separately; this slice
does not call any provider or persist/deliver drafts.

See [API_INTEGRATION.md](API_INTEGRATION.md) and run
`node --import tsx services/intelligence/api-demo.mjs` with Node 24+. This is an
in-process MOCK demonstration through the actual authenticated API and canonical
validators. The dependent API/contracts/UI are imported unchanged from Josh's
published `feat/control` at `a270752`. No default API server or Electron UI
entrypoint was rewired; app hookup remains coordinated with Andrew/Josh.

Verification: TypeScript check passed; shared TS suites plus 13 new integration
tests passed (86 tests total); legacy B Node suite passed 85 with one Windows
symlink-privilege skip. Loopback server tests require local communication permission
in the Codex sandbox. No package or model versions were changed.
