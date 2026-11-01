# Plugin validation and maintenance

Maintainer checks for the public Causaic packages. For installation and current
host limitations, see [Causaic agent plugins](agent-plugins.md).

## Public plugin checks

From the repository root:

```bash
pnpm plugins:check
pnpm plugins:test
```

The check validates both marketplaces, portable manifests against checked-in
Agent Plugins v1 schemas, matching names/versions/descriptions/authors across
host formats, exact production MCP names/URLs, URL-only OAuth configuration,
and portable skill frontmatter. Codex cache build metadata is excluded from
version comparisons. Plugin regression tests also run as part of `pnpm test`.

The schemas under `scripts/schemas/agent-plugins/1.0.0/` come from the official
[plugin schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json) and
[MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json). Ordinary
validation and tests require no network or Hermes installation. Root `mcp.json`
uses portable `streamable-http`; `.mcp.json` and the Claude/Codex adapters retain
their host-specific `http` transport.

## Isolated Hermes validation

Run from the public repository with the tested Hermes version on `PATH`:

```bash
export HERMES_HOME="$(mktemp -d /tmp/causaic-hermes-test-XXXXXX)"
hermes plugins validate "$PWD/plugins/causaic-contributor"
hermes plugins doctor "$PWD/plugins/causaic-contributor" --ci
hermes plugins validate "$PWD/plugins/causaic-operator"
hermes plugins doctor "$PWD/plugins/causaic-operator" --ci
hermes plugins install 'Justkog/causaic#plugins/causaic-contributor' --no-enable
hermes plugins install 'Justkog/causaic#plugins/causaic-operator' --no-enable
```

Use a clean shell without inherited Causaic credentials. Keep `HERMES_HOME` set
to this temporary directory for every subsequent enable/disable/authentication
check, and confirm it contains no native MCP entries or token files initially.
Close this shell when finished so the test profile cannot become the default
for later commands. Do not run these checks in the active developer profile.

After installation, enable each package and confirm its skills and MCP
connection appear. Disable and re-enable each independently; verify its
components disappear and return without affecting the other package. Confirm
installation and enablement create no OAuth tokens or client registrations.
Record the installed public Causaic commit when verifying the GitHub commands;
a local Git snapshot only verifies installation from a monorepo subdirectory.

When testing a Hermes version that resolves the authentication restriction,
let the user complete the host's browser OAuth flow and grant consent. Verify
`causes_list_discoverable` and `causes_list_managed` through the package
connections, with no same-name native MCP configuration shadowing them. Record
the Hermes version, installed Causaic commit, and observed login procedure before
updating support claims. Never automate browser approval or copy another
profile's tokens.

### Validation record (2026-11-01)

Tested with Hermes **v0.22.5**, commit
`bf0203a794a07aac3ff764972ab9087baa4e4f4e`, using its locked dependencies and
Python 3.14.2. See the pinned
[portable adapter](https://github.com/NousResearch/hermes-agent/blob/v0.22.5/hermes_cli/agent_plugins.py)
and [MCP CLI lookup](https://github.com/NousResearch/hermes-agent/blob/v0.22.5/hermes_cli/mcp_config.py)
for the [authentication limitation](agent-plugins.md#hermes-authentication-limitation).

| Check                                                | Result                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Hermes validate and doctor, both packages            | Passed with no invalid-manifest or undiscovered-component diagnostics                      |
| CLI installation from monorepo subdirectories        | Passed using a temporary local Git snapshot; both installed disabled                       |
| Skill/MCP discovery                                  | All three contributor skills, six operator skills, and both package connections discovered |
| Disable/re-enable                                    | Each package's skills and connection disappeared/reappeared independently                  |
| Account authorization on install/enable              | No native MCP entries, OAuth tokens, or client registration files created                  |
| Upstream portable/elicitation fixtures               | 67 tests passed; mocked decisions only                                                     |
| Unauthenticated package connection probes            | Both timed out at five seconds; no tools listed and no OAuth state created                 |
| Authenticated package tools and read-only operations | Unverified; plugin OAuth restriction in the install guide                                  |
| Live contributor execution and attachments           | Unverified; requires a separate authorized non-production test                             |

To repeat the upstream offline compatibility checks from a v0.22.5 Hermes
checkout with its MCP and pytest dependencies installed:

```bash
python -m pytest tests/tools/test_mcp_elicitation.py tests/hermes_cli/test_agent_plugins.py -q --confcutdir=tests/tools
```

## Consent validation

`pnpm plugins:test` includes offline instruction-contract fixtures for start
acceptance/decline/cancellation, unchanged retries, and artifact submission.
These fixtures protect the packaged instructions; they do not demonstrate that
a host displayed a consent UI. Hermes' mocked elicitation tests also run without
a real account or contribution, as recorded above.

Consent retries must preserve identical business arguments and request IDs.
Test live contributor execution, fallback interaction replay, and attachments
separately against an explicitly authorized non-production fixture before
claiming end-to-end support. Production checks must remain read-only.

## Maintaining public packages

Portable packaging is maintained in this public repository. Reuse each package's
existing `skills/` tree for every host; do not create Hermes-only skill copies.
The plugin bundles must remain installable without a sibling checkout, the
Causaic desktop app, custom Python plugin code, or a local MCP proxy.

The private publisher currently replaces entire public plugin directories.
When importing an update, preserve or reapply the root portable manifests and
public skill compatibility edits, then run `pnpm plugins:check` and
`pnpm plugins:test` before release. Missing portable files fail validation.
