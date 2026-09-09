#!/usr/bin/env node

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const productionMode = process.argv.includes('--prod');
const pluginSuffix = productionMode ? '' : '-dev';
const contributorPluginName = `causaic-contributor${pluginSuffix}`;
const operatorPluginName = `causaic-operator${pluginSuffix}`;
const writeMode = process.argv.includes('--write');
const contributorConfigPath = path.join(
  repositoryRoot,
  `plugins/${contributorPluginName}/.mcp.json`,
);
const operatorConfigPath = path.join(
  repositoryRoot,
  `plugins/${operatorPluginName}/.mcp.json`,
);
const contributorCodexManifestPath = path.join(
  repositoryRoot,
  `plugins/${contributorPluginName}/.codex-plugin/plugin.json`,
);
const operatorCodexManifestPath = path.join(
  repositoryRoot,
  `plugins/${operatorPluginName}/.codex-plugin/plugin.json`,
);
const contributorClaudeConfigPath = path.join(
  repositoryRoot,
  `plugins/${contributorPluginName}/.claude-plugin/mcp.json`,
);
const operatorClaudeConfigPath = path.join(
  repositoryRoot,
  `plugins/${operatorPluginName}/.claude-plugin/mcp.json`,
);
const skillRoots = [
  path.join(repositoryRoot, `plugins/${contributorPluginName}/skills`),
  path.join(repositoryRoot, `plugins/${operatorPluginName}/skills`),
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

function expectedServers(siteUrl) {
  const contributorUrl = `${siteUrl}/mcp/contributor`;
  const operatorUrl = `${siteUrl}/mcp/operator`;
  return {
    contributor: {
      type: 'http',
      url: contributorUrl,
    },
    operator: {
      type: 'http',
      url: operatorUrl,
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

function expectedHostConfigs(siteUrl) {
  const servers = expectedServers(siteUrl);
  return {
    contributor: {
      shared: expectedSharedConfig(contributorPluginName, servers.contributor),
      codex: servers.contributor,
      claude: expectedClaudeConfig(contributorPluginName, servers.contributor),
    },
    operator: {
      shared: expectedSharedConfig(operatorPluginName, servers.operator),
      codex: servers.operator,
      claude: expectedClaudeConfig(operatorPluginName, servers.operator),
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
const checkedInSiteUrl = contributorCodexManifest?.mcpServers?.[
  contributorPluginName
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
const configs = expectedHostConfigs(siteUrl);
const contributor = configs.contributor.shared;
const operator = configs.operator.shared;
const contributorCodex = expectedCodexManifest(
  contributorCodexManifest,
  contributorPluginName,
  configs.contributor.codex,
);
const operatorCodex = expectedCodexManifest(
  operatorCodexManifest,
  operatorPluginName,
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
  console.log(
    `Updated Causaic ${productionMode ? 'production' : 'development'} plugin URLs for ${siteUrl}`,
  );
} else {
  assertServer(
    contributorConfig,
    configs.contributor.shared.mcpServers[contributorPluginName],
    contributorPluginName,
  );
  assertServer(
    operatorConfig,
    configs.operator.shared.mcpServers[operatorPluginName],
    operatorPluginName,
  );
  assertServer(
    contributorCodexManifest,
    configs.contributor.codex,
    contributorPluginName,
  );
  assertServer(
    operatorCodexManifest,
    configs.operator.codex,
    operatorPluginName,
  );
  assertServer(
    contributorClaudeConfig,
    configs.contributor.claude.mcpServers[contributorPluginName],
    contributorPluginName,
  );
  assertServer(
    operatorClaudeConfig,
    configs.operator.claude.mcpServers[operatorPluginName],
    operatorPluginName,
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
  console.log(
    `Causaic ${productionMode ? 'production' : 'development'} plugin URLs match ${siteUrl}`,
  );
}
