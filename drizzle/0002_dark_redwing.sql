CREATE TABLE `ledger_budget_plans` (
	`month_key` text PRIMARY KEY NOT NULL,
	`total_budget_cents` integer DEFAULT 0 NOT NULL,
	`savings_target_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_category_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month_key` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`month_key`) REFERENCES `ledger_budget_plans`(`month_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ledger_recurring_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '固定支出' NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_day` integer NOT NULL,
	`account_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `ledger_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `source_delta_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `target_delta_cents` integer DEFAULT 0 NOT NULL;
