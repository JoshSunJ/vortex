# Elastic and Apify adapters (Nathan, lane B)

Imported from Nathan's `feat/retrieval` and reviewed by Nova during repository integration. Pure Python 3.13, standard library only (no dependencies to install).

| Folder | What it does |
| --- | --- |
| `extract/` | `extract_article(url)` runs Apify Website Content Crawler on one public article and returns a wire-shaped `Source` (plus the run ID and a trace) |
| `retrieval/` | `search_sources(query, scope)` searches opted-in sources and checkpoints in Elastic Agent Builder; also indexing and deletion |
| `provider_common/` | Shared error codes (the wire error vocabulary) and a small HTTP helper |

Both functions are also available under the contract names `extractArticle` and `searchSources`.

## Status: what is verified and what is not

- **Verified:** unit tests (`python -m unittest discover -s services/intelligence/extract/tests -t .` and the same for `retrieval/tests`). They use a **fake transport**, so they prove the logic only.
- **Not yet verified against the real services:** every call to Apify and Elastic. The Kibana endpoints and headers come from Elastic's docs. Response parsing for `tools/_execute` is defensive and still needs a real smoke test. Agent conversation search is disabled: allowing a model to choose user/workspace tool parameters can disclose another user's content before post-filtering. It requires server-enforced scope before enablement.

## Environment (never commit these; `.env` is git-ignored here)

| Variable | Used by |
| --- | --- |
| `APIFY_TOKEN` | extract |
| `ELASTIC_KIBANA_URL`, `ELASTIC_ES_URL`, `ELASTIC_API_KEY` | retrieval (optional: `ELASTIC_INDEX`, `ELASTIC_AGENT_ID`) |

The Elastic API key needs privileges for the index and for Agent Builder.

## Smoke tests (run from the repo root)

```
python -m services.intelligence.extract https://<a public article>
python -m services.intelligence.retrieval setup
python -m services.intelligence.retrieval seed
python -m services.intelligence.retrieval search "cost of recycling"
```

These smoke commands contact real providers and may consume credits; they are not part of the offline test suite. `seed` indexes two labeled demo fixtures for `demo-user`, not sponsor evidence. `--agent` currently returns FORBIDDEN without a network call. Direct tool execution alone does not establish the project's named Agent Builder-agent acceptance gate.

## Behavior to know about

- **Apify:** one page, 60 s total budget, run aborted on timeout. The start request is never retried. Private, local and non-web URLs are rejected before Apify is contacted, and the final loaded URL is checked again for redirects. Provider failures, paywalled or empty pages return an `unavailable` Source with a typed error, with no text and no summary. Article text is returned unmodified as quoted data; callers must never treat it as instructions.
- **Elastic search:** the default path runs the scoped tool directly with the trusted caller's `user_id`; never take identity/scope from a model or client body. Returned rows are checked again for user/workspace membership. `via_agent=True` fails closed before contacting the provider. Up to 5 hits, excerpts up to 500 characters. Agent setup is development scaffolding and must not be published for private data until its server authorization is implemented.
- **Elastic indexing:** needs `consent=True`. A failed index write returns `status: "failed"` (the checkpoint itself is unaffected). Writes use fixed document IDs, so a retry is safe.
- Timeouts are 20 s per call with at most one retry on reads.
- Provider HTTP bodies are capped at 2 MiB, upstream error bodies are not echoed, and loaded-URL credentials/fragments are stripped from successful extraction traces. A final URL check cannot prevent an external Actor from visiting a redirect first; production extraction needs a verified provider-side redirect/private-network policy. The adapter is not enabled by any default application entrypoint.
