# Vortex browser control bridge - owner A

This is a **development-only authenticated loopback bridge** for Josh's first control slice.
It is not production native messaging, cloud browser control, Cartesia voice or full workspace persistence.
The desktop executor must authorize checkpoint ownership, approvals and action scope before dispatch.

## Load and connect

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge), enable Developer mode and
   choose **Load unpacked**. Select this `apps/extension` directory. No extension installation is automated.
2. Copy the extension ID shown there, or click the Vortex action to open its configuration page.
3. Configure the desktop loopback service's exact allowed extension ID, and start it on
   `http://127.0.0.1:8790`. Get the local bridge token from that service's setup.
4. Paste the local token into the extension's password field and choose **Save and start**.
   This explicitly enables sharing ordinary HTTP(S) tab titles/URLs with that local service and
   executing the three approved browser action kinds.
5. Confirm **Connected** in the options page and real tab metadata at the desktop. Stop explicitly
   with **Stop sharing and control**. A command already in progress may complete; no new one starts.

The loopback address is fixed, tokens never appear in query strings/log messages, and browser
host permissions cover only that address. Incognito, internal/browser pages, credential-bearing
URLs and page contents are excluded. Native application control is handled separately by Josh's
Windows adapter, not this extension.

## Bridge protocol

Every request is `mode:cors`, credentials omitted, authenticated with `Authorization: Bearer …`.
The desktop must enforce the exact extension Origin, token, request bounds and localhost binding.

- `POST /bridge/snapshot`: `{sessionId, sequence, tabs:[{tabId,windowId,title,url,pendingUrl?,active,pinned,audible,lastAccessed?}]}`.
  Session identity/sequence survive worker suspension using `chrome.storage.session`.
- `GET /bridge/commands`: `{commands:[command]}` (maximum 10). Desktop should return promptly;
  each request has an eight-second timeout, and successful polls repeat about every 1.5 seconds.
- `POST /bridge/results`: `{id,ok,code?,message?,tabId?}`.

Commands are strict allowlisted objects:

```text
{id,kind:"activate_tab",tabId,windowId,expectedUrl}
{id,kind:"group_tabs",tabs:[{tabId,windowId,expectedUrl}],label}
{id,kind:"open_saved_url",url}
```

All targeted tabs are re-read and checked for navigation, target/window identity and protected
context before any mutation. Cross-window grouping is rejected rather than moving tabs silently.
After activation, active/focused state is checked. No archive/close, generic click/type or script tool exists.

Receipts are persisted **before** mutations. A restarted worker seeing a pending command returns
`STALE_STATE` instead of blindly opening another tab. Completed receipts are re-delivered by ID;
they are retained for the most recent 200 commands. The desktop must also enforce durable
idempotency and stop reissuing completed IDs after that retention window.

## Lifecycle and verification limits

Browser events and a 30-second alarm rehydrate the bridge after service-worker suspension.
Local metadata polling does not call an AI model. This is a development transport and does not
claim an always-running worker or guaranteed latency after Chrome suspends it. If unavailable,
the desktop must fail/expire its queued operation and never claim it succeeded.

Run pure boundary checks from the repository root with:

```text
npm test -- apps/extension/test/protocol.test.ts
```

These tests cover the protocol boundary only. Live activation/grouping and reconnection still
require loading the extension and exercising it with the real desktop bridge on the demo machine.
