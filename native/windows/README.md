# Vortex Windows metadata and focus helper

Owner: Josh / A. This helper implements the limited native-window boundary in
`contracts/JOSH.md`: list supported top-level desktop windows and focus a selected live window.
It does not read documents, click controls, type, change layouts, close apps, run commands,
or launch arbitrary applications. It never identifies a target by a title match alone.

## Build and validation

Run from the repository root on Windows:

```powershell
& ./native/windows/build.ps1
& ./native/windows/test.ps1
& ./native/windows/test.ps1 -IncludeInventory
```

The build uses the Windows .NET Framework C# compiler in `Framework64/v4.0.30319`
(or the 32-bit Framework directory if the 64-bit compiler is unavailable). It installs
no SDK, package or service and changes no global setting. Compiled output is ignored in
`native/windows/dist/`. The code deliberately stays compatible with that compiler.

`test.ps1` checks invalid CLI inputs without focusing any window. `-IncludeInventory`
also validates real read-only inventory and wrong PID/start-time rejection. Neither test
claims that foreground activation succeeds on the user's desktop.

## Fixed JSON CLI

```powershell
& ./native/windows/dist/vortex-window-helper.exe list
& ./native/windows/dist/vortex-window-helper.exe focus '<handle>' '<pid>' '<processStartedAt>'
```

`list` returns one JSON object on stdout and exit code 0:

```json
{
  "ok": true,
  "windows": [{
    "handle": "123456",
    "processId": 1000,
    "processStartedAt": "2026-10-25T01:00:00.000Z",
    "title": "Example notes",
    "appName": "notepad",
    "active": false
  }]
}
```

The example is illustrative. Handles are decimal strings so JavaScript does not lose integer
precision. A binding consists of handle, PID and the exact UTC process-start timestamp, normalized
to milliseconds. The list excludes untitled, tool, owned, cloaked and shell windows, inaccessible
processes, and windows outside the current Windows session. Titles and process names are metadata
and must not be used to infer document contents or task progress.

`focus` accepts exactly those three binding values. It rechecks window identity, process session,
PID/start time and visibility, calls `SetForegroundWindow`, then verifies `GetForegroundWindow`.
Successful focus returns `{"ok":true}` and exit code 0. It does not work around Windows foreground
restrictions or restore a minimized window. If the window is minimized or activation is denied,
the user must bring it forward manually.

Failures return one JSON object and exit code 1:

```json
{"ok":false,"code":"STALE_STATE","message":"Refresh the inventory."}
```

Codes are `VALIDATION_ERROR`, `NOT_FOUND`, `STALE_STATE`, `FOCUS_DENIED` or `INTERNAL_ERROR`.
The parent process must parse stdout even for a nonzero exit; do not replace a known typed error
with success or raw stderr. Inventory omits inaccessible entries instead of elevating privileges.

This is the Windows adapter executable, **not** a Chrome native-messaging host. The first control
slice uses a separately labeled authenticated loopback development bridge; production native
messaging registration is a separate integration. No registry entry or startup task is installed.
