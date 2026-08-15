import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema.js';

export const CURRENT_LOCAL_SCHEMA_VERSION = 3;

export interface DesktopDataPaths {
  readonly root: string;
  readonly database: string;
  readonly artifacts: string;
  readonly backups: string;
}

export function desktopDataPaths(userData: string): DesktopDataPaths {
  return {
    root: userData,
    database: join(userData, 'causaic.sqlite'),
    artifacts: join(userData, 'artifacts'),
    backups: join(userData, 'backups'),
  };
}

export type DesktopDatabase = ReturnType<typeof drizzle<typeof schema>>;

export interface OpenDesktopDatabaseOptions {
  readonly paths: DesktopDataPaths;
  readonly migrationsFolder: string;
  readonly now?: () => number;
  readonly expectedSchemaVersion?: number;
}

export interface DesktopDatabaseHandle {
  readonly sqlite: Database.Database;
  readonly db: DesktopDatabase;
  readonly paths: DesktopDataPaths;
  readonly schemaVersion: number;
  close(): void;
}

async function backupBeforeMigration(
  sqlite: Database.Database,
  paths: DesktopDataPaths,
  currentVersion: number,
  now: number,
): Promise<void> {
  if (currentVersion === 0) return;
  await mkdir(paths.backups, { recursive: true, mode: 0o700 });
  const backupPath = join(
    paths.backups,
    `causaic-v${currentVersion}-${now}.sqlite`,
  );
  await sqlite.backup(backupPath);
}

export async function openDesktopDatabase(
  options: OpenDesktopDatabaseOptions,
): Promise<DesktopDatabaseHandle> {
  await Promise.all([
    mkdir(dirname(options.paths.database), { recursive: true, mode: 0o700 }),
    mkdir(options.paths.artifacts, { recursive: true, mode: 0o700 }),
    mkdir(options.paths.backups, { recursive: true, mode: 0o700 }),
  ]);
  const sqlite = new Database(options.paths.database);
  try {
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    const version = Number(sqlite.pragma('user_version', { simple: true }));
    const expectedVersion =
      options.expectedSchemaVersion ?? CURRENT_LOCAL_SCHEMA_VERSION;
    if (version > expectedVersion) {
      throw new Error(
        `The local database schema ${version} is newer than supported schema ${expectedVersion}.`,
      );
    }
    if (version < expectedVersion) {
      await backupBeforeMigration(
        sqlite,
        options.paths,
        version,
        options.now?.() ?? Date.now(),
      );
      migrate(drizzle(sqlite, { schema }), {
        migrationsFolder: options.migrationsFolder,
      });
    }
    const schemaVersion = Number(
      sqlite.pragma('user_version', { simple: true }),
    );
    if (schemaVersion !== expectedVersion) {
      throw new Error(
        `The local database migration ended at schema ${schemaVersion}; expected ${expectedVersion}.`,
      );
    }
    return {
      sqlite,
      db: drizzle(sqlite, { schema }),
      paths: options.paths,
      schemaVersion,
      close: () => sqlite.close(),
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
