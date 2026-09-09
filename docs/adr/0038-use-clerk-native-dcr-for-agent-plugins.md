# ADR 0038: Use Clerk-native DCR for public agent plugins

- Status: accepted
- Date: 2026-09-09

## Context

Causaic's public contributor and operator plugins must be installable by
multiple AI clients without distributing one shared OAuth client ID or
manually registering each host's loopback callback. The production Clerk
authorization server exposes Dynamic Client Registration through its metadata.

## Decision

Generate URL-only MCP definitions for the shared, Codex, and Claude adapters.
Do not include `oauth.clientId`, `oauth_client_id`, `oauth_resource`, client
secrets, or access tokens. Each host discovers the MCP protected resource and
Clerk authorization server, then registers its own public OAuth client through
Clerk-native DCR.

The public repository contains self-contained production plugin directories and
both host marketplace manifests. Marketplace validation rejects pinned OAuth
and resource fields and requires exactly the public contributor and operator
plugins.

## Consequences

- Plugin installation requires no per-client callback or OAuth client setup.
- Every host connection gets a distinct Clerk client ID and mandatory consent
  screen.
- Each plugin keeps its shared `.mcp.json`, `skills/` tree, skill metadata, and
  thin host adapters together so hosts can cache or copy it independently.
- Codex is the runtime release gate; Claude manifests are validated
  structurally until Claude Code is available for runtime testing.
