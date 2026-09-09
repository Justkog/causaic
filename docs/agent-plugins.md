# Causaic agent plugins

This repository contains the public Causaic contributor and operator plugins
for Codex and Claude Code. Both plugins connect to the production Causaic MCP
deployment through OAuth protected-resource and authorization-server discovery.

## Install from GitHub

In Codex:

```bash
codex plugin marketplace add causaic/causaic
codex plugin add causaic-contributor@causaic
codex plugin add causaic-operator@causaic
```

In Claude Code:

```text
/plugin marketplace add causaic/causaic
/plugin install causaic-contributor@causaic
/plugin install causaic-operator@causaic
```

Open a new conversation after installation or after updating a plugin because
host plugin installations are cached.

## Authentication

The plugins use URL-only MCP definitions. The host discovers the protected
resource and Clerk authorization-server metadata, registers its own public
OAuth client through Clerk DCR, and authenticates with Authorization Code +
PKCE S256. No client ID, client secret, callback registration, or access token
belongs in this repository.

The public MCP resources are:

```text
https://befitting-chickadee-185.convex.site/mcp/contributor
https://befitting-chickadee-185.convex.site/mcp/operator
```

Codex can force DCR for an existing installation with:

```bash
codex mcp login causaic-contributor --oauth-client-registration dcr
codex mcp login causaic-operator --oauth-client-registration dcr
```

Authenticate the contributor plugin first and verify a harmless read such as
`causes_list_discoverable`. Authenticate the operator plugin with the same
Clerk account and verify `causes_list_managed`.

## Public plugin checks

From the repository root:

```bash
pnpm plugins:check
```

The check validates both marketplace manifests, the two self-contained plugin
bundles, production MCP URLs, and URL-only OAuth configuration.
