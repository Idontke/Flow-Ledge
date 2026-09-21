ALTER TABLE `ledger_accounts` ADD `asset_type` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD `asset_id` text;--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD `asset_symbol` text;--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD `quantity_text` text;