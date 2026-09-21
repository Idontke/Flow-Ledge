import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("ledger_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  group: text("account_group", { enum: ["cash", "investment", "liability"] }).notNull(),
  balance: integer("balance_cents").notNull().default(0),
  currency: text("currency").notNull().default("CNY"),
  assetType: text("asset_type", { enum: ["manual", "crypto"] }).notNull().default("manual"),
  assetId: text("asset_id"),
  assetSymbol: text("asset_symbol"),
  quantity: text("quantity_text"),
  costBasisCny: integer("cost_basis_cny_cents").notNull().default(0),
  realizedPnlCny: integer("realized_pnl_cny_cents").notNull().default(0),
  color: text("color").notNull(),
  short: text("short_label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const transactions = sqliteTable("ledger_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  kind: text("kind", { enum: ["expense", "income", "transfer", "investment"] }).notNull(),
  amount: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("CNY"),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  targetAccountId: integer("target_account_id").references(() => accounts.id),
  sourceDelta: integer("source_delta_cents").notNull().default(0),
  targetDelta: integer("target_delta_cents").notNull().default(0),
  targetAmount: integer("target_amount_cents"),
  targetCurrency: text("target_currency"),
  feeAmount: integer("fee_amount_cents").notNull().default(0),
  feeCurrency: text("fee_currency"),
  baseAmountCny: integer("base_amount_cny_cents").notNull().default(0),
  fxRate: text("fx_rate_text"),
  fxSource: text("fx_source"),
  fxCapturedAt: text("fx_captured_at"),
  occurredAt: text("occurred_at").notNull(),
  note: text("note").notNull().default(""),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const budgetPlans = sqliteTable("ledger_budget_plans", {
  monthKey: text("month_key").primaryKey(),
  totalBudget: integer("total_budget_cents").notNull().default(0),
  savingsTarget: integer("savings_target_cents").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const categoryBudgets = sqliteTable("ledger_category_budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthKey: text("month_key").notNull().references(() => budgetPlans.monthKey),
  category: text("category").notNull(),
  amount: integer("amount_cents").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const recurringBills = sqliteTable("ledger_recurring_bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  category: text("category").notNull().default("固定支出"),
  amount: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("CNY"),
  dueDay: integer("due_day").notNull(),
  accountId: integer("account_id").references(() => accounts.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  frequency: text("frequency", { enum: ["monthly", "yearly"] }).notNull().default("monthly"),
  nextDueDate: text("next_due_date"),
  trialEndsAt: text("trial_ends_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const cryptoTransactions = sqliteTable("ledger_crypto_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  targetAccountId: integer("target_account_id").references(() => accounts.id),
  fundingAccountId: integer("funding_account_id").references(() => accounts.id),
  kind: text("kind", { enum: ["buy", "sell", "deposit", "withdrawal", "transfer"] }).notNull(),
  quantity: text("quantity_text").notNull(),
  amount: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("CNY"),
  feeAmount: integer("fee_amount_cents").notNull().default(0),
  baseAmountCny: integer("base_amount_cny_cents").notNull().default(0),
  fxRate: text("fx_rate_text"),
  fxSource: text("fx_source"),
  fxCapturedAt: text("fx_captured_at"),
  quantityDelta: text("quantity_delta_text").notNull().default("0"),
  targetQuantityDelta: text("target_quantity_delta_text").notNull().default("0"),
  basisDeltaCny: integer("basis_delta_cny_cents").notNull().default(0),
  targetBasisDeltaCny: integer("target_basis_delta_cny_cents").notNull().default(0),
  realizedDeltaCny: integer("realized_delta_cny_cents").notNull().default(0),
  fundingDelta: integer("funding_delta_cents").notNull().default(0),
  occurredAt: text("occurred_at").notNull(),
  note: text("note").notNull().default(""),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const marketCache = sqliteTable("ledger_market_cache", {
  key: text("cache_key").primaryKey(),
  payload: text("payload_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
