import { describe, expect, it } from 'vitest';

import {
  compareSemanticVersions,
  incrementSemanticVersionPatch,
  parseSemanticVersion,
} from './private-workflows.js';

describe('private workflow semantic versions', () => {
  it('parses semantic version components numerically', () => {
    expect(parseSemanticVersion('12.3.45')).toEqual({
      major: 12,
      minor: 3,
      patch: 45,
    });
    expect(parseSemanticVersion('1.2')).toBeUndefined();
  });

  it('compares numeric components instead of strings', () => {
    expect(compareSemanticVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemanticVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareSemanticVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('increments only the patch component', () => {
    expect(incrementSemanticVersionPatch('1.2.3')).toBe('1.2.4');
    expect(incrementSemanticVersionPatch('1.2.9')).toBe('1.2.10');
  });
});
