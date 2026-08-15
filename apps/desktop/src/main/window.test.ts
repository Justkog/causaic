import { describe, expect, it } from 'vitest';

import { isAllowedRendererNavigation } from './window.js';

describe('isAllowedRendererNavigation', () => {
  it('allows the configured development and packaged entries', () => {
    expect(
      isAllowedRendererNavigation(
        'http://localhost:5174/',
        'http://localhost:5174/',
      ),
    ).toBe(true);
    expect(
      isAllowedRendererNavigation(
        'file:///tmp/causaic/out/renderer/index.html',
        'file:///tmp/causaic/out/renderer/index.html',
      ),
    ).toBe(true);
  });

  it('rejects other origins and paths', () => {
    expect(
      isAllowedRendererNavigation(
        'https://example.com/',
        'http://localhost:5174/',
      ),
    ).toBe(false);
    expect(
      isAllowedRendererNavigation(
        'http://localhost:5174/admin',
        'http://localhost:5174/',
      ),
    ).toBe(false);
  });
});
