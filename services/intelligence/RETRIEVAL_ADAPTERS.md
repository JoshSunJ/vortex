# Elastic and Apify adapters (Nathan, lane B)

Branch `feat/retrieval`, reviewed and merged into `feat/intelligence` by Nova. Pure Python 3.13, standard library only (no dependencies to install).

| Folder | What it does |
| --- | --- |
| `extract/` | `extract_article(url)` runs Apify Website Content Crawler on one public article and returns a wire-shaped `Source` (plus the run ID and a trace) |
| `retrieval/` | `search_sources(query, scope)` searches opted-in sources and checkpoints in Elastic Agent Builder; also indexing and deletion |
| `provider_common/` | Shared error codes (the wire error vocabulary) and a small HTTP helper |

Both functions are also available under the contract names `extractArticle` and `searchSources`.

## Status: what is verified and what is not

- **Verified:** unit tests (`python -m unittest discover -s services/intelligence/extract/tests -t .` and the same for `retrieval/tests`). They use a **fake transport**, so they prove the logic only.
- **Not yet verified against the real services:** every call to Apify and Elastic. The Kibana endpoints and headers come from Elastic's docs. The response shapes of `converse` and `tools/_execute` are not documented there, so parsing is defensive. Run the smoke tests below and fix anything they reveal before anyone treats these as working sponsor integrations.

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
python -m services.intelligence.retrieval search "cost of recycling" --agent
```

`seed` indexes two labeled demo fixtures for `demo-user`. They are not real sources and are not sponsor evidence. The Apify run ID and the `--agent` trace are the evidence to save.

## Behavior to know about

- **Apify:** one page, 60 s total budget, run aborted on timeout. The start request is never retried. Private, local and non-web URLs are rejected before Apify is contacted, and the final loaded URL is checked again for redirects. Provider failures, paywalled or empty pages return an `unavailable` Source with a typed error, with no text and no summary. Article text is returned unmodified as quoted data; callers must never treat it as instructions.
- **Elastic search:** the default path runs the scoped tool directly with the caller's `user_id`. `via_agent=True` runs it through the Agent Builder agent for the trace; because the agent cannot be forced to pass our `user_id`, every row is re-checked in code and rows for another user or workspace are dropped. Up to 5 hits, excerpts up to 500 characters.
- **Elastic indexing:** needs `consent=True`. A failed index write returns `status: "failed"` (the checkpoint itself is unaffected). Writes use fixed document IDs, so a retry is safe.
- Timeouts are 20 s per call with at most one retry on reads.
