import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const runtimeDirectory = fileURLToPath(
  new URL('../apps/desktop/app/', import.meta.url),
);
const desktopRequire = createRequire(
  new URL('../apps/desktop/package.json', import.meta.url),
);
const electronPath = desktopRequire('electron');
const electronBuilderCli = desktopRequire.resolve('electron-builder/cli.js');
const environment = { ...process.env };

if (process.platform === 'linux') {
  environment.CXXFLAGS = [environment.CXXFLAGS, '-UV8_DEPRECATION_WARNINGS']
    .filter(Boolean)
    .join(' ');
}

const installation = spawnSync(
  process.execPath,
  [electronBuilderCli, 'install-app-deps'],
  {
    cwd: runtimeDirectory,
    env: environment,
    stdio: 'inherit',
  },
);
if (installation.error !== undefined) throw installation.error;
if (installation.status !== 0) process.exit(installation.status ?? 1);

const verification = spawnSync(
  electronPath,
  [
    '-e',
    [
      "const Database = require('better-sqlite3');",
      "const database = new Database(':memory:');",
      "database.prepare('select 1').get();",
      'database.close();',
      'console.log(`Verified isolated better-sqlite3 for Electron ABI ${process.versions.modules}.`);',
    ].join(' '),
  ],
  {
    cwd: runtimeDirectory,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
  },
);
if (verification.error !== undefined) throw verification.error;
process.exitCode = verification.status ?? 1;
