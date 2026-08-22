---
name: execute-causaic-job
description: Use the Causaic contributor MCP to execute a compatible job from discovery through completion, including consent-gated atomic start, progress, workflow approvals, artifact validation, submission consent, and contribution completion. Trigger when a user wants to pick up or run a Causaic job.
---

# Execute a Causaic job

Use the contributor MCP connection and the authenticated user’s ownership. Read the live tool schemas before constructing arguments; never invent Convex IDs, workflow schemas, status values, or approval decisions.

## Complete flow

1. If starting from a `jobId`, call `job_get`; otherwise use `jobs_list_available` and inspect a candidate with `job_get`. List results intentionally omit input; detail includes contributor-visible input. Confirm the user is a member and that the job satisfies the fixed Lite limits: `plugin_host`, small capacity, at most 15 minutes, no persistent runner or checkpoint-recovery execution.
2. Do not create or send an `executorId`. The server resolves a stable portable executor identity for the authenticated contributor and validated MCP OAuth client. Generate a unique client-side `requestId` for each mutation. Reuse a request ID only to retry identical arguments; a changed replay must be surfaced as `MCP_IDEMPOTENCY_CONFLICT`.
3. Call `job_begin` with the job, explicit lease duration, and request ID. Do not send approval booleans, executor/lease/run IDs, runtime types, or continuation metadata. The first call must not acquire work.
4. If the client returns protocol-level `input_required`, let the MCP client present its form elicitation and continue with its signed state. If it returns `interaction_required`, present the exact proposal to the user and retry the same `job_begin` business request with `interactionResponse` containing the returned interaction ID and the user’s `accept`, `decline`, or `cancel` decision. Never manufacture consent. Decline and cancel are terminal and must not execute the job.
5. On `started`, use the returned authoritative `inputs`; the lease and reserved run were created atomically and the run is already `preparing`. Treat the returned executor ID as informational and never copy it into later arguments. Report only monotonic progress with `job_report_progress` using the advertised status and sequence shape. Renew before expiry with `lease_renew` when needed.
6. If the workflow exposes a runtime checkpoint, use `approval_request`, present the checkpoint to the user, and call `approval_resolve` with the user’s actual decision. If no checkpoint exists, do not create an artificial approval.
7. Produce the artifact, call `artifact_validate`, and fix every reported validation issue before persisting anything.
8. Call `artifact_prepare_submission`, show its exact artifact proposal, obtain the user’s actual submission consent, and resolve it with `contributor_consent_resolve`. This consent tool is only for artifact submission; `job_begin` owns start consent.
9. Call `artifact_submit` with the matching approved consent, then `job_complete`. Finally use `contributions_list` and `contribution_get` to confirm the authenticated contributor’s history.

## Failure and safety rules

- Never send development node secrets, caller-selected identities, or internal Convex IDs.
- If lease, consent, ownership, availability, attempt, approval, or lifecycle checks fail, report the backend reason and stop rather than bypassing it.
- Use `job_cancel` for a user-requested cancellation and `job_fail` for an execution failure. Terminal jobs cannot be mutated.
- A failed, cancelled, or expired run must be allowed to release its lease and close pending approvals according to the backend state machine.
- Do not claim that agent-reported fallback consent proves a host displayed a consent interface.
