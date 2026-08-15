import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

function readManifest(relativePath: string): PackageManifest {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
  ) as PackageManifest;
}

function readText(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('desktop native dependency isolation', () => {
  it('pins matching Node and Electron better-sqlite3 versions', () => {
    const development = readManifest('../../package.json');
    const runtime = readManifest('../../app/package.json');

    expect(development.dependencies?.['better-sqlite3']).toBeUndefined();
    expect(development.devDependencies?.['better-sqlite3']).toBe('12.11.1');
    expect(runtime.dependencies?.['better-sqlite3']).toBe('12.11.1');
  });

  it('pins the packaged Electron version to the development runtime', () => {
    const development = readManifest('../../package.json');
    const builderConfiguration = readText('../../app/electron-builder.yml');

    expect(development.devDependencies?.electron).toBe('^43.1.1');
    expect(builderConfiguration).toMatch(/^electronVersion: 43\.1\.1$/m);
  });
});
