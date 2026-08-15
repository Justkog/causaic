#!/usr/bin/env node

import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const pluginRoot = path.join(repositoryRoot, 'plugins');
const marketplacePaths = {
  codex: path.join(repositoryRoot, '.agents/plugins/marketplace.json'),
  claude: path.join(repositoryRoot, '.claude-plugin/marketplace.json'),
};
const allowedPluginSets = [
  new Set(['causaic-contributor-dev', 'causaic-operator-dev']),
  new Set(['causaic-contributor', 'causaic-operator']),
];

function fail(message) {
  throw new Error(message);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    fail(
      `${path.relative(repositoryRoot, filePath)} is not valid JSON: ${error}`,
    );
  }
}

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function sourcePath(entry, host) {
  const source = entry?.source;
  if (host === 'codex') {
    if (source?.source !== 'local' || typeof source.path !== 'string') {
      fail(
        `Codex entry ${entry?.name ?? '<unnamed>'} must use a local source path`,
      );
    }
    return source.path;
  }
  if (typeof source !== 'string') {
    fail(
      `Claude entry ${entry?.name ?? '<unnamed>'} must use a relative source path`,
    );
  }
  return source;
}

function collectEntries(marketplace, host) {
  assertObject(marketplace, `${host} marketplace`);
  if (marketplace.name !== 'causaic') {
    fail(`${host} marketplace name must be causaic`);
  }
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    fail(`${host} marketplace must list at least one plugin`);
  }

  const entries = new Map();
  for (const entry of marketplace.plugins) {
    assertObject(entry, `${host} marketplace plugin entry`);
    if (typeof entry.name !== 'string' || !entry.name) {
      fail(`${host} marketplace plugin entries require a name`);
    }
    if (entries.has(entry.name)) {
      fail(`${host} marketplace lists ${entry.name} more than once`);
    }
    const source = sourcePath(entry, host);
    if (source !== `./plugins/${entry.name}`) {
      fail(`${host} source for ${entry.name} must be ./plugins/${entry.name}`);
    }
    entries.set(entry.name, source);
  }
  return entries;
}

async function assertNoSymlinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const metadata = await lstat(entryPath);
    if (metadata.isSymbolicLink()) {
      fail(
        `plugin contains an external symlink: ${path.relative(repositoryRoot, entryPath)}`,
      );
    }
    if (entry.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

async function validatePlugin(name, source) {
  const resolved = path.resolve(repositoryRoot, source);
  const relativeToPlugins = path.relative(pluginRoot, resolved);
  if (
    !relativeToPlugins ||
    relativeToPlugins.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToPlugins)
  ) {
    fail(`plugin source for ${name} escapes the plugins directory`);
  }

  const codexManifestPath = path.join(resolved, '.codex-plugin/plugin.json');
  const claudeManifestPath = path.join(resolved, '.claude-plugin/plugin.json');
  const sharedMcpPath = path.join(resolved, '.mcp.json');
  const claudeMcpPath = path.join(resolved, '.claude-plugin/mcp.json');
  for (const requiredPath of [
    codexManifestPath,
    claudeManifestPath,
    sharedMcpPath,
    claudeMcpPath,
    path.join(resolved, 'skills'),
  ]) {
    try {
      await lstat(requiredPath);
    } catch {
      fail(`${name} is missing ${path.relative(repositoryRoot, requiredPath)}`);
    }
  }

  const codexManifest = await readJson(codexManifestPath);
  const claudeManifest = await readJson(claudeManifestPath);
  if (codexManifest.name !== name || claudeManifest.name !== name) {
    fail(`${name} host manifests must use the marketplace plugin name`);
  }
  if (
    typeof codexManifest.mcpServers !== 'object' ||
    codexManifest.mcpServers === null ||
    Array.isArray(codexManifest.mcpServers)
  ) {
    fail(`${name} Codex manifest must contain its host MCP adapter`);
  }
  if (claudeManifest.mcpServers !== './.claude-plugin/mcp.json') {
    fail(`${name} Claude manifest must point to its host MCP adapter`);
  }

  const sharedMcp = await readJson(sharedMcpPath);
  assertObject(sharedMcp.mcpServers, `${name} shared MCP servers`);
  for (const [serverName, config] of Object.entries(sharedMcp.mcpServers)) {
    assertObject(config, `${name} shared MCP server ${serverName}`);
    if (config?.type !== 'http' || typeof config.url !== 'string') {
      fail(`${name} shared MCP server ${serverName} must use an HTTP URL`);
    }
    if (
      'oauth' in config ||
      'oauth_client_id' in config ||
      'oauth_resource' in config
    ) {
      fail(
        `${name} shared MCP server ${serverName} contains host-specific OAuth fields`,
      );
    }
  }
  await assertNoSymlinks(resolved);
}

const marketplaces = {
  codex: await readJson(marketplacePaths.codex),
  claude: await readJson(marketplacePaths.claude),
};
const entries = {
  codex: collectEntries(marketplaces.codex, 'codex'),
  claude: collectEntries(marketplaces.claude, 'claude'),
};

const codexNames = [...entries.codex.keys()].sort();
const claudeNames = [...entries.claude.keys()].sort();
if (JSON.stringify(codexNames) !== JSON.stringify(claudeNames)) {
  fail('Codex and Claude marketplaces must list the same plugin names');
}
for (const name of codexNames) {
  if (entries.codex.get(name) !== entries.claude.get(name)) {
    fail(`Codex and Claude sources for ${name} must match`);
  }
  await validatePlugin(name, entries.codex.get(name));
}

if (
  !allowedPluginSets.some(
    (allowed) =>
      codexNames.every((name) => allowed.has(name)) &&
      allowed.size === codexNames.length,
  )
) {
  fail(
    'marketplaces must list either the complete dev set or complete production set',
  );
}

console.log(`Plugin marketplace validation passed: ${codexNames.join(', ')}`);
