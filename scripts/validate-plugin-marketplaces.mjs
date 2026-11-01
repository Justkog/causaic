#!/usr/bin/env node

import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const productionSiteUrl = 'https://befitting-chickadee-185.convex.site';
const allowedPluginSet = new Set(['causaic-contributor', 'causaic-operator']);
const ajv = new Ajv2020({ allErrors: true });
const portableSchemas = {};
for (const component of ['plugin', 'mcp']) {
  const schema = JSON.parse(
    await readFile(
      new URL(
        `./schemas/agent-plugins/1.0.0/${component}.schema.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
  portableSchemas[component] = ajv.compile(schema);
}

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
    if (entry.isDirectory()) {
      await assertNoSymlinks(entryPath);
    } else {
      if (entry.name.startsWith('.env')) {
        fail(
          `plugin contains an environment file: ${path.relative(repositoryRoot, entryPath)}`,
        );
      }
      const contents = await readFile(entryPath, 'utf8');
      if (/-dev(?:["'\/\s]|$)/u.test(contents)) {
        fail(
          `public plugin contains a development plugin reference: ${path.relative(repositoryRoot, entryPath)}`,
        );
      }
    }
  }
}

function assertDiscoveredMcpServers(
  servers,
  label,
  expectedUrl,
  name,
  type = 'http',
) {
  assertObject(servers, `${label} MCP servers`);
  if (Object.keys(servers).length !== 1 || !Object.hasOwn(servers, name)) {
    fail(`${label} must contain exactly the ${name} MCP server`);
  }
  for (const [serverName, config] of Object.entries(servers)) {
    assertObject(config, `${label} MCP server ${serverName}`);
    if (config.type !== type || typeof config.url !== 'string') {
      fail(`${label} MCP server ${serverName} must use ${type}`);
    }
    if (config.url !== expectedUrl) {
      fail(`${label} MCP server ${serverName} must use ${expectedUrl}`);
    }
    if (Object.keys(config).some((key) => !['type', 'url'].includes(key))) {
      fail(
        `${label} MCP server ${serverName} must contain only type and url for OAuth discovery`,
      );
    }
  }
}

async function validateSkills(directory, name, expectedUrl) {
  const skillRoot = path.join(directory, 'skills');
  const skills = [];
  for (const entry of await readdir(skillRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const label = `${name} skill ${entry.name}`;
    const contents = await readFile(
      path.join(skillRoot, entry.name, 'SKILL.md'),
      'utf8',
    );
    const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
    if (!match) fail(`${label} must have YAML frontmatter`);
    let frontmatter;
    try {
      frontmatter = parseYaml(match[1], { maxAliasCount: 0 });
    } catch {
      fail(`${label} has invalid YAML frontmatter`);
    }
    assertObject(frontmatter, `${label} frontmatter`);
    if (
      frontmatter.name !== entry.name ||
      entry.name.length > 64 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.name)
    ) {
      fail(
        `${label} name must match its directory and Agent Skills constraints`,
      );
    }
    if (
      typeof frontmatter.description !== 'string' ||
      !frontmatter.description.trim() ||
      frontmatter.description.length > 1024
    ) {
      fail(`${label} description must contain 1 to 1024 characters`);
    }
    if ('license' in frontmatter && typeof frontmatter.license !== 'string') {
      fail(`${label} license must be a string`);
    }
    if (
      'compatibility' in frontmatter &&
      (typeof frontmatter.compatibility !== 'string' ||
        !frontmatter.compatibility.trim() ||
        frontmatter.compatibility.length > 500)
    ) {
      fail(`${label} compatibility must contain 1 to 500 characters`);
    }
    if ('metadata' in frontmatter) {
      assertObject(frontmatter.metadata, `${label} metadata`);
      if (
        Object.values(frontmatter.metadata).some(
          (value) => typeof value !== 'string',
        )
      ) {
        fail(`${label} metadata must map strings to strings`);
      }
    }
    if (
      'allowed-tools' in frontmatter &&
      typeof frontmatter['allowed-tools'] !== 'string'
    ) {
      fail(`${label} allowed-tools must be a string`);
    }
    const openai = parseYaml(
      await readFile(
        path.join(skillRoot, entry.name, 'agents/openai.yaml'),
        'utf8',
      ),
    );
    const tools = openai?.dependencies?.tools;
    if (
      !Array.isArray(tools) ||
      tools.length !== 1 ||
      tools[0]?.type !== 'mcp' ||
      tools[0].value !== name ||
      tools[0].transport !== 'streamable_http' ||
      tools[0].url !== expectedUrl
    ) {
      fail(
        `${label} Codex dependency must match its MCP server name, transport, and endpoint`,
      );
    }
    skills.push(entry.name);
  }
  if (!skills.length) fail(`${name} must contain discoverable skills`);
  return skills.sort();
}

async function validatePlugin(name, source, root) {
  const pluginRoot = path.join(root, 'plugins');
  const resolved = path.resolve(root, source);
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
  const portableManifestPath = path.join(resolved, 'plugin.json');
  const portableMcpPath = path.join(resolved, 'mcp.json');
  for (const requiredPath of [
    codexManifestPath,
    claudeManifestPath,
    sharedMcpPath,
    claudeMcpPath,
    portableManifestPath,
    portableMcpPath,
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
  const sharedMcp = await readJson(sharedMcpPath);
  const claudeMcp = await readJson(claudeMcpPath);
  const portableManifest = await readJson(portableManifestPath);
  const portableMcp = await readJson(portableMcpPath);
  for (const [component, value] of [
    ['plugin', portableManifest],
    ['mcp', portableMcp],
  ]) {
    const validate = portableSchemas[component];
    if (!validate(value)) {
      fail(
        `${name} ${component}.json schema: ${ajv.errorsText(validate.errors)}`,
      );
    }
  }
  const endpoint = name.includes('operator') ? 'operator' : 'contributor';
  const expectedUrl = `${productionSiteUrl}/mcp/${endpoint}`;
  if (
    codexManifest.name !== name ||
    claudeManifest.name !== name ||
    portableManifest.name !== name
  ) {
    fail(`${name} host manifests must use the marketplace plugin name`);
  }
  if (
    typeof portableManifest.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(portableManifest.version) ||
    portableManifest.version !== claudeManifest.version ||
    typeof codexManifest.version !== 'string' ||
    codexManifest.version?.split('+')[0] !== portableManifest.version
  ) {
    fail(`${name} manifest versions must agree before Codex build metadata`);
  }
  if (
    typeof portableManifest.description !== 'string' ||
    !portableManifest.description.trim() ||
    portableManifest.description !== claudeManifest.description ||
    portableManifest.description !== codexManifest.description ||
    !portableManifest.author?.name?.trim() ||
    !isDeepStrictEqual(portableManifest.author, claudeManifest.author) ||
    !isDeepStrictEqual(portableManifest.author, codexManifest.author)
  ) {
    fail(
      `${name} manifest descriptions and authors must agree and be non-empty`,
    );
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
  if (codexManifest.skills !== './skills/') {
    fail(`${name} Codex manifest must point to the shared skills directory`);
  }

  assertDiscoveredMcpServers(
    sharedMcp.mcpServers,
    `${name} shared`,
    expectedUrl,
    name,
  );
  assertDiscoveredMcpServers(
    codexManifest.mcpServers,
    `${name} Codex`,
    expectedUrl,
    name,
  );
  assertDiscoveredMcpServers(
    claudeMcp.mcpServers,
    `${name} Claude`,
    expectedUrl,
    name,
  );
  assertDiscoveredMcpServers(
    portableMcp.mcpServers,
    `${name} portable`,
    expectedUrl,
    name,
    'streamable-http',
  );
  await assertNoSymlinks(resolved);
  return validateSkills(resolved, name, expectedUrl);
}

export async function validatePluginMarketplaces(root = repositoryRoot) {
  const pluginRoot = path.join(root, 'plugins');
  const marketplacePaths = {
    codex: path.join(root, '.agents/plugins/marketplace.json'),
    claude: path.join(root, '.claude-plugin/marketplace.json'),
  };
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
  const skills = {};
  for (const name of codexNames) {
    if (entries.codex.get(name) !== entries.claude.get(name)) {
      fail(`Codex and Claude sources for ${name} must match`);
    }
    skills[name] = await validatePlugin(name, entries.codex.get(name), root);
    const claudeEntry = marketplaces.claude.plugins.find(
      (entry) => entry.name === name,
    );
    const claudeManifest = await readJson(
      path.join(root, entries.claude.get(name), '.claude-plugin/plugin.json'),
    );
    if (
      claudeEntry.version !== claudeManifest.version ||
      !isDeepStrictEqual(claudeEntry.author, claudeManifest.author)
    ) {
      fail(
        `${name} Claude marketplace version and author must match its manifest`,
      );
    }
  }

  if (
    codexNames.length !== allowedPluginSet.size ||
    codexNames.some((name) => !allowedPluginSet.has(name))
  ) {
    fail('public marketplaces must list exactly the production plugin set');
  }

  const pluginDirectories = (await readdir(pluginRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(pluginDirectories) !== JSON.stringify(codexNames)) {
    fail(
      'public plugins directory must contain exactly the marketplace plugins',
    );
  }

  return skills;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const skills = await validatePluginMarketplaces();
  console.log(
    `Plugin marketplace validation passed: ${Object.entries(skills)
      .map(([name, names]) => `${name} (${names.length} skills)`)
      .join(', ')}`,
  );
}
