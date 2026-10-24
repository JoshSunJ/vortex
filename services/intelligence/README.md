# Owner B: Tab Selection and Workspace Intent Routing

A dependency-free Node.js starting point for Owner B. Gemini is the selected model
provider. Real browser inventory, Elastic, Apify, and Fetch are not connected.
All demos still use MOCK records/responses; live Gemini access awaits a local key.
Project files, messages, examples, and supported command patterns use English.

## Run

Open PowerShell in the repository directory, then run:

```powershell
node services/intelligence/demo.mjs
node services/intelligence/demo.mjs "switch to project notes"
node services/intelligence/workspace-demo.mjs
node services/intelligence/workspace-demo.mjs --interactive
node services/intelligence/content-demo.mjs
node services/intelligence/gemini-check.mjs
node --test
```

The tab demo shows a unique match, ambiguous matches, and a missing resource.
The workspace demo resolves all six high-level commands without executing them.
The content demo creates a checkpoint and reading-brief draft using mock article
text, model responses, authorization, and schema validators. It saves nothing.
Node.js 22.17.0 is the tested runtime. No installation or API key is required.
Type `exit` or `quit` to stop the interactive demo.

## Workspace commands from contract v1.3

The implementation is synced with the v1.3 contracts at `origin/main` commit
`886e1dc`, including Nathan's Elastic/Apify ownership split. Wire version stays 1.0.
The user subsequently selected Gemini for the free-first model integration. The
original Meta/Llama sponsor implementation is no longer assumed or claimed;
coordinate this selection with the team before making a Meta eligibility claim.

Nova owns routing, Gemini, checkpoints/briefs, and Fetch. Nathan owns the reserved
`retrieval/` and `extract/` directories and provides `searchSources(query, scope)`
and `extractArticle(url)`. Nova reviews/integrates those results; this feature does
not implement or overwrite Nathan's providers. See [HANDOFF.md](HANDOFF.md).

| Example request | Shared service command |
| --- | --- |
| find project research | find |
| create workspace "Group Project" | create_workspace |
| focus Group Project | focus_workspace |
| save checkpoint "Group Project" | save_checkpoint |
| send brief "Group Project" | send_brief |
| resume Group Project | resume_workspace |

Only the documented English command patterns are supported. Workspace creation,
checkpoint saving, and brief sending require double quotes around the name.
`search for`, `switch to`, and `continue` are supported aliases for find, focus,
and resume respectively. This is deterministic parsing, not open-ended AI chat.

Demo output represents **command resolution only**. It does not prove that a
workspace was persisted, a phone received a brief, or any desktop action ran.

`src/workspace-router.mjs` exports the internal `resolveWorkspaceRequest` resolver
and the `dispatchWorkspaceRequest` integration seam. No competing wire schema or
separate database was introduced. See [HANDOFF.md](HANDOFF.md) for service bindings.

## Tab requests

- `find project notes`: search title words without requesting a mutation.
- `switch to project notes`: select a tab activation target.
- `search for`, `activate`, and `focus` are supported aliases.

Every query word must appear in the title. Multiple plausible matches produce a
clarification rather than a guessed winner. Tab search excludes native windows.
Tab closing, shell commands, and native application content access are unsupported.

## Code and integration boundaries

- `src/tab-router.mjs`: `resolveTabRequest` returns internal selection decisions.
  Its input is a subset of inventory data, not a new full Snapshot schema.
  `resolved` and `ambiguous` are internal states, not wire schema additions.
- `planCommand` in the same module requires canonical Snapshot/Plan/Clarification
  validators and a trusted plan issuer. Missing dependencies produce an error.
- `src/workspace-router.mjs`: resolves the six documented WorkspaceCommand kinds
  and dispatches through injected shared services and canonical validators.
- `src/content-drafts.mjs`: creates checkpoint/brief drafts for the shared services,
  verifies exact source quotes, preserves the user's note, and labels proposed
  next steps as inferred. No persistence or delivery is performed.
- `src/model-json.mjs`: parses and validates a model-only JSON response through
  an injected transport. At most two calls share the repair/timeout retry budget.
- `src/gemini.mjs`: SDK-free Google Gemini transport with a fixed official endpoint,
  structured JSON output, bounded responses, and one allowlisted model.
- `demo.mjs` and `workspace-demo.mjs`: explicitly labeled mock examples.
- `test/`: routing, malformed input, ambiguity, device boundaries, stale state,
  content provenance, consent, cancellation, model output, and safe integration
  failure checks. All 75 tests passed on the tested runtime. Integration
  dependencies are test doubles.

Connect Josh's real schemas through `contracts.snapshot`, `contracts.plan`, and
`contracts.clarification`, each exposing `parse`. Workspace dispatch additionally
requires `contracts.workspaceCommand.parse` and a command-specific output validator.
Canonical schema implementations have not been copied into this directory.

Connect Andrew/Josh's trusted plan service with the internal
`issuePlan({commandId, deviceId, snapshotRevision, actions})` adapter. The input is
a proposal, not a complete wire Plan. The service owns authenticated identity,
authorization, approval policy, plan/action IDs, canonical hashing, expiry, and
persistence. It must not trust a user ID from the request body. Issuing a plan
must never execute desktop effects.

`planCommand` returns the documented `Result<Plan | Clarification>` shape after
validation. Read-only tab search uses `resolveTabRequest` without a mutation plan.

Root configuration, shared contracts, API/auth code, and lockfiles were not edited.
This feature is on `codex/owner-b-gemini`, based on the latest main at sync time.
Future features follow [the branch and sync workflow](AGENTS.md).

## Grounded content drafts

`createContentDrafts(dependencies)` exposes `draftCheckpoint(input, context)` and
`draftBrief(input, context)`. These are internal draft builders, not new HTTP API
contracts or alternative persistence services. Integrate them behind the existing
checkpoint/brief services; see [HANDOFF.md](HANDOFF.md) for the complete dependencies.

The input contains server-loaded workspace, resource, and selected source records.
It supports up to five selected sources, 50,000 text characters per source, a
2,000-character user note, and an 800-word summary bound. The original note is
preserved; long goal/note text may appear as a labeled excerpt in the summary.

The initial brief is extractive: the model selects up to five verbatim quotes.
Every quote must occur exactly in its cited, permitted source. Source presence
proves provenance, not the truth of the article or semantic completeness. Free-form
paraphrasing is not enabled. Native titles/handles and inventory are never model
input. Original URLs come from selected source records, never from model output.

Metadata-only checkpoints need no model; unavailable articles are marked rather
than summarized. Brief creation fails with CONTENT_UNAVAILABLE if no permitted
article text is ready. Mixed-source briefs take their default title from cited
content, including when the first selected article is unavailable.

The model helper uses strict JSON.parse, bounded output, a per-call deadline of
at most 20 seconds, and one shared repair/transient-timeout retry. It does not
execute model output. Cancellation raises a helper-local ABORTED error for the
operation worker to handle; ABORTED is not a new wire ErrorCode.

## Next steps and limitations

Connect canonical validators and shared persistence services, configure a local
Gemini key from a verified Free-tier project, and run the opt-in live check below.
Then connect one public article through Apify. Elastic and Fetch remain unconnected.
Mock demos and unit tests are not live sponsor evidence or real delivery proof.

## Gemini setup with a free-tier project

The selected model is `gemini-3.5-flash-lite`. Google's current documentation lists
it as stable with free-tier text input/output. Free quotas and account eligibility
must be checked in Google AI Studio. The application cannot determine project
billing status from an API key; a paid-enabled project can incur charges for the
same model. No billing changes, paid fallback, or automatic model switch exists.

1. Open [Google AI Studio](https://aistudio.google.com/) and verify that the project
   used for the key shows **Free**. Do not enable billing for this setup.
2. Copy the empty service template locally:

   ```powershell
   Copy-Item services/intelligence/.env.example services/intelligence/.env.local
   ```

3. Enter the key in `.env.local` using a local editor. The service-local .gitignore
   ignores this file; never paste keys in chat, source, screenshots, or logs.
4. Check readiness without contacting Google:

   ```powershell
   node --env-file=services/intelligence/.env.local services/intelligence/gemini-check.mjs
   ```

5. After verifying the Free tier, explicitly run the synthetic-only live check:

   ```powershell
   node --env-file=services/intelligence/.env.local services/intelligence/gemini-check.mjs --live --confirm-free-tier
   ```

The check prints only model/provider and safe status messages. It sends synthetic
demo text, not browsing data. A quota error stops the request without upgrading or
falling back. All other demos remain offline mocks even after configuring a key.

To use the transport behind the shared content services:

```javascript
import { createGeminiModel, DEFAULT_GEMINI_MODEL } from './src/gemini.mjs';
const model = createGeminiModel({
  apiKey: process.env.GEMINI_API_KEY,
  modelId: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
});
// Inject model into createContentDrafts alongside the canonical validators,
// exact-disclosure authorization callback, and shared hash implementation.
```

The adapter uses Google's documented compatibility REST endpoint without an SDK
or OpenAI account. Source grounding and canonical output validation remain in the
existing content draft builder. Free-tier content may be used to improve Google
products; keep demonstrations on permitted public sources and approved sample data.

Official references checked October 24, 2026:

- [Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- [Pricing and data-use distinction](https://ai.google.dev/gemini-api/docs/pricing)
- [Compatibility REST and structured output](https://ai.google.dev/gemini-api/docs/openai)
- [Model/project-specific quotas](https://ai.google.dev/gemini-api/docs/rate-limits)
