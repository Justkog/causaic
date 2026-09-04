import { z } from 'zod';

function opaqueId<const Prefix extends string, const Brand extends string>(
  prefix: Prefix,
  brand: Brand,
  reservedPrefixes: readonly string[] = [],
) {
  const reservedPrefixPattern =
    reservedPrefixes.length === 0
      ? ''
      : `(?!${reservedPrefixes
          .map((reservedPrefix) => `${escapeRegExp(reservedPrefix)}_`)
          .join('|')})`;
  return z
    .string()
    .regex(
      new RegExp(
        `^${reservedPrefixPattern}${escapeRegExp(prefix)}_[a-zA-Z0-9][a-zA-Z0-9_-]*$`,
      ),
      `${brand} must start with "${prefix}_"`,
    )
    .brand<Brand>();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const CauseIdSchema = opaqueId('cause', 'CauseId', ['cause_invitation']);
export type CauseId = z.infer<typeof CauseIdSchema>;

export const CauseInvitationIdSchema = opaqueId(
  'cause_invitation',
  'CauseInvitationId',
);
export type CauseInvitationId = z.infer<typeof CauseInvitationIdSchema>;

export const CampaignIdSchema = opaqueId('campaign', 'CampaignId');
export type CampaignId = z.infer<typeof CampaignIdSchema>;

export const WorkstreamIdSchema = opaqueId('workstream', 'WorkstreamId', [
  'workstream_dependency',
]);
export type WorkstreamId = z.infer<typeof WorkstreamIdSchema>;

export const WorkstreamDependencyIdSchema = opaqueId(
  'workstream_dependency',
  'WorkstreamDependencyId',
);
export type WorkstreamDependencyId = z.infer<
  typeof WorkstreamDependencyIdSchema
>;

export const UserIdSchema = opaqueId('user', 'UserId');
export type UserId = z.infer<typeof UserIdSchema>;

export const WorkflowIdSchema = opaqueId('workflow', 'WorkflowId', [
  'workflow_version',
  'workflow_schema',
  'workflow_report',
]);
export type WorkflowId = z.infer<typeof WorkflowIdSchema>;

export const WorkflowVersionIdSchema = opaqueId(
  'workflow_version',
  'WorkflowVersionId',
);
export type WorkflowVersionId = z.infer<typeof WorkflowVersionIdSchema>;

export const WorkflowReportIdSchema = opaqueId(
  'workflow_report',
  'WorkflowReportId',
);
export type WorkflowReportId = z.infer<typeof WorkflowReportIdSchema>;

export const WorkflowSchemaIdSchema = opaqueId(
  'workflow_schema',
  'WorkflowSchemaId',
);
export type WorkflowSchemaId = z.infer<typeof WorkflowSchemaIdSchema>;

export const JobIdSchema = opaqueId('job', 'JobId');
export type JobId = z.infer<typeof JobIdSchema>;

export const GenerationInputIdSchema = opaqueId(
  'generation_input',
  'GenerationInputId',
);
export type GenerationInputId = z.infer<typeof GenerationInputIdSchema>;

export const OpportunityIdSchema = opaqueId('opportunity', 'OpportunityId');
export type OpportunityId = z.infer<typeof OpportunityIdSchema>;

export const LeaseIdSchema = opaqueId('lease', 'LeaseId');
export type LeaseId = z.infer<typeof LeaseIdSchema>;

export const RunIdSchema = opaqueId('run', 'RunId');
export type RunId = z.infer<typeof RunIdSchema>;

export const ApprovalIdSchema = opaqueId('approval', 'ApprovalId');
export type ApprovalId = z.infer<typeof ApprovalIdSchema>;

export const ArtifactIdSchema = opaqueId('artifact', 'ArtifactId', [
  'artifact_decision',
  'artifact_export',
]);
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;

export const ArtifactDecisionIdSchema = opaqueId(
  'artifact_decision',
  'ArtifactDecisionId',
);
export type ArtifactDecisionId = z.infer<typeof ArtifactDecisionIdSchema>;

export const ArtifactExportIdSchema = opaqueId(
  'artifact_export',
  'ArtifactExportId',
);
export type ArtifactExportId = z.infer<typeof ArtifactExportIdSchema>;

export const ValidationRunIdSchema = opaqueId(
  'validation_run',
  'ValidationRunId',
);
export type ValidationRunId = z.infer<typeof ValidationRunIdSchema>;

export const ConsentIdSchema = opaqueId('consent', 'ConsentId');
export type ConsentId = z.infer<typeof ConsentIdSchema>;

export const MessageIdSchema = opaqueId('message', 'MessageId');
export type MessageId = z.infer<typeof MessageIdSchema>;

export const ExecutorIdSchema = opaqueId('executor', 'ExecutorId');
export type ExecutorId = z.infer<typeof ExecutorIdSchema>;

export const NodeIdSchema = z.string().trim().min(1).brand<'NodeId'>();
export type NodeId = z.infer<typeof NodeIdSchema>;
