CREATE TABLE `safety_reviews` (
	`owner` text NOT NULL,
	`scope` text NOT NULL,
	`location` text NOT NULL,
	`checks` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `scope`)
);
