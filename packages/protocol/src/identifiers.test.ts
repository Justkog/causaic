import { describe, expect, it } from 'vitest';

import { ArtifactExportIdSchema } from './identifiers.js';

describe('portable identifiers', () => {
  it('validates artifact export identifiers', () => {
    expect(
      ArtifactExportIdSchema.safeParse('artifact_export_fixture-1').success,
    ).toBe(true);
    expect(ArtifactExportIdSchema.safeParse('artifact_fixture-1').success).toBe(
      false,
    );
  });
});
