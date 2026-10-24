# Owner B workflow and ownership

Read the root AGENTS.md, TEAM_CONTRACT.md, and current named teammate contracts
before implementation. Shared schemas/routes remain owned by Josh/Andrew; do not
create competing copies or independently rename fields.

## User-approved Git workflow

- Create a new descriptive feature branch for every new feature. Use
  `codex/owner-b-<feature>` unless the user names a different branch.
- Fetch origin/main and inspect upstream changes before beginning a feature.
- Start independent features from current origin/main. If a feature depends on
  unmerged work, explicitly retain that dependency in the branch base and report it.
  Never discard completed work by silently rebasing onto an older baseline.
- Inspect and preserve local changes before switching branches or integrating main.
  Do not reset, force-push, overwrite another person's work, or stash without tracking
  how it will be recovered. Resolve conflicts deliberately and rerun relevant checks.
- When a feature is ready, run its relevant tests, check the staged files, commit
  only the feature changes with an English message, and push that feature branch
  to GitHub with upstream tracking. The user explicitly requested this recurring sync.
- Report the pushed branch, commit, checks, limitations, and any integration conflict.
  Publishing a branch does not mean it is merged or that live sponsor access works.
- Main integration remains coordinated with Andrew. Do not merge into or push main
  automatically. Use review/PR handoff for shared integration.

## Current implementation boundaries

- Nova owns this directory except Nathan's retrieval/ and extract/ adapters, plus
  services/fetch-agent/. Nova reviews and integrates Nathan's provider results.
- Nathan owns retrieval/ (Elastic Agent Builder) and extract/ (Apify). When acting
  for Nova, consume their agreed interfaces rather than editing those implementations.
- The user selected Gemini for the current model adapter. Preserve that explicit
  decision and disclose its difference from the shared Meta/Llama sponsor plan.
  Do not claim Gemini activity as Meta evidence or silently edit the team contracts.
- All committed source, comments, documentation, examples, output, tests, commit
  messages, and PR descriptions must be English. Never commit real credentials.
- Model output is validated data. Only the existing local executor changes browser
  or OS state. Deferred closing/layout and arbitrary application control stay disabled.
