---
name: execute-causaic-job
description: Use the Causaic contributor MCP to execute a compatible contribution from opportunity discovery through completion, including consent-gated atomic start, progress, workflow approvals, atomic artifact submission, and contribution history. Trigger when a user wants to pick up or run a Causaic contribution.
---

# Execute a Causaic contribution

Use the contributor MCP connection and the authenticated user’s ownership. Read the live tool schemas before constructing arguments; never invent Convex IDs, workflow schemas, status values, or approval decisions.

## Complete flow

1. If starting from an `opportunityId`, call `opportunity_get`; otherwise use `opportunities_list_available` and inspect a candidate with `opportunity_get`. List results intentionally omit input; detail includes contributor-visible input. Confirm the user is a member and that the opportunity satisfies the fixed Lite limits: `plugin_host`, small capacity, at most 15 minutes, no persistent runner or checkpoint-recovery execution.
2. Do not create or send an `executorId`. The server resolves a stable portable executor identity for the authenticated contributor and validated MCP OAuth client. Generate a unique client-side `requestId` for each mutation. Reuse a request ID only to retry identical arguments; a changed replay must be surfaced as `MCP_IDEMPOTENCY_CONFLICT`.
3. Call `opportunity_begin` with the opportunity, explicit lease duration, and request ID. Do not send approval booleans, executor/lease/run IDs, runtime types, or continuation metadata. The first call must not acquire work.
4. If the client returns protocol-level `input_required`, let the MCP client present its form elicitation and continue with its signed state. If it returns `interaction_required`, present the exact proposal to the user and retry the same `opportunity_begin` business request with `interactionResponse` containing the returned interaction ID and the user’s `accept`, `decline`, or `cancel` decision. Never manufacture consent. Decline and cancel are terminal and must not execute the contribution.
5. On `started`, use the returned authoritative `inputs`; the lease and reserved run were created atomically and the run is already `preparing`. Treat the returned executor ID as informational and never copy it into later arguments. Report only monotonic progress with `job_report_progress` using the advertised status and sequence shape. An accepted newer progress sequence keeps the active lease alive and returns the effective `leaseExpiresAt`; do not send stale or equal-sequence calls as heartbeats. Use `lease_renew` only for an exceptional blocking operation that cannot produce meaningful progress before expiry.
6. If the workflow exposes a runtime checkpoint, use `approval_request`, present the checkpoint to the user, and call `approval_resolve` with the user’s actual decision. If no checkpoint exists, do not create an artificial approval.
7. Produce the artifact and call `artifact_submit`. The server validates it against the pinned output schema before creating any consent record. If the result is `validation_failed`, fix every reported issue and retry with the same run and lease.
8. Present the exact returned artifact proposal to the user. For form-elicitation clients, let the MCP client collect the decision and continue its signed one-time request; otherwise retry the same `artifact_submit` business request with `interactionResponse` containing the returned interaction ID and the user’s `accept`, `decline`, or `cancel` decision. Acceptance validates, submits the artifact, and completes the contribution atomically. There is no separate prepare, consent-resolve, or job-complete step.
9. Finally use `contributions_list` and `contribution_get` to confirm the authenticated contributor’s history.

## Failure and safety rules

- Never send development node secrets, caller-selected identities, or internal Convex IDs.
- If opportunity, lease, consent, ownership, availability, attempt, approval, or lifecycle checks fail, report the backend reason and stop rather than bypassing it.
- Use `job_cancel` for a user-requested cancellation and `job_fail` for an execution failure. Terminal jobs cannot be mutated.
- A failed, cancelled, or expired run must be allowed to release its lease and close pending approvals according to the backend state machine.
- Do not claim that agent-reported fallback consent proves a host displayed a consent interface.
