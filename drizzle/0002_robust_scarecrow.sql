CREATE TABLE `skillcanvas_mcp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`server_url` text NOT NULL,
	`encrypted_auth` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_skillcanvas_mcp_connections_tenant` ON `skillcanvas_mcp_connections` (`tenant_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `skillcanvas_runtime_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`detail_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_skillcanvas_runtime_traces_run_time` ON `skillcanvas_runtime_traces` (`tenant_id`,`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `skillcanvas_workflow_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`node_id` text,
	`state_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_skillcanvas_workflow_checkpoints_run_time` ON `skillcanvas_workflow_checkpoints` (`tenant_id`,`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `skillcanvas_workflow_nodes` (
	`run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`node_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`max_attempts` integer NOT NULL,
	`input_json` text,
	`output_json` text,
	`error_json` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`run_id`, `node_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_skillcanvas_workflow_nodes_run_position` ON `skillcanvas_workflow_nodes` (`tenant_id`,`run_id`,`position`);--> statement-breakpoint
CREATE TABLE `skillcanvas_workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`current_node_id` text,
	`input_json` text,
	`output_json` text,
	`error_json` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_skillcanvas_workflow_runs_tenant_time` ON `skillcanvas_workflow_runs` (`tenant_id`,`updated_at`);