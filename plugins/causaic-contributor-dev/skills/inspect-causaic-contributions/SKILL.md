---
name: inspect-causaic-contributions
description: Use the Causaic contributor MCP to list and inspect the authenticated contributor’s completed contribution history and submitted artifacts. Trigger when a user asks what they have contributed, wants contribution status, or needs details for a completed job.
---

# Inspect Causaic contributions

Use `contributions_list` with `{ cursor?, limit? }` and default to 20 items, then use `contribution_get` for a selected portable contribution ID. Keep all queries scoped to the authenticated user; never accept a contributor ID as an override.

Present the returned job, cause, status, timestamps, and artifact projection without exposing Convex IDs, credentials, claims, or hidden records. If a contribution is not found, preserve the backend’s permission-safe response. Use pagination cursors exactly as returned and do not fetch unbounded history.
