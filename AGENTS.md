# Vortex agent entry point

Read [TEAM_CONTRACT.md](TEAM_CONTRACT.md) before planning or changing implementation. It is the canonical project context, ownership map, interface contract and timed workflow. Its current document revision is 1.1; wire schema version remains 1.0.

- Josh owns A: Windows/Chrome control, local execution and Cartesia voice.
- Nova owns B: planning, Meta, Elastic Agent Builder, Apify and Fetch/ASI:One.
- Andrew owns C: dashboard, API/auth wiring, phone, Spacetime and integration.
- Nathan is absent at kickoff and optional support only. No required milestone depends on him. Give him isolated demo data, copy, visual polish or extra backup assets when he arrives.

Use the supplied team clock: 11 AM-10 PM; feature freeze 6:30 PM, release candidate 8 PM, demo-ready 9:45 PM. Keep the final fifteen minutes as buffer. Organizer submission deadlines are separate.

Determine the assigned teammate/lane before editing. Inspect current code and repository instructions first. Preserve another person's work. Propose shared interface changes before making them; keep schemas, fixtures and consumers consistent. Andrew coordinates root configuration and integration. Avoid dependency/model swaps after the freeze.

Use one implementation of checkpoint, brief, delivery and resume services behind the dashboard and ASI:One. The local executor alone mutates OS/browser state. Runtime-validate model output and all input; do not execute model-generated scripts. Deferred archive/layout capabilities must not appear enabled.

Use mocks only when visibly labeled. Report changed files, behavior delivered, checks actually run, limitations and blockers. Never claim a sponsor integration is live because a fixture or fallback works. Do not expose credentials or unapproved browsing content.
