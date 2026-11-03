CREATE TABLE `clean_previews` (
	`media_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`job_id` text,
	`preview_key` text,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`locale` text NOT NULL,
	`translated` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `translations_expiry_idx` ON `translations` (`created_at`);