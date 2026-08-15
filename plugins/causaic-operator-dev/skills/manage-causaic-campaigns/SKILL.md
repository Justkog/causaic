---
name: manage-causaic-campaigns
description: Use the Causaic operator MCP to list, create, publish, update, pause, complete, unpublish, and archive causes and campaigns for causes the authenticated user currently manages. Trigger when a user wants to manage cause or campaign lifecycle.
---

# Manage Causaic causes and campaigns

Use only operator tools and the authenticated operator’s current cause membership. Start with `causes_list_managed` or `campaigns_list`; use detail tools before consequential mutations. Pagination is `{ cursor?, limit? }`, default 20 and maximum 50.

## Rules

- Create operations require a unique client-generated `requestId`; retrying the same request is safe, while changed arguments with the same ID must be reported as `MCP_IDEMPOTENCY_CONFLICT`.
- Use the returned `allowedActions` and current state as authoritative. Do not infer permissions from the user’s request or from a stale projection.
- Owner-only completion and archival remain owner-only. An operator who loses active cause membership must lose access immediately.
- Publish only after the cause or campaign satisfies backend lifecycle requirements. Pause, resume, complete, unpublish, and archive must follow the advertised action set.
- Never pass a caller-selected user, owner, operator, or contributor ID. Never expose Convex IDs or auth claims.

When a referenced cause or campaign belongs to another cause, preserve the permission-safe not-found or authorization result rather than probing it.
