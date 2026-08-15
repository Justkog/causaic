import { NodeIdSchema } from '@causaic/protocol';
import { z } from 'zod';

export const ConvexCoordinatorConfigSchema = z
  .object({
    convexUrl: z.url(),
    nodeExternalId: NodeIdSchema,
    developmentSecret: z.string().trim().min(1),
    defaultLeaseDurationMs: z.number().int().positive().max(3_600_000),
  })
  .strict();

export type ConvexCoordinatorConfig = z.infer<
  typeof ConvexCoordinatorConfigSchema
>;

const EnvironmentSchema = z.object({
  CONVEX_URL: z.string().min(1),
  CAUSAIC_NODE_ID: z.string().min(1),
  CAUSAIC_DEV_NODE_SECRET: z.string().min(1),
  CAUSAIC_DEFAULT_LEASE_DURATION_MS: z.coerce.number().int().positive(),
});

export function loadConvexCoordinatorConfig(
  environment: Readonly<Record<string, string | undefined>>,
): ConvexCoordinatorConfig {
  const parsed = EnvironmentSchema.parse(environment);
  return ConvexCoordinatorConfigSchema.parse({
    convexUrl: parsed.CONVEX_URL,
    nodeExternalId: parsed.CAUSAIC_NODE_ID,
    developmentSecret: parsed.CAUSAIC_DEV_NODE_SECRET,
    defaultLeaseDurationMs: parsed.CAUSAIC_DEFAULT_LEASE_DURATION_MS,
  });
}
