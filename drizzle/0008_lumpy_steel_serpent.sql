CREATE TABLE `ledger_market_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `fx_source` text;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `fx_captured_at` text;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `ledger_recurring_bills` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `fx_source` text;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `fx_captured_at` text;--> statement-breakpoint
ALTER TABLE `ledger_transactions` ADD `deleted_at` text;