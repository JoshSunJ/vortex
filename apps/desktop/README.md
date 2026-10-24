# Vortex desktop preview

Vortex now has a visible Windows Electron dashboard backed by the real local control engine. Select open windows or connected browser tabs, save them as a task workspace, leave a checkpoint note, and review a focus/resume preview before approving it. Workspace cards and notes persist locally in SQLite. This standalone local mode uses the existing `@vortex/contracts`; Andrew's cloud API and Nova's planning service are not required to try it.

Voice, AI summaries, phone handoff and reconstruction of closed native applications are not connected in this preview. Resume focuses saved primary resources that are still available; it does not restore a full desktop layout or reopen closed tabs.

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

Unit tests cover changed/recycled targets, missing exact approval, duplicate concurrent execution, disabled actions, interrupted receipts, focus denial, unavailable workspace primaries, browser timeout and token/Origin checks. Workspace tests check canonical identity, selected primary membership, saved user notes and preview without side effects. Extension tests cover URL/target validation and exclude private page contents. Read-only smoke checks exercise the real Windows helper through the real local HTTP server without focusing a user's window.

The Electron renderer is sandboxed with context isolation, no Node access and a restrictive content security policy. Its fixed preload methods validate the sending main frame; local tokens and direct network/file access remain in the main process. All external navigation and permission requests are denied in this preview.

Still requires real manual demo-device verification: extension activation/grouping, user-approved native focus and browser-worker suspension/reconnection. Unit adapter mocks are labeled test doubles and are not live evidence.

## Next owner A milestones

1. Manually pair/load the extension, then verify real activation/grouping and reconnect.
2. Wire the engine into Andrew's authenticated live `Services` implementation and durable workspace/checkpoint store.
3. Add push-to-talk and Cartesia transcription/reply using a real provider key. **No microphone capture or Cartesia integration is connected in this slice.**
4. Implement reviewed checkpoint-driven reopening/rebinding for closed tabs, then repeat the full workspace pause/resume journey.

Archive/closing, arbitrary click/type/scripts, native document contents and layout changes remain disabled. Nathan has no critical dependency. The root lockfile repair only fills missing optional-platform metadata and registers this new workspace; no existing requested dependency versions were changed.
