---
name: discover-and-join-causes
description: Use the Causaic contributor MCP to discover public causes, inspect eligibility and moderation state, view joined causes, and join or leave causes. Trigger when a user wants to find a cause, understand why it is or is not available, or manage contributor membership.
---

# Discover and join Causaic causes

Use only the contributor MCP connection and the authenticated user’s identity. Never ask for or pass a caller-selected user ID or contributor ID.

## Workflow

1. Call `causes_list_discoverable` for discovery, using the standard `cursor` and `limit` pagination fields. Default to 20 items and never request more than 50.
2. Use `cause_get` for a selected portable cause ID. Explain `eligibility.state`, `eligibility.reason`, publication, moderation, and suspension fields instead of treating every returned cause as approved or joinable.
3. Use `causes_list_joined` when the user wants current memberships or causes that became unavailable after joining.
4. Use `cause_join` or `cause_leave` only after checking the current projection. These operations are idempotent; retry the same request only with the same arguments and request ID when one is required.

Joining a cause grants contributor membership only. It never grants operator access. Suspended, private, unpublished, and archived causes cannot be newly joined, but an existing membership may remain visible and leaveable.

Return portable IDs and backend-derived state. If a cause is absent, use the permission-safe result as returned; do not probe internal Convex IDs or infer hidden causes.
