---
name: manage-causaic-campaigns
description: Use the Causaic operator MCP to manage four-mode causes, email invitations, and campaign lifecycle for causes the authenticated user currently manages. Trigger when a user wants to manage cause visibility, invite contributors, or operate cause and campaign lifecycle.
---

# Manage Causaic causes and campaigns

Use only operator tools and the authenticated operator’s current cause membership. Start with `causes_list_managed` or `campaigns_list`; use detail tools before consequential mutations. Pagination is `{ cursor?, limit? }`, default 20 and maximum 50.

Cause visibility is one of `private`, `invite_only`, `unlisted`, or `public`. Use `cause_invitations_list`, `cause_invitation_create`, and `cause_invitation_revoke` only for managed causes. Invitation create/revoke calls require a unique `requestId` and are safely retryable. Invitation grants are reusable and email-based; creating one does not join the recipient automatically. A slug is a routing identifier, not a secret, and unlisted access is not confidential.

## Rules

- Create operations require a unique client-generated `requestId`; retrying the same request is safe, while changed arguments with the same ID must be reported as `MCP_IDEMPOTENCY_CONFLICT`.
- Use the returned `allowedActions` and current state as authoritative. Do not infer permissions from the user’s request or from a stale projection.
- Confirm the target cause and email before creating or revoking an invitation; report that invitation changes do not join contributors automatically.
- Owner-only completion and archival remain owner-only. An operator who loses active cause membership must lose access immediately.
- Publish only after the cause or campaign satisfies backend lifecycle requirements. Pause, resume, complete, unpublish, and archive must follow the advertised action set.
- Never pass a caller-selected user, owner, operator, or contributor ID. Never expose Convex IDs or auth claims.

When a referenced cause or campaign belongs to another cause, preserve the permission-safe not-found or authorization result rather than probing it.
