import {
  ValidationApprovalIdSchema,
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
import { z } from 'zod';

interface ValidationClient {
  mutation(name: string, args: Record<string, unknown>): Promise<unknown>;
}

const ApprovalSchema = z
  .object({ id: ValidationApprovalIdSchema })
  .passthrough();

export interface ValidationDemoOptions {
  readonly client: ValidationClient;
  readonly artifactExternalId: string;
  readonly runtime?: AgentValidationRuntimeAdapter;
  readonly approveNetwork?: boolean;
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
  const approvalId = ValidationApprovalIdSchema.parse(
    `validation_approval_${crypto.randomUUID()}`,
  );
  const prepared = await runtime.prepareValidationSession({
    sessionId: runtimeSessionId,
    installationId: RuntimeInstallationIdSchema.parse(
      'runtime-installation_fake-validator',
    ),
    validationRunId: session.validationRunId,
    approvalId,
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
    } else if (event.type === 'validation.approval_requested') {
      const approval = ApprovalSchema.parse(
        await options.client.mutation('artifactValidations:requestApproval', {
          validationRunExternalId: session.validationRunId,
          reason: event.reason,
          expiresAt: Date.now() + 60_000,
        }),
      );
      const approved = options.approveNetwork !== false;
      await options.client.mutation('artifactValidations:resolveApproval', {
        validationRunExternalId: session.validationRunId,
        approvalExternalId: approval.id,
        decision: approved ? 'approved' : 'denied',
        ...(approved ? {} : { denialReason: 'Denied by CLI operator' }),
      });
      await runtime.resolveValidationApproval(
        runtimeSessionId,
        approved
          ? { approvalId, decision: 'approved' }
          : {
              approvalId,
              decision: 'denied',
              reason: 'Denied by CLI operator',
            },
      );
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
