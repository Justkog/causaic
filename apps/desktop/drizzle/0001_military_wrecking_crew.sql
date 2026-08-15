PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_application_metadata` (
	`id` integer PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`last_configured_node_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_successful_startup_at` integer,
	CONSTRAINT "application_metadata_singleton" CHECK("__new_application_metadata"."id" = 1)
);
--> statement-breakpoint
INSERT INTO `__new_application_metadata`("id", "installation_id", "last_configured_node_id", "created_at", "last_successful_startup_at") SELECT "id", "installation_id", "last_configured_node_id", "created_at", "last_successful_startup_at" FROM `application_metadata`;--> statement-breakpoint
DROP TABLE `application_metadata`;--> statement-breakpoint
ALTER TABLE `__new_application_metadata` RENAME TO `application_metadata`;--> statement-breakpoint
CREATE UNIQUE INDEX `application_metadata_installation_id_unique` ON `application_metadata` (`installation_id`);--> statement-breakpoint
CREATE TABLE `__new_desktop_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`last_selected_view` text DEFAULT 'jobs' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "desktop_preferences_singleton" CHECK("__new_desktop_preferences"."id" = 1),
	CONSTRAINT "desktop_preferences_view" CHECK("__new_desktop_preferences"."last_selected_view" IN ('jobs', 'execution', 'settings'))
);
--> statement-breakpoint
INSERT INTO `__new_desktop_preferences`("id", "paused", "last_selected_view", "updated_at") SELECT "id", "paused", "last_selected_view", "updated_at" FROM `desktop_preferences`;--> statement-breakpoint
DROP TABLE `desktop_preferences`;--> statement-breakpoint
ALTER TABLE `__new_desktop_preferences` RENAME TO `desktop_preferences`;--> statement-breakpoint
CREATE TABLE `__new_local_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`run_id` text,
	`domain` text NOT NULL,
	`reason` text NOT NULL,
	`capabilities_json` text DEFAULT '[]' NOT NULL,
	`presentation_status` text NOT NULL,
	`authoritative_status` text DEFAULT 'unknown' NOT NULL,
	`attempted_decision` text,
	`denial_reason` text,
	`requested_at` integer NOT NULL,
	`decision_attempted_at` integer,
	`resolved_at` integer,
	`notified_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "local_approvals_presentation_status" CHECK("__new_local_approvals"."presentation_status" IN ('pending', 'decision_attempted', 'reconciled', 'superseded')),
	CONSTRAINT "local_approvals_authoritative_status" CHECK("__new_local_approvals"."authoritative_status" IN ('unknown', 'pending', 'approved', 'denied'))
);
--> statement-breakpoint
INSERT INTO `__new_local_approvals`("id", "execution_id", "run_id", "domain", "reason", "capabilities_json", "presentation_status", "authoritative_status", "attempted_decision", "denial_reason", "requested_at", "decision_attempted_at", "resolved_at", "notified_at", "updated_at") SELECT "id", "execution_id", "run_id", "domain", "reason", "capabilities_json", "presentation_status", "authoritative_status", "attempted_decision", "denial_reason", "requested_at", "decision_attempted_at", "resolved_at", "notified_at", "updated_at" FROM `local_approvals`;--> statement-breakpoint
DROP TABLE `local_approvals`;--> statement-breakpoint
ALTER TABLE `__new_local_approvals` RENAME TO `local_approvals`;--> statement-breakpoint
CREATE INDEX `local_approvals_execution_status_idx` ON `local_approvals` (`execution_id`,`presentation_status`);--> statement-breakpoint
CREATE TABLE `__new_local_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`job_id` text NOT NULL,
	`run_id` text,
	`relative_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`byte_size` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`validation_status` text NOT NULL,
	`submission_status` text NOT NULL,
	`submission_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "local_artifacts_nonnegative_size" CHECK("__new_local_artifacts"."byte_size" >= 0),
	CONSTRAINT "local_artifacts_validation_status" CHECK("__new_local_artifacts"."validation_status" IN ('validated', 'missing', 'invalid')),
	CONSTRAINT "local_artifacts_submission_status" CHECK("__new_local_artifacts"."submission_status" IN ('local_only', 'pending', 'confirmed', 'conflict'))
);
--> statement-breakpoint
INSERT INTO `__new_local_artifacts`("id", "execution_id", "job_id", "run_id", "relative_path", "content_hash", "byte_size", "schema_version", "validation_status", "submission_status", "submission_attempts", "created_at", "updated_at") SELECT "id", "execution_id", "job_id", "run_id", "relative_path", "content_hash", "byte_size", "schema_version", "validation_status", "submission_status", "submission_attempts", "created_at", "updated_at" FROM `local_artifacts`;--> statement-breakpoint
DROP TABLE `local_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_local_artifacts` RENAME TO `local_artifacts`;--> statement-breakpoint
CREATE UNIQUE INDEX `local_artifacts_relative_path_unique` ON `local_artifacts` (`relative_path`);--> statement-breakpoint
CREATE INDEX `local_artifacts_execution_status_idx` ON `local_artifacts` (`execution_id`,`submission_status`);--> statement-breakpoint
CREATE TABLE `__new_local_execution_events` (
	`execution_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`occurred_at` integer NOT NULL,
	PRIMARY KEY(`execution_id`, `sequence`),
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "local_execution_events_type" CHECK("__new_local_execution_events"."type" IN ('job.selected', 'runtime.selected', 'lease.acquired', 'run.started', 'phase.changed', 'progress', 'approval.requested', 'approval.resolved', 'artifact.produced', 'artifact.submitted', 'execution.completed', 'execution.cancelled', 'execution.failed'))
);
--> statement-breakpoint
INSERT INTO `__new_local_execution_events`("execution_id", "sequence", "type", "message", "occurred_at") SELECT "execution_id", "sequence", "type", "message", "occurred_at" FROM `local_execution_events`;--> statement-breakpoint
DROP TABLE `local_execution_events`;--> statement-breakpoint
ALTER TABLE `__new_local_execution_events` RENAME TO `local_execution_events`;--> statement-breakpoint
CREATE INDEX `local_execution_events_time_idx` ON `local_execution_events` (`execution_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `__new_local_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`lease_id` text,
	`run_id` text,
	`node_id` text NOT NULL,
	`executor_id` text NOT NULL,
	`runtime_type` text NOT NULL,
	`objective` text NOT NULL,
	`campaign_name` text NOT NULL,
	`lifecycle_status` text NOT NULL,
	`recovery_status` text DEFAULT 'pending' NOT NULL,
	`last_runner_sequence` integer DEFAULT -1 NOT NULL,
	`last_progress_sequence` integer DEFAULT -1 NOT NULL,
	`progress_message` text,
	`last_confirmed_remote_stage` text,
	`remote_snapshot_json` text,
	`failure_code` text,
	`failure_message` text,
	`retryable` integer,
	`cancellation_requested_at` integer,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`terminal_at` integer,
	`terminal_notified_at` integer,
	CONSTRAINT "local_executions_lifecycle_status" CHECK("__new_local_executions"."lifecycle_status" IN ('selected', 'leasing', 'starting_run', 'running', 'awaiting_approval', 'validating', 'artifact_persisted', 'artifact_submitted', 'completion_pending', 'cleanup_pending', 'completed', 'cancelled', 'failed', 'interrupted')),
	CONSTRAINT "local_executions_recovery_status" CHECK("__new_local_executions"."recovery_status" IN ('pending', 'reconciling', 'reconciled', 'attention_required'))
);
--> statement-breakpoint
INSERT INTO `__new_local_executions`("id", "job_id", "lease_id", "run_id", "node_id", "executor_id", "runtime_type", "objective", "campaign_name", "lifecycle_status", "recovery_status", "last_runner_sequence", "last_progress_sequence", "progress_message", "last_confirmed_remote_stage", "remote_snapshot_json", "failure_code", "failure_message", "retryable", "cancellation_requested_at", "started_at", "updated_at", "terminal_at", "terminal_notified_at") SELECT "id", "job_id", "lease_id", "run_id", "node_id", "executor_id", "runtime_type", "objective", "campaign_name", "lifecycle_status", "recovery_status", "last_runner_sequence", "last_progress_sequence", "progress_message", "last_confirmed_remote_stage", "remote_snapshot_json", "failure_code", "failure_message", "retryable", "cancellation_requested_at", "started_at", "updated_at", "terminal_at", "terminal_notified_at" FROM `local_executions`;--> statement-breakpoint
DROP TABLE `local_executions`;--> statement-breakpoint
ALTER TABLE `__new_local_executions` RENAME TO `local_executions`;--> statement-breakpoint
CREATE INDEX `local_executions_recovery_updated_idx` ON `local_executions` (`recovery_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `local_executions_job_idx` ON `local_executions` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_executions_lease_idx` ON `local_executions` (`lease_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_executions_run_idx` ON `local_executions` (`run_id`);--> statement-breakpoint
CREATE TABLE `__new_pending_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pending_operations_kind" CHECK("__new_pending_operations"."kind" IN ('acquire_lease', 'start_run', 'renew_lease', 'request_approval', 'resolve_approval', 'submit_artifact', 'complete_run', 'fail_run', 'release_lease')),
	CONSTRAINT "pending_operations_status" CHECK("__new_pending_operations"."status" IN ('pending', 'confirmed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_pending_operations`("id", "execution_id", "kind", "status", "idempotency_key", "payload_json", "attempts", "last_error_code", "last_error_message", "created_at", "updated_at", "confirmed_at") SELECT "id", "execution_id", "kind", "status", "idempotency_key", "payload_json", "attempts", "last_error_code", "last_error_message", "created_at", "updated_at", "confirmed_at" FROM `pending_operations`;--> statement-breakpoint
DROP TABLE `pending_operations`;--> statement-breakpoint
ALTER TABLE `__new_pending_operations` RENAME TO `pending_operations`;--> statement-breakpoint
CREATE UNIQUE INDEX `pending_operations_idempotency_key_unique` ON `pending_operations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `pending_operations_status_updated_idx` ON `pending_operations` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `pending_operations_execution_idx` ON `pending_operations` (`execution_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
PRAGMA user_version = 2;
