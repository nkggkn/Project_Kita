CREATE TABLE `removal_checklists` (
	`media_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`items` text NOT NULL,
	`sample_index` integer NOT NULL,
	`seconds` real,
	`analyzed_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `removal_checklists_owner_idx` ON `removal_checklists` (`owner`);