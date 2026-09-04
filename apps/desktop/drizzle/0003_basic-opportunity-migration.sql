PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_local_execution_events` (
	`execution_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`occurred_at` integer NOT NULL,
	PRIMARY KEY(`execution_id`, `sequence`),
	FOREIGN KEY (`execution_id`) REFERENCES `local_executions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "local_execution_events_type" CHECK("__new_local_execution_events"."type" IN ('opportunity.claimed', 'runtime.selected', 'lease.acquired', 'run.started', 'phase.changed', 'progress', 'approval.requested', 'approval.resolved', 'artifact.produced', 'artifact.submitted', 'execution.completed', 'execution.cancelled', 'execution.failed'))
);
--> statement-breakpoint
INSERT INTO `__new_local_execution_events`("execution_id", "sequence", "type", "message", "occurred_at") SELECT "execution_id", "sequence", CASE WHEN "type" = 'job.selected' THEN 'opportunity.claimed' ELSE "type" END, "message", "occurred_at" FROM `local_execution_events`;
--> statement-breakpoint
DROP TABLE `local_execution_events`;
--> statement-breakpoint
ALTER TABLE `__new_local_execution_events` RENAME TO `local_execution_events`;
--> statement-breakpoint
CREATE INDEX `local_execution_events_time_idx` ON `local_execution_events` (`execution_id`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE `__new_local_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text,
	`job_id` text,
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
	CONSTRAINT "local_executions_identity" CHECK("__new_local_executions"."opportunity_id" IS NOT NULL OR "__new_local_executions"."job_id" IS NOT NULL),
	CONSTRAINT "local_executions_lifecycle_status" CHECK("__new_local_executions"."lifecycle_status" IN ('selected', 'leasing', 'starting_run', 'running', 'awaiting_approval', 'validating', 'artifact_persisted', 'artifact_submitted', 'completion_pending', 'cleanup_pending', 'completed', 'cancelled', 'failed', 'interrupted')),
	CONSTRAINT "local_executions_recovery_status" CHECK("__new_local_executions"."recovery_status" IN ('pending', 'reconciling', 'reconciled', 'attention_required'))
);
--> statement-breakpoint
INSERT INTO `__new_local_executions`(`id`, `opportunity_id`, `job_id`, `lease_id`, `run_id`, `node_id`, `executor_id`, `runtime_type`, `objective`, `campaign_name`, `lifecycle_status`, `recovery_status`, `last_runner_sequence`, `last_progress_sequence`, `progress_message`, `last_confirmed_remote_stage`, `remote_snapshot_json`, `failure_code`, `failure_message`, `retryable`, `cancellation_requested_at`, `started_at`, `updated_at`, `terminal_at`, `terminal_notified_at`) SELECT `id`, NULL, `job_id`, `lease_id`, `run_id`, `node_id`, `executor_id`, `runtime_type`, `objective`, `campaign_name`, `lifecycle_status`, `recovery_status`, `last_runner_sequence`, `last_progress_sequence`, `progress_message`, `last_confirmed_remote_stage`, `remote_snapshot_json`, `failure_code`, `failure_message`, `retryable`, `cancellation_requested_at`, `started_at`, `updated_at`, `terminal_at`, `terminal_notified_at` FROM `local_executions`;
--> statement-breakpoint
DROP TABLE `local_executions`;
--> statement-breakpoint
ALTER TABLE `__new_local_executions` RENAME TO `local_executions`;
--> statement-breakpoint
CREATE INDEX `local_executions_recovery_updated_idx` ON `local_executions` (`recovery_status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `local_executions_opportunity_idx` ON `local_executions` (`opportunity_id`);
--> statement-breakpoint
CREATE INDEX `local_executions_job_idx` ON `local_executions` (`job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_executions_lease_idx` ON `local_executions` (`lease_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_executions_run_idx` ON `local_executions` (`run_id`);
--> statement-breakpoint
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
	CONSTRAINT "pending_operations_kind" CHECK("__new_pending_operations"."kind" IN ('claim_opportunity', 'acquire_lease', 'start_run', 'renew_lease', 'request_approval', 'resolve_approval', 'submit_artifact', 'complete_run', 'fail_run', 'release_lease')),
	CONSTRAINT "pending_operations_status" CHECK("__new_pending_operations"."status" IN ('pending', 'confirmed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_pending_operations`("id", "execution_id", "kind", "status", "idempotency_key", "payload_json", "attempts", "last_error_code", "last_error_message", "created_at", "updated_at", "confirmed_at") SELECT "id", "execution_id", "kind", "status", "idempotency_key", "payload_json", "attempts", "last_error_code", "last_error_message", "created_at", "updated_at", "confirmed_at" FROM `pending_operations`;
--> statement-breakpoint
DROP TABLE `pending_operations`;
--> statement-breakpoint
ALTER TABLE `__new_pending_operations` RENAME TO `pending_operations`;
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_operations_idempotency_key_unique` ON `pending_operations` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `pending_operations_status_updated_idx` ON `pending_operations` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `pending_operations_execution_idx` ON `pending_operations` (`execution_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA user_version = 5;
