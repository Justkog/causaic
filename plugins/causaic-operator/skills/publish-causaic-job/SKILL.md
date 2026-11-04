---
name: publish-causaic-job
description: Use the Causaic operator MCP to configure and publish manual or input-driven Causaic work, including several independent jobs per input. Prefer dataset-backed inventory when work is itemized. Trigger when a user wants to create contributor work or make it available.
---

# Publish Causaic contributor work

For new contributor inventory, prefer an `input_driven` workstream backed by a
dataset source. It keeps source items, mapping, and generated opportunities
separate from concrete jobs. Use manual jobs as the fallback for work that
cannot be represented as input items.

For several independent jobs from the same source item, set
`inventoryPolicy.maxJobsPerInput` in `workstream_create` rather than duplicating
inputs. The default is 1; limits must be integers from 1 to 10,000. Each
`generation_inputs_ingest` item may specify a custom `maxJobs`; omission inherits
the workstream default, including subsequent increases. Explicit overrides
remain fixed, and reimporting a source item does not edit its cap.

The cap counts jobs created, not accepted results or claim attempts. Every job
retains its own `requiredAcceptedRuns` target and execution lifecycle; reassigning
an existing job consumes no additional slot. Existing participation settings
govern contributor limits, so multiple jobs do not by themselves guarantee
distinct contributors.

Guide this sequence while re-reading each projection after a mutation:

1. Confirm the managed cause is published and the selected workflow version is published and selectable for that cause.
2. Create or select an appropriate campaign. Activate it only when its lifecycle preconditions are satisfied.
3. Create a workstream pinned to the selected workflow version. Prefer an input-driven dataset source with explicit mappings, participation policy, and dependencies; reject self-dependencies and cycles. Choose a manual inventory only when appropriate.
4. Follow the inventory branch:
   - dataset-backed input-driven: preview a representative item before activation; previewing persists nothing. Then activate the campaign and workstream and ingest bounded batches with stable source-item keys. Reuse a request ID only for an exact retry, and close intake with the final batch or `workstream_input_control` when appropriate.
   - upstream-backed input-driven: accepted artifacts synchronize automatically. Do not ingest them manually; use `workstream_input_control` with `retry_source_sync` only when `workstream_get` reports that the initial sync failed.
   - manual: create a job draft with a unique `requestId`, using the workflow schema tools to construct valid input and validation parameters.
5. Activate the campaign and workstream in the required order. For manual inventory, publish the job; for input-driven inventory, keep intake and source-sync state aligned with the desired ingestion flow.
6. Use `jobs_list_managed` and `job_get_managed` for manual jobs or materialized input-backed jobs. For input-driven inventory, use the generation-input tools to verify readiness and rely on contributor opportunity discovery for the generated candidate inventory.

Drafts are editable only in permitted states. Published jobs and workflow pins are immutable. Publication must be blocked for invalid input, expired availability, inactive campaign/workstream, unavailable workflow versions, inventory violations, unsafe active-run state, or any other backend rejection. Never pass a caller-selected operator or cause ID.

For later cap edits, inheritance resets, related-job inspection, or failed limit
synchronization, use `$manage-causaic-work`. Cap edits require a draft or paused
workstream, and limit synchronization must finish before activation/resume.
