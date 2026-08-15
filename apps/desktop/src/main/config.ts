import {
  ExecutorIdSchema,
  NodeIdSchema,
  UserIdSchema,
} from '@causaic/protocol';
import { z } from 'zod';

const EnvironmentSchema = z
  .object({
    CAUSAIC_ENABLE_DESKTOP_DEVELOPMENT: z.literal('true'),
    CONVEX_URL: z.url(),
    CAUSAIC_NODE_ID: NodeIdSchema,
    CAUSAIC_DEV_NODE_SECRET: z.string().trim().min(1),
    CAUSAIC_DEFAULT_LEASE_DURATION_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(3_600_000),
  })
  .passthrough();

export interface DesktopConfig {
  readonly convexUrl: string;
  readonly nodeExternalId: z.infer<typeof NodeIdSchema>;
  readonly developmentSecret: string;
  readonly defaultLeaseDurationMs: number;
  readonly executorId: z.infer<typeof ExecutorIdSchema>;
  readonly contributorId: z.infer<typeof UserIdSchema>;
}

function isLoopback(url: URL): boolean {
  return (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1'
  );
}

export function loadDesktopConfig(
  environment: Readonly<Record<string, string | undefined>>,
): DesktopConfig {
  const parsed = EnvironmentSchema.parse(environment);
  const url = new URL(parsed.CONVEX_URL);
  if (!isLoopback(url))
    throw new Error('The desktop milestone requires a loopback Convex URL');
  return {
    convexUrl: parsed.CONVEX_URL,
    nodeExternalId: parsed.CAUSAIC_NODE_ID,
    developmentSecret: parsed.CAUSAIC_DEV_NODE_SECRET,
    defaultLeaseDurationMs: parsed.CAUSAIC_DEFAULT_LEASE_DURATION_MS,
    executorId: ExecutorIdSchema.parse(`executor_${parsed.CAUSAIC_NODE_ID}`),
    contributorId: UserIdSchema.parse('user_desktop-development'),
  };
}
