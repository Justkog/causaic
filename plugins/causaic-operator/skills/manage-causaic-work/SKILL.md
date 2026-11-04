---
name: manage-causaic-work
description: Use the Causaic operator MCP to manage workstreams, generation-input limits and inventory, and job lifecycle actions. Trigger when a user wants to operate existing Causaic work, change jobs per input, or inspect generated jobs.
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
each fresh input-opportunity claim materializes another job up to its effective
maximum. Generated jobs have independent opportunities for reassignment.
Use `jobs_list_managed` with `generationInputId` to inspect related jobs.
Input list/detail responses expose `maxJobs` (absent means inherited),
`effectiveMaxJobs`, and `materializedJobCount`. Workstream
`inputInventory.counts.materializedJobs` is the number of generated jobs;
`counts.materialized` counts exhausted inputs. A ready input may already have
generated jobs. Skipping it stops further creation and preserves those jobs.
Editing a cap does not revive a skipped input or retry a failed mapping.

Set `inventoryPolicy.maxJobsPerInput` through `workstream_update` for the
workstream default (initially 1). Import items may specify `maxJobs`; omitted
values inherit subsequent default increases; explicit overrides stay fixed.
Change an existing input through
`generation_input_set_max_jobs`, passing an integer from 1 to 10,000 or `null`
to restore inheritance. Check `allowedActions.editConfiguration` on the workstream
before editing. These edits require draft or paused workstreams;
individual effective limits cannot fall below jobs already created, and default
limits can only increase, within the same 1-to-10,000 range. Reimporting an
existing source key does not change its cap. Default increases update inherited
inputs in bounded background pages. Inspect `inputInventory.limitSync.status`
and any `error`: pending, running, and failed updates block further cap edits,
activation/resume, and completion until completed. New inputs can still be
ingested using the current default. Retry a failed update using
`workstream_input_control` with `action: "retry_limit_sync"`. Existing
workstream-wide contributor limits still apply; a job cap does not require
distinct contributors unless the configured participation policy ensures it.

Use a new `requestId` for each intended mutation and reuse it only with identical arguments. Respect active-run restrictions, workflow-pin immutability, owner-only completion/archive operations, campaign/workstream lifecycle rules, and cause authorization. Before completing an input-driven workstream, inspect `completionReadiness` and resolve every blocking reason; backend readiness remains authoritative for races and non-MCP callers. If an action is absent from `allowedActions`, do not attempt it or simulate it through another tool.

Keep projections compact: retrieve full workflow schemas and requirements through the dedicated workflow tools, not from embedded workstream responses. Never pass caller-selected identity or expose Convex IDs.

`workstream_update` requires the full authored inventory policy, including its
mapping. Preserve that configuration when changing the default; the compact
`workstream_get` mapping summary cannot reconstruct it. If the authored
configuration is unavailable, obtain it before attempting the update.

Artifact review is a separate workflow. Use `$validate-causaic-artifacts` to discover pending artifacts, run semantic validation, and apply a permitted final decision.
