# Vortex - team plan and Claude/Codex contract

Version 1.1 | 25 October 2026 | Windows | Implementation workflow contract

Repository: https://github.com/JoshSunJ/vortex

**Build window: 11:00 AM-10:00 PM, using Josh's supplied team clock. Demo-ready target: 9:45 PM; 9:45-10:00 PM is contingency only.** Do not convert these supplied times into another timezone or treat 10 PM as the start of final testing. This document supersedes the earlier PDF and unnamed 12-hour plan. It does not change organizer submission deadlines.

## Team assignments - read this first

| Owner | Name | Required work | First handoff |
| --- | --- | --- | --- |
| A | **Josh** | Windows helper, Chrome extension, local executor, Cartesia voice, tab/window actions and local recovery | Snapshot + real focus command working by 1 PM |
| B | **Nova** | Intent planning, Meta Llama, Elastic Agent Builder on Serverless, Apify, checkpoint/brief generation, Fetch ACP/Agentverse/ASI:One | Typed plan + checkpoint/brief fixtures by 12:30 PM |
| C | **Andrew** | Dashboard, backend API/auth wiring, mobile reader/pairing, SpacetimeDB, access controls and integration coordination | Typed fixture client + API/auth skeleton by 12:30 PM |
| Optional support | **Nathan** | Prepared demo data, nonessential visual polish, captions/screenshots, second copy of backup demo, wording/proofreading | Pick up an isolated task whenever he arrives |

**Nathan is not present yet. No required feature, service, credential, integration, release check, recording or submission may depend on his arrival.** Josh, Nova and Andrew own the critical path and must cover essential tests and backup recording themselves. Nathan's work can be omitted without changing the demo. He does not own Fetch, API/auth or any required sponsor integration.

### Each person's workflow

- **Josh:** read sections 03, 04, 08-10 and Appendices B-F; implement inventory/control with fixture plans first, then voice and live plans. Branch: `feat/control`. Require a real Windows/Chrome check before calling an action done.
- **Nova:** read sections 02, 05, 08-10 and Appendices B-G; freeze typed plans and fixture outputs first, then attach real providers and ASI:One. Branch: `feat/intelligence`. Report sponsor access blockers by 12:30 PM; keep one bounded workflow per service.
- **Andrew:** read sections 03, 06-10 and Appendices B-G; deliver fixture clients and authenticated API skeleton first, then live dashboard/phone sync. Branch: `feat/continuity`. Own root scripts and integration coordination; each owner implements and tests their own business logic.
- **Nathan, on arrival:** read this assignment table and ask Andrew for a noncritical task. Use `chore/demo-support`. Prefer isolated copy/styles/demo assets; do not change shared schemas, dependencies, API/auth or another person's unfinished code. Andrew reviews any polish after the core demo is working.

**Status protocol:** at every timed gate, each required owner posts what works on real hardware/services, the next handoff and one blocker. Share changes via small reviewed commits. Tell teammates promptly if an interface changes; never silently make a second contract.

## 01 / Product decision brief

### A workspace that follows you

**Working name: Vortex.** A Windows voice workspace assistant that finds your open work, creates a useful checkpoint, and lets you continue reading or collaborating on another device.

**Core promise:** "Tell your computer what matters. Take the useful context with you." This is a proposed design and work contract, not an implemented product or a guarantee of prizes.

#### Decisions to build around

- **Focus on workspace continuity.** The dashboard organizes tabs, windows, tasks and checkpoints. Reading support belongs inside that workflow. A separate tutoring platform, courses and quizzes are out of scope.

- **Profession-agnostic product; one concrete demo.** Use research for a group project as the example. The same task/source/checkpoint structure works for students, professionals and personal projects.

- **Windows desktop app + thin Chrome extension.** The app controls supported OS windows; the extension supplies reliable browser tab identity and permitted page text. This is OS-integrated software, not a new OS or universal control of every application.

- **Phone is a reading companion first.** Explicitly send an article brief or checkpoint to a paired phone. General remote keyboard/mouse control is deferred.

- **Social handoff is explicit.** Preview a project briefing before granting a teammate access. Personal phone sync and sharing with another person are different permissions.

#### Required minimum and deliberate exclusions

Required: push-to-talk, find/switch/group tabs, focus a supported Windows window, task dashboard, checkpoint creation, source-linked phone brief, resume task, visible operation status, all six sponsor integrations with evidence. Closing/archiving tabs is deferred for this sprint; stale-tab suggestions may offer Keep / Snooze / Save checkpoint without closing anything.

Excluded: arbitrary shell commands, deleting files, closing native apps, unsaved-form recovery guarantees, general screen scraping, unattended purchases/messages, always-listening microphone, native iOS/Android apps, full remote desktop and a second OS.

**Confirmed by Josh:** Windows; Meta, Elastic, Spacetime, Cartesia, Apify and Fetch.ai. Required owners are Josh (A), Nova (B) and Andrew (C). Nathan is optional support and absent at kickoff. The team has 11 AM-10 PM on its supplied clock; aim to be demo-ready by 9:45 PM. Document date: 25 October 2026.

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

## 03 / Architecture and Windows feasibility

### One system, several interfaces

**Recommended stack:** Electron + React + TypeScript desktop; Manifest V3 Chrome extension; a small Windows helper using C#/.NET and Win32 APIs; TypeScript backend; Python uAgent adapter for Fetch; React mobile web app; shared Zod schemas. Pin versions at kickoff, not by model guess.

| Layer | Responsibility / boundary |
| --- | --- |
| Desktop renderer | Local dashboard, push-to-talk, transcript, plan preview and recovery controls. No provider keys or direct OS calls. |
| Desktop main + Windows helper | Single local command executor; persistent operation journal; window enumeration/focus; minimize/restore/move are stretch features. Use explicit handles and verified process identity. |
| Chrome extension | Track tabs/windows, group and activate tabs, capture permitted text. Native messaging host bridges to desktop; register only the known extension ID. |
| Backend / intelligence | Authenticate; route to Cartesia, Llama, Elastic Agent Builder and Apify; validate plans. Never execute generated scripts. |
| SpacetimeDB | Authorized shared state: devices, checkpoints, deliveries, progress and command receipts. Local desktop journal remains authoritative for local execution. |
| Phone / ASI:One | Phone reads delivered briefs; ASI:One invokes the same planning and execution services with a linked identity and scoped consent. |

#### Data flow

Voice or text -> transcript -> relevant tab/window snapshot -> validated plan -> required user approval -> executor -> journal + result -> dashboard / authorized phone subscription. Content retrieval and summarization happen only for selected sources.

#### Feasibility rules

- Do not try to identify all Chrome tabs from OS window titles. Chrome owns tab identity; Windows owns top-level windows. Maintain separate resource IDs.

- Chrome native messaging uses framed JSON and an installed host manifest [9]. Keep packets small; transfer selected text in bounded chunks rather than whole browsing history.

- Windows may deny foreground activation. Verify the result; return FOCUS_DENIED and highlight the target for a user click. Never claim success after merely calling an API [10].

- Use event-driven tracking and a five-minute candidate scan, not constant AI calls. Persist state because extension workers can stop. Reconcile on reconnect; do not infer that a missing event means a tab was closed [11].

**First 45-minute platform spike:** list real tabs, focus one tab, focus one native window, survive extension reconnect. If native messaging installation blocks progress, use a development-only authenticated loopback bridge with strict Origin checks; document the limitation.

## 04 / Josh (A) - desktop, browser and voice

### Josh: control the actual computer

**Mission:** make every claimed action affect the correct live resource, and make failures recoverable. Own apps/desktop, apps/extension, native/windows and local execution code.

#### Build in this order

- 1. Inventory: Chrome tabs/window events and Windows top-level windows. Generate app-owned IDs bound to current session IDs/handles. Persist firstObservedAt and lastActivatedAt; unknown age stays unknown.

- 2. Control: activate tab; group selected tabs; focus a supported native window. Minimize/restore/layout rearrangement are stretch features only after the main journey passes. Never close native apps in the MVP.

- 3. Command runner: validate revision, resource identity, scope and approval; journal operations; process desktop mutations serially. Return per-action outcomes.

- 4. Voice: desktop push-to-talk -> backend Cartesia transcription -> final transcript. Speak short results through Cartesia; display identical text. Stop playback when recording to avoid self-triggering.

- 5. Recovery: save checkpoints, reopen saved HTTP(S) source URLs on resume, reconcile after reconnect, report failed focus, cancel between actions and recover operation status after restart. Tab-closing/archive execution is deferred; its future safety rules remain in the contract.

#### Interfaces you provide

getSnapshot(), executePlan(planId, approvalId), getOperation(id), restoreCheckpoint(id), and capabilities(). Browser adapter exports listTabs, activateTab, groupTabs and openSavedUrl. Windows adapter exports listWindows and focusWindow. archiveTabs and setWindowState are future capabilities and must not be advertised by the demo.

#### Acceptance demo

With two Chrome windows and a native editor open, say "switch to my project notes." Resolve the intended tab, focus its browser window, and verify selection. Then focus the editor by voice. Navigate a selected tab before executing a saved plan: execution must return STALE_STATE.

#### Dependencies and deliverables

Use B's fixture plan until intelligence is ready; expose mock adapter to C on hour one. Deliver setup instructions, host registration/unregistration script, .env.example without secrets, structured errors and an actual Windows test recording.

**Scope cap:** one Windows laptop, one Chrome profile and ordinary desktop windows. A process title match alone is never enough for a destructive action. No global key injection or arbitrary computer-use agent is needed for the main demo.

**Assigned owner: Josh.** Nova supplies typed plans; Andrew supplies API/UI integration. Nathan is not a dependency.

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

## 06 / Andrew (C) - dashboard, phone and integration

### Andrew: make continuity visible

**Mission:** make the user understand what is open, what will happen, and what traveled to another device. Own apps/dashboard, apps/phone, services/sync, Spacetime module and shared integration fixtures. Coordinate merges.

#### Dashboard: four useful areas

- **Now:** current task and relevant tabs/windows, a "focus this task" action, visible microphone state, live transcript and clarification choices.

- **Later:** stale-tab suggestions with Keep / Snooze / Save checkpoint. No tab-closing execution is required for this demo.

- **Checkpoints:** searchable saved work with source links, timestamp, observed progress, proposed next step and Resume action.

- **Devices:** paired phone, delivery status, recent briefs and revoke access. Technical traces belong in a separate developer view.

#### Build in this order

Start against fixtures. Then implement auth, short-lived QR pairing, private Spacetime subscriptions and reducer checks. Build mobile web reader with summary/source link/read position, delivery acknowledgements and explicit read-aloud. Add a second-user project brief with preview, recipient selection and revocable access; no automatic messages.

#### Phone handoff contract

"Send this article to my phone" selects a source -> shows content scope -> creates a durable brief -> publishes delivery to the paired identity -> phone acknowledges receipt. On reconnect, it fetches pending deliveries without duplication. Offline laptop status is explicit; previously downloaded briefs can remain readable.

Default packet: article title, publisher/source URL, retrieval timestamp, 3-5 key points, permitted excerpt and proposed follow-up. Full text is optional only when extraction succeeds and the user has rights/access. Do not promise that an authenticated laptop session transfers to a phone.

#### Acceptance demo

A real phone receives the chosen brief, opens its original source, records read progress, and updates the dashboard. A second identity cannot read it. A separately approved teammate can read only the shared briefing, not the workspace. Revoking access blocks future server retrieval.

**Deliverables:** responsive screens, sync schema, auth tests, role-aware fixtures, one-command dev setup, recorded integration journey, evidence checklist and submission draft. Do not block A/B on visual polish; provide typed fixture clients immediately.

## 07 / 11 AM-10 PM team schedule

### Finish before the deadline, with no dependency on Nathan

Times below use Josh's supplied team clock, without timezone conversion. There are eleven hours from 11 AM to 10 PM. **The release candidate must work by 8 PM and the demo must be ready by 9:45 PM.** The final fifteen minutes are a buffer, not planned feature work. Keep organizer submission time separate and verify it independently.

| Time | Josh / A | Nova / B | Andrew / C | Gate / expected evidence |
| --- | --- | --- | --- | --- |
| **11:00-11:30 AM** | Agree resource bindings, snapshot/action types; prove Windows helper prerequisites | Confirm model/provider accounts; freeze plan/checkpoint/brief fixtures; begin Fetch registration | API/auth skeleton, folder layout, fixture client; confirm Spacetime access | Shared interfaces committed; one article and demo task chosen; blockers posted |
| **11:30 AM-1:00 PM** | Real Chrome inventory, tab activation and native window focus; Cartesia smoke test | Typed command -> plan; Llama/Elastic/Apify smoke tests; ACP agent setup | Dashboard against fixtures; authenticated API endpoints; private phone subscription and pairing | **1 PM:** a real command reaches the correct real tab/window; every provider has access or an explicit blocker |
| **1:00-3:00 PM** | Connect Cartesia voice and executor; verify selected targets; tab grouping | Real checkpoint/brief generation and selected article retrieval; connect Elastic Agent Builder | Connect dashboard/API to A+B; real paired phone receipt; operation/delivery status | **3 PM:** voice -> correct tab -> durable checkpoint -> source-linked brief on a real phone |
| **3:00-5:00 PM** | Resume saved task; handle changed targets, failed focus and reconnect | Complete ASI:One identity link + ACP workflow; collect Meta/Elastic/Apify/Fetch traces | Progress sync, approval UI, revocation checks; previewed teammate brief | **5 PM:** show real success evidence for all six integrations or decide explicit cuts/track limitations |
| **5:00-6:30 PM** | Run stale-target/restart/duplicate-command checks on Windows | Grounding, ambiguity and provider-timeout checks; ASI:One primary-flow parity | Cross-user denial, pairing replay/expiry, reconnect and complete integrated journey | **6:30 PM feature freeze:** no new capabilities or service changes |
| **6:30-8:00 PM** | Fix execution/voice bugs only | Fix provider/agent bugs only | Integrate fixes and verify full phone/desktop journey | **8 PM release candidate:** end-to-end journey works on actual demo devices |
| **8:00-9:00 PM** | Rehearse controls and reset routine | Rehearse ASI:One + sponsor evidence; verify sources | Lead three timed rehearsals; capture essential backup recording and setup notes | Three passing rehearsals or a reduced working demo; all failures have an honest explanation |
| **9:00-9:45 PM** | Freeze known-good build and document Windows startup/reset | Finish real tool evidence and agent/run instructions | Final README/image/demo recording; validate from clean startup | **9:45 PM: demo-ready.** One pinned revision, recording, evidence and recovery instructions available |
| **9:45-10:00 PM** | Stand by; critical fixes only if a demonstrated blocker exists | Stand by; no model/dependency swaps | Hold final working artifact and backup copy | Buffer only; do not start new implementation |

**Nathan, whenever he arrives:** Andrew offers one isolated optional task: improve sample/demo labels, adjust nonessential spacing/colors, proofread captions, capture extra screenshots, or make a second copy of an already completed backup recording. No milestone above waits for him, and his changes must not destabilize the frozen build.

### Cut rules and ownership

- **1 PM:** if a provider is inaccessible, its owner investigates within the current block and makes the blocker visible. No service silently disappears from sponsor claims.
- **3 PM:** if the phone slice is incomplete, all three owners prioritize that path before adding more UI. No new capability until it works.
- **5 PM:** choose the demonstrable scope. Preserve voice/text find+focus, checkpoint, phone brief, source links and resume. Keep all selected sponsor integrations only where real evidence exists. If Fetch parity or social sharing is incomplete, state the relevant track gap.
- **6:30 PM:** stop feature work. Cut window layout changes, archive/closing tabs, automatic stale-tab scans, phone audio and offline caching before compromising the core path.
- **8 PM:** if necessary, freeze a smaller honest live journey and record it; a fallback is labeled and never presented as a working sponsor integration.
- **After 9 PM:** no architecture, model or dependency changes. Andrew controls integration; owners fix only reproducible demo blockers.

### Git and integration rules

Andrew coordinates merges/root configuration. Josh owns execution contracts; Nova and Andrew review shared interface changes. Work in `feat/control`, `feat/intelligence` and `feat/continuity`; Nathan may use `chore/demo-support`. Create these branches from the current default-branch head once work begins; these are proposed workflow names, not claims that branches exist. Merge small working slices at the gates and keep all owners updated. Nathan never changes critical contracts or credentials. Fixtures are labeled and never count as live evidence.

## 08 / Version 1 API and authority boundaries

### The shared service contract

This Markdown is the canonical team contract. Appendices A-G include agent onboarding, field-level types and route behavior. Both Claude and Codex must read the relevant owner workflow and shared interfaces before implementation; schemas are versioned together.

| Operation / endpoint | Required input -> result |
| --- | --- |
| GET /v1/snapshot | Authenticated user + device -> sessionId, revision, resources, capabilities; only that user's authorized resources. |
| POST /v1/plans | commandId, text, deviceId, snapshotRevision, selectedResourceIds -> typed Plan or Clarification. No side effects. |
| POST /v1/plans/:id/approve | Exact planHash and confirmation -> short-lived approval bound to user/device/actions. |
| POST /v1/plans/:id/execute | operationId, expectedRevision, approvalId if required -> operation receipt; executor rechecks live state. |
| GET /v1/operations/:id | Authorized operation ID -> queued/running/partial/succeeded/failed/cancelled, per-action outcomes. |
| POST /v1/operations/:id/cancel | Stop before next action; report any completed effects. Cancellation is not rollback. |
| POST /v1/checkpoints | taskId, resourceIds, consent scope -> durable checkpoint, source references and inferred/observed labels. |
| POST /v1/briefs | sourceIds, format, audience, taskId -> asynchronous build receipt; no implicit delivery. |
| POST /v1/deliveries | operationId, briefId, recipient:{deviceId} or recipient:{userId}, approvalId -> durable delivery receipt. |
| POST /v1/checkpoints/:id/resume | Resolve live matching resources and saved URLs -> preview Plan; execute uses ordinary approval path. |

**Result envelope:** {schemaVersion:"1.0", requestId, ok:true, data} or {schemaVersion:"1.0", requestId, ok:false, error:{code,message,retryable}}. Backend derives user identity from credentials, never from a trusted userId in request JSON.

**State updates:** resource.upserted, resource.removed, operation.updated, checkpoint.created, delivery.updated, readProgress.updated. Every event has eventId, schemaVersion, deviceId, sessionId, sequence and emittedAt. C maps Spacetime subscriptions into these logical events.

**Local channel:** authenticated native messaging -> desktop executor. **Remote channel:** authenticated backend -> authorized command row -> desktop outbound subscription -> receipt. Never expose a desktop control port publicly. Phone v1 has read/progress scope; ASI:One gets separately granted command scope.

## 09 / Rules that prevent integration failures

### Identity, state and recovery

#### Data ownership

**Resource:** app-owned UUID, revision, session binding, kind (tab/window), device ID, display title, optional URL, firstObservedAt, lastActivatedAt, protection flags and capabilities. Chrome tab IDs and Windows handles are ephemeral bindings, never global identifiers.

**Task:** UUID, user-stated goal and selected resource IDs. **Checkpoint:** immutable source snapshot, source hashes, summary, proposed next step, provenance, timestamp. **Brief:** versioned selected content and audience. **Delivery:** brief ID/version, recipient, expiry and receipt state. **ReadProgress:** resource/brief version, position and last update.

#### Execution state machine

Plan: draft -> awaiting_approval -> approved -> executing -> completed / partial / failed / cancelled / expired. An approved plan expires after two minutes. New tab navigation, changed target set or new content/audience invalidates approval. Approval is checked by code, never model confidence.

Operation: persist before effects; update each action as it completes. Archive: write URL/title/checkpoint durably -> revalidate live target -> close -> record outcome. If interrupted between close and receipt, reconcile actual tabs and mark unknown/partial where needed; never blindly repeat a close.

#### Concurrency and reconnect

- One writer per device executes desktop mutations. Backend idempotency key is (authenticated user, operationId). A retry returns the saved receipt; same key with different payload returns IDEMPOTENCY_CONFLICT.

- Compare the affected resource revisions and live bindings before each action. Reconcile inventory after restart/reconnect; rebind only verified live resources. Restore opens saved HTTP(S) URLs as new tabs when originals no longer exist.

- Retain a durable outbox for pending checkpoint/delivery updates. SpacetimeDB is the shared delivery record; Elastic is an eventually consistent search projection. Index lag never means the underlying checkpoint disappeared.

- For partial plans, keep completed action results and offer a new recovery plan. Reopening a URL cannot restore unsaved forms or application state. Layout restore is best effort if windows/displays have changed.

**Error vocabulary:** VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_STATE, PROTECTED, NEEDS_CLARIFICATION, APPROVAL_REQUIRED, EXPIRED, DEVICE_OFFLINE, FOCUS_DENIED, STORAGE_FAILED, PROVIDER_TIMEOUT, CONTENT_UNAVAILABLE, IDEMPOTENCY_CONFLICT, INTERNAL_ERROR.

## 10 / Security, content and remote-device rules

### Keep control and context private

#### Authority and content

- Only the local executor mutates OS/browser state. Model outputs are typed proposals. Website text, extracted articles and retrieved snippets are data, never instructions. No eval, model-generated shell commands or automatic installation.

- Native messaging allowlists the extension ID. Electron uses contextIsolation, renderer sandboxing, nodeIntegration disabled and a narrow validated preload API. Provider keys stay in trusted backend processes [9,12].

- Protect active/pinned/audible/user-protected tabs from archive. The dashboard may suggest changes, but must state why and require approval. Snooze duration is explicit; known-to-be-stale and safe-to-close are different judgments.

#### Cloud consent and content boundaries

Default tracking is local metadata. Before first cloud operation, disclose which selected titles, URLs, text and audio go to which providers. Permission to track does not imply permission to summarize remotely or share with another person. Exclude incognito and user-blocked domains.

Apify gets only an explicitly selected public URL; strip credentials, reject private/reserved destinations and validate every redirect. Logged-in text comes from user-approved extension extraction and never carries cookies/tokens to the crawler. If extraction fails, send source link + unavailable status, not a fabricated summary.

Summaries include original URLs, retrievedAt and source IDs. Label unsupported/inferred next steps. A cached brief is not the live page. Never claim paywall bypass or that the phone can access the laptop's logged-in session.

#### Pairing, identity and authorization

Use authenticated user identities on desktop and phone. QR contains a single-use random nonce with a two-minute expiry, not a bearer token granting workspace access. Desktop confirms the pairing; assign device-specific scopes. Spacetime reducers and private views must enforce ownership; a client-side SQL filter is not authorization [7].

Link ASI:One sender/conversation to that identity through one-time authenticated linking. Sender address alone is not sufficient authorization. Plans/approvals bind to user, device, exact action set, content hash, recipient and expiry.

Delivery defaults to the user's paired device with 24-hour expiry; cross-person sharing requires preview and explicit recipient consent. Revocation blocks future server access but cannot recall screenshots/downloads. Do not claim end-to-end encryption without implementing it.

**Retention target:** no raw audio saved by this app; provider retention is separately disclosed. Local metadata/checkpoints have a Delete control; deletion removes shared records and Elastic projections. Remote desktop mutations require an online, unlocked device and a granted capability; offline requests expire rather than running unexpectedly later.

## 11 / Demo script, tests and honest claims

### Prove the experience in three minutes

| Time | Visible result |
| --- | --- |
| 0:00-0:25 | Show 15-20 real tabs across two windows plus a native editor. State the task and speak: "Find my group project research." Show transcript and real semantic results. |
| 0:25-0:55 | "Focus this task." Preview selected tabs, group them, focus a native notes window. Explain the difference between tab and OS control. |
| 0:55-1:30 | "Save where I am and send this article to my phone." Show source-backed checkpoint, actual Apify result and Llama brief, then live phone receipt. |
| 1:30-2:00 | Phone shows brief/source link and read position. Preview a project briefing for a teammate; show second-user access to that brief only. |
| 2:00-2:35 | Use the linked ASI:One conversation to find the checkpoint, deliver/read its brief and request resume. The same plan/approval APIs drive the laptop. |
| 2:35-3:00 | Show restored task and proposed next step. Close with one measured result and honest current limits. Keep sponsor traces available for Q&A. |

#### Release gate: test the failures that matter

Josh: changed URL between preview/execute; Windows focus denied; checkpoint storage failure; restart mid-operation; duplicate execute; cancellation after first action. Archive/close checks apply only if that deferred capability is implemented later. Nova: ambiguous title; invalid model JSON; source unavailable; source prompt injection; Elastic index delay; real ASI:One workflow parity. Andrew: wrong-user access; pairing expiry/replay; revoked device; delivery retry; phone reconnect; remote request while laptop offline.

**Suggested targets, not measured claims:** 18/20 commands resolve or correctly clarify; zero wrong-target destructive actions; completed voice command to feedback p95 under five seconds excluding crawling; phone delivery p95 under three seconds after brief readiness. Measure on the actual network and disclose sample size.

#### What makes this competitive

One coherent demonstration of intent -> action -> context recovery across devices, with a useful social handoff. FaceTimeOS is an inspiration for remote access, not a claimed original invention [13]. Voice tab control, summaries and sync each exist; the proposed distinction is a reliable, source-backed task checkpoint and continuation experience.

**Honest assessment:** strong demo potential if the end-to-end path works. Six services plus OS integration is a reliability risk for three available builders in eleven hours. Nathan's optional help cannot reduce the required owners' responsibilities. More integrations do not imply a better project. A polished real workflow beats unsupported breadth; no plan can guarantee a win.

## 12 / Kickoff, submission and reference links

### Hand this to every teammate and agent

#### Start here

Give every Claude/Codex session this Markdown. State Josh/A, Nova/B, Andrew/C or Nathan/optional support, the working repository, current time on the supplied team clock and working SDK versions. Ask it to read existing code before editing. The technical architecture is a proposal and the named workflow is the current team agreement; the repository exists, but integrations are not claimed implemented.

At 11 AM kickoff: confirm Josh/A, Nova/B and Andrew/C are ready; choose the real demo article and task; create shared schemas/fixtures; establish a single integration lead; verify accounts/credits; agree consent wording; confirm organizer deadlines and sponsor submission steps. Model choice does not change interface obligations.

#### Submission evidence

Public README with setup, Windows/Chrome prerequisites, .env.example, agent identity/address, tested versions, known limitations and architecture. Include project image, short recorded demo, real provider/tool traces without secrets and a track-by-track explanation. Fetch also lists its ASI:One submission agent, README badges and demo requirements [2]; follow that process separately.

Meta needs a people-connection story, Elastic needs the named Agent Builder/Serverless implementation, and Spacetime criteria need sponsor confirmation. Do not claim eligibility from a logo or an unused SDK. The human team must verify final registration and submit; this plan does not publish anything.

#### Primary sources checked 25 October 2026

[1] [Cal Hacks 13.0 requirements and prize categories](https://cal-hacks-13-0.devpost.com/)

[2] [Fetch.ai Cal Hacks 13.0 mandatory workflow and submission rules](https://www.fetch.ai/events/hackathons/calhacks-13-0/hackpack)

[3] [Elastic Agent Builder: custom agents](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/custom-agents)

[4] [Cartesia: speech and voice capabilities](https://docs.cartesia.ai/get-started/overview)

[5] [Apify Website Content Crawler API](https://apify.com/apify/website-content-crawler/api)

[6] [Spacetime sponsor announcement](https://spacetimedb.com/blog/spacetime-at-calhacks)

[7] [SpacetimeDB authentication](https://spacetimedb.com/docs/core-concepts/authentication/)

[8] [Meta Llama official models](https://github.com/meta-llama/llama-models)

[9] [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)

[10] [Windows foreground activation restrictions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)

[11] [Chrome extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)

[12] [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)

[13] [FaceTimeOS project repository](https://github.com/dylanelu/FaceTimeOS)

## Appendix A - Copy this context into every Claude/Codex session

You are implementing Vortex for Josh's Cal Hacks 13.0 team (Josh/A, Nova/B, Andrew/C; Nathan is absent and optional support only). It is a Windows voice workspace assistant: find and manage browser tabs and supported native windows, preserve task checkpoints, explicitly deliver source-backed reading briefs to a paired phone, optionally share a briefing with a teammate, and resume work. It is profession-agnostic; use one group-project research story for the demo. Workspace continuity is the focus; a standalone learning platform is out of scope.

Josh selected Meta, Elastic, Spacetime, Cartesia, Apify and Fetch.ai. Use Cartesia for speech; a real Meta Llama model for grounding/task briefs; Elastic Agent Builder on Serverless for retrieval; Apify for a selected public article; SpacetimeDB for private real-time device/brief state; and an Agentverse-registered ACP agent that can run the primary workflow entirely inside ASI:One. Meta fit additionally requires a credible people-connection outcome, not just model use. Verify detailed sponsor rules and submit evidence. No claim of eligibility is automatic.

Read this entire document, repository instructions and current code first. The implementation owners are Josh/A, Nova/B and Andrew/C; Nathan only takes noncritical support tasks when he arrives. Ask your human for your assigned person/lane if it is absent. Work toward a real demo by 9:45 PM within the supplied 11 AM-10 PM window. Do not infer your lane from whether you are Claude or Codex. Inspect what already exists; do not overwrite another teammate's code or rebuild working infrastructure. Use mocks only for development, visibly labeled. Report actual implementation status, blockers and tested behavior.

Implement a narrow vertical slice first. Propose shared schema changes before editing them. Do not independently rename fields, routes, states, timestamps or action kinds. Do not add another database, orchestration framework or alternate execution path without team coordination. Keep secrets out of source, browser renderers and logs. Never execute model-generated shell/script text. The local executor is the only authority for OS/browser mutations.

For each change, report: files changed; behavior delivered; checks run and results; remaining limitations; any required contract change. Do not describe planned behavior as already implemented. A fallback path does not count as evidence that the sponsor path works.

## Appendix B - Repository and ownership contract

```text
apps/desktop/                  Josh/A: Electron shell, voice capture, executor UI bridge
apps/extension/                Josh/A: Chrome MV3 tracking and tab actions
native/windows/                Josh/A: C# window helper and native messaging host
apps/dashboard/                Andrew/C: task/checkpoint views, composed into desktop
apps/phone/                    Andrew/C: mobile web reader and pairing
services/api/                  Andrew/C: auth, routing, delivery; Nova/B owns intelligence route logic
services/intelligence/         Nova/B: Llama, Elastic, Apify, planning
services/fetch-agent/          Nova/B: Python ACP/ASI:One adapter
services/sync/                 Andrew/C: Spacetime module/reducers/views
packages/contracts/           Josh edits; Nova+Andrew review; TS/Zod + generated JSON Schema
packages/fixtures/             Andrew coordinates; all lanes contribute
docs/                          Andrew coordinates; all lanes update their runbooks
```

Use a workspace package manager and one lockfile after a real dependency smoke test. C coordinates root scripts and config. Suggested branches: feat/control, feat/intelligence, feat/continuity. These are proposed names, not existing branches. Never reset another person's work. Interface changes require matching TS/Zod schemas, JSON Schema for Python, fixtures, tests and a contract version update in one reviewed change. Additive optional fields can be a minor change; breaking changes require a new major contract.

## Appendix C - Canonical wire types (starter specification)

These are design contracts, not an installed SDK or validated implementation. Put runtime validation in packages/contracts; generate JSON Schema for the Python service. Wire schema remains 1.0; document revision 1.1 updates the team workflow. Deferred action kinds are disabled in runtime capabilities. Timestamps are UTC ISO 8601 strings; elapsed age is calculated from them. IDs are UUID strings unless explicitly identified as provider IDs. Unknown optional values are omitted, never fabricated. Content sizes and URL schemes must be bounded by runtime schemas.

```ts
type Id = string;
type ISODate = string;
type Version = "1.0";
type Scope = "metadata:read" | "content:read" | "desktop:control"
  | "brief:read" | "brief:deliver" | "progress:write";

type Resource = {
  id: Id;
  deviceId: Id;
  sessionId: Id;
  revision: number;
  kind: "tab" | "window";
  title: string;
  url?: string;                  // HTTP(S) for reopen/delivery; local by default
  appName?: string;
  firstObservedAt: ISODate;      // not a claim about original creation time
  lastActivatedAt?: ISODate;
  active: boolean;
  protectedByUser: boolean;
  pinned?: boolean;
  audible?: boolean;
  capabilities: ActionKind[];
};

// Binding is private to A's executor; never send OS handles to an LLM.
type LocalBinding = {
  resourceId: Id;
  sessionId: Id;
  browserTabId?: number;
  browserWindowId?: number;
  nativeHandle?: string;         // string to avoid unsafe integer conversion
  processId?: number;
  processStartedAt?: ISODate;    // protects against PID/handle reuse
};

type Snapshot = {
  schemaVersion: Version;
  deviceId: Id;
  sessionId: Id;
  revision: number;
  capturedAt: ISODate;
  resources: Resource[];
  capabilities: ActionKind[];
};

type Task = {
  id: Id;
  goal: string;
  resourceIds: Id[];
  updatedAt: ISODate;
};

type Source = {
  id: Id;
  resourceId?: Id;
  url: string;
  title: string;
  retrievedAt: ISODate;
  contentHash: string;           // SHA-256 of normalized selected text
  extraction: "metadata" | "extension" | "apify";
  availability: "ready" | "unavailable";
  text?: string;                 // bounded, selected, consented content only
  apifyRunId?: string;
};

type GroundedPoint = {
  text: string;
  sourceIds: Id[];
  basis: "observed" | "user_stated" | "inferred";
};

type Checkpoint = {
  id: Id;
  taskId: Id;
  createdAt: ISODate;
  version: number;
  resourceSnapshots: Resource[];
  sourceIds: Id[];
  summary: GroundedPoint[];
  proposedNextStep?: GroundedPoint;
};

type Brief = {
  id: Id;
  version: number;
  taskId?: Id;
  checkpointId?: Id;
  title: string;
  format: "reading" | "project_handoff";
  audience: "self" | "selected_teammate";
  sourceIds: Id[];
  points: GroundedPoint[];
  originalUrls: string[];
  excerpt?: string;
  createdAt: ISODate;
};

type Delivery = {
  id: Id;
  operationId: Id;
  briefId: Id;
  briefVersion: number;
  recipient: { deviceId: Id } | { userId: Id };
  expiresAt: ISODate;
  status: "queued" | "available" | "received" | "read"
    | "expired" | "revoked" | "failed";
};

type ReadProgress = {
  id: Id;
  briefId: Id;
  briefVersion: number;
  deviceId: Id;
  fraction: number;              // inclusive 0..1
  updatedAt: ISODate;
  revision: number;              // server monotonic; reject stale writes
};

type Target = { resourceId: Id; expectedRevision: number };
type Action =
  | { kind: "activate_tab"; target: Target }
  | { kind: "group_tabs"; targets: Target[]; label: string }
  | { kind: "focus_window"; target: Target }
  | { kind: "set_window_state"; target: Target;
      state: "minimized" | "normal" | "maximized" }
  | { kind: "create_checkpoint"; taskId: Id; sourceIds: Id[];
      targets: Target[] }
  | { kind: "archive_tabs"; targets: Target[]; checkpointId: Id }
  | { kind: "open_saved_url"; checkpointId: Id; sourceId: Id;
      url: string; expectedSourceHash: string }
  | { kind: "create_brief"; sourceIds: Id[];
      format: Brief["format"]; audience: Brief["audience"] }
  | { kind: "deliver_brief"; briefId: Id; briefVersion: number;
      recipient: { deviceId: Id } | { userId: Id } };
type ActionKind = Action["kind"];

type Plan = {
  kind: "plan";
  id: Id;
  commandId: Id;
  deviceId: Id;
  snapshotRevision: number;
  actions: { actionId: Id; action: Action }[];
  explanation: string;
  approvalRequired: boolean;     // derived by policy, not chosen by model
  planHash: string;
  createdAt: ISODate;
  expiresAt: ISODate;
};

type Clarification = {
  kind: "clarification";
  commandId: Id;
  question: string;
  options: { id: Id; label: string; resourceIds: Id[] }[];
};

type ErrorCode = "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN"
  | "NOT_FOUND" | "STALE_STATE" | "PROTECTED" | "NEEDS_CLARIFICATION"
  | "APPROVAL_REQUIRED" | "EXPIRED" | "DEVICE_OFFLINE" | "FOCUS_DENIED"
  | "STORAGE_FAILED" | "PROVIDER_TIMEOUT" | "CONTENT_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT" | "INTERNAL_ERROR";
type ActionResult = {
  actionId: Id;
  status: "pending" | "running" | "succeeded" | "failed"
    | "skipped" | "unknown";
  code?: ErrorCode;
  checkpointId?: Id;
  briefId?: Id;
  deliveryId?: Id;
};
type Operation = {
  id: Id;
  planId?: Id;
  status: "queued" | "running" | "partial" | "succeeded"
    | "failed" | "cancelled";
  results: ActionResult[];
  updatedAt: ISODate;
};
type Result<T> = {
  schemaVersion: Version; requestId: Id;
} & (
  | { ok: true; data: T }
  | { ok: false; error: {
      code: ErrorCode; message: string; retryable: boolean;
    } }
);
```

### Planning and action composition

- Each plan can include at most ten mutations. No arbitrary action names or executable source strings. The executor checks kind-specific capabilities and resource kind.
- V1 plans refer to existing checkpoint/brief IDs. If a command needs to create a brief then deliver it, the orchestrator waits for the first operation result, builds a second plan with the resulting brief ID, and obtains any required preview approval. Never guess a future ID or parse it out of free text.
- The resume endpoint expands into explicit `activate_tab` and/or `open_saved_url` actions. For `open_saved_url`, the executor checks checkpoint ownership, source membership, exact saved URL and expected source hash. The model cannot supply an unrelated URL. Only HTTP(S) URLs can reopen; reject embedded credentials and unsafe schemes. Resume may focus known live native windows but does not recreate closed native apps or recover unsaved documents.
- Desktop reorder/layout move is a stretch capability: add `move_window` with validated bounds and original layout snapshot only through contract review. Do not advertise it before implementation.
- Read-only search has no mutation plan. Cloud disclosure/consent is still enforced. Simple explicit focus commands may execute under a current local user invocation; bulk regroup/archive, minimizing unrelated windows and all cross-person delivery require a preview. Remote actions always require separately granted control scope.
- Hash canonical action JSON plus affected source hashes, audience/recipient, user, device, snapshot and expiry. Bind approval to that hash. Server issues approval IDs; clients cannot self-approve by setting a boolean.
- `archive_tabs` writes a durable URL/title archive entry before close. Protect active/pinned/audible/user-protected tabs and reject non-HTTP(S) targets. Unknown unsaved state is a stated limitation, not a detectable guarantee.


### One service implementation behind every interface

HTTP routes, desktop plan actions and the ASI:One adapter call the same checkpoint, brief, delivery and resume services. Nova owns their intelligence logic; Andrew owns authenticated route wiring and persistence integration; Josh owns local effects and operation recovery. Do not create separate implementations or contradictory data stores for each interface.

### Runtime capability tiers for this deadline

Required enabled actions: `activate_tab`, `group_tabs`, `focus_window`, `create_checkpoint`, `open_saved_url`, `create_brief`, `deliver_brief`. Planning/search and checkpoint resume use the documented endpoints. Deferred: `archive_tabs`, `set_window_state`, `move_window`, unattended automation. Deferred types may remain as design notes but must be excluded from live capabilities and rejected if proposed. Keep / Snooze suggestions do not close or minimize resources.

## Appendix D - Request bodies and route behavior

All routes use a backend-verified access token. Native IPC is separately authenticated and restricted. Every API returns the Result envelope. No client-supplied owner ID is authoritative. Persisted domain rows add owner identity and ACL fields server-side. Mutations require idempotency; use operationId for execution/delivery and Idempotency-Key for creation endpoints. A duplicate request with a changed body is rejected.

| Route | Body/query | Return data |
| --- | --- | --- |
| GET /v1/snapshot | deviceId query | Snapshot |
| POST /v1/plans | commandId, text, deviceId, snapshotRevision, selectedResourceIds | tagged plan or clarification |
| POST /v1/plans/:id/approve | planHash, confirmed:true | approvalId, expiresAt |
| POST /v1/plans/:id/execute | operationId, expectedRevision, approvalId? | Operation receipt, normally HTTP 202 |
| GET /v1/operations/:id | none | Operation |
| POST /v1/operations/:id/cancel | none | Operation |
| POST /v1/checkpoints | taskId, resourceIds, sourceIds, consentId | Operation receipt; result includes checkpointId |
| POST /v1/briefs | sourceIds, taskId?, checkpointId?, format, audience, consentId | Operation receipt; result includes briefId |
| POST /v1/deliveries | operationId, briefId, briefVersion, recipient union, approvalId? | Delivery |
| POST /v1/checkpoints/:id/resume | deviceId, snapshotRevision | Plan, with preview before effects |
| GET /v1/briefs/:id | version query | authorized Brief + scoped source metadata |
| POST /v1/read-progress | briefId, briefVersion, deviceId, fraction, expectedRevision | ReadProgress |
| POST /v1/pairings | desktopDeviceId | pairingId, nonce, expiresAt |
| POST /v1/pairings/:id/claim | nonce, phoneDeviceName | pending pairing; desktop confirms before access |
| POST /v1/pairings/:id/confirm | approved:true | Device with server-granted scopes |
| DELETE /v1/devices/:id | none | revoked:true |
| DELETE /v1/checkpoints/:id | none | deletion receipt and search-projection status |

Validation bounds: command text <= 2,000 characters; title <= 500; selected resources <= 100; selected article text <= 50,000 characters per source; at most five sources per brief; summary <= 800 words. Errors never return provider credentials or private source contents. Excerpts returned by search are capped at 500 characters each.

Async provider work returns immediately with a receipt. Apify budget is 60 seconds; Llama/Elastic calls have a 20-second timeout and at most one transient retry. Retry only when side effects can be reconciled; don't duplicate Actor runs blindly after unknown responses. UI distinguishes processing from delivery. Cartesia audio streaming uses its provider protocol through trusted transport; audio does not go in generic JSON API requests.

## Appendix E - Shared persistence and synchronization

Local desktop storage (SQLite recommended): resource bindings, inventory snapshots, plans, approvals, operation journal, action receipts, archive entries and outbox. Persist before actions. Cloud credentials use an OS-protected credential store. The dashboard renderer receives only scoped methods, never raw database or filesystem access.

SpacetimeDB logical tables: User, Device, Pairing, Task, Checkpoint, Brief, BriefSource, Delivery, ReadProgress, RemoteCommand, OperationReceipt, ShareGrant. Private data must not be exposed by public tables/subscriptions. Use the supported version's private tables and authenticated views/reducers, or route through an authorization-enforcing backend. Test this explicitly with a second identity.

Suggested reducers: create_pairing, claim_pairing, confirm_pairing, revoke_device, publish_checkpoint, publish_brief, create_delivery, acknowledge_delivery, update_read_progress, create_remote_command, acknowledge_remote_command, revoke_share, delete_checkpoint. Each checks caller identity, ownership, device scope and immutable content version. `create_remote_command` is unavailable to the read-only phone role. Events listed in section 08 are logical events derived from subscriptions, not a second competing event store.

Desktop is execution authority; Spacetime is shared delivery/receipt authority; Elastic is an eventually consistent searchable projection. Backend provider jobs update shared result state and the desktop consumes it. Every outbox message carries a deduplication ID. Track index status as pending/ready/failed, so a saved checkpoint remains visible before search indexing completes.

Remote commands expire after two minutes. The connected desktop claims a command once, checks authenticated ownership, device scope, local unlocked/available status and live resource revision, then journals effects. Reconnect never executes expired queued commands. If reliable unlocked-state detection is unavailable, disable remote desktop mutation and report that Fetch resume capability is incomplete; do not bypass the requirement.

Read progress uses server revisions; a conflicting stale update refetches instead of overwriting. Brief source content/version is immutable; summarizing a changed article creates a new version. Revocation/delete cancels pending delivery and removes future server access; downloaded copies cannot be recalled. Default server delivery retention is 24 hours; user controls checkpoint deletion. Verify provider retention terms rather than claiming that application deletion erases provider logs.

## Appendix F - Fixture and verification contract

Create shared fixtures before implementing AI. Required cases (deferred archive/layout features are tested only if implemented and enabled):

1. Two similar article titles -> clarification, no execution.
2. Native and browser windows with similar names -> resource kind disambiguation.
3. Changed resource revision or recycled native handle -> STALE_STATE.
4. Pinned, audible, active and user-protected archive targets -> PROTECTED.
5. Unknown historical age -> no confident stale classification.
6. Model response with an arbitrary shell action -> schema rejection.
7. Article contains "ignore previous instructions" -> treated as quoted source content.
8. Apify unavailable or paywalled page -> link/unavailable status, no invented summary.
9. Elastic delayed projection -> checkpoint still accessible by ID.
10. Save-before-close fails -> tab remains open.
11. Crash after close before receipt -> reconciliation, no repeated close against a reused ID.
12. Same operation ID twice -> one effect and same receipt; changed payload -> conflict.
13. Second user querying first user's brief -> FORBIDDEN/empty authorized view.
14. Expired/replayed pairing nonce -> denied; no broad tokens in QR.
15. Offline laptop receives remote request -> explicit DEVICE_OFFLINE or expiring pending state, no false success.
16. Native focus denied -> FOCUS_DENIED and manual navigation fallback.
17. Personal phone handoff -> delivery received and progress synced on real hardware.
18. Teammate handoff -> only previewed brief visible to second identity.
19. ASI:One primary workflow -> find, checkpoint, brief delivery and resume using real tool execution and linked identity; no custom dashboard dependency.
20. Sponsor verification -> real trace for Cartesia, Llama, Elastic Agent Builder/Serverless, Apify, Spacetime and Fetch registration/ACP.

Tests should use adapter boundaries for unit checks and actual Windows/Chrome/phone integration for the core journey. Do not equate passing mocked tests with OS execution or sponsor eligibility. Record sample sizes and latency measurements. A finished visual demo that does not execute real actions is incomplete.

## Appendix G - Named readiness and final checklist

- Josh / A: Cartesia microphone/transcription/reply; actual native focus; extension registration; local executor journal.
- Nova / B: Meta model access/model ID; Elastic Serverless Agent Builder and tools; Apify Actor run; Agentverse registration and ACP; ASI:One identity link and full workflow.
- Andrew / C: Spacetime deployment and private access; phone pairing and real delivery; second-user handoff; developer evidence view.
- All: confirm sponsor-specific instructions. Meta social-theme fit and precise Spacetime prize criteria need sponsor validation; the public event list is not a full implementation specification.
- Fetch-specific: use its submission agent as well as Devpost, include public setup README and agent address, required innovationlab/hackathon badges and its requested demo video. Recheck linked instructions before submitting. Prize amounts differ between public sources, so this document deliberately does not quote them.
- Nathan (optional only): prepared demo data, captions/screenshots, visual polish or an extra recording copy. Andrew retains essential demo/recording responsibility; do not wait for Nathan.
- Human team: monitor the 11 AM-10 PM schedule, keep a 9:45 PM demo-ready target, choose demo data, verify accepted/checked-in status and deadline, submit project image/repository/demo and track selections. This package neither publishes nor registers anything.

The 9:45 PM readiness target is owned by Josh, Nova and Andrew even if Nathan never arrives. The plan favors a coherent working system. If a required capability cannot be completed, report it plainly and narrow the submission claims. Do not use a sponsor logo as a substitute for a real integration or say the app is the first of its kind.
