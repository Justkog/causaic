import { describe, expect, it } from 'vitest';

import {
  createWorkflowDataValidator,
  sha256Json,
} from '@causaic/workflow-schema';

import {
  sourceVerificationInputExample,
  sourceVerificationInputSchema,
} from './index.js';

describe('source-verification fixture', () => {
  it('requires at least one valid source URL', async () => {
    const hash = await sha256Json(sourceVerificationInputSchema);
    const validate = createWorkflowDataValidator(
      sourceVerificationInputSchema,
      hash,
    );
    expect(validate(sourceVerificationInputExample)).toEqual({ valid: true });
    expect(validate({ claim: 'A claim', sourceUrls: [] }).valid).toBe(false);
  });
});
