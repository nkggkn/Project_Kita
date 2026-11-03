CREATE TABLE `public_usage` (
	`key` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_usage_expiry_idx` ON `public_usage` (`expires_at`);