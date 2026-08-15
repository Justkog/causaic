CREATE TABLE `application_metadata` (
	`id` integer PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`last_configured_node_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_successful_startup_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_metadata_installation_id_unique` ON `application_metadata` (`installation_id`);--> statement-breakpoint
CREATE TABLE `desktop_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`last_selected_view` text DEFAULT 'jobs' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_approvals` (
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
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_approvals_execution_status_idx` ON `local_approvals` (`execution_id`,`presentation_status`);--> statement-breakpoint
CREATE TABLE `local_artifacts` (
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
	CONSTRAINT "local_artifacts_nonnegative_size" CHECK("local_artifacts"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_artifacts_relative_path_unique` ON `local_artifacts` (`relative_path`);--> statement-breakpoint
CREATE INDEX `local_artifacts_execution_status_idx` ON `local_artifacts` (`execution_id`,`submission_status`);--> statement-breakpoint
CREATE TABLE `local_execution_events` (
	`execution_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`occurred_at` integer NOT NULL,
	PRIMARY KEY(`execution_id`, `sequence`),
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_execution_events_time_idx` ON `local_execution_events` (`execution_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `local_executions` (
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
	`terminal_notified_at` integer
);
--> statement-breakpoint
CREATE INDEX `local_executions_recovery_updated_idx` ON `local_executions` (`recovery_status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `local_executions_job_idx` ON `local_executions` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_executions_lease_idx` ON `local_executions` (`lease_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_executions_run_idx` ON `local_executions` (`run_id`);--> statement-breakpoint
CREATE TABLE `pending_operations` (
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
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_operations_idempotency_key_unique` ON `pending_operations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `pending_operations_status_updated_idx` ON `pending_operations` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `pending_operations_execution_idx` ON `pending_operations` (`execution_id`);--> statement-breakpoint
PRAGMA user_version = 1;
