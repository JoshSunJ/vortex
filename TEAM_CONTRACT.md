# Vortex team contracts

Version 1.2 | 25 October 2026 | Windows | Wire schema 1.0

The full contract is now split into **four teammate files in [contracts/](contracts/)**. This root document is the entry point; it replaces the previous monolithic contract. Shared technical requirements remain authoritative in the linked owner files.

| Teammate | Contract | Responsibility |
| --- | --- | --- |
| Josh / A | [contracts/JOSH.md](contracts/JOSH.md) | Windows/browser control, local executor, Cartesia voice and canonical wire types |
| Nova / B | [contracts/NOVA.md](contracts/NOVA.md) | Intent planning, Meta Llama, Elastic Agent Builder, Apify, Fetch ACP/ASI:One |
| Andrew / C | [contracts/ANDREW.md](contracts/ANDREW.md) | Dashboard, API/auth, phone, Spacetime, integration, team timeline and release |
| Nathan / optional | [contracts/NATHAN.md](contracts/NATHAN.md) | Noncritical demo data, visual/copy polish, captions/screenshots and extra backup assets |

**Nathan is not on the critical path.** No required service, feature, test, recording or submission depends on his arrival.

## Shared time window

11 AM-10 PM on Josh's supplied team clock. **1 PM:** real control. **3 PM:** real phone vertical slice. **5 PM:** sponsor evidence. **6:30 PM:** feature freeze. **8 PM:** release candidate. **9:45 PM:** demo-ready. **9:45-10 PM:** contingency buffer only. Organizer submission timing is separate.

Read [Andrew's full owner-by-owner schedule](contracts/ANDREW.md#team-schedule).

## How Claude and Codex should start

Read [AGENTS.md](AGENTS.md), then the named teammate file. Before touching a shared interface, also read [Josh's wire/execution contract](contracts/JOSH.md#wire-contract) and [Andrew's API/auth/sync contract](contracts/ANDREW.md#api-contract). Do not create competing copies of canonical schemas. Consult [Nova's sponsor map](contracts/NOVA.md) and [sources](contracts/ANDREW.md#sources) for integration evidence requirements.

## 01 / Product decision brief

### A workspace that follows you

**Working name: Vortex.** A Windows voice workspace assistant that finds your open work, creates a useful checkpoint, and lets you continue reading or collaborating on another device.

**Core promise:** "Tell your computer what matters. Take the useful context with you." This is a proposed design and work contract, not an implemented product or a guarantee of prizes.

#### Decisions to build around

- **Focus on workspace continuity.** The dashboard organizes tabs, windows, tasks and checkpoints. Reading support belongs inside that workflow. A separate tutoring platform, courses and quizzes are out of scope.

- **Profession-agnostic product; one concrete demo.** Use research for a group project as the example. The same task/source/checkpoint structure works for students, professionals and personal projects.

- **Windows desktop app + thin Chrome extension.** The app controls supported OS windows; the extension supplies reliable browser tab identity and permitted page text. This is OS-integrated software, not a new OS or universal control of every application.

- **Phone is a reading companion first.** Explicitly send an article brief or checkpoint to a paired phone. General remote keyboard/mouse control is deferred.

- **Social handoff is explicit.** Preview a project briefing before granting a teammate access. Personal phone sync and sharing with another person are different permissions.

#### Required minimum and deliberate exclusions

Required: push-to-talk, find/switch/group tabs, focus a supported Windows window, task dashboard, checkpoint creation, source-linked phone brief, resume task, visible operation status, all six sponsor integrations with evidence. Closing/archiving tabs is deferred for this sprint; stale-tab suggestions may offer Keep / Snooze / Save checkpoint without closing anything.

Excluded: arbitrary shell commands, deleting files, closing native apps, unsaved-form recovery guarantees, general screen scraping, unattended purchases/messages, always-listening microphone, native iOS/Android apps, full remote desktop and a second OS.

**Confirmed by Josh:** Windows; Meta, Elastic, Spacetime, Cartesia, Apify and Fetch.ai. Required owners are Josh (A), Nova (B) and Andrew (C). Nathan is optional support and absent at kickoff. The team has 11 AM-10 PM on its supplied clock; aim to be demo-ready by 9:45 PM. Document date: 25 October 2026.
