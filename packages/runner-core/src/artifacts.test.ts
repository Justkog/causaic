import { describe, expect, it } from 'vitest';

import { WorkflowArtifactValidator } from './artifacts.js';
import {
  runnerCoreTestArtifact,
  runnerCoreTestWorkflowDefinition,
} from './testing.js';

describe('WorkflowArtifactValidator', () => {
  it('validates content and hashes canonical JSON deterministically', async () => {
    const validator = new WorkflowArtifactValidator();
    const first = await validator.validate(
      runnerCoreTestArtifact,
      runnerCoreTestWorkflowDefinition,
    );
    const second = await validator.validate(
      {
        citations: runnerCoreTestArtifact.citations,
        verdict: runnerCoreTestArtifact.verdict,
        claim: runnerCoreTestArtifact.claim,
        artifactType: runnerCoreTestArtifact.artifactType,
      },
      runnerCoreTestWorkflowDefinition,
    );

    expect(first.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second).toEqual(first);
  });
});
