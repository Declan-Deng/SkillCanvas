CREATE TABLE `skillcanvas_credential_vault` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`encrypted_payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skillcanvas_diagnostic_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`level` text NOT NULL,
	`event` text NOT NULL,
	`request_id` text,
	`mode` text,
	`phase` text,
	`attempt` integer,
	`status` integer,
	`elapsed_ms` integer,
	`input_chars` integer,
	`output_chars` integer,
	`estimated_tokens` integer,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`provider` text,
	`model` text,
	`estimated_cost_microusd` integer,
	`reason` text
);
