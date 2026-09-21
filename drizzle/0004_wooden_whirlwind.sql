ALTER TABLE `ledger_recurring_bills` ADD `currency` text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `currency` text DEFAULT 'CNY' NOT NULL;