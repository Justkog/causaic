---
name: manage-causaic-work
description: Use the Causaic operator MCP to browse managed workstreams, generation-input inventory, and concrete jobs, and perform permitted pause, resume, complete, close, duplicate, or archive lifecycle actions. Trigger when a user wants to operate already-published Causaic work.
---

# Manage published Causaic work

For new inventory, input-driven dataset work is preferred over creating jobs
manually. Start with `workstreams_list` and the corresponding detail tool, then
use `generation_inputs_list`/`generation_input_get` for input-driven work or
`jobs_list_managed`/`job_get_managed` for concrete manual or materialized jobs.
Inspect current state and backend-derived `allowedActions` immediately before
each mutation. Use the dependency tools only with same-campaign, non-self
references and preserve cycle detection.

For dataset-backed workstreams, preview representative items before ingestion,
then ingest bounded batches using stable source-item keys. Previewing is
read-only; ingestion persists ready or failed inputs, and ready inputs become
opportunities.
Inspect inventory and intake state through `workstream_get` and the input
list/detail tools. Retry a failed item after correcting its mapping, skip it
only when intentionally discarding it, and use `workstream_input_control` to
open or close intake. Upstream-backed workstreams synchronize accepted
artifacts automatically; retry source sync only when `workstream_get` reports
a failed initial sync. A generation input is not itself a concrete job;
claiming its opportunity materializes one job, which is then managed through
the normal job lifecycle tools.

Use a new `requestId` for each intended mutation and reuse it only with identical arguments. Respect active-run restrictions, workflow-pin immutability, owner-only completion/archive operations, campaign/workstream lifecycle rules, and cause authorization. Before completing an input-driven workstream, inspect `completionReadiness` and resolve every blocking reason; backend readiness remains authoritative for races and non-MCP callers. If an action is absent from `allowedActions`, do not attempt it or simulate it through another tool.

Keep projections compact: retrieve full workflow schemas and requirements through the dedicated workflow tools, not from embedded workstream responses. Never pass caller-selected identity or expose Convex IDs.

Artifact review is a separate workflow. Use `$validate-causaic-artifacts` to discover pending artifacts, run semantic validation, and apply a permitted final decision.
