import type { ExecutableWorkflowDefinition } from '@causaic/protocol';
import {
  createWorkflowDataValidator,
  parseJsonValue,
  parseStoredSchema,
  sha256Json,
} from '@causaic/workflow-schema';

import type { ArtifactValidator, ValidatedArtifact } from './types.js';

export class WorkflowArtifactValidator implements ArtifactValidator {
  public async validate(
    value: unknown,
    definition: ExecutableWorkflowDefinition,
  ): Promise<ValidatedArtifact> {
    const content = parseJsonValue(value);
    const descriptor = definition.execution.outputSchema.descriptor;
    const schema = parseStoredSchema(
      definition.execution.outputSchema.documentJson,
    );
    const result = createWorkflowDataValidator(
      schema,
      descriptor.hash,
    )(content);
    if (!result.valid) {
      const details = result.issues
        .map(
          ({ instancePath, message }) => `${instancePath || '/'}: ${message}`,
        )
        .join('; ');
      throw new Error(`Workflow output is invalid: ${details}`);
    }
    return { content, contentHash: await sha256Json(content) };
  }
}
