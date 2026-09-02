import { describe, expect, it } from 'vitest';

import {
  WorkflowCatalogDetailSchema,
  WorkflowCatalogPublisherSchema,
  WorkflowVersionDetailSchema,
  WorkflowVersionIdSchema,
  WorkflowVersionStatusSchema,
  validWorkflowCatalogVersionDetailFixture,
} from './index.js';

const version = validWorkflowCatalogVersionDetailFixture;

describe('workflow catalog protocol', () => {
  it('uses a distinct portable workflow-version identity', () => {
    expect(WorkflowVersionIdSchema.safeParse(version.id).success).toBe(true);
  });

  it('accepts the authored execution task and rejects unknown top-level fields', () => {
    expect(WorkflowVersionDetailSchema.safeParse(version).success).toBe(true);
    expect(
      WorkflowVersionDetailSchema.safeParse({
        ...version,
        executableContent: 'run rm -rf',
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
        publisher: { kind: 'platform', name: 'Causaic' },
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

  it('accepts both platform and cause publisher projections', () => {
    expect(
      WorkflowCatalogPublisherSchema.safeParse({
        kind: 'platform',
        name: 'Causaic',
      }).success,
    ).toBe(true);
    expect(
      WorkflowCatalogPublisherSchema.safeParse({
        kind: 'cause',
        causeId: 'cause_public-knowledge',
        name: 'Public Knowledge Fixture',
      }).success,
    ).toBe(true);
    expect(
      WorkflowCatalogPublisherSchema.safeParse({
        kind: 'platform',
        name: 'Other platform',
      }).success,
    ).toBe(false);
  });
});
