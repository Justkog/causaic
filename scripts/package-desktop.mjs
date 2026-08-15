import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const runtimeDirectory = fileURLToPath(
  new URL('../apps/desktop/app/', import.meta.url),
);
const desktopRequire = createRequire(
  new URL('../apps/desktop/package.json', import.meta.url),
);
const electronBuilderCli = desktopRequire.resolve('electron-builder/cli.js');
const environment = { ...process.env };
if (process.platform === 'linux') {
  environment.CXXFLAGS = [environment.CXXFLAGS, '-UV8_DEPRECATION_WARNINGS']
    .filter(Boolean)
    .join(' ');
}

const result = spawnSync(process.execPath, [electronBuilderCli, '--dir'], {
  cwd: runtimeDirectory,
  env: environment,
  stdio: 'inherit',
});

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
