ALTER TABLE `local_artifacts` ADD `workflow_version_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_artifacts` ADD `output_schema_hash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_artifacts` ADD `output_schema_document_json` text NOT NULL;--> statement-breakpoint
ALTER TABLE `local_artifacts` DROP COLUMN `schema_version`;--> statement-breakpoint
PRAGMA user_version = 3;
