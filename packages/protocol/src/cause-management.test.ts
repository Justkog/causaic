import { describe, expect, it } from 'vitest';

import {
  CauseContributorMembershipSchema,
  CauseContributorMembershipStatusSchema,
  CampaignProfileInputSchema,
  CauseInvitationSchema,
  CauseProfileInputSchema,
  CauseVisibilitySchema,
  CauseWebsiteUrlSchema,
  CauseOperatorEmailSchema,
  CauseSlugSchema,
  ManagedCauseSchema,
  ManagedCauseSummarySchema,
  normalizeCauseSlug,
} from './cause-management.js';

describe('cause management contracts', () => {
  it('accepts all cause visibility modes and rejects unknown modes', () => {
    for (const visibility of [
      'private',
      'invite_only',
      'unlisted',
      'public',
    ] as const) {
      expect(CauseVisibilitySchema.safeParse(visibility).success).toBe(true);
      expect(
        CauseProfileInputSchema.safeParse({
          name: 'Example cause',
          slug: 'example-cause',
          summary: 'A cause summary that is long enough.',
          description: 'A cause description.',
          visibility,
        }).success,
      ).toBe(true);
      const managedCause = {
        id: 'cause_example',
        slug: 'example-cause',
        name: 'Example cause',
        summary: 'A cause summary that is long enough.',
        status: 'draft' as const,
        visibility,
        role: 'owner' as const,
        updatedAt: 1,
      };
      expect(ManagedCauseSummarySchema.safeParse(managedCause).success).toBe(
        true,
      );
      expect(
        ManagedCauseSchema.safeParse({
          ...managedCause,
          description: 'A cause description.',
          createdBy: 'user_example',
          createdAt: 1,
        }).success,
      ).toBe(true);
    }
    expect(CauseVisibilitySchema.safeParse('link_only').success).toBe(false);
    expect(
      CauseProfileInputSchema.safeParse({
        name: 'Example cause',
        slug: 'example-cause',
        summary: 'A cause summary that is long enough.',
        description: 'A cause description.',
        visibility: 'link_only',
      }).success,
    ).toBe(false);
  });

  it('validates invitation projections and their portable IDs', () => {
    expect(
      CauseInvitationSchema.safeParse({
        id: 'cause_invitation_example',
        causeId: 'cause_example',
        email: 'person@example.test',
        status: 'active',
        joined: false,
        createdAt: 1,
        updatedAt: 2,
      }).success,
    ).toBe(true);
    expect(
      CauseInvitationSchema.safeParse({
        id: 'cause_invitation_example',
        causeId: 'cause_example',
        email: 'person@example.test',
        status: 'revoked',
        joined: true,
        createdAt: 1,
        updatedAt: 3,
        revokedAt: 3,
      }).success,
    ).toBe(true);
    expect(
      CauseInvitationSchema.safeParse({
        id: 'cause_example',
        causeId: 'cause_example',
        email: 'person@example.test',
        status: 'active',
        joined: false,
        createdAt: 1,
        updatedAt: 2,
      }).success,
    ).toBe(false);
    expect(
      CauseInvitationSchema.safeParse({
        id: 'cause_invitation_example',
        causeId: 'cause_example',
        email: 'not-an-email',
        status: 'active',
        joined: false,
        createdAt: 1,
        updatedAt: 2,
      }).success,
    ).toBe(false);
  });

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

  it('accepts secure website URLs and rejects insecure or credentialed URLs', () => {
    expect(CauseWebsiteUrlSchema.parse('')).toBeUndefined();
    expect(CauseWebsiteUrlSchema.parse('   ')).toBeUndefined();
    expect(CauseWebsiteUrlSchema.parse('https://example.test/about')).toBe(
      'https://example.test/about',
    );
    expect(CauseWebsiteUrlSchema.safeParse('http://example.test').success).toBe(
      false,
    );
    expect(
      CauseWebsiteUrlSchema.safeParse('https://user:secret@example.test')
        .success,
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
