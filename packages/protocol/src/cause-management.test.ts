import { describe, expect, it } from 'vitest';

import {
  CauseContributorMembershipSchema,
  CauseContributorMembershipStatusSchema,
  CampaignProfileInputSchema,
  CauseProfileInputSchema,
  CauseOperatorEmailSchema,
  CauseSlugSchema,
  normalizeCauseSlug,
} from './cause-management.js';

describe('cause management contracts', () => {
  it('restricts contributor membership status to active or left', () => {
    expect(
      CauseContributorMembershipStatusSchema.safeParse('active').success,
    ).toBe(true);
    expect(
      CauseContributorMembershipStatusSchema.safeParse('left').success,
    ).toBe(true);
    expect(
      CauseContributorMembershipStatusSchema.safeParse('removed').success,
    ).toBe(false);
    expect(
      CauseContributorMembershipSchema.safeParse({
        causeId: 'cause_example',
        userId: 'user_example',
        status: 'active',
        createdAt: 1,
        joinedAt: 2,
        updatedAt: 2,
      }).success,
    ).toBe(true);
  });

  it('normalizes stable slugs', () => {
    expect(normalizeCauseSlug('  Crème__Brûlée  ')).toBe('creme-brulee');
    expect(CauseSlugSchema.parse('Public Knowledge')).toBe('public-knowledge');
  });

  it('rejects reserved and malformed profile input', () => {
    expect(CauseSlugSchema.safeParse('internal').success).toBe(false);
    expect(
      CauseProfileInputSchema.safeParse({
        name: 'A',
        slug: 'ok',
        summary: 'short',
        description: '',
        visibility: 'public',
      }).success,
    ).toBe(false);
  });

  it('normalizes an existing-user operator email', () => {
    expect(CauseOperatorEmailSchema.parse('  Person@Example.Test ')).toBe(
      'person@example.test',
    );
  });

  it('validates a campaign profile and its descriptive date range', () => {
    expect(
      CampaignProfileInputSchema.safeParse({
        name: 'Verify transport evidence',
        summary:
          'Coordinate public-source verification for a transport report.',
        objective:
          'Verify the report claims against accessible primary sources.',
        startsAt: Date.parse('2030-01-01T00:00:00Z'),
        endsAt: Date.parse('2030-01-31T00:00:00Z'),
      }).success,
    ).toBe(true);
    expect(
      CampaignProfileInputSchema.safeParse({
        name: 'Verify transport evidence',
        summary:
          'Coordinate public-source verification for a transport report.',
        objective:
          'Verify the report claims against accessible primary sources.',
        startsAt: Date.parse('2030-02-01T00:00:00Z'),
        endsAt: Date.parse('2030-01-31T00:00:00Z'),
      }).success,
    ).toBe(false);
  });
});
