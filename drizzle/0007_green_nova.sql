ALTER TABLE `ledger_crypto_transactions` ADD `quantity_delta_text` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `target_quantity_delta_text` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `basis_delta_cny_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `target_basis_delta_cny_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `realized_delta_cny_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_crypto_transactions` ADD `funding_delta_cents` integer DEFAULT 0 NOT NULL;