# Causaic development Codex plugins

This repository contains two Codex plugins for testing the authenticated MCP
connections against the Convex development deployment:

- `causaic-contributor-dev` — contributor discovery, membership, bounded job
  execution, artifact submission, and contribution history;
- `causaic-operator-dev` — cause, campaign, workflow, workstream, and job
  management plus submitted-artifact validation and decisions.

The `dev` suffix is intentional. Codex plugin IDs are static; they do not
change based on `.env` values. Production plugins should be separate IDs when a
production deployment exists.

## Install from this checkout

From the repository root, add the local marketplace once:

```bash
codex plugin marketplace add .
codex plugin add causaic-contributor-dev@causaic
codex plugin add causaic-operator-dev@causaic
```

Open a new Codex desktop conversation after installation. Installed plugins
are cached, so also start a new conversation after any plugin update. If the
marketplace is already configured, refresh or reinstall the plugin rather than
editing its cached copy.

## Keep the development deployment in sync

The checked-in connectors currently target:

```text
https://compassionate-swordfish-378.eu-west-1.convex.site/mcp/contributor
https://compassionate-swordfish-378.eu-west-1.convex.site/mcp/operator
```

Check the checked-in manifests and connector files:

```bash
pnpm plugins:dev:check
```

When the deployment changes, update the shared connector, both host-specific
OAuth adapters, and skill dependency URLs explicitly:

```bash
CONVEX_SITE_URL=https://your-deployment.convex.site \
CLERK_MCP_OAUTH_CLIENT_ID=<public-client-id> \
pnpm plugins:dev:sync
pnpm format:check
```

The shared `.mcp.json` files contain only the HTTP URL so each host can use its
own standards-based OAuth discovery. The Codex manifests retain Codex's
explicit resource/client fields, while the Claude adapters use Claude's
documented `oauth.clientId` shape. The public
`CLERK_MCP_OAUTH_CLIENT_ID` is safe to check in; no client secret or access
token belongs in the repository. Supply a rotated public ID explicitly when
synchronizing:

```bash
CLERK_MCP_OAUTH_CLIENT_ID=<public-client-id> pnpm plugins:dev:sync
```

After synchronization, update the installed plugin cache and start a new
conversation.

## OAuth setup for Codex desktop

Both plugins use the same Clerk public OAuth application and PKCE S256 flow,
but each requests its own MCP resource:

```text
https://compassionate-swordfish-378.eu-west-1.convex.site/mcp/contributor
https://compassionate-swordfish-378.eu-west-1.convex.site/mcp/operator
```

The protected-resource metadata URLs are:

```text
https://compassionate-swordfish-378.eu-west-1.convex.site/.well-known/oauth-protected-resource/mcp/contributor
https://compassionate-swordfish-378.eu-west-1.convex.site/.well-known/oauth-protected-resource/mcp/operator
```

In Clerk development settings:

1. Configure the shared public client ID stored in `CLERK_MCP_OAUTH_CLIENT_ID`.
2. Enable Authorization Code + PKCE with `S256`.
3. Keep Dynamic Client Registration disabled.
4. Do not create or distribute a client secret.
5. Start authentication from Codex desktop for each plugin and register the
   exact callback URI shown by the OAuth flow. Callback matching is exact; do
   not use a wildcard.

Authenticate the contributor plugin first and verify a harmless read such as
`causes_list_discoverable`. Authenticate the operator plugin with the same
Clerk account and verify `causes_list_managed`. The same account may use both
connections, but their tool catalogs must remain disjoint and backend
membership remains authoritative.

If the hosted deployment's site URL or public OAuth client changes, update the
private deployment separately, run the synchronization command above, reinstall
the plugins, and begin a new conversation.

## Skill behavior

Contributor skills guide discovery, consent-gated leasing and artifact
submission, bounded execution, progress, approval checkpoints, failure, and
history inspection. Operator skills guide lifecycle ordering, schema retrieval,
workflow authoring, dependency checks, publication, artifact validation, and
`allowedActions`.

The operator artifact-validation skill uses this dedicated tool set:

```text
artifacts_list_pending_validation
artifact_get_for_validation
artifact_validation_start
artifact_validation_submit_result
artifact_validation_cancel
artifact_validation_prepare_decision
operator_consent_resolve
artifact_validation_decide
```

It lists content-free summaries before retrieving one artifact, treats only the
pinned validation task as trusted instructions, and follows backend-derived
actions for advisory, human-confirmation, automatic, and schema-only workflows.
The host must show the exact proposed final decision and rationale to the
operator before reporting consent and calling the decision tool. Authentication
supplies the user and stable executor identities; plugin prompts and tool calls
must not invent them.

An explicit user goal authorizes ordinary lifecycle mutations. The contributor
skills still present the exact lease and artifact proposals before recording
the user’s consent, and destructive or materially different operations require
confirmation. Consent records are auditable evidence, not cryptographic proof
that a host displayed a consent interface.
