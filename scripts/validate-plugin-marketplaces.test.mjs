import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { validatePluginMarketplaces } from './validate-plugin-marketplaces.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const contributor = 'plugins/causaic-contributor';
const skill = `${contributor}/skills/execute-causaic-job/SKILL.md`;

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'causaic-plugin-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['plugins', '.agents', '.claude-plugin']) {
    await cp(path.join(repositoryRoot, directory), path.join(root, directory), {
      recursive: true,
    });
  }
  return root;
}

async function editJson(root, file, edit) {
  const target = path.join(root, file);
  const value = JSON.parse(await readFile(target, 'utf8'));
  edit(value);
  await writeFile(target, JSON.stringify(value));
}

test('both public packages expose all nine portable skills', async () => {
  const skills = await validatePluginMarketplaces();
  assert.deepEqual(skills['causaic-contributor'], [
    'discover-and-join-causes',
    'execute-causaic-job',
    'inspect-causaic-contributions',
  ]);
  assert.deepEqual(skills['causaic-operator'], [
    'author-causaic-workflows',
    'export-accepted-artifacts',
    'manage-causaic-campaigns',
    'manage-causaic-work',
    'publish-causaic-job',
    'validate-causaic-artifacts',
  ]);
});

const consentFixtures = JSON.parse(
  await readFile(
    new URL('./fixtures/plugin-consent.json', import.meta.url),
    'utf8',
  ),
);
for (const { scenario, tool, requiredInstructions } of consentFixtures) {
  test(`consent skill contract: ${scenario}`, async () => {
    const instructions = await readFile(
      path.join(repositoryRoot, skill),
      'utf8',
    );
    for (const required of requiredInstructions) {
      assert.ok(
        instructions.includes(required),
        `${tool}: missing ${required}`,
      );
    }
  });
}

for (const file of ['plugin.json', 'mcp.json']) {
  test(`rejects a missing portable ${file}`, async (t) => {
    const root = await fixture(t);
    await rm(path.join(root, contributor, file));
    await assert.rejects(validatePluginMarketplaces(root), /is missing/u);
  });
  test(`rejects unsupported fields in ${file}`, async (t) => {
    const root = await fixture(t);
    await editJson(root, `${contributor}/${file}`, (value) => {
      value.skills = './skills/';
    });
    await assert.rejects(
      validatePluginMarketplaces(root),
      /schema:.*additional properties/u,
    );
  });
}

for (const file of [
  'mcp.json',
  '.mcp.json',
  '.claude-plugin/mcp.json',
  '.codex-plugin/plugin.json',
]) {
  for (const [label, edit, error] of [
    [
      'wrong transport',
      (server) => {
        server.type = 'sse';
      },
      /must use|schema/u,
    ],
    [
      'wrong endpoint',
      (server) => {
        server.url = 'https://example.com/mcp/contributor';
      },
      /must use https/u,
    ],
    [
      'embedded credential',
      (server) => {
        server.headers = { Authorization: 'Bearer fixture-only' };
      },
      /only type and url/u,
    ],
    [
      'pinned OAuth',
      (server) => {
        server.oauth = { client_id: 'fixture-only' };
      },
      /only type and url|schema/u,
    ],
  ]) {
    test(`rejects ${label} in ${file}`, async (t) => {
      const root = await fixture(t);
      await editJson(root, `${contributor}/${file}`, (value) =>
        edit(value.mcpServers['causaic-contributor']),
      );
      await assert.rejects(validatePluginMarketplaces(root), error);
    });
  }
  test(`rejects empty or renamed servers in ${file}`, async (t) => {
    const root = await fixture(t);
    for (const servers of [
      {},
      {
        other: {
          type: file === 'mcp.json' ? 'streamable-http' : 'http',
          url: 'https://example.com',
        },
      },
    ]) {
      await editJson(root, `${contributor}/${file}`, (value) => {
        value.mcpServers = servers;
      });
      await assert.rejects(
        validatePluginMarketplaces(root),
        /exactly the causaic-contributor/u,
      );
    }
  });
}

for (const file of [
  'plugin.json',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
]) {
  for (const [field, value, error] of [
    ['name', 'wrong-name', /plugin name/u],
    ['version', '9.9.9', /versions must agree/u],
    ['description', 'Different description', /descriptions and authors/u],
    ['author', { name: 'Different author' }, /descriptions and authors/u],
  ]) {
    test(`rejects ${field} drift in ${file}`, async (t) => {
      const root = await fixture(t);
      await editJson(root, `${contributor}/${file}`, (manifest) => {
        manifest[field] = value;
      });
      await assert.rejects(validatePluginMarketplaces(root), error);
    });
  }
}

for (const [label, contents, error] of [
  ['missing frontmatter', '# Skill', /YAML frontmatter/u],
  ['invalid YAML', '---\nname: [\n---\n', /invalid YAML/u],
  ['non-object YAML', '---\n- skill\n---\n', /must be an object/u],
  [
    'mismatched name',
    '---\nname: other\ndescription: Valid\n---\n',
    /name must match/u,
  ],
  [
    'empty description',
    '---\nname: execute-causaic-job\ndescription: "  "\n---\n',
    /description must contain/u,
  ],
  [
    'invalid metadata',
    '---\nname: execute-causaic-job\ndescription: Valid\nmetadata:\n  version: 1\n---\n',
    /metadata must map/u,
  ],
]) {
  test(`rejects skill ${label}`, async (t) => {
    const root = await fixture(t);
    await writeFile(path.join(root, skill), contents);
    await assert.rejects(validatePluginMarketplaces(root), error);
  });
}

test('accepts YAML block descriptions and Codex cache metadata', async (t) => {
  const root = await fixture(t);
  const target = path.join(root, skill);
  const contents = await readFile(target, 'utf8');
  await writeFile(
    target,
    contents.replace(
      /^description: .+$/mu,
      'description: >\n  Execute a contribution with explicit consent.',
    ),
  );
  await editJson(
    root,
    `${contributor}/.codex-plugin/plugin.json`,
    (manifest) => {
      manifest.version = '0.1.0+codex.20990101000000';
    },
  );
  await validatePluginMarketplaces(root);
});

test('rejects a Codex manifest pointing away from the shared skills', async (t) => {
  const root = await fixture(t);
  await editJson(
    root,
    `${contributor}/.codex-plugin/plugin.json`,
    (manifest) => {
      manifest.skills = './other-skills/';
    },
  );
  await assert.rejects(
    validatePluginMarketplaces(root),
    /shared skills directory/u,
  );
});

test('rejects endpoint drift in Codex skill metadata', async (t) => {
  const root = await fixture(t);
  const target = path.join(
    root,
    contributor,
    'skills/execute-causaic-job/agents/openai.yaml',
  );
  const contents = await readFile(target, 'utf8');
  await writeFile(
    target,
    contents.replace('/mcp/contributor', '/mcp/operator'),
  );
  await assert.rejects(
    validatePluginMarketplaces(root),
    /Codex dependency must match/u,
  );
});
