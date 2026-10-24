# Nathan - Vortex teammate contract

Version 1.3 | 25 October 2026 | Windows | Wire schema 1.0

**Project context:** Vortex is a voice-controlled workspace manager for unfinished tasks. A named workspace collects selected browser tabs, references to still-open native windows, a user-stated goal and a checkpoint. It helps people switch tasks, preserve their place, take a selected brief to another device and resume. It is profession-agnostic; the demo is group-project research. Vortex manages the workspace around applications; arbitrary interaction inside applications and a separate tutoring platform are outside the MVP.

**Team:** Josh owns A (control/voice), Nova owns B (intelligence/providers/Fetch), Andrew owns C (dashboard/API/phone/sync/integration). Nathan owns the Elastic and Apify provider adapters inside B, split from Nova's lane; Nova keeps intent planning, Meta Llama, checkpoints/briefs and Fetch/ASI:One.

**Team clock:** 11 AM-10 PM. Gates: 11:30 AM scope frozen; 1 PM real control; 3 PM saved workspace -> switch away -> resume; 5 PM grounded checkpoint + real phone brief + sponsor traces; 6:30 PM ASI:One parity/failure cases and feature freeze; 8 PM release candidate; 9:45 PM demo-ready; 9:45-10 PM buffer. These supplied times are not timezone-converted. Organizer submission deadlines are separate.

**Sponsors:** Cartesia = voice; Meta Llama = grounding/briefs plus a people-connection outcome; Elastic Agent Builder on Serverless = retrieval; Apify = requested public article extraction; SpacetimeDB = private real-time handoff; Fetch = registered ACP agent usable in ASI:One. Logos, fixtures and fallback paths do not prove a live integration or eligibility.

**Shared rules:** native windows expose identity/title/focus only, never document contents or arbitrary click/type actions. Membership is user-selected; AI may suggest resources and resolve intent. Never execute generated scripts or expose secrets; the local executor alone mutates the computer. Cloud content and sharing need scoped consent. Deferred archive/closing, layout changes and unattended automation remain disabled. Runtime-validate shared messages and preserve the existing teammate work.

**Read next:** [team index](../TEAM_CONTRACT.md), [agent instructions](../AGENTS.md), [wire types/execution contract](JOSH.md#wire-contract), [API/auth/sync contract](ANDREW.md#api-contract), [team schedule](ANDREW.md#team-schedule). Source numbers in migrated sections refer to [the source list](ANDREW.md#sources). Proposed architecture is not a claim of completed implementation.

## Your workflow - Elastic and Apify (inside B)

Branch: `feat/retrieval`, merged into `feat/intelligence` after Nova reviews it. Own `services/intelligence/retrieval/` (Elastic) and `services/intelligence/extract/` (Apify). Nova owns the rest of `services/intelligence/` and `services/fetch-agent/`; Andrew owns API wiring and persistence; Josh owns local effects. Do not change schemas, action kinds, routes, root scripts or dependencies outside your folders without Nova/Andrew review.

- By 12:30 PM: Elastic Serverless project and Apify account working; blockers reported to Nova and Andrew. Agree the `searchSources` and `extractArticle` signatures with Nova.
- By 1 PM: real Elastic Agent Builder access and one real Apify Actor run.
- By 3 PM: opted-in workspace sources and checkpoints indexed; `searchSources` returns real source IDs and evidence excerpts so Find works by meaning, not by exact title.
- By 5 PM: an Elastic Agent Builder tool trace and an Apify run ID whose article text feeds Nova's real phone brief.
- 5-6:30 PM: failure cases (Elastic index delay, source unavailable, Apify timeout, private/local URL rejected, prompt injection inside article text).
- After freeze: fixes only, saved evidence (screenshots of agent config, traces, run IDs) and exact run instructions for the README.

Read [Josh's canonical types](JOSH.md#wire-contract), [Andrew's API contract](ANDREW.md#api-contract) and [Nova's sponsor map](NOVA.md) before writing code. Follow [the complete timed schedule](ANDREW.md#team-schedule). If you are blocked at 1 PM, tell Nova and Andrew immediately so they can take the work back or drop the track and report it.

## What you build

### 1. Elastic Agent Builder on Serverless

Index opted-in source metadata and checkpoints. Create a scoped retrieval tool in an Agent Builder agent and return source IDs and evidence excerpts. Enforce search filters (user, workspace, opt-in) in the trusted service/tool, never in prompts. Plain Elasticsearch search is not enough for the Elastic track: you need the agent configuration and a real tool trace.

### 2. Apify article tool

Run Website Content Crawler on one explicitly requested public HTTP(S) article. Cap it to one page and a 60-second run budget; poll, and cancel on timeout. Reject private/local addresses and redirects to them. No cookies, paywall bypass or logged-in crawling, and never crawl all tabs. Keep source provenance (URL, run ID, fetch time) with the text.

### Interfaces you provide

`searchSources(query, scope)` and `extractArticle(url)`. Both return schema-validated objects with provenance and operation IDs. Nova's `buildBrief`, `createCheckpoint` and the ASI:One agent call these; do not build a separate brief or summary path.

## Acceptance demo

Find an article by meaning with a visible Elastic tool trace, then extract that article through a real Apify run whose ID appears with the brief Nova sends to the phone. Fallbacks and fixtures are labeled and do not count as sponsor evidence.

## Definition of done

- Real Elastic trace and Apify run ID are captured and saved for submission.
- Failure cases above return typed errors instead of crashing the journey.
- No credentials or private browsing content in code, logs, assets or recordings.
- Nova has reviewed and merged your adapters; Andrew knows what is live and what is not.

## If time is left over

Help Andrew with demo articles, captions, screenshots or README proofreading. After 9 PM, do not change implementation or dependencies.

## People and handoffs

- [Josh](JOSH.md): Windows/browser control and Cartesia voice.
- [Nova](NOVA.md): intent planning, Meta Llama, checkpoints/briefs and Fetch/ASI:One; reviews your adapters.
- [Andrew](ANDREW.md): dashboard, phone, API/auth, Spacetime, integration and demo readiness.

The [source list](ANDREW.md#sources) is the evidence reference. Do not assert first-of-its-kind status or guaranteed prize eligibility.
