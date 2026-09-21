CREATE TABLE `ledger_crypto_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`target_account_id` integer,
	`kind` text NOT NULL,
	`quantity_text` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`fee_amount_cents` integer DEFAULT 0 NOT NULL,
	`base_amount_cny_cents` integer DEFAULT 0 NOT NULL,
	`fx_rate_text` text,
	`occurred_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `ledger_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_account_id`) REFERENCES `ledger_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD `cost_basis_cny_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD `realized_pnl_cny_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_recurring_bills` ADD `frequency` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_recurring_bills` ADD `next_due_date` text;--> statement-breakpoint
ALTER TABLE `ledger_recurring_bills` ADD `trial_ends_at` text;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `target_amount_cents` integer;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `target_currency` text;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `fee_amount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `fee_currency` text;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `base_amount_cny_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `fx_rate_text` text;