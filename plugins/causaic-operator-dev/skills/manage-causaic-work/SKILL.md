---
name: manage-causaic-work
description: Use the Causaic operator MCP to browse managed jobs and workstreams and perform permitted pause, resume, complete, close, duplicate, or archive lifecycle actions. Trigger when a user wants to operate already-published Causaic work.
---

# Manage published Causaic work

Start with `workstreams_list`, `jobs_list_managed`, and the corresponding detail tools. Inspect current state and backend-derived `allowedActions` immediately before each mutation. Use the dependency tools only with same-campaign, non-self references and preserve cycle detection.

Use a unique `requestId` for non-idempotent mutations and replay only identical arguments. Respect active-run restrictions, workflow-pin immutability, owner-only completion/archive operations, campaign/workstream lifecycle rules, and cause authorization. If an action is absent from `allowedActions`, do not attempt it or simulate it through another tool.

Keep projections compact: retrieve full workflow schemas and requirements through the dedicated workflow tools, not from embedded workstream responses. Never pass caller-selected identity or expose Convex IDs.

Artifact review is a separate workflow. Use `$validate-causaic-artifacts` to discover pending artifacts, run semantic validation, and apply a permitted final decision.
