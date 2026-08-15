#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const writeMode = process.argv.includes('--write');
const contributorConfigPath = path.join(
  repositoryRoot,
  'plugins/causaic-contributor-dev/.mcp.json',
);
const operatorConfigPath = path.join(
  repositoryRoot,
  'plugins/causaic-operator-dev/.mcp.json',
);
const contributorCodexManifestPath = path.join(
  repositoryRoot,
  'plugins/causaic-contributor-dev/.codex-plugin/plugin.json',
);
const operatorCodexManifestPath = path.join(
  repositoryRoot,
  'plugins/causaic-operator-dev/.codex-plugin/plugin.json',
);
const contributorClaudeConfigPath = path.join(
  repositoryRoot,
  'plugins/causaic-contributor-dev/.claude-plugin/mcp.json',
);
const operatorClaudeConfigPath = path.join(
  repositoryRoot,
  'plugins/causaic-operator-dev/.claude-plugin/mcp.json',
);
const skillRoots = [
  path.join(repositoryRoot, 'plugins/causaic-contributor-dev/skills'),
  path.join(repositoryRoot, 'plugins/causaic-operator-dev/skills'),
];

function normalizedSiteUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.convex.site')) {
    throw new Error('CONVEX_SITE_URL must be an https Convex site URL');
  }
  return url.toString().replace(/\/$/u, '');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function expectedServers(siteUrl, clientId) {
  const contributorUrl = `${siteUrl}/mcp/contributor`;
  const operatorUrl = `${siteUrl}/mcp/operator`;
  return {
    shared: {
      contributor: {
        type: 'http',
        url: contributorUrl,
      },
      operator: {
        type: 'http',
        url: operatorUrl,
      },
    },
    codex: {
      contributor: {
        type: 'http',
        url: contributorUrl,
        oauth_resource: contributorUrl,
        oauth_client_id: clientId,
      },
      operator: {
        type: 'http',
        url: operatorUrl,
        oauth_resource: operatorUrl,
        oauth_client_id: clientId,
      },
    },
    claude: {
      contributor: {
        type: 'http',
        url: contributorUrl,
        oauth: { clientId },
      },
      operator: {
        type: 'http',
        url: operatorUrl,
        oauth: { clientId },
      },
    },
  };
}

function expectedCodexManifest(manifest, serverName, server) {
  return {
    ...manifest,
    mcpServers: { [serverName]: server },
  };
}

function expectedClaudeConfig(serverName, server) {
  return {
    mcpServers: { [serverName]: server },
  };
}

function expectedSharedConfig(serverName, server) {
  return {
    mcpServers: { [serverName]: server },
  };
}

/*
 * Host-specific OAuth fields stay in the host adapter. The shared connector
 * only carries the HTTP URL so hosts can perform their own standards-based
 * discovery.
 */
function expectedHostConfigs(siteUrl, clientId) {
  const servers = expectedServers(siteUrl, clientId);
  return {
    contributor: {
      shared: expectedSharedConfig(
        'causaic-contributor-dev',
        servers.shared.contributor,
      ),
      codex: servers.codex.contributor,
      claude: expectedClaudeConfig(
        'causaic-contributor-dev',
        servers.claude.contributor,
      ),
    },
    operator: {
      shared: expectedSharedConfig(
        'causaic-operator-dev',
        servers.shared.operator,
      ),
      codex: servers.codex.operator,
      claude: expectedClaudeConfig(
        'causaic-operator-dev',
        servers.claude.operator,
      ),
    },
  };
}

function assertServer(config, expected, label) {
  const actual = config?.mcpServers?.[label];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} connector is out of sync`);
  }
}

const contributorConfig = await readJson(contributorConfigPath);
const operatorConfig = await readJson(operatorConfigPath);
const contributorCodexManifest = await readJson(contributorCodexManifestPath);
const operatorCodexManifest = await readJson(operatorCodexManifestPath);
const contributorClaudeConfig = await readJson(contributorClaudeConfigPath);
const operatorClaudeConfig = await readJson(operatorClaudeConfigPath);
const checkedInClientId =
  contributorCodexManifest?.mcpServers?.['causaic-contributor-dev']
    ?.oauth_client_id;
const checkedInSiteUrl = contributorCodexManifest?.mcpServers?.[
  'causaic-contributor-dev'
]?.url?.replace(/\/mcp\/contributor$/u, '');
const rawSiteUrl = process.env.CONVEX_SITE_URL ?? checkedInSiteUrl;
if (!rawSiteUrl) {
  throw new Error(
    'CONVEX_SITE_URL is required when no checked-in plugin endpoint exists',
  );
}
if (writeMode && process.env.CONVEX_SITE_URL === undefined) {
  throw new Error('CONVEX_SITE_URL is required when writing plugin endpoints');
}
const siteUrl = normalizedSiteUrl(rawSiteUrl);
const clientId = process.env.CLERK_MCP_OAUTH_CLIENT_ID ?? checkedInClientId;
if (!clientId)
  throw new Error(
    'CLERK_MCP_OAUTH_CLIENT_ID is required when no client ID is checked in',
  );

const configs = expectedHostConfigs(siteUrl, clientId);
const contributor = configs.contributor.shared;
const operator = configs.operator.shared;
const contributorCodex = expectedCodexManifest(
  contributorCodexManifest,
  'causaic-contributor-dev',
  configs.contributor.codex,
);
const operatorCodex = expectedCodexManifest(
  operatorCodexManifest,
  'causaic-operator-dev',
  configs.operator.codex,
);
const contributorClaude = configs.contributor.claude;
const operatorClaude = configs.operator.claude;

if (writeMode) {
  await writeFile(
    contributorConfigPath,
    `${JSON.stringify(contributor, null, 2)}\n`,
  );
  await writeFile(operatorConfigPath, `${JSON.stringify(operator, null, 2)}\n`);
  await writeFile(
    contributorCodexManifestPath,
    `${JSON.stringify(contributorCodex, null, 2)}\n`,
  );
  await writeFile(
    operatorCodexManifestPath,
    `${JSON.stringify(operatorCodex, null, 2)}\n`,
  );
  await writeFile(
    contributorClaudeConfigPath,
    `${JSON.stringify(contributorClaude, null, 2)}\n`,
  );
  await writeFile(
    operatorClaudeConfigPath,
    `${JSON.stringify(operatorClaude, null, 2)}\n`,
  );
  for (const root of skillRoots) {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const yamlPath = path.join(root, entry.name, 'agents/openai.yaml');
      const contents = await readFile(yamlPath, 'utf8');
      const updated = contents.replace(
        /url:\s+(['"])https:\/\/[^'"]+\/mcp\/(contributor|operator)\1/gu,
        (_, quote, endpoint) =>
          'url: ' + quote + siteUrl + '/mcp/' + endpoint + quote,
      );
      if (updated !== contents) await writeFile(yamlPath, updated);
    }
  }
  console.log(`Updated Causaic dev plugin URLs for ${siteUrl}`);
} else {
  assertServer(
    contributorConfig,
    configs.contributor.shared.mcpServers['causaic-contributor-dev'],
    'causaic-contributor-dev',
  );
  assertServer(
    operatorConfig,
    configs.operator.shared.mcpServers['causaic-operator-dev'],
    'causaic-operator-dev',
  );
  assertServer(
    contributorCodexManifest,
    configs.contributor.codex,
    'causaic-contributor-dev',
  );
  assertServer(
    operatorCodexManifest,
    configs.operator.codex,
    'causaic-operator-dev',
  );
  assertServer(
    contributorClaudeConfig,
    configs.contributor.claude.mcpServers['causaic-contributor-dev'],
    'causaic-contributor-dev',
  );
  assertServer(
    operatorClaudeConfig,
    configs.operator.claude.mcpServers['causaic-operator-dev'],
    'causaic-operator-dev',
  );
  for (const root of skillRoots) {
    const entries = await readdir(root, { withFileTypes: true });
    const endpoint = root.includes('contributor') ? 'contributor' : 'operator';
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const yamlPath = path.join(root, entry.name, 'agents/openai.yaml');
      const contents = await readFile(yamlPath, 'utf8');
      if (
        !contents.includes(`url: "${siteUrl}/mcp/${endpoint}"`) &&
        !contents.includes(`url: '${siteUrl}/mcp/${endpoint}'`)
      ) {
        throw new Error(`${yamlPath} is out of sync`);
      }
    }
  }
  console.log(`Causaic dev plugin URLs match ${siteUrl}`);
}
