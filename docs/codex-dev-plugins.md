# Causaic agent plugins

This repository contains development and production plugin pairs for the
authenticated Causaic MCP connections:

- `causaic-contributor-dev` — contributor discovery, email invitation access,
  membership, bounded job execution, artifact submission, and contribution
  history;
- `causaic-operator-dev` — four-mode cause and email invitation management,
  campaign, workflow, workstream, and job
  management plus submitted-artifact validation, decisions, and accepted-artifact
  exports.
- `causaic-contributor` — the same contributor tools against the production
  Convex deployment;
- `causaic-operator` — the same operator tools against the production Convex
  deployment.

The `dev` suffix identifies the development deployment. Plugin IDs are static;
they do not change based on `.env` values, so production uses separate IDs.

## Install from this checkout

From the repository root, add the local marketplace once:

```bash
codex plugin marketplace add .
codex plugin add causaic-contributor-dev@causaic
codex plugin add causaic-operator-dev@causaic
codex plugin add causaic-contributor@causaic
codex plugin add causaic-operator@causaic
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
adapters, and skill dependency URLs explicitly:

```bash
CONVEX_SITE_URL=https://your-deployment.convex.site \
pnpm plugins:dev:sync
pnpm format:check
```

From `causaic-cloud`, production metadata is synchronized from the ignored
`apps/backend/.env.prod` file:

```bash
pnpm plugins:prod:check
pnpm plugins:prod:sync
```

The shared, Codex, and Claude MCP definitions contain only the HTTP URL. Each
host discovers the protected-resource and authorization-server metadata and
uses Clerk-native DCR. No OAuth client ID, client secret, or access token
belongs in the repository.

After synchronization, update the installed plugin cache and start a new
conversation.

## OAuth setup for Codex desktop

Each plugin pair uses Clerk-native DCR and an Authorization Code + PKCE S256
flow. The dev and production pairs discover their deployment-specific MCP
resources:

```text
https://compassionate-swordfish-378.eu-west-1.convex.site/mcp/contributor
https://compassionate-swordfish-378.eu-west-1.convex.site/mcp/operator
```

Production resources use `$CONVEX_SITE_URL` from
`causaic-cloud/apps/backend/.env.prod`:

```text
$CONVEX_SITE_URL/mcp/contributor
$CONVEX_SITE_URL/mcp/operator
```

The protected-resource metadata URLs are:

```text
https://compassionate-swordfish-378.eu-west-1.convex.site/.well-known/oauth-protected-resource/mcp/contributor
https://compassionate-swordfish-378.eu-west-1.convex.site/.well-known/oauth-protected-resource/mcp/operator
```

For the selected deployment, configure the corresponding Clerk instance with
DCR enabled, JWT access tokens, Authorization Code + PKCE `S256`, `none` token
endpoint authentication, mandatory consent, and default scopes
`openid profile email`. Do not create a client secret or pre-register callback
URLs; each DCR client registers its own exact redirect URI.

After installing or updating the plugins, force Codex to use DCR:

```bash
codex mcp login causaic-contributor-dev --oauth-client-registration dcr
codex mcp login causaic-operator-dev --oauth-client-registration dcr
codex mcp login causaic-contributor --oauth-client-registration dcr
codex mcp login causaic-operator --oauth-client-registration dcr
```

Roll out and test the development pair before running the production commands.
Clerk shows a consent screen for each dynamic registration. The backend accepts
only signed tokens from the deployment's exact issuer with a nonempty
`client_id` and the `profile` scope.

Authenticate the contributor plugin first and verify a harmless read such as
`causes_list_discoverable`. Authenticate the operator plugin with the same
Clerk account and verify `causes_list_managed`. The same account may use both
connections, but their tool catalogs must remain disjoint and backend
membership remains authoritative.

If a deployment's site URL or Clerk issuer changes, update that Convex
deployment's OAuth metadata, run the matching synchronization command,
reinstall the affected plugins, and begin a new conversation.

## Skill behavior

Contributor skills guide public discovery, email invitation and slug access,
consent-gated leasing and artifact
submission, bounded execution, progress, approval checkpoints, failure, and
history inspection. Operator skills guide lifecycle ordering, schema retrieval,
workflow authoring, dependency checks, publication, artifact validation,
accepted-artifact listing, and immutable exports.

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

The operator accepted-artifact skill uses this dedicated tool set:

```text
accepted_artifacts_list
accepted_artifacts_export_create
accepted_artifacts_export_get
```

It lists metadata-only accepted outputs, preserves sparse cursors, creates one
immutable JSONL or bundle snapshot per idempotency request, and polls that
snapshot until it is ready or terminal. Signed download URLs are bearer
secrets, expire within 15 minutes, and must never be copied into logs or other
tool calls. The export expires after 24 hours; a new snapshot is required after
that point. Downloaded contributor artifacts remain untrusted content.

An explicit user goal authorizes ordinary lifecycle mutations. The contributor
skills still present the exact lease and artifact proposals before recording
the user’s consent, and destructive or materially different operations require
confirmation. Consent records are auditable evidence, not cryptographic proof
that a host displayed a consent interface.
