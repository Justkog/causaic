# ADR 0037: Distribute parallel development and production agent plugins

- Status: accepted
- Date: 2026-09-08
- Supersedes: ADR 0030's in-place rename decision for the plugin packages

## Context

Causaic now has authenticated MCP endpoints for both the development and
production Convex deployments. Developers still need the development plugins
while production users need stable production endpoints, so the two plugin
sets must be installable from the same repository marketplace.

## Decision

- Keep `causaic-contributor-dev` and `causaic-operator-dev` for development.
- Add `causaic-contributor` and `causaic-operator` for production.
- Keep both plugin sets self-contained for Codex and Claude; marketplace
  validation requires the complete four-plugin set.
- Use one environment-aware synchronization script with explicit dev/prod
  selection. Production values come from the deployment environment and only
  the public MCP URL and OAuth client ID may be checked in.

## Consequences

- Skill trees are duplicated so hosts can consume each plugin without external
  symlinks.
- Skill changes must be kept synchronized across the corresponding dev and
  production plugins.
- Production release remains repo-local; public marketplace publication is a
  separate decision.
