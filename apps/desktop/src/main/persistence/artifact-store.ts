import { randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';

import type {
  ArtifactId,
  ArtifactManifest,
  ExecutableWorkflowDefinition,
  JobId,
  JsonValue,
  RunId,
} from '@causaic/protocol';
import { type LocalArtifactStore } from '@causaic/runner-core';
import { parseJsonValue, sha256Json } from '@causaic/workflow-schema';

import type { LocalExecutionId } from './models.js';
import type { DesktopRepositories } from './repositories.js';

const MAXIMUM_ARTIFACT_BYTES = 1024 * 1024;
const STALE_TEMPORARY_AGE_MS = 24 * 60 * 60 * 1_000;

export interface DesktopArtifactStoreOptions {
  readonly rootDirectory: string;
  readonly repositories: DesktopRepositories;
  readonly executionId: LocalExecutionId;
  readonly jobId: JobId;
  readonly runId: () => RunId | undefined;
  readonly now?: () => number;
  readonly createId?: () => string;
}

function assertInside(root: string, path: string): void {
  const normalizedRoot = `${resolve(root)}${sep}`;
  if (!resolve(path).startsWith(normalizedRoot)) {
    throw new Error('Artifact path escaped the configured artifact directory');
  }
}

export class DesktopArtifactStore implements LocalArtifactStore {
  readonly #options: DesktopArtifactStoreOptions;

  public constructor(options: DesktopArtifactStoreOptions) {
    this.#options = options;
  }

  public async persist(
    artifactId: ArtifactId,
    artifact: JsonValue,
    contentHash: ArtifactManifest['contentHash'],
    definition: ExecutableWorkflowDefinition,
  ) {
    const existing = this.#options.repositories.artifact(artifactId);
    if (existing !== undefined) {
      if (existing.contentHash !== contentHash)
        throw new Error('A conflicting local artifact already exists');
      const path = join(this.#options.rootDirectory, existing.relativePath);
      await this.#verify(path, contentHash);
      return { directory: this.#options.rootDirectory, path };
    }

    await mkdir(this.#options.rootDirectory, { recursive: true, mode: 0o700 });
    const opaque = this.#options.createId?.() ?? randomUUID();
    const relativePath = `artifact-${opaque}.json`;
    const finalPath = join(this.#options.rootDirectory, relativePath);
    const temporaryPath = join(
      this.#options.rootDirectory,
      `.tmp-${opaque}-${randomUUID()}`,
    );
    assertInside(this.#options.rootDirectory, finalPath);
    assertInside(this.#options.rootDirectory, temporaryPath);

    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    const size = Buffer.byteLength(serialized);
    if (size > MAXIMUM_ARTIFACT_BYTES)
      throw new Error('The validated artifact exceeds the local size limit');

    const file = await open(temporaryPath, 'wx', 0o600);
    try {
      await file.writeFile(serialized, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, finalPath);
    await this.#verify(finalPath, contentHash);
    const createdAt = this.#options.now?.() ?? Date.now();
    const runId = this.#options.runId();
    this.#options.repositories.persistArtifact({
      id: artifactId,
      executionId: this.#options.executionId,
      jobId: this.#options.jobId,
      ...(runId === undefined ? {} : { runId }),
      relativePath,
      contentHash,
      byteSize: size,
      workflowVersionId: definition.workflowVersionId,
      outputSchemaHash: definition.execution.outputSchema.descriptor.hash,
      outputSchemaDocumentJson: definition.execution.outputSchema.documentJson,
      createdAt,
    });
    return { directory: this.#options.rootDirectory, path: finalPath };
  }

  async #verify(path: string, expectedHash: string): Promise<void> {
    assertInside(this.#options.rootDirectory, path);
    const bytes = await readFile(path);
    if (bytes.byteLength > MAXIMUM_ARTIFACT_BYTES)
      throw new Error('The persisted artifact exceeds the local size limit');
    const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    const content = parseJsonValue(parsed);
    if ((await sha256Json(content)) !== expectedHash)
      throw new Error(
        'The persisted artifact hash does not match its metadata',
      );
  }
}

export async function cleanArtifactDirectory(
  rootDirectory: string,
  knownRelativePaths: ReadonlySet<string>,
  now = Date.now(),
): Promise<void> {
  await mkdir(rootDirectory, { recursive: true, mode: 0o700 });
  const quarantine = join(rootDirectory, 'orphans');
  for (const entry of await readdir(rootDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(rootDirectory, entry.name);
    if (entry.name.startsWith('.tmp-')) {
      const details = await stat(path);
      if (now - details.mtimeMs > STALE_TEMPORARY_AGE_MS) await unlink(path);
      continue;
    }
    if (!knownRelativePaths.has(entry.name)) {
      await mkdir(quarantine, { recursive: true, mode: 0o700 });
      await rename(path, join(quarantine, `${now}-${basename(entry.name)}`));
    }
  }
}
