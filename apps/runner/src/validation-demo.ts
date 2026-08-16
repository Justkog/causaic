import {
  WorkflowValidationSessionSchema,
  type WorkflowValidationResult,
} from '@causaic/protocol';
import {
  RuntimeInstallationIdSchema,
  RuntimeSessionIdSchema,
  type AgentValidationRuntimeAdapter,
} from '@causaic/runtime-core';
import { FakeRuntimeAdapter } from '@causaic/runtime-fake';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

interface ValidationClient {
  mutation(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface ValidationDemoOptions {
  readonly client: ValidationClient;
  readonly artifactExternalId: string;
  readonly runtime?: AgentValidationRuntimeAdapter;
  readonly confirmRecommendation?: boolean;
  readonly writeLine?: (line: string) => void;
}

export async function runValidationDemo(
  options: ValidationDemoOptions,
): Promise<WorkflowValidationResult> {
  const runtime = options.runtime ?? new FakeRuntimeAdapter();
  const writeLine = options.writeLine ?? ((line) => console.log(line));
  const session = WorkflowValidationSessionSchema.parse(
    await options.client.mutation('artifactValidations:start', {
      artifactExternalId: options.artifactExternalId,
      runtimeType: 'fake',
    }),
  );
  const runtimeSessionId = RuntimeSessionIdSchema.parse(
    `runtime-session_validation-${crypto.randomUUID()}`,
  );
  const prepared = await runtime.prepareValidationSession({
    sessionId: runtimeSessionId,
    installationId: RuntimeInstallationIdSchema.parse(
      'runtime-installation_fake-validator',
    ),
    validationRunId: session.validationRunId,
    task: session.task,
    input: session.input,
  });
  let result: WorkflowValidationResult | undefined;
  for await (const event of runtime.executeValidation(
    prepared,
    new AbortController().signal,
  )) {
    if (event.type === 'validation.progress') {
      writeLine(`[validation] ${event.message}`);
      await options.client.mutation('artifactValidations:reportProgress', {
        validationRunExternalId: session.validationRunId,
        sequence: event.sequence + 1,
        message: event.message,
      });
    } else if (event.type === 'validation.completed') {
      result = event.result;
      await options.client.mutation('artifactValidations:submitResult', {
        validationRunExternalId: session.validationRunId,
        result,
      });
    } else if (event.type === 'validation.failed') {
      await options.client.mutation('artifactValidations:fail', {
        validationRunExternalId: session.validationRunId,
        message: event.failure.message,
      });
      throw new Error(event.failure.message);
    } else if (event.type === 'validation.cancelled') {
      await options.client.mutation('artifactValidations:cancel', {
        validationRunExternalId: session.validationRunId,
        message: event.reason,
      });
      throw new Error(event.reason);
    }
  }
  if (result === undefined) throw new Error('Validator returned no result');
  writeLine(`[recommendation] ${result.decision}: ${result.summary}`);
  if (
    options.confirmRecommendation !== false &&
    result.decision !== 'needs_review'
  ) {
    await options.client.mutation('artifactValidations:decide', {
      artifactExternalId: options.artifactExternalId,
      decision: result.decision,
    });
    writeLine(`[decision] ${result.decision}`);
  }
  return result;
}

export function createAuthenticatedValidationClient(
  convexUrl: string,
  clerkJwt: string,
): ValidationClient {
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(clerkJwt);
  return {
    mutation: (name, args) =>
      client.mutation(makeFunctionReference<'mutation'>(name), args),
  };
}
