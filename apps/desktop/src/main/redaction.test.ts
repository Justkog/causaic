import { describe, expect, it } from 'vitest';

import { createRedactor } from './redaction.js';

describe('createRedactor', () => {
  it('removes every configured secret without logging it', () => {
    const redact = createRedactor(['local-secret', 'token-value']);
    expect(redact('Failed with local-secret and token-value')).toBe(
      'Failed with [redacted] and [redacted]',
    );
  });
});
