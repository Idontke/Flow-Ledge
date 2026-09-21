import { env } from "cloudflare:workers";
import { d1ErrorResponse, withD1ReadRetry } from "../d1-resilience";

type TxKind = "expense" | "income" | "transfer" | "investment";
const currencies = new Set(["CNY", "USD", "USDT", "JPY", "HKD", "EUR", "GBP", "CAD"]);

type AccountRow = {
  id: number; name: string; account_group: string; balance_cents: number; currency: string;
  asset_type: "manual" | "crypto"; asset_id: string | null; asset_symbol: string | null;
  quantity_text: string | null; cost_basis_cny_cents: number; realized_pnl_cny_cents: number;
  color: string; short_label: string; sort_order: number; archived: number;
  archived_at: string | null; created_at: string;
};
type TransactionRow = {
  id: number; title: string; category: string; kind: TxKind; amount_cents: number; currency: string;
  account_id: number; target_account_id: number | null; source_delta_cents: number; target_delta_cents: number;
  target_amount_cents: number | null; target_currency: string | null; fee_amount_cents: number;
  fee_currency: string | null; base_amount_cny_cents: number; fx_rate_text: string | null;
  fx_source: string | null; fx_captured_at: string | null; occurred_at: string; note: string;
  deleted_at: string | null; created_at: string;
};
type CryptoRow = {
  id: number; account_id: number; target_account_id: number | null; funding_account_id: number | null;
  kind: string; quantity_text: string; amount_cents: number; currency: string; fee_amount_cents: number;
  base_amount_cny_cents: number; fx_rate_text: string | null; fx_source: string | null;
  fx_captured_at: string | null; quantity_delta_text: string; target_quantity_delta_text: string;
  basis_delta_cny_cents: number; target_basis_delta_cny_cents: number; realized_delta_cny_cents: number;
  funding_delta_cents: number; occurred_at: string; note: string; deleted_at: string | null; created_at: string;
};
type PlanRow = { month_key: string; total_budget_cents: number; savings_target_cents: number; updated_at: string };
type CategoryRow = { id: number; month_key: string; category: string; amount_cents: number; sort_order: number };
type BillRow = {
  id: number; title: string; category: string; amount_cents: number; currency: string; due_day: number;
  account_id: number | null; active: number; frequency: "monthly" | "yearly"; next_due_date: string | null;
  trial_ends_at: string | null; deleted_at: string | null; created_at: string;
};

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function toClientAccount(account: AccountRow) {
  return {
    id: account.id, name: account.name, group: account.account_group, currency: account.currency,
    balance: account.asset_type === "crypto" ? Number(account.quantity_text ?? 0) : account.balance_cents / 100,
    assetType: account.asset_type, assetId: account.asset_id, assetSymbol: account.asset_symbol,
    quantity: account.quantity_text, costBasisCny: account.cost_basis_cny_cents / 100,
    realizedPnlCny: account.realized_pnl_cny_cents / 100, color: account.color, short: account.short_label,
    sortOrder: account.sort_order, archived: Boolean(account.archived), archivedAt: account.archived_at,
    createdAt: account.created_at,
  };
}

function toClientTransaction(row: TransactionRow) {
  return {
    id: row.id, title: row.title, category: row.category, kind: row.kind, amount: row.amount_cents / 100,
    currency: row.currency, accountId: row.account_id, targetAccountId: row.target_account_id,
    sourceDelta: row.source_delta_cents / 100, targetDelta: row.target_delta_cents / 100,
    targetAmount: row.target_amount_cents == null ? null : row.target_amount_cents / 100,
    targetCurrency: row.target_currency, feeAmount: row.fee_amount_cents / 100, feeCurrency: row.fee_currency,
    baseAmountCny: row.base_amount_cny_cents / 100, fxRate: row.fx_rate_text, fxSource: row.fx_source,
    fxCapturedAt: row.fx_captured_at, occurredAt: row.occurred_at, note: row.note,
    deletedAt: row.deleted_at, createdAt: row.created_at,
  };
}

function toClientCrypto(row: CryptoRow) {
  return {
    id: row.id, accountId: row.account_id, targetAccountId: row.target_account_id,
    fundingAccountId: row.funding_account_id, kind: row.kind, quantity: Number(row.quantity_text),
    amount: row.amount_cents / 100, currency: row.currency, feeAmount: row.fee_amount_cents / 100,
    baseAmountCny: row.base_amount_cny_cents / 100, fxRate: row.fx_rate_text, fxSource: row.fx_source,
    fxCapturedAt: row.fx_captured_at, quantityDelta: Number(row.quantity_delta_text),
    targetQuantityDelta: Number(row.target_quantity_delta_text), basisDeltaCny: row.basis_delta_cny_cents / 100,
    targetBasisDeltaCny: row.target_basis_delta_cny_cents / 100, realizedDeltaCny: row.realized_delta_cny_cents / 100,
    fundingDelta: row.funding_delta_cents / 100, occurredAt: row.occurred_at, note: row.note,
    deletedAt: row.deleted_at, createdAt: row.created_at,
  };
}

function toClientBill(row: BillRow) {
  return {
    id: row.id, title: row.title, category: row.category, amount: row.amount_cents / 100,
    currency: row.currency, dueDay: row.due_day, accountId: row.account_id, active: Boolean(row.active),
    frequency: row.frequency, nextDueDate: row.next_due_date, trialEndsAt: row.trial_ends_at,
    deletedAt: row.deleted_at, createdAt: row.created_at,
  };
}

function primaryDelta(kind: TxKind, group: string, amount: number) {
  if (kind === "income") return group === "liability" ? -amount : amount;
  return group === "liability" ? amount : -amount;
}

function targetDelta(group: string, amount: number) {
  return group === "liability" ? -amount : amount;
}

async function readLedger() {
  const monthKey = currentMonthKey();
  const results = await withD1ReadRetry(() => env.DB.batch([
    env.DB.prepare("SELECT * FROM ledger_accounts ORDER BY sort_order ASC, id ASC"),
    env.DB.prepare("SELECT * FROM ledger_transactions WHERE deleted_at IS NULL ORDER BY occurred_at DESC, id DESC LIMIT 200"),
    env.DB.prepare("SELECT * FROM ledger_crypto_transactions WHERE deleted_at IS NULL ORDER BY occurred_at DESC, id DESC LIMIT 200"),
    env.DB.prepare("SELECT * FROM ledger_budget_plans WHERE month_key = ? LIMIT 1").bind(monthKey),
    env.DB.prepare("SELECT * FROM ledger_category_budgets WHERE month_key = ? ORDER BY sort_order ASC, id ASC").bind(monthKey),
    env.DB.prepare("SELECT * FROM ledger_recurring_bills WHERE deleted_at IS NULL ORDER BY due_day ASC, id ASC"),
    env.DB.prepare("SELECT * FROM ledger_transactions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100"),
    env.DB.prepare("SELECT * FROM ledger_crypto_transactions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100"),
    env.DB.prepare("SELECT * FROM ledger_recurring_bills WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100"),
  ]));
  const accountRows = results[0].results as AccountRow[];
  const transactionRows = results[1].results as TransactionRow[];
  const cryptoRows = results[2].results as CryptoRow[];
  const planRows = results[3].results as PlanRow[];
  const categoryRows = results[4].results as CategoryRow[];
  const recurringRows = results[5].results as BillRow[];
  const deletedTransactions = results[6].results as TransactionRow[];
  const deletedCrypto = results[7].results as CryptoRow[];
  const deletedBills = results[8].results as BillRow[];
  const plan = planRows[0];
  return {
    accounts: accountRows.map(toClientAccount),
    transactions: transactionRows.map(toClientTransaction),
    cryptoTransactions: cryptoRows.map(toClientCrypto),
    monthlyBudget: (plan?.total_budget_cents ?? 0) / 100,
    savingsTarget: (plan?.savings_target_cents ?? 0) / 100,
    categoryBudgets: categoryRows.map((row) => ({ id: row.id, category: row.category, amount: row.amount_cents / 100 })),
    recurringBills: recurringRows.map(toClientBill),
    trashItems: [
      ...accountRows.filter((row) => row.archived).map((row) => ({ type: "account" as const, id: row.id, title: row.name, detail: "账户与历史关联", deletedAt: row.archived_at ?? row.created_at })),
      ...deletedTransactions.map((row) => ({ type: "transaction" as const, id: row.id, title: row.title, detail: `${row.kind} · ${row.currency} ${(row.amount_cents / 100).toFixed(2)}`, deletedAt: row.deleted_at ?? row.created_at })),
      ...deletedCrypto.map((row) => ({ type: "crypto" as const, id: row.id, title: row.note || `Crypto ${row.kind}`, detail: `${row.kind} · ${Number(row.quantity_text)} 枚`, deletedAt: row.deleted_at ?? row.created_at })),
      ...deletedBills.map((row) => ({ type: "bill" as const, id: row.id, title: row.title, detail: `固定账单 · ${row.currency} ${(row.amount_cents / 100).toFixed(2)}`, deletedAt: row.deleted_at ?? row.created_at })),
    ].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))),
  };
}

export async function GET() {
  try {
    return Response.json(await readLedger());
  } catch (error) {
    return d1ErrorResponse(error, "无法读取账本");
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { title?: string; category?: string; kind?: TxKind; amount?: number; accountAmount?: number; targetAmount?: number; feeAmount?: number; baseAmountCny?: number; fxRate?: number; fxSource?: string; fxCapturedAt?: string; currency?: string; accountId?: number; targetAccountId?: number | null; occurredAt?: string };
    const title = payload.title?.trim() || "未命名记录";
    const category = payload.category?.trim() || "其他";
    const amount = Math.round(Number(payload.amount) * 100);
    const currency = String(payload.currency || "CNY").toUpperCase();
    const accountId = Number(payload.accountId);
    const targetAccountId = payload.targetAccountId ? Number(payload.targetAccountId) : null;
    const kind = payload.kind;
    if (!kind || !["expense", "income", "transfer", "investment"].includes(kind)) return Response.json({ error: "请选择记录类型" }, { status: 400 });
    if (!currencies.has(currency)) return Response.json({ error: "暂不支持该交易币种" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(accountId)) return Response.json({ error: "金额或账户无效" }, { status: 400 });
    if ((kind === "transfer" || kind === "investment") && (!targetAccountId || targetAccountId === accountId)) return Response.json({ error: "请选择不同的转入账户" }, { status: 400 });

    const d1 = env.DB;
    const rows = await d1.prepare("SELECT id, account_group, currency, asset_type, archived FROM ledger_accounts WHERE id IN (?, ?)").bind(accountId, targetAccountId ?? -1).all<{ id: number; account_group: string; currency: string; asset_type: string; archived: number }>();
    const primary = rows.results.find((row) => row.id === accountId);
    const target = rows.results.find((row) => row.id === targetAccountId);
    if (!primary || primary.archived) return Response.json({ error: "找不到所选账户" }, { status: 404 });
    if ((kind === "transfer" || kind === "investment") && (!target || target.archived)) return Response.json({ error: "找不到转入账户" }, { status: 404 });
    if (primary.asset_type === "crypto" || target?.asset_type === "crypto") return Response.json({ error: "Crypto 持仓请在资产页编辑数量" }, { status: 400 });
    const needsConversion = (kind === "income" || kind === "expense") && currency !== primary.currency;
    const accountAmount = needsConversion ? Math.round(Number(payload.accountAmount) * 100) : amount;
    if (!Number.isFinite(accountAmount) || accountAmount <= 0) return Response.json({ error: "汇率尚未同步，暂时无法折算账户余额" }, { status: 400 });
    const storedCurrency = kind === "transfer" || kind === "investment" ? primary.currency : currency;
    const feeAmount = Math.round(Number(payload.feeAmount ?? 0) * 100);
    const targetAmount = target ? Math.round(Number(payload.targetAmount ?? (target.currency === primary.currency ? payload.amount : 0)) * 100) : null;
    const baseAmountCny = Math.round(Number(payload.baseAmountCny ?? (storedCurrency === "CNY" ? payload.amount : 0)) * 100);
    const fxRate = Number(payload.fxRate ?? (Number(payload.amount) > 0 ? Number(payload.baseAmountCny) / Number(payload.amount) : 0));
    const fxSource = String(payload.fxSource || (storedCurrency === "CNY" ? "CNY" : "未标注")).trim().slice(0, 48);
    const fxCapturedAt = payload.fxCapturedAt || new Date().toISOString();
    if (!Number.isFinite(feeAmount) || feeAmount < 0) return Response.json({ error: "手续费不能小于 0" }, { status: 400 });
    if (target && (!Number.isFinite(targetAmount) || !targetAmount || targetAmount <= 0)) return Response.json({ error: "请输入实际到账金额" }, { status: 400 });
    if (!Number.isFinite(baseAmountCny) || baseAmountCny <= 0) return Response.json({ error: "汇率尚未同步，无法锁定本笔交易的历史折算值" }, { status: 400 });

    const sourceDebit = (kind === "transfer" || kind === "investment") ? amount + feeAmount : accountAmount + feeAmount;
    const sourceChange = primaryDelta(kind, primary.account_group, sourceDebit);
    const targetChange = target && targetAmount ? targetDelta(target.account_group, targetAmount) : 0;
    const statements = [d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents + ? WHERE id = ?").bind(sourceChange, accountId)];
    if (targetAccountId) statements.push(d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents + ? WHERE id = ?").bind(targetChange, targetAccountId));
    statements.push(d1.prepare("INSERT INTO ledger_transactions (title, category, kind, amount_cents, currency, account_id, target_account_id, source_delta_cents, target_delta_cents, target_amount_cents, target_currency, fee_amount_cents, fee_currency, base_amount_cny_cents, fx_rate_text, fx_source, fx_captured_at, occurred_at, note, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL)").bind(title, category, kind, amount, storedCurrency, accountId, targetAccountId, sourceChange, targetChange, targetAmount, target?.currency ?? null, feeAmount, feeAmount ? primary.currency : null, baseAmountCny, Number.isFinite(fxRate) && fxRate > 0 ? String(fxRate) : null, fxSource, fxCapturedAt, payload.occurredAt || new Date().toISOString()));
    await d1.batch(statements);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return d1ErrorResponse(error, "保存失败");
  }
}
