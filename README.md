# Vortex

Windows workspace assistant for selected browser tabs and native windows.
Owners: Josh (desktop/voice), Nova (intelligence/Fetch), Andrew (API/sync/UI),
Nathan (Elastic/Apify adapters). Start with [TEAM_CONTRACT.md](TEAM_CONTRACT.md)
and the named teammate contract in [contracts/](contracts/).

## Setup and offline verification

- Node.js 24+ and npm; Python 3.13 for provider-adapter tests.
- Run `npm ci --ignore-scripts` to install the existing locked test dependencies.
  This skips the Electron binary download; launching the desktop requires its
  normal installation described in [the desktop guide](apps/desktop/README.md).
- `npm run check` checks root/desktop TypeScript, Vitest suites and Node unit tests.
  The runners are separate because the B unit suites use `node:test`.
- `npm run test:providers` runs both standard-library Python provider suites.
- `node --import tsx services/intelligence/api-demo.mjs` demonstrates the actual
  authenticated API and B routing with explicitly labeled synthetic fixture data.
- On Windows, `./native/windows/build.ps1` then `./native/windows/test.ps1`
  checks the C# helper without focusing a real window.

Tests use mock providers and do not require keys or billable network calls.
Loopback server tests need local communication permission. Windows may skip the
symlink test when the account lacks symlink creation privileges. Keep `.env` and
`.env.local` files private; only empty `.env.example` templates belong in Git.

## Implementation status

- [Desktop/voice](apps/desktop/README.md): local Electron UI, scoped control,
  reviewed voice previews, Cartesia STT/TTS adapters and local journals.
- [API](services/api/README.md): authenticated Hono routes on fixture services;
  real production sign-in, durable cloud persistence and phone delivery are pending.
- [Intelligence integration](services/intelligence/API_INTEGRATION.md): shared
  focus/resume planning and canonical checkpoint/brief drafts. Default app
  entrypoints still need the reviewed integration hookup.
- [Elastic/Apify](services/intelligence/RETRIEVAL_ADAPTERS.md): offline-tested Python
  adapters; live provider verification and production authorization are pending.
  Model-directed agent search is blocked until scope is enforced outside prompts.
- [Fetch](services/fetch-agent/README.md): linked-message dispatch boundary only;
  no running Python ACP host, Agentverse registration or ASI:One journey yet.

Passing offline tests does not prove physical microphone capture, foreground
activation, live sponsor access, extraction, phone delivery, or submission eligibility.
Provider smoke tests and live demos are separate opt-in steps that can consume credits.
