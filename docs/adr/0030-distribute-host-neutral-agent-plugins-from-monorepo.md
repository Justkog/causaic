# ADR 0030: Distribute host-neutral agent plugins from the public monorepo

- Status: accepted
- Date: 2026-08-08

## Context

Causaic distributes contributor and operator agent plugins to Codex and Claude
Code. Each host requires its own marketplace and manifest contract, while the
plugin skills and MCP behavior must remain consistent.

## Decision

- Use this repository as the distribution root for the public Codex and Claude
  marketplaces at `.agents/plugins/marketplace.json` and
  `.claude-plugin/marketplace.json`.
- Keep `.mcp.json`, `skills/`, skill metadata, and supporting assets
  self-contained inside each production plugin directory.
- Add only thin host-specific manifests or adapters when a host contract
  requires them.
- Prefer protected-resource and authorization-server discovery. Never package
  secrets, access tokens, or pinned OAuth client configuration.
- Keep the public marketplace limited to the production contributor and
  operator plugins.

## Consequences

- Hosts can cache or copy a plugin without access to files elsewhere in the
  repository.
- Codex and Claude marketplace schemas require separate validation even though
  they point to the same public plugin capabilities.
- Public release remains independent of the private hosted backend source.
