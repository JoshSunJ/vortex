# Vortex team contracts

Version 1.3 | 25 October 2026 | Windows | Wire schema 1.0

The full contract is now split into **four teammate files in [contracts/](contracts/)**. This root document is the entry point; it replaces the previous monolithic contract. Shared technical requirements remain authoritative in the linked owner files.

| Teammate | Contract | Responsibility |
| --- | --- | --- |
| Josh / A | [contracts/JOSH.md](contracts/JOSH.md) | Windows/browser control, local executor, Cartesia voice and canonical wire types |
| Nova / B | [contracts/NOVA.md](contracts/NOVA.md) | Intent planning, Meta Llama, checkpoints/briefs, Fetch ACP/ASI:One |
| Andrew / C | [contracts/ANDREW.md](contracts/ANDREW.md) | Dashboard, API/auth, phone, Spacetime, integration, team timeline and release |
| Nathan / B-retrieval | [contracts/NATHAN.md](contracts/NATHAN.md) | Elastic Agent Builder retrieval and Apify article extraction, delivered to Nova |

**Nathan works inside Nova's lane.** He owns the Elastic and Apify adapters (`searchSources`, `extractArticle`), and Nova reviews and merges them. If they are blocked at 1 PM, Nova and Andrew decide whether Nova takes them back or the track is dropped and reported.

## Shared time window

11 AM-10 PM on Josh's supplied team clock. **11:30 AM:** scope frozen. **1 PM:** real control. **3 PM:** saved workspace, switch and resume. **5 PM:** grounded checkpoint, real phone brief and sponsor traces. **6:30 PM:** ASI:One parity/failure cases and feature freeze. **8 PM:** release candidate. **9:45 PM:** demo-ready. **9:45-10 PM:** contingency buffer only. Organizer submission timing is separate.

Read [Andrew's full owner-by-owner schedule](contracts/ANDREW.md#team-schedule).

## How Claude and Codex should start

Read [AGENTS.md](AGENTS.md), then the named teammate file. Before touching a shared interface, also read [Josh's wire/execution contract](contracts/JOSH.md#wire-contract) and [Andrew's API/auth/sync contract](contracts/ANDREW.md#api-contract). Do not create competing copies of canonical schemas. Consult [Nova's sponsor map](contracts/NOVA.md) and [sources](contracts/ANDREW.md#sources) for integration evidence requirements.

## Product definition and operating boundary

**Vortex is a voice-controlled workspace manager for unfinished tasks.** It organizes selected browser tabs and application windows around a named task, saves where the user stopped, delivers a useful reading brief to another device and helps the user resume.

The problem is: **"My work is scattered across my computer, and switching tasks makes me lose context."** The unit of organization is a workspace, not an individual tab or an unrestricted computer-use session. OS integration earns its place by coordinating related tabs and native windows as one task; expanding control just for novelty is not a product advantage.

| Area | Included in the MVP | Outside the MVP |
| --- | --- | --- |
| Browser | Find, group, activate and reopen saved HTTP(S) URLs | Complete arbitrary website workflows, forms or purchases |
| Native applications | List ordinary top-level windows, identify selected ones, bring a designated live window forward | Read arbitrary application contents, click buttons, type, edit documents or close applications |
| Workspaces | User-selected membership, named goal, primary targets, create/focus/resume | Automatically infer every project or inspect everything on the laptop |
| Checkpoints | Selected browser evidence, explicit user note, grounded summary and labeled proposed next step | Recover unsaved state or infer completed work from window titles |
| Phone | Explicitly deliver a source-linked article or workspace briefing to a paired device | General remote desktop/keyboard control |

### Six bounded commands

1. **Find:** "Find the article about battery recycling."
2. **Create workspace:** "Put these selected tabs and my notes window into Group Project."
3. **Focus:** "Switch to Group Project."
4. **Save checkpoint:** "Save where I stopped. Next I need to compare the costs."
5. **Send brief:** "Send this article's key points to my phone."
6. **Resume:** "Continue Group Project."

Workspace membership starts with user selection and can be edited explicitly. AI suggests related resources, resolves spoken names, summarizes permitted browser sources and labels inferred next steps. Deterministic code validates membership, chooses the saved primary tab/native window and executes only allowlisted actions. It cannot activate all tabs simultaneously.

**Resume means:** reuse matching live tabs/windows; reopen saved HTTP(S) URLs when needed; focus designated primary targets; display the checkpoint. Missing native windows are shown as unavailable. Vortex does not recreate closed native applications, restore their documents or promise unsaved-state recovery. Saving a checkpoint never closes applications or tabs.

**Dashboard:** Workspaces, Checkpoints and Devices. The active workspace shows its goal, selected resources, transcript, action preview, last checkpoint and Focus / Resume / Send brief actions. Automatic stale-tab cleanup and a separate learning platform are deferred.

**Optional stretch:** one "browser left, notes right" layout preset, only after the required journey passes and before feature freeze. It requires reviewed typed bounds/undo and explicit user approval; it stays disabled by default. No general window manager, screenshot surveillance, generated scripts, filesystem edits or arbitrary click/type tools.

### Demo story and done criteria

Create Group Project with research tabs and a native notes window -> focus it by voice -> save a checkpoint from selected sources plus a user note -> send an article brief to a real phone -> resume Group Project and show the saved next step. A title match alone does not prove the app's document contents. Measure correct target resolution and time to resume rather than claiming that fewer tabs imply better focus.

Windows remains the only supported desktop platform for this demo. Josh owns A, Nova B and Andrew C; Nathan owns the Elastic and Apify adapters inside B. Meta, Elastic, Spacetime, Cartesia, Apify and Fetch.ai remain selected; sponsor eligibility still requires actual evidence and the event rules.


## Canonical implementation references

- [Workspace type and bounded intent/execution rules](contracts/JOSH.md#workspace-model).
- [Workspace API and persistence](contracts/ANDREW.md#workspace-api).
- [Owner-by-owner revised milestones](contracts/ANDREW.md#team-schedule).
- [Provider behavior and ASI:One workflow](contracts/NOVA.md#bounded-intents).

Document revision 1.3 updates the product scope and milestones. Wire envelope version stays 1.0: workspace endpoints/types are additive; existing `taskId` fields refer to the same Workspace ID. These are implementation specifications, not a claim that code is already complete.
