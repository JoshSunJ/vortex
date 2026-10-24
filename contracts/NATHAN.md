# Nathan - Vortex optional-support contract

Version 1.3 | 25 October 2026 | Windows | Wire schema 1.0

**Project context:** Vortex is a voice-controlled workspace manager for unfinished tasks. A named workspace collects selected browser tabs, references to still-open native windows, a user-stated goal and a checkpoint. It helps people switch tasks, preserve their place, take a selected brief to another device and resume. It is profession-agnostic; the demo is group-project research. Vortex manages the workspace around applications; arbitrary interaction inside applications and a separate tutoring platform are outside the MVP.

**Team:** Josh owns A (control/voice), Nova owns B (intelligence/providers/Fetch), Andrew owns C (dashboard/API/phone/sync/integration). Nathan is absent at kickoff and optional support only; no required feature or milestone depends on him.

**Team clock:** 11 AM-10 PM. Gates: 11:30 AM scope frozen; 1 PM real control; 3 PM saved workspace -> switch away -> resume; 5 PM grounded checkpoint + real phone brief + sponsor traces; 6:30 PM ASI:One parity/failure cases and feature freeze; 8 PM release candidate; 9:45 PM demo-ready; 9:45-10 PM buffer. These supplied times are not timezone-converted. Organizer submission deadlines are separate.

**Sponsors:** Cartesia = voice; Meta Llama = grounding/briefs plus a people-connection outcome; Elastic Agent Builder on Serverless = retrieval; Apify = requested public article extraction; SpacetimeDB = private real-time handoff; Fetch = registered ACP agent usable in ASI:One. Logos, fixtures and fallback paths do not prove a live integration or eligibility.

**Shared rules:** native windows expose identity/title/focus only, never document contents or arbitrary click/type actions. Membership is user-selected; AI may suggest resources and resolve intent. Never execute generated scripts or expose secrets; the local executor alone mutates the computer. Cloud content and sharing need scoped consent. Deferred archive/closing, layout changes and unattended automation remain disabled. Runtime-validate shared messages and preserve the existing teammate work.

**Read next:** [team index](../TEAM_CONTRACT.md), [agent instructions](../AGENTS.md), [wire types/execution contract](JOSH.md#wire-contract), [API/auth/sync contract](ANDREW.md#api-contract), [team schedule](ANDREW.md#team-schedule). Source numbers in migrated sections refer to [the source list](ANDREW.md#sources). Proposed architecture is not a claim of completed implementation.

## Your assignment is optional

You are not present at kickoff. Arrive when available and ask Andrew which isolated support item would help. Do not take over a required service, feature, API/auth component, sponsor integration, release test, core backup recording or submission. The demo must succeed even if you do not arrive.

Branch: `chore/demo-support`. Work in an agreed demo asset or copy/style area. Do not change schemas, action kinds, routes, credentials, provider choices, dependencies, root scripts, security settings or another teammate's unfinished implementation.

## Choose one small task

1. Prepare safe public demo articles and clear sample task/tab labels. Keep optional demo data visibly separate from actual provider results; do not pass fake data off as live integration.
2. Improve nonessential labels, spelling, spacing or colors after Andrew confirms the core screen works. Keep the existing flows and field names intact.
3. Proofread captions or presentation wording. Claims must match actual functionality; preserve visible source links and limitations.
4. Capture extra screenshots or make a second copy of Andrew's completed backup recording. Andrew remains responsible for the essential recording.
5. Check README readability and suggest changes. The required owners retain setup accuracy and submission responsibility.

## Arrival workflow

- Read the team index and this file; tell Andrew your available time.
- Pick one bounded task with a clear file boundary and agree it with Andrew.
- Use an isolated small commit. Do not edit other owners' code or run updates to dependencies.
- Show Andrew the exact changes for review. If there is no time to review them safely, leave them unmerged.
- At or after 6:30 PM, limit help to proofing/captions/screenshots or a tiny approved visual fix. After 9 PM, do not change implementation or dependencies; help with the existing demo only.

## Definition of done

- The optional item is complete, easy to inspect and does not break the known-good workflow.
- No credentials/private browsing content are in assets or recordings.
- No fixture is presented as a real sponsor call.
- Andrew knows what changed, what you checked and whether anything remains.
- Your task can be omitted without affecting any required milestone.

## People and handoffs

- [Josh](JOSH.md): Windows/browser control and Cartesia voice.
- [Nova](NOVA.md): semantic planning, Meta, Elastic, Apify and Fetch/ASI:One.
- [Andrew](ANDREW.md): dashboard, phone, API/auth, Spacetime, integration and demo readiness.

The [demo script, release gates and submission checklist](ANDREW.md#release-gates) are owned by Andrew with Josh/Nova. They are reference context for your optional assets, not an assignment of critical work to you. The [source list](ANDREW.md#sources) is the evidence reference. Do not assert first-of-its-kind status or guaranteed prize eligibility.
