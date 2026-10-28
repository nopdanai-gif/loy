ALTER TABLE `events` ADD `float_ms` integer DEFAULT 24000 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `scene_json` text;--> statement-breakpoint
ALTER TABLE `wishes` ADD `design_json` text;