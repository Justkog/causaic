import { describe, expect, it } from 'vitest';

import {
  WorkflowCatalogDetailSchema,
  WorkflowVersionDetailSchema,
  WorkflowVersionIdSchema,
  WorkflowVersionStatusSchema,
} from './index.js';

const descriptor = (id: string, summary: string) => ({
  id,
  dialect: 'https://json-schema.org/draft/2020-12/schema' as const,
  hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  summary,
});

const version = {
  id: 'workflow_version_source-verification-1-0-0',
  workflowId: 'workflow_source-verification',
  workflowName: 'Source Verification',
  version: '1.0.0',
  status: 'published' as const,
  summary: 'Verify claims against public evidence.',
  selectable: true,
  inputSchema: {
    ...descriptor(
      'workflow_schema_source-verification-input-1',
      'Claim and source references.',
    ),
  },
  outputSchema: {
    ...descriptor(
      'workflow_schema_source-verification-output-1',
      'Structured verification artifact.',
    ),
  },
  requiredCapabilities: [],
  approvalCheckpoints: [],
  objective: 'Verify the supplied claim.',
  toolRequirements: [],
  validationPolicy: 'human_confirmation' as const,
  createdAt: 1,
};

describe('workflow catalog protocol', () => {
  it('uses a distinct portable workflow-version identity', () => {
    expect(WorkflowVersionIdSchema.safeParse(version.id).success).toBe(true);
  });

  it('accepts creator-safe version details and rejects executable content', () => {
    expect(WorkflowVersionDetailSchema.safeParse(version).success).toBe(true);
    expect(
      WorkflowVersionDetailSchema.safeParse({
        ...version,
        instructions: 'run rm -rf',
      }).success,
    ).toBe(false);
  });

  it('represents every version lifecycle status in catalog contracts', () => {
    expect(
      WorkflowCatalogDetailSchema.safeParse({
        id: version.workflowId,
        slug: 'source-verification',
        name: version.workflowName,
        summary: version.summary,
        description: 'A workflow.',
        status: 'active',
        versions: [
          {
            id: version.id,
            version: version.version,
            status: 'draft',
            summary: version.summary,
            selectable: false,
          },
        ],
      }).success,
    ).toBe(true);
    expect(WorkflowVersionStatusSchema.options).toEqual([
      'draft',
      'published',
      'deprecated',
      'revoked',
    ]);
  });
});
