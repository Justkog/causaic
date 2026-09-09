---
name: discover-and-join-causes
description: Use the Causaic contributor MCP to discover public causes, inspect invitation access, view joined causes, and join or leave causes. Trigger when a user wants to find a cause, use an invitation or shared link, understand why a cause is or is not available, or manage contributor membership.
---

# Discover and join Causaic causes

Use only the contributor MCP connection and the authenticated user’s identity. Never ask for or pass a caller-selected user ID or contributor ID.

## Workflow

1. Call `causes_list_discoverable` for public discovery, using the standard `cursor` and `limit` pagination fields. Default to 20 items and never request more than 50.
2. Call `causes_list_invited` when the user asks about email invitations. If it returns `EMAIL_REQUIRED`, tell the user to sign into the Causaic web application once so the server can synchronize the account email, then retry.
3. For a shared cause link, use `cause_get_by_slug` with the slug and use its returned portable `causeId`; use `cause_get` for a selected portable cause ID. Explain the returned visibility, publication status, `acceptsContributions`, and membership state without inferring hidden moderation details. A slug is a routing identifier, never a secret. Unlisted means anyone who knows the URL can access and join it.
4. Use `causes_list_joined` when the user wants current memberships or causes that became unavailable after joining.
5. Use `cause_join` or `cause_leave` only after checking the current projection and asking for explicit approval to change membership. These operations are idempotent; retry the same request only with the same arguments and request ID when one is required.

Joining a cause grants contributor membership only. It never grants operator access. Suspended, private, unpublished, and archived causes cannot be newly joined, but an existing membership may remain visible and leaveable.

Return portable IDs and backend-derived state. If a cause is absent, use the permission-safe result as returned; do not probe internal Convex IDs or infer hidden causes.
