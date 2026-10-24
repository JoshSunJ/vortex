# Josh / owner A: first control slice

This is a **headless local control core and command-line harness**, not the finished Electron dashboard or voice assistant. It uses the existing `@vortex/contracts`; it does not replace Andrew's API, workspace persistence, auth or Nova's planning service.

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
./native/windows/build.ps1
npm run dev -w @vortex/desktop
```

In another terminal:

```powershell
npm run snapshot -w @vortex/desktop
npm run focus -w @vortex/desktop -- <resource-UUID-from-snapshot>
```

`focus` prints the exact proposed target and requires typing `FOCUS` before it requests approval/execution. Windows may deny foreground activation or the target may be minimized; those return `FOCUS_DENIED`, not a success claim. Run in your normal Windows desktop session, not a service account/restricted background session.

## Connect Chrome or Edge explicitly

1. Follow [the extension setup](../extension/README.md) to load `apps/extension` unpacked and copy its ID. This step is manual; don't assume the extension is installed.
2. Stop the service, then configure the exact ID and restart:

```powershell
$env:VORTEX_EXTENSION_ID = '<32-character-extension-ID>'
npm run dev -w @vortex/desktop
```

3. In a separate local terminal run `npm run pair -w @vortex/desktop`. This **explicit command reveals the local bearer token** so you can paste it into the extension options; don't put it in screenshots, issues, URLs or Git. It is not a cloud/provider key.
4. Choose **Save and start** in the extension options. Wait for Connected, then run snapshot again. Only HTTP(S) tabs are included.

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

Unit tests cover changed/recycled targets, missing exact approval, duplicate concurrent execution, disabled actions, interrupted receipts, focus denial, unavailable workspace primaries, browser timeout and token/Origin checks. Extension tests cover URL/target validation and exclude private page contents. Read-only smoke checks exercise the real Windows helper through the real local HTTP server without focusing a user's window.

Still requires real manual demo-device verification: extension activation/grouping, user-approved native focus and browser-worker suspension/reconnection. Unit adapter mocks are labeled test doubles and are not live evidence.

## Next owner A milestones

1. Manually pair/load the extension, then verify real activation/grouping and reconnect.
2. Wire the engine into Andrew's authenticated live `Services` implementation and durable workspace/checkpoint store.
3. Add the Electron push-to-talk surface and Cartesia transcription/reply using a real provider key. **No microphone capture or Cartesia integration is connected in this slice.**
4. Implement reviewed checkpoint-driven reopening/rebinding for closed tabs, then repeat the full workspace pause/resume journey.

Archive/closing, arbitrary click/type/scripts, native document contents and layout changes remain disabled. Nathan has no critical dependency. The root lockfile repair only fills missing optional-platform metadata and registers this new workspace; no existing requested dependency versions were changed.
