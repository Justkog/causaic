import { z } from 'zod';

import {
  CampaignIdSchema,
  CauseIdSchema,
  UserIdSchema,
} from './identifiers.js';

export const CausePublicationStatusSchema = z.enum([
  'draft',
  'published',
  'unpublished',
  'archived',
]);
export type CausePublicationStatus = z.infer<
  typeof CausePublicationStatusSchema
>;

export const CauseVisibilitySchema = z.enum(['private', 'public']);
export type CauseVisibility = z.infer<typeof CauseVisibilitySchema>;

export const CauseModerationStatusSchema = z.enum([
  'unreviewed',
  'approved',
  'suspended',
]);
export type CauseModerationStatus = z.infer<typeof CauseModerationStatusSchema>;

export const CauseMembershipRoleSchema = z.enum(['owner', 'operator']);
export type CauseMembershipRole = z.infer<typeof CauseMembershipRoleSchema>;

export const CauseMembershipStatusSchema = z.enum(['active', 'removed']);
export type CauseMembershipStatus = z.infer<typeof CauseMembershipStatusSchema>;

export const CauseContributorMembershipStatusSchema = z.enum([
  'active',
  'left',
]);
export type CauseContributorMembershipStatus = z.infer<
  typeof CauseContributorMembershipStatusSchema
>;

export const CauseContributorMembershipSchema = z
  .object({
    causeId: CauseIdSchema,
    userId: UserIdSchema,
    status: CauseContributorMembershipStatusSchema,
    createdAt: z.number().int().nonnegative(),
    joinedAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    leftAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export type CauseContributorMembership = z.infer<
  typeof CauseContributorMembershipSchema
>;

export const CampaignManagementStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]);
export type CampaignManagementStatus = z.infer<
  typeof CampaignManagementStatusSchema
>;

const OptionalCampaignDateSchema = z.number().int().nonnegative().optional();

export const CampaignProfileInputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    summary: z.string().trim().min(10).max(280),
    objective: z.string().trim().min(1).max(10_000),
    startsAt: OptionalCampaignDateSchema,
    endsAt: OptionalCampaignDateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.startsAt !== undefined &&
      value.endsAt !== undefined &&
      value.endsAt < value.startsAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'End date must be on or after the start date.',
      });
    }
  });
export type CampaignProfileInput = z.input<typeof CampaignProfileInputSchema>;
export type NormalizedCampaignProfileInput = z.output<
  typeof CampaignProfileInputSchema
>;

export const ManagedCampaignSummarySchema = z
  .object({
    id: CampaignIdSchema,
    causeId: CauseIdSchema,
    name: z.string(),
    summary: z.string(),
    status: CampaignManagementStatusSchema,
    startsAt: z.number().optional(),
    endsAt: z.number().optional(),
    updatedAt: z.number(),
  })
  .strict();
export type ManagedCampaignSummary = z.infer<
  typeof ManagedCampaignSummarySchema
>;

export const ManagedCampaignSchema = ManagedCampaignSummarySchema.extend({
  objective: z.string(),
  role: CauseMembershipRoleSchema,
  createdBy: UserIdSchema,
  createdAt: z.number(),
  activatedAt: z.number().optional(),
  completedAt: z.number().optional(),
  archivedAt: z.number().optional(),
}).strict();
export type ManagedCampaign = z.infer<typeof ManagedCampaignSchema>;

export function normalizeUserEmail(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export const CauseOperatorEmailSchema = z
  .string()
  .transform(normalizeUserEmail)
  .pipe(z.string().email().max(254));
export type CauseOperatorEmail = z.output<typeof CauseOperatorEmailSchema>;

export const CAUSE_SLUG_MIN_LENGTH = 3;
export const CAUSE_SLUG_MAX_LENGTH = 63;
export const RESERVED_CAUSE_SLUGS = [
  'admin',
  'api',
  'app',
  'auth',
  'contributor',
  'creator',
  'internal',
  'new',
  'settings',
  'sign-in',
  'sign-up',
] as const;

export function normalizeCauseSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const CauseSlugSchema = z
  .string()
  .transform(normalizeCauseSlug)
  .pipe(
    z
      .string()
      .min(CAUSE_SLUG_MIN_LENGTH)
      .max(CAUSE_SLUG_MAX_LENGTH)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  )
  .refine(
    (slug) => !(RESERVED_CAUSE_SLUGS as readonly string[]).includes(slug),
    'This slug is reserved',
  );

export const CauseProfileInputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: CauseSlugSchema,
    summary: z.string().trim().min(10).max(280),
    description: z.string().trim().min(1).max(10_000),
    visibility: CauseVisibilitySchema,
  })
  .strict();
export type CauseProfileInput = z.input<typeof CauseProfileInputSchema>;
export type NormalizedCauseProfileInput = z.output<
  typeof CauseProfileInputSchema
>;

export const ManagedCauseSummarySchema = z
  .object({
    id: CauseIdSchema,
    slug: z.string(),
    name: z.string(),
    summary: z.string(),
    status: CausePublicationStatusSchema,
    visibility: CauseVisibilitySchema,
    role: CauseMembershipRoleSchema,
    updatedAt: z.number(),
  })
  .strict();
export type ManagedCauseSummary = z.infer<typeof ManagedCauseSummarySchema>;

export const ManagedCauseSchema = ManagedCauseSummarySchema.extend({
  description: z.string(),
  createdBy: UserIdSchema,
  createdAt: z.number(),
  publishedAt: z.number().optional(),
  archivedAt: z.number().optional(),
}).strict();
export type ManagedCause = z.infer<typeof ManagedCauseSchema>;

export const CauseMemberSchema = z
  .object({
    userId: UserIdSchema,
    displayName: z.string().optional(),
    email: z.string().email().optional(),
    imageUrl: z.string().url().optional(),
    role: CauseMembershipRoleSchema,
    createdAt: z.number(),
  })
  .strict();
export type CauseMember = z.infer<typeof CauseMemberSchema>;

export const CauseManagementErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'USER_NOT_INITIALIZED',
  'INVALID_CAUSE_INPUT',
  'CAUSE_SLUG_RESERVED',
  'CAUSE_SLUG_ALREADY_EXISTS',
  'CAUSE_NOT_FOUND',
  'CAUSE_PERMISSION_DENIED',
  'CAUSE_SLUG_LOCKED',
  'INVALID_CAUSE_TRANSITION',
  'CAUSE_ARCHIVED',
  'CAUSE_OWNER_REQUIRED',
  'CAUSE_MEMBER_USER_NOT_FOUND',
  'CAUSE_MEMBERSHIP_ALREADY_ACTIVE',
  'INVALID_CAUSE_MEMBERSHIP_ROLE',
  'CAUSE_OWNER_CANNOT_BE_REMOVED',
  'CAUSE_OPERATOR_ALREADY_REMOVED',
  'INVALID_CAMPAIGN_INPUT',
  'CAMPAIGN_NOT_FOUND',
  'CAMPAIGN_PERMISSION_DENIED',
  'CAMPAIGN_OWNER_REQUIRED',
  'INVALID_CAMPAIGN_TRANSITION',
  'CAMPAIGN_ARCHIVED',
]);
export type CauseManagementErrorCode = z.infer<
  typeof CauseManagementErrorCodeSchema
>;
