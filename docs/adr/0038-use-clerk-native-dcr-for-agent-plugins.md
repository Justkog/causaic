# ADR 0038: Use Clerk-native DCR for agent plugins

- Status: accepted
- Date: 2026-09-09
- Supersedes: the host-specific client-ID decisions in ADR 0030 and ADR 0037

## Context

Causaic's development and production plugins must be installable by multiple AI
clients without distributing one shared OAuth client ID or manually registering
each host's loopback callback. Both Clerk instances expose Dynamic Client
Registration through authorization-server metadata.

## Decision

Generate URL-only MCP definitions for the shared, Codex, and Claude adapters in
all four plugins. Do not include `oauth.clientId`, `oauth_client_id`,
`oauth_resource`, client secrets, or access tokens. Each host discovers the MCP
protected resource and Clerk authorization server, then registers its own
public OAuth client through Clerk-native DCR.

Marketplace validation rejects pinned OAuth client and resource fields. Plugin
synchronization requires only the deployment's Convex site URL. Codex release
testing explicitly forces DCR with `--oauth-client-registration dcr` because a
configured client ID would bypass dynamic registration.

## Consequences

- Plugin installation no longer requires per-client callback or OAuth client
  configuration.
- Every host connection gets a distinct Clerk client ID and mandatory consent
  screen.
- Development and production plugin pairs continue to coexist and retain their
  deployment-specific URLs.
- Codex is the runtime release gate. Claude manifests are validated
  structurally; other client runtime tests remain follow-up compatibility work.
