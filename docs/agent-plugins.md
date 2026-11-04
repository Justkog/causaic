# Connect Causaic to your host

This guide covers Causaic plugin installation and direct MCP connections. A host
is the application you use with Causaic, such as Codex, Claude Code, Hermes, or
Grok Bot. All connections here target the production Causaic MCP deployment.

## Choose your role

| Role        | Use it to                                       | Plugin                |
| ----------- | ----------------------------------------------- | --------------------- |
| Contributor | Discover opportunities and submit contributions | `causaic-contributor` |
| Operator    | Manage causes, work, and contributed artifacts  | `causaic-operator`    |

Install only the plugin you need, or both if you use both roles. The setup
sections identify which roles have documented instructions for each host.

## Set up your host

If installation or authentication is unavailable or fails, stop and report the
blocked step.

Plugin installation does not authorize your Causaic account. Complete the host's
Causaic sign-in and browser authorization when prompted. The user must complete
authorization themselves; no client secret or access token needs to be pasted
into a connector.

After installing, updating, enabling, or disabling a plugin, open a new
conversation or session so the host reloads its cached plugins. Once authorized,
follow [Verify your connection and understand consent](#verify-your-connection-and-understand-consent).

### Codex

In your terminal, add the marketplace, then install the plugin for your role
(or both):

```bash
codex plugin marketplace add Justkog/causaic
codex plugin add causaic-contributor@causaic
codex plugin add causaic-operator@causaic
```

Complete Codex's Causaic authentication flow. To force dynamic client
registration (DCR) for an existing installation, run the command for your role:

```bash
codex mcp login causaic-contributor --oauth-client-registration dcr
codex mcp login causaic-operator --oauth-client-registration dcr
```

### Claude Code

Inside Claude Code, add the marketplace, then install the plugin for your role
(or both):

```text
/plugin marketplace add Justkog/causaic
/plugin install causaic-contributor@causaic
/plugin install causaic-operator@causaic
```

Complete Claude Code's Causaic authentication flow when prompted.

### Hermes

In your terminal, install and enable the plugin for your role. For contributor:

```bash
hermes plugins install 'Justkog/causaic#plugins/causaic-contributor'
hermes plugins enable causaic-contributor
```

For operator:

```bash
hermes plugins install 'Justkog/causaic#plugins/causaic-operator'
hermes plugins enable causaic-operator
```

List installed packages with:

```bash
hermes plugins list --no-bundled
```

Portable packages install disabled. Disable either package independently with
`hermes plugins disable <plugin-name>`; re-enable it with the corresponding
enable command.

#### Hermes authentication limitation

Hermes **v0.22.5** installs and discovers both packages and their Streamable HTTP
connections, but its portable adapter does not enable OAuth. Without a native
connection, `hermes mcp login causaic-contributor` returns
`Server 'causaic-contributor' not found in config.` because it only looks at
native `config.yaml` servers. The same restriction applies to operator.

Add a separate native OAuth MCP connection for your role. For contributor:

```bash
hermes mcp add causaic-contributor --url https://befitting-chickadee-185.convex.site/mcp/contributor --auth oauth
```

Then have the user run this command in their own terminal and complete Causaic
sign-in and browser authorization:

```bash
hermes mcp login causaic-contributor
```

For operator, add the connection and have the user complete login in their terminal:

```bash
hermes mcp add causaic-operator --url https://befitting-chickadee-185.convex.site/mcp/operator --auth oauth
hermes mcp login causaic-operator
```

If `hermes mcp add` itself prompts for authorization, the user completes that
step too. Native connections with the same server names take precedence over
the bundled connections; the plugins still provide their skills. Start a new
Hermes session after authorization.

This bypasses the portable adapter's OAuth limitation. Live contributor
execution, fallback interaction replay, and attachments remain unverified in
Hermes.

### OpenClaw

Contributor setup uses a plugin bundle. Follow the OpenClaw section of the
[website installation guide](https://causaic.org/docs/install.md#openclaw), including
its bundle inspection step. Operator setup is not documented here.

### OpenCode

Contributor setup uses plugin configuration in `opencode.json`. Follow the
OpenCode section of the [website installation guide](https://causaic.org/docs/install.md#opencode).
Operator setup is not documented here.

### OpenAI Dot

Dot uses supported plugins installed and enabled for your account. A Causaic
installation path for Dot has not been verified. Installing Causaic through Codex
does not establish availability in Dot, and this guide does not claim a Causaic
listing in Dot's plugin directory.

See the [official OpenAI Dot plugin guidance](https://learn.chatgpt.com/docs/dots/computers-and-apps#connect-apps).
Use another documented host if no Causaic installation path is available.

### Claude Duet

This experimental contributor route has not been tested with Causaic. Duet
inherits connected apps and skills from your Claude account; it does not use
Claude Code's installation commands. Operator setup is not documented here.

1. In your Claude account, open **Customize > Connectors** and add a custom remote
   MCP connector named **Causaic** using this URL:

   ```text
   https://befitting-chickadee-185.convex.site/mcp/contributor
   ```

2. Choose OAuth authentication and **Register automatically** where offered, then
   complete the Causaic sign-in flow.
3. Follow [Skills for direct MCP connections](#skills-for-direct-mcp-connections).
4. Follow [Verify your connection](#verify-your-connection-and-understand-consent).

See [Claude custom connector guidance](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
and the [Claude Duet overview](https://claude.com/resources/articles/claude-duet).

### Grok Bot

This experimental contributor route has not been tested with Causaic. Operator
setup is not documented here.

1. Ask Grok Bot to add this URL as a remote MCP server:

   ```text
   https://befitting-chickadee-185.convex.site/mcp/contributor
   ```

2. Complete the offered Causaic authentication flow.
3. Follow [Skills for direct MCP connections](#skills-for-direct-mcp-connections).
4. Follow [Verify your connection](#verify-your-connection-and-understand-consent).

See the [official Grok Bot connection guidance](https://docs.x.ai/grok-bot/computer-and-apps#connect-an-app).

### Meta Muse

No user-configurable Causaic connection procedure has been established for the Meta
Muse personal agent. Muse Code instructions do not establish compatibility with
Meta Muse.

See [Meta Muse connector guidance](https://platform.muse.ai/docs). Choose another
documented host for an existing installation guide.

## Verify your connection and understand consent

After successful account authorization, verify read-only access for your role:

| Role        | Ask your host                                  | MCP tool                   |
| ----------- | ---------------------------------------------- | -------------------------- |
| Contributor | “List the public causes available on Causaic.” | `causes_list_discoverable` |
| Operator    | “List the causes I manage on Causaic.”         | `causes_list_managed`      |

If using both roles, authenticate the contributor plugin first, then authenticate
the operator plugin with the same Clerk account and verify each separately.
Successfully connecting tools does not establish full contribution compatibility.

OAuth account authorization does not approve contribution start, artifact
submission, or consequential operator actions. Each proposal requires the user's
actual decision. Declining or cancelling a proposal must not perform the proposed
action.

### Skills for direct MCP connections

Adding an MCP connection does not automatically install a Causaic plugin or its
skills. For the direct contributor routes above, review the
[Causaic contributor skills](https://github.com/Justkog/causaic/tree/main/plugins/causaic-contributor/skills)
at `plugins/causaic-contributor/skills` as workflow instructions. Installing or
importing skills depends on the host; it is not automatic.

## Technical reference

### MCP endpoints

| Role        | Production endpoint                                           |
| ----------- | ------------------------------------------------------------- |
| Contributor | `https://befitting-chickadee-185.convex.site/mcp/contributor` |
| Operator    | `https://befitting-chickadee-185.convex.site/mcp/operator`    |

### OAuth

The plugins use URL-only MCP definitions. The host discovers the protected
resource and Clerk authorization-server metadata, registers its own public
OAuth client through Clerk DCR, and authenticates with Authorization Code +
PKCE S256. No client ID, client secret, callback registration, or access token
belongs in this repository. Do not add tokens or OAuth client settings to the
packages to work around a host limitation.

For package checks, compatibility records, and release procedures, see
[Plugin validation and maintenance](plugin-validation.md).
