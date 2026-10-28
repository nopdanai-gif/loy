CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`device` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`byte_size` integer NOT NULL,
	`duration_ms` integer,
	`digest` text NOT NULL,
	`read_token` text NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_event_created` ON `media` (`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_submission` ON `media` (`submission_id`);--> statement-breakpoint
ALTER TABLE `wishes` ADD `photo_id` text;--> statement-breakpoint
ALTER TABLE `wishes` ADD `voice_id` text;--> statement-breakpoint
ALTER TABLE `wishes` ADD `voice_duration_ms` integer;