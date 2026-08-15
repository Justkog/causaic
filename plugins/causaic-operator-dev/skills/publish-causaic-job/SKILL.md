---
name: publish-causaic-job
description: Use the Causaic operator MCP to configure and publish a valid job through its cause, workflow, campaign, and workstream prerequisites. Trigger when a user wants to create a job draft or make a job available to contributors.
---

# Publish a Causaic job

Guide this sequence while re-reading each projection after a mutation:

1. Confirm the managed cause is published and the selected workflow version is published and selectable for that cause.
2. Create or select an appropriate campaign. Activate it only when its lifecycle preconditions are satisfied.
3. Create a workstream pinned to the selected workflow version. Configure participation policy and dependencies; reject self-dependencies and cycles.
4. Create a job draft with unique `requestId`, using the workflow schema tools to construct valid input and validation parameters.
5. Activate the campaign and workstream in the required order, then publish the job.
6. Use `jobs_list_managed` and `job_get_managed` to verify the compact projection, publication state, and backend-derived `allowedActions`.

Drafts are editable only in permitted states. Published jobs and workflow pins are immutable. Publication must be blocked for invalid input, expired availability, inactive campaign/workstream, unavailable workflow versions, inventory violations, unsafe active-run state, or any other backend rejection. Never pass a caller-selected operator or cause ID.
