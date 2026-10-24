# Vortex desktop preview

Vortex now has a visible Windows Electron dashboard backed by the real local control engine. Select open windows or connected browser tabs, save them as a task workspace, leave a checkpoint note, and review a focus/resume preview before approving it. Workspace cards and notes persist locally in SQLite. This standalone local mode uses the existing `@vortex/contracts`; Andrew's cloud API and Nova's planning service are not required to try it.

The command bar supports bounded typed commands, and the voice dialog records a short microphone command for Cartesia transcription. Speech now prepares the search result, clarification, form or action preview directly. Focus/resume still requires the existing exact-plan confirmation. Cartesia speaks short generic status responses. AI summaries, phone handoff and reconstruction of closed native applications are not connected. Resume focuses saved primary resources that are still available; it does not restore a full desktop layout or reopen closed tabs.

Implemented:

- Real ordinary Windows window inventory through the C# helper; IDs/handles and process-start checks stay local.
- Bounded native focus, real tab activation/grouping and checkpoint-authorized URL dispatch adapters.
- Live resource IDs/revisions, explicit saved primary targets, focus-plan creation and live-member workspace resume.
- SQLite operation journal, exact-plan approval, serialized execution, idempotency, cancellation between actions and conservative interrupted-effect recovery.
- Authenticated development-only loopback transport with an exact extension Origin allowlist. No browser installation, OS settings change or cloud call runs automatically.
- Chrome MV3 extension in `../extension`. It excludes incognito/internal pages and never reads page contents.

## Start on Windows

From the repository root, using Node 24 or later:

```powershell
npm ci
npm run desktop -w @vortex/desktop
```

The launcher builds the narrow Windows helper automatically when necessary. Electron starts its local controller in the background and stops that child when the app quits. Run in your normal interactive Windows session. No cloud keys are required for local mode. If a corporate machine blocks the Electron download during installation, use the official Electron package download instructions rather than disabling endpoint protections.

In the dashboard:

1. Select resources under **Open on this computer**, then choose **Create workspace**.
2. Give the task a name/goal and choose its primary tab or window.
3. Choose **Save checkpoint** and record where you stopped and what comes next.
4. Choose **Resume**, inspect the listed targets, then confirm the action. Activity shows its actual outcome.

To run only the headless controller, use `npm run control -w @vortex/desktop` instead of the desktop command.

## Commands and Cartesia voice

Typed commands work immediately, without provider keys. Examples:

- `find notes` searches live local title/app/URL metadata.
- `focus Research` or `resume Research` previews the saved workspace's designated live targets.
- `focus Vortex` previews an exact matching live title. Partial or duplicate targets require a concrete choice.
- Select resources, then use `create workspace Research` to open a prefilled creation form.
- `save checkpoint for Research saying Next: compare the costs.` opens a note draft for review and saving.

Named-workspace focus/resume now uses Nova's shared bounded resolver, also used by the API. Local metadata search, native-title focus and create/checkpoint forms remain deterministic. This hookup does not call Gemini or another model. Unsupported instructions return help rather than gaining new OS capabilities. Find/planning never executes a focus action. Creating/checkpoint commands prepare forms; users still save them explicitly.

For voice:

1. Create a speech-to-text key in the [Cartesia dashboard](https://play.cartesia.ai/keys).
2. Copy `apps/desktop/.env.example` to `apps/desktop/.env.local` and set `CARTESIA_API_KEY` there. The latter is ignored by Git and read only in the desktop main process. An existing `CARTESIA_API_KEY` environment variable takes priority. Do not enter the key into the app's command bar or commit it.
3. Open **Voice command**. Choose **Check setup again** if needed; no restart is required for a changed local key.
4. Agree to send this recording to Cartesia, choose **Record command**, then **Stop & transcribe**. The microphone stops after 15 seconds at most; switching away or closing the dialog discards capture. **Discard / cancel** aborts a pending request and suppresses late transcripts. Audio remains in memory and is not written to disk by Vortex; Cartesia receives the submitted recording under its own service policies.
5. By default, Vortex opens the resulting search, clarification, form or exact action preview directly after transcription. Review the proposed target and choose **Confirm & focus** to switch. Creating a workspace or checkpoint still requires saving its form. Speech never silently approves a plan.
6. The recognized text also appears in the command bar for correction. For the earlier workflow, select **Let me review the transcript before preparing a result** in the voice dialog; then edit the transcript and choose **Review this command**.

**Spoken replies:** the command panel has **Spoken replies**, **Test voice**, **Stop voice** and **Replay** controls. Turn replies off to keep text-only results; the preference stays on this computer. A confirmation dialog also displays the identical spoken text and a Stop voice button. Starting another recording stops playback and aborts pending synthesis so the assistant does not transcribe its own response. A failed voice reply never blocks or approves a desktop action.

Only fixed status phrases are sent to Cartesia's `POST /tts/bytes`, using `sonic-3-2026-01-12` and the public example voice from Cartesia's official SDK. Titles, URLs, notes, resource metadata and recognized commands are not sent for speech synthesis. Audio is requested as 24 kHz PCM WAV with `save:false`, bounded to 1 MB, cached in memory by phrase, and cancelled after 15 seconds. No automatic provider retry occurs. Provider retention remains governed by Cartesia's service policies.

The main process uses the fixed `https://api.cartesia.ai/stt` endpoint, `ink-whisper`, English, multipart audio, a 20-second timeout, 1 MB upload limit and no automatic retries. It keeps the key out of preload responses, renderer data and error messages. Camera/screen permissions are denied; microphone permission is restricted to this main frame during an explicit short recording lease. No background listening, native app content or browsing inventory is sent to Cartesia.

Live verification on this Windows machine: a locally synthesized **Find Vortex** WAV was sent through the real Cartesia adapter and returned **Find vortex**. The real Cartesia TTS adapter also generated a valid 249,738-byte WAV for the generic voice-ready phrase. These provider checks used no microphone recording. The renderer's physical microphone capture still requires a human trial on the demo device. Adapter unit tests use a clearly labeled mock provider and do not count as live Cartesia evidence.

In another terminal:

```powershell
npm run snapshot -w @vortex/desktop
npm run focus -w @vortex/desktop -- <resource-UUID-from-snapshot>
```

`focus` prints the exact proposed target and requires typing `FOCUS` before it requests approval/execution. Windows may deny foreground activation or the target may be minimized; those return `FOCUS_DENIED`, not a success claim. Run in your normal Windows desktop session, not a service account/restricted background session.

## Connect Chrome or Edge explicitly

1. Follow [the extension setup](../extension/README.md) to load `apps/extension` unpacked and copy its ID. This step is manual; don't assume the extension is installed.
2. In Vortex, open **Connect browser**, paste the exact extension ID and save it. No restart is required.
3. Choose **Copy local token**, then paste it only into the Vortex extension options. The token is kept out of renderer data and the visible interface. Do not put it in screenshots, issues, URLs or Git. Headless users can explicitly reveal it with `npm run pair -w @vortex/desktop`.
4. Choose **Save and start** in the extension options. Wait for Connected, then refresh Vortex. Only HTTP(S) tabs are included.

State/config live in ignored `apps/desktop/.vortex/`. Keep that directory private and never upload it. The bridge binds only `127.0.0.1:8790`. Other origins, missing tokens and wrong Hosts are rejected. This fallback transport has not been promoted to production native messaging.

`apps/desktop/.env.local` is private too. Publish only the empty `.env.example` template.

## Andrew / Nova integration

```ts
import { ControlEngine, Journal, BrowserBridge, NativeWindowsAdapter } from '@vortex/desktop';

const engine = new ControlEngine(journal, browserBridge, windowsAdapter);
const snapshot = await engine.getSnapshot();
const plan = await engine.planWorkspaceFocus(workspace, snapshot.revision);
const approval = engine.approvePlan(plan.id, plan.planHash); // only after actual user confirmation
const operation = await engine.executePlan(plan.id, {
  operationId,
  expectedRevision: snapshot.revision,
  approvalId: approval.approvalId,
});
```

Keep Andrew's verified AuthContext/ownership/device checks in front of these local functions. Resource IDs/deviceId come from the live engine, not fixtures. The engine does not accept cloud requests directly. Existing API `Services` can delegate its snapshot/planning/execution methods to this module when the trusted connection is wired.

`hashPlan()` exports the recursive sorted-key JSON SHA-256 algorithm used by local plans; the `planHash` field is excluded from its own hash. Imported plans must match it. This is an adapter-level algorithm clarification, not a field rename; coordinate it before replacing Andrew's fixture planner. A new preview/approval is needed when targets change. All local mutations currently require approval even if a broader product policy permits simple focus shortcuts.

For saved-URL dispatch, the trusted checkpoint service first calls `registerCheckpointSources(checkpoint, sources)`. Only exact saved URLs/source hashes in that checkpoint can be opened. Full closed-tab workspace reconstruction is **not yet wired into `planWorkspaceResume`**; it currently resumes matching live primary members only. Do not present that as complete checkpoint restoration.

Local HTTP endpoints use `/control/` so they cannot be confused with Andrew's `/v1` API:

- GET `/control/snapshot`, `/control/status`, `/control/operations/:id`.
- GET `/control/workspaces`, POST `/control/workspaces` (create), POST `/control/checkpoints` (save note/metadata), GET `/control/operations` (recent receipts).
- POST `/control/workspace-preview` `{workspaceId,mode}` and `/control/settings/extension` `{extensionId}`.
- POST `/control/commands/preview` `{text}` returns a local command result, form draft, clarification or existing Plan. Cartesia audio transport is private Electron IPC, not a new public HTTP endpoint.
- POST `/control/focus` `{resourceId}` and `/control/workspaces/focus|resume` `{workspace,snapshotRevision}`.
- POST `/control/plans` (validated external plan), `/control/plans/:id/approve` `{planHash,confirmed:true}`, `/control/plans/:id/execute` `{operationId,expectedRevision,approvalId}`.
- POST `/control/operations/:id/cancel`. Cancellation is not rollback and an already dispatched browser action can finish.
- `/bridge/snapshot|commands|results` is reserved for the explicitly configured extension and is not a public desktop-control API.

## Verification

```powershell
npm run check
npm run typecheck -w @vortex/desktop
./native/windows/test.ps1
./node_modules/.bin/tsx.cmd apps/desktop/scripts/smoke.ts
```

Unit tests cover changed/recycled targets, missing exact approval, duplicate concurrent execution, disabled actions, interrupted receipts, focus denial, unavailable workspace primaries, browser timeout and token/Origin checks. Workspace tests check canonical identity, selected primary membership, saved user notes and preview without side effects. Voice UI flow tests execute the real capture script with simulated microphone/IPC objects to verify direct preview preparation, optional transcript review and cancellation during transcription/planning; no execute call occurs in those tests. TTS tests cover the fixed phrase allowlist, caching, bounded audio and cancellation. Extension tests cover URL/target validation and exclude private page contents. Read-only smoke checks exercise the real Windows helper through the real local HTTP server without focusing a user's window.

The Electron renderer is sandboxed with context isolation, no Node access and a restrictive content security policy. Its fixed preload methods validate the sending main frame; local tokens and direct network/file access remain in the main process. All external navigation is denied. Permission handlers allow only the app's explicitly armed audio recording; camera, display capture and unrelated permissions stay denied.

Still requires real manual demo-device verification: physical microphone capture, extension activation/grouping, cross-application native focus and browser-worker suspension/reconnection. ChatGPT window switching has been reported unreliable and remains an open issue; this voice-flow update does not claim to fix it. Unit adapter mocks are labeled test doubles and are not live evidence.

## Next owner A milestones

1. Manually pair/load the extension, then verify real activation/grouping and reconnect.
2. Wire the engine into Andrew's authenticated live `Services` implementation and durable workspace/checkpoint store.
3. Human-test microphone capture, recording cancellation and voice -> direct preview -> approved focus. Wire Nova's real intent planner; typed command grammar is not an AI/sponsor substitute.
4. Implement reviewed checkpoint-driven reopening/rebinding for closed tabs, then repeat the full workspace pause/resume journey.

Archive/closing, arbitrary click/type/scripts, native document contents and layout changes remain disabled. Nathan has no critical dependency. No shared wire schema or action kind changed for this command/voice slice.
