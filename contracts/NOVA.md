# Nova - Vortex teammate contract

Version 1.2 | 25 October 2026 | Windows | Wire schema 1.0

**Project context:** Vortex is a voice-controlled Windows workspace assistant. Find and group browser tabs, focus supported native windows, save a source-backed task checkpoint, send a reading brief to a paired phone, and resume unfinished work. It is profession-agnostic; the demo story is group-project research. Workspace continuity is the focus; a separate tutoring platform is out of scope.

**Team:** Josh owns A (control/voice), Nova owns B (intelligence/providers/Fetch), Andrew owns C (dashboard/API/phone/sync/integration). Nathan is absent at kickoff and optional support only; no required feature or milestone depends on him.

**Team clock:** 11 AM-10 PM. Gates: 1 PM real control; 3 PM phone vertical slice; 5 PM sponsor evidence; 6:30 PM feature freeze; 8 PM release candidate; 9:45 PM demo-ready; 9:45-10 PM buffer. These supplied times are not timezone-converted. Organizer submission deadlines are separate.

**Sponsors:** Cartesia = voice; Meta Llama = grounding/briefs plus a people-connection outcome; Elastic Agent Builder on Serverless = retrieval; Apify = requested public article extraction; SpacetimeDB = private real-time handoff; Fetch = registered ACP agent usable in ASI:One. Logos, fixtures and fallback paths do not prove a live integration or eligibility.

**Shared rules:** never execute generated scripts or expose secrets; the local executor alone mutates the computer. Cloud content and sharing need scoped consent. Deferred archive/closing, layout changes and unattended automation remain disabled. Runtime-validate shared messages and preserve the existing teammate work.

**Read next:** [team index](../TEAM_CONTRACT.md), [agent instructions](../AGENTS.md), [wire types/execution contract](JOSH.md#wire-contract), [API/auth/sync contract](ANDREW.md#api-contract), [team schedule](ANDREW.md#team-schedule). Source numbers in migrated sections refer to [the source list](ANDREW.md#sources). Proposed architecture is not a claim of completed implementation.

## Your workflow - owner B

Branch: `feat/intelligence`. Own `services/intelligence/`, `services/fetch-agent/` and Meta/Elastic/Apify adapters. Andrew owns authenticated API wiring and shared persistence; Josh owns local effects. Implement intelligence functions rather than a competing backend or execution path.

- By 12:30 PM: validated plan/checkpoint/brief fixtures and provider blockers reported; start Agentverse/ACP immediately.
- By 1 PM: real Llama, Elastic and Apify access; typed command-to-plan path.
- By 3 PM: real source-backed checkpoint/brief generation in the phone slice.
- By 5 PM: real provider traces and full linked ASI:One workflow; no dashboard-only substitute for the Fetch gate.
- 5-6:30 PM: grounding, ambiguity, invalid output, timeout and ASI parity checks.
- After freeze: provider/agent fixes, evidence and exact run instructions.

Read [Josh's canonical types and action rules](JOSH.md#wire-contract) before creating models; do not copy or independently rename schemas. Read [Andrew's routes and persistence](ANDREW.md#api-contract) and [security/release rules](ANDREW.md) before sending content. Follow [the complete timed schedule](ANDREW.md#team-schedule). No critical dependency is assigned to Nathan.

## 02 / Sponsor map and eligibility gates

### Use the tracks meaningfully

The six sponsor choices are confirmed. The integrations below are design recommendations. Exact eligibility still depends on organizer rules, sponsor guidance and the final working implementation. Sources: [1]-[8].

| Sponsor / owner | Concrete integration | Evidence / gate |
| --- | --- | --- |
| Cartesia / A | Speech transcription and spoken status via Cartesia. Push-to-talk first. | Record real transcription and reply; keep captions and typed fallback. |
| Elastic / B | Serverless Agent Builder agent with a scoped search tool over opted-in task/source records. | Show agent configuration and an actual tool trace. Plain Elasticsearch search is insufficient for the named track. |
| Spacetime / C | SpacetimeDB stores authorized device pairing, brief delivery, read progress and status subscriptions. | Show a live phone update and rejected cross-user read; confirm exact prize criteria with sponsor. |
| Apify / B | Run Website Content Crawler for one explicitly requested public article. Poll its run, retrieve text, retain source provenance. | Show real Actor run ID and its result in the brief. Do not crawl all tabs. |
| Fetch.ai / B | Expose the same workflow through an ACP agent registered on Agentverse and usable in ASI:One. | Complete find -> checkpoint -> phone delivery -> resume through ASI:One; collect conversation and tool trace. |
| Meta / B + C | Use a Meta Llama model for task/brief generation, plus a previewed project handoff to a second person. | Record actual model/provider and meaningful social outcome. Llama use alone does not establish theme fit. |

**Verified track constraints:** the event lists Elastic Agent Builder on Serverless and Meta's people-connection theme [1]. Fetch requires ACP, Agentverse registration, ASI:One usability, tool execution, and an end-to-end primary workflow in its conversation; a dashboard-only demo misses that gate [2].

**Do first:** B verifies model/API access and Fetch registration; C verifies Spacetime deployment; A verifies Cartesia audio. Pin working SDK versions after smoke tests. Do not spend hours adding integrations that cannot be demonstrated.

**Priority if time runs out:** keep the core journey working and explicitly report which tracks are not ready. Do not replace a sponsor with a fallback and still claim that integration. No extra payment or blockchain work unless mandatory rules require it.

## 05 / Nova (B) - intelligence, retrieval and agents

### Nova: understand intent and sources

**Mission:** turn vague requests into grounded, typed plans. Own services/intelligence, services/fetch-agent and provider adapters for Meta, Elastic and Apify. A owns Cartesia transport; C owns sync and UI.

#### Build in this order

- 1. Intent router: a fixed action vocabulary for tab search/switch/group, Windows focus, checkpoint, brief creation, phone delivery and task resumption. Straightforward commands can use deterministic rules; the model resolves semantics.

- 2. Meta model adapter: choose an accessible Meta Llama instruction model, log model ID/provider, and validate every output against shared schemas. One repair attempt, then clarification or a typed failure; never execute raw model output.

- 3. Elastic Agent Builder on Serverless: index opted-in source metadata/checkpoints, create a scoped retrieval tool, return source IDs and evidence excerpts. Search filters must be enforced in the trusted service/tool, never delegated to prompts.

- 4. Apify article tool: accept one public HTTP(S) article, cap to one page and a 60-second run budget, poll/cancel as appropriate, reject private/local addresses and redirects. No cookies, paywall bypass or logged-in crawling.

- 5. Checkpoint: summary of observed work, sources, user-stated goal and optional proposed next step. Label model inference; do not invent progress from page titles.

- 6. Fetch ACP adapter: link ASI:One conversation to an authenticated user, register on Agentverse, route to shared endpoints, and show plan approvals/results in the conversation. Test find, checkpoint, delivery and resume without opening the custom dashboard.

#### Interfaces you provide

planCommand(input), searchSources(query, scope), createCheckpoint(taskId, sourceIds), buildBrief(sourceIds, format), and handleAgentMessage(context). All produce schema-validated objects, provenance and operation IDs.

#### Acceptance demo

Find an article by meaning rather than exact title, show an Elastic tool trace, summarize an actual Apify result using Llama with source links, then complete the same journey from ASI:One. If two sources fit, ask a short disambiguation question.

**Scope cap:** no model training, vector database migration, open-ended agent loops or unsolicited recommendations. Limit a planning turn to two tool rounds, five search hits and ten proposed mutations. Provider fallbacks are labeled; failed sponsor gates remain visible.
