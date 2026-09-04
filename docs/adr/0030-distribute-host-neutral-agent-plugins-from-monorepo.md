# ADR 0030: Distribute host-neutral agent plugins from the monorepo

- Status: accepted
- Date: 2026-08-08

## Context

Causaic has contributor and operator development plugins with shared Agent
Skills and remote MCP definitions. Public distribution must support Codex and
Claude Code without duplicating either skill tree or MCP behavior. Production
MCP endpoints and the public GitHub repository are not yet available, and
Claude Code is not installed in the current validation environment.

## Decision

- Use the Causaic monorepo as the distribution root for both hosts, with
  repository marketplaces at `.agents/plugins/marketplace.json` and
  `.claude-plugin/marketplace.json` and packages under `plugins/`.
- Keep `.mcp.json`, `skills/`, `SKILL.md` files, and supporting assets shared
  inside each plugin directory. Add only thin host-specific manifests or
  adapters when a host contract requires them.
- Prefer standards-based OAuth protected-resource and authorization-server
  discovery. Add explicit host-specific OAuth metadata only when discovery or
  host validation requires it, and never package secrets or access tokens. The
  shared `.mcp.json` therefore contains only the HTTP URL; the current dev
  adapters carry the public client ID in Codex's documented nested
  `oauth.clientId` field and Claude's documented `oauth.clientId` because the
  current Clerk setup has DCR disabled.
- Keep the `causaic-contributor-dev` and `causaic-operator-dev` packages private
  for pre-production validation. Once production endpoints and OAuth
  registration are ready, rename them in place to `causaic-contributor` and
  `causaic-operator` rather than maintaining parallel development and
  production skill trees.
- Eventually list both production plugins in public marketplaces. The
  contributor install page installs only `causaic-contributor`; the operator
  plugin gets a separate future install page.
- Use command-based Codex installation until an official marketplace is known
  to Codex. Record its public name, URL, and deep link only after publication.

## Consequences

- Each plugin must be self-contained because hosts may cache or copy the
  plugin directory without access to files elsewhere in the monorepo.
- Codex and Claude manifests and marketplace schemas require separate
  validation even though their payloads point to shared plugin content.
- Claude contract validation is documentation-only in the current environment;
  executable checks wait for an environment where Claude Code is already
  installed.
- Public release remains blocked on production MCP/OAuth deployment and GitHub
  publication. Development endpoints cannot appear in public configuration.
