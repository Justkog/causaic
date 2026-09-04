import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ArtifactIdSchema,
  ExecutorIdSchema,
  JobIdSchema,
  LeaseIdSchema,
  NodeIdSchema,
  RunIdSchema,
} from '@causaic/protocol';
import {
  runnerCoreTestArtifact,
  runnerCoreTestWorkflowDefinition,
} from '@causaic/runner-core/testing';
import { WorkflowArtifactValidator } from '@causaic/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { DesktopArtifactStore } from './artifact-store.js';
import { desktopDataPaths, openDesktopDatabase } from './database.js';
import { DesktopRepositories } from './repositories.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('DesktopArtifactStore', () => {
  it('atomically persists validated content and idempotently verifies it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'causaic-artifact-'));
    temporaryDirectories.push(root);
    const handle = await openDesktopDatabase({
      paths: desktopDataPaths(root),
      migrationsFolder: join(import.meta.dirname, '../../../drizzle'),
    });
    const repositories = new DesktopRepositories(handle, () => 100);
    const nodeId = NodeIdSchema.parse('node_artifact-test');
    repositories.initialize(nodeId);
    const jobId = JobIdSchema.parse('job_artifact-test');
    const execution = repositories.createExecution({
      jobId,
      nodeId,
      executorId: ExecutorIdSchema.parse('executor_artifact-test'),
      runtimeType: 'fake',
      objective: 'Persist the test artifact',
      campaignName: 'Artifact campaign',
      startedAt: 100,
    });
    const runId = RunIdSchema.parse('run_artifact-test');
    repositories.bindLease(
      execution.id,
      LeaseIdSchema.parse('lease_artifact-test'),
      runId,
    );
    const store = new DesktopArtifactStore({
      rootDirectory: handle.paths.artifacts,
      repositories,
      executionId: execution.id,
      jobId: () => jobId,
      runId: () => runId,
      createId: () => 'opaque-test',
      now: () => 100,
    });
    const validated = await new WorkflowArtifactValidator().validate(
      runnerCoreTestArtifact,
      runnerCoreTestWorkflowDefinition,
    );
    const artifactId = ArtifactIdSchema.parse('artifact_artifact-test');

    const first = await store.persist(
      artifactId,
      validated.content,
      validated.contentHash,
      runnerCoreTestWorkflowDefinition,
    );
    const second = await store.persist(
      artifactId,
      validated.content,
      validated.contentHash,
      runnerCoreTestWorkflowDefinition,
    );

    expect(second).toEqual(first);
    expect(JSON.parse(await readFile(first.path, 'utf8'))).toEqual(
      validated.content,
    );
    expect(repositories.execution(execution.id)?.lifecycleStatus).toBe(
      'artifact_persisted',
    );
    expect(repositories.artifact(artifactId)?.relativePath).toBe(
      'artifact-opaque-test.json',
    );
    expect(repositories.artifact(artifactId)).toMatchObject({
      workflowVersionId: 'workflow_version_source-verification-1-0-0',
      outputSchemaHash:
        runnerCoreTestWorkflowDefinition.execution.outputSchema.descriptor.hash,
      outputSchemaDocumentJson:
        runnerCoreTestWorkflowDefinition.execution.outputSchema.documentJson,
    });
    handle.close();
  });
});
