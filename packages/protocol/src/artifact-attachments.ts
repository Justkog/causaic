import { z } from 'zod';

import { ArtifactUploadIdSchema } from './identifiers.js';
import { Sha256Schema } from './workflow-data.js';

export const MAX_ARTIFACT_ATTACHMENTS = 10;
export const MAX_ARTIFACT_ATTACHMENT_BYTES = 100 * 1024 * 1024;

const FilenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.includes('/') &&
      !value.includes('\\') &&
      !Array.from(value).some((character) => /\p{Cc}/u.test(character)),
    {
      message:
        'Filename must not contain path separators or control characters',
    },
  );

const MediaTypeSchema = z
  .string()
  .max(127)
  .regex(
    /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/,
    'Media type must be a lower-case type/subtype without parameters',
  );

export const ArtifactAttachmentSchema = z
  .object({
    id: ArtifactUploadIdSchema,
    filename: FilenameSchema,
    mediaType: MediaTypeSchema,
    byteSize: z.number().int().nonnegative().max(MAX_ARTIFACT_ATTACHMENT_BYTES),
    sha256: Sha256Schema,
  })
  .strict();
export type ArtifactAttachment = z.infer<typeof ArtifactAttachmentSchema>;

export const ArtifactAttachmentsSchema = z
  .array(ArtifactAttachmentSchema)
  .min(1)
  .max(MAX_ARTIFACT_ATTACHMENTS)
  .superRefine((attachments, context) => {
    if (
      attachments.reduce(
        (total, attachment) => total + attachment.byteSize,
        0,
      ) > MAX_ARTIFACT_ATTACHMENT_BYTES
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Artifact attachments exceed the aggregate byte limit',
      });
    }
    if (
      new Set(attachments.map((attachment) => attachment.id)).size !==
      attachments.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Artifact attachment IDs must be unique',
      });
    }
  });
