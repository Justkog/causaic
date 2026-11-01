# Causaic agent plugins

This repository contains the public Causaic contributor and operator plugins
for Codex, Claude Code, and hosts supporting portable Agent Plugins v1 packages.
Both plugins target the production Causaic MCP
deployment through OAuth protected-resource and authorization-server discovery.
Hermes package installation and component discovery are tested; authenticated
Hermes use has the limitation described below.

## Install from GitHub

In Hermes CLI:

```bash
hermes plugins install 'Justkog/causaic#plugins/causaic-contributor'
hermes plugins install 'Justkog/causaic#plugins/causaic-operator'
hermes plugins enable causaic-contributor
hermes plugins enable causaic-operator
hermes plugins list --no-bundled
```

Portable packages install disabled. Installation and enablement do not authorize
a Causaic account. Disable either package independently with
`hermes plugins disable <plugin-name>`; re-enable with the corresponding enable
command. Start a new session after changing plugin state.

In Codex:

```bash
codex plugin marketplace add Justkog/causaic
codex plugin add causaic-contributor@causaic
codex plugin add causaic-operator@causaic
```

In Claude Code:

```text
/plugin marketplace add Justkog/causaic
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

### Hermes authentication limitation

Hermes **v0.22.5** loads the packages' Streamable HTTP connections, but its
portable adapter does not enable OAuth for them. The
`hermes mcp login causaic-contributor` command returns
`Server 'causaic-contributor' not found in config.` because it only looks at
native `config.yaml` servers. The same restriction applies to operator.

There is no verified plugin-only authentication procedure for this version.
Authenticated Hermes tool discovery and Causaic operations remain unverified.
Adding a native server with `hermes mcp add` overrides the bundled connection;
it does not establish support for plugin-provided authentication. Do not add
tokens or OAuth client settings to the packages.

### Contributor consent

OAuth consent does not approve contribution start, artifact submission, or
consequential operator actions. Each proposal requires the user's actual
decision. Declining or cancelling a proposal must not perform the proposed action.

Live contributor execution, fallback interaction replay, and attachments remain
unverified in Hermes.

For package checks, compatibility records, and release procedures, see
[Plugin validation and maintenance](plugin-validation.md).
