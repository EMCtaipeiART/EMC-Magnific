CREATE TABLE `records` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `state` (
	`owner` text NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`owner`, `key`)
);
