# Andrew - Vortex teammate contract

Version 1.2 | 25 October 2026 | Windows | Wire schema 1.0

**Project context:** Vortex is a voice-controlled Windows workspace assistant. Find and group browser tabs, focus supported native windows, save a source-backed task checkpoint, send a reading brief to a paired phone, and resume unfinished work. It is profession-agnostic; the demo story is group-project research. Workspace continuity is the focus; a separate tutoring platform is out of scope.

**Team:** Josh owns A (control/voice), Nova owns B (intelligence/providers/Fetch), Andrew owns C (dashboard/API/phone/sync/integration). Nathan is absent at kickoff and optional support only; no required feature or milestone depends on him.

**Team clock:** 11 AM-10 PM. Gates: 1 PM real control; 3 PM phone vertical slice; 5 PM sponsor evidence; 6:30 PM feature freeze; 8 PM release candidate; 9:45 PM demo-ready; 9:45-10 PM buffer. These supplied times are not timezone-converted. Organizer submission deadlines are separate.

**Sponsors:** Cartesia = voice; Meta Llama = grounding/briefs plus a people-connection outcome; Elastic Agent Builder on Serverless = retrieval; Apify = requested public article extraction; SpacetimeDB = private real-time handoff; Fetch = registered ACP agent usable in ASI:One. Logos, fixtures and fallback paths do not prove a live integration or eligibility.

**Shared rules:** never execute generated scripts or expose secrets; the local executor alone mutates the computer. Cloud content and sharing need scoped consent. Deferred archive/closing, layout changes and unattended automation remain disabled. Runtime-validate shared messages and preserve the existing teammate work.

**Read next:** [team index](../TEAM_CONTRACT.md), [agent instructions](../AGENTS.md), [wire types/execution contract](JOSH.md#wire-contract), [API/auth/sync contract](ANDREW.md#api-contract), [team schedule](ANDREW.md#team-schedule). Source numbers in migrated sections refer to [the source list](ANDREW.md#sources). Proposed architecture is not a claim of completed implementation.

## Your workflow - owner C and integration lead

Branch: `feat/continuity`. Own `apps/dashboard/`, `apps/phone/`, authenticated API wiring in `services/api/`, `services/sync/`, Spacetime state, fixtures, root scripts and integration coordination. Nova implements intelligence route logic; Josh implements local execution. Use those implementations through one shared service path.

- By 12:30 PM: authenticated API skeleton and typed fixture client.
- By 1 PM: phone auth/pairing and a private subscription proved.
- By 3 PM: dashboard -> checkpoint -> real paired-phone receipt.
- By 5 PM: progress/approval/revocation, teammate brief and real Spacetime evidence.
- 5-6:30 PM: cross-user denial, pairing replay, reconnect and full-journey tests.
- At 8 PM: hold a passing integrated release candidate. By 9:45 PM: final demo, backup recording, setup notes and sponsor evidence.

Read [Josh's wire types/executor rules](JOSH.md#wire-contract) and [Nova's sponsor/planning contract](NOVA.md) before wiring consumers. Required testing, submission and recording remain your responsibility with Josh/Nova; Nathan may provide extras but is never a release dependency.

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


<a id="team-schedule"></a>

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

The root [TEAM_CONTRACT.md](../TEAM_CONTRACT.md) is the index. Canonical [wire types/action rules](JOSH.md#wire-contract) live in Josh's file; API/auth/sync behavior lives here; agent onboarding is in [AGENTS.md](../AGENTS.md). Claude and Codex must read the relevant linked contracts before implementation; schemas are versioned together.

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


<a id="release-gates"></a>

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

Give every Claude/Codex session its named teammate contract plus the root AGENTS.md and TEAM_CONTRACT.md index. State Josh/A, Nova/B, Andrew/C or Nathan/optional support, the working repository, current time on the supplied team clock and working SDK versions. Ask it to read existing code before editing. The technical architecture is a proposal and the named workflow is the current team agreement; the repository exists, but integrations are not claimed implemented.

At 11 AM kickoff: confirm Josh/A, Nova/B and Andrew/C are ready; choose the real demo article and task; create shared schemas/fixtures; establish a single integration lead; verify accounts/credits; agree consent wording; confirm organizer deadlines and sponsor submission steps. Model choice does not change interface obligations.

#### Submission evidence

Public README with setup, Windows/Chrome prerequisites, .env.example, agent identity/address, tested versions, known limitations and architecture. Include project image, short recorded demo, real provider/tool traces without secrets and a track-by-track explanation. Fetch also lists its ASI:One submission agent, README badges and demo requirements [2]; follow that process separately.

Meta needs a people-connection story, Elastic needs the named Agent Builder/Serverless implementation, and Spacetime criteria need sponsor confirmation. Do not claim eligibility from a logo or an unused SDK. The human team must verify final registration and submit; this plan does not publish anything.

<a id="sources"></a>

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


<a id="api-contract"></a>

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

Suggested reducers: create_pairing, claim_pairing, confirm_pairing, revoke_device, publish_checkpoint, publish_brief, create_delivery, acknowledge_delivery, update_read_progress, create_remote_command, acknowledge_remote_command, revoke_share, delete_checkpoint. Each checks caller identity, ownership, device scope and immutable content version. `create_remote_command` is unavailable to the read-only phone role. Events listed in section 08 in this file are logical events derived from subscriptions, not a second competing event store.

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
