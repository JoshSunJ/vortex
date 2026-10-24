# Vortex instructions for coding agents

Read [TEAM_CONTRACT.md](TEAM_CONTRACT.md) to choose the correct teammate contract:

- [Josh / A](contracts/JOSH.md): Windows/Chrome control, local execution and Cartesia.
- [Nova / B](contracts/NOVA.md): intent planning, Meta Llama, checkpoints/briefs and Fetch/ASI:One.
- [Andrew / C](contracts/ANDREW.md): dashboard, API/auth, phone, Spacetime and integration.
- [Nathan / B-retrieval](contracts/NATHAN.md): Elastic Agent Builder and Apify adapters inside B, reviewed by Nova.

The canonical [wire types/action rules](contracts/JOSH.md#wire-contract) belong to Josh with Nova/Andrew review. Canonical [API/auth/sync behavior](contracts/ANDREW.md#api-contract), [schedule](contracts/ANDREW.md#team-schedule) and [release gates](contracts/ANDREW.md#release-gates) belong to Andrew. Nova owns intelligence logic and provider/ASI:One behavior. Changes must stay consistent across consumers.

Use the supplied 11 AM-10 PM team clock. Feature freeze 6:30 PM, release candidate 8 PM, demo-ready 9:45 PM. Do not convert this schedule to another timezone or change organizer deadlines.

## Shared project context and working rules

You are implementing Vortex for Josh's Cal Hacks 13.0 team (Josh/A, Nova/B, Andrew/C, Nathan/B-retrieval). It is a Windows voice workspace assistant: find and manage browser tabs and supported native windows, preserve task checkpoints, explicitly deliver source-backed reading briefs to a paired phone, optionally share a briefing with a teammate, and resume work. It is profession-agnostic; use one group-project research story for the demo. Workspace continuity is the focus; a standalone learning platform is out of scope.

Josh selected Meta, Elastic, Spacetime, Cartesia, Apify and Fetch.ai. Use Cartesia for speech; a real Meta Llama model for grounding/task briefs; Elastic Agent Builder on Serverless for retrieval; Apify for a selected public article; SpacetimeDB for private real-time device/brief state; and an Agentverse-registered ACP agent that can run the primary workflow entirely inside ASI:One. Meta fit additionally requires a credible people-connection outcome, not just model use. Verify detailed sponsor rules and submit evidence. No claim of eligibility is automatic.

Read TEAM_CONTRACT.md, your named contract under contracts/, repository instructions and current code first. Before shared changes, read the linked canonical wire/API contracts. The implementation owners are Josh/A, Nova/B, Andrew/C and Nathan (Elastic/Apify inside B). Ask your human for your assigned person/lane if it is absent. Work toward a real demo by 9:45 PM within the supplied 11 AM-10 PM window. Do not infer your lane from whether you are Claude or Codex. Inspect what already exists; do not overwrite another teammate's code or rebuild working infrastructure. Use mocks only for development, visibly labeled. Report actual implementation status, blockers and tested behavior.

Implement a narrow vertical slice first. Propose shared schema changes before editing them. Do not independently rename fields, routes, states, timestamps or action kinds. Do not add another database, orchestration framework or alternate execution path without team coordination. Keep secrets out of source, browser renderers and logs. Never execute model-generated shell/script text. The local executor is the only authority for OS/browser mutations.

For each change, report: files changed; behavior delivered; checks run and results; remaining limitations; any required contract change. Do not describe planned behavior as already implemented. A fallback path does not count as evidence that the sponsor path works.

## Current product boundary - document revision 1.3

Implement a voice-controlled workspace manager for unfinished tasks. The six user commands are Find, Create workspace, Focus, Save checkpoint, Send brief and Resume. Read [the operating boundary](TEAM_CONTRACT.md), [Workspace model](contracts/JOSH.md#workspace-model) and [workspace routes](contracts/ANDREW.md#workspace-api) before implementing them. Membership is user-selected; native windows provide identity/title/focus only. No generic click/type/script tools, document editing, automatic closing, universal app control or remote desktop.

Updated gates: 3 PM saved workspace -> switch away -> resume; 5 PM grounded checkpoint + real phone brief + sponsor traces; 6:30 PM ASI:One parity/failure cases and feature freeze. Wire envelope stays 1.0 through additive Workspace APIs and optional fields. Existing `taskId` means Workspace.id; do not create a separate Task store or break existing field names.
