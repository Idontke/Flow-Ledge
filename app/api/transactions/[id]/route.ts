import { env } from "cloudflare:workers";
import { d1ErrorResponse, withD1ReadRetry } from "../../d1-resilience";

type TxKind = "expense" | "income" | "transfer" | "investment";
const currencies = new Set(["CNY", "USD", "USDT", "JPY", "HKD", "EUR", "GBP", "CAD"]);
type TxRow = {
  id: number;
  kind: TxKind;
  amount_cents: number;
  account_id: number;
  target_account_id: number | null;
  source_delta_cents: number;
  target_delta_cents: number;
  occurred_at: string;
};

function idFrom(request: Request) {
  return Number(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
}

function primaryDelta(kind: TxKind, group: string, amount: number) {
  if (kind === "income") return group === "liability" ? -amount : amount;
  return group === "liability" ? amount : -amount;
}

function targetDelta(group: string, amount: number) {
  return group === "liability" ? -amount : amount;
}

type AccountState = { id: number; account_group: string; currency: string; asset_type: string; archived: number };

async function loadAccountGroups(ids: Array<number | null>) {
  const unique = Array.from(new Set(ids.filter((id): id is number => Boolean(id))));
  if (!unique.length) return new Map<number, AccountState>();
  const placeholders = unique.map(() => "?").join(", ");
  const result = await withD1ReadRetry(() => env.DB.prepare(`SELECT id, account_group, currency, asset_type, archived FROM ledger_accounts WHERE id IN (${placeholders})`).bind(...unique).all<AccountState>());
  return new Map(result.results.map((row) => [row.id, row]));
}

function oldDeltas(tx: TxRow, accounts: Map<number, AccountState>) {
  const sourceGroup = accounts.get(tx.account_id);
  const targetGroup = tx.target_account_id ? accounts.get(tx.target_account_id) : null;
  return {
    source: tx.source_delta_cents || (sourceGroup ? primaryDelta(tx.kind, sourceGroup.account_group, tx.amount_cents) : 0),
    target: tx.target_delta_cents || (targetGroup ? targetDelta(targetGroup.account_group, tx.amount_cents) : 0),
  };
}

export async function PATCH(request: Request) {
  try {
    const id = idFrom(request);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "流水编号无效" }, { status: 400 });
    const old = await env.DB.prepare("SELECT id, kind, amount_cents, account_id, target_account_id, source_delta_cents, target_delta_cents, occurred_at FROM ledger_transactions WHERE id = ? AND deleted_at IS NULL").bind(id).first<TxRow>();
    if (!old) return Response.json({ error: "找不到该流水" }, { status: 404 });
    const payload = await request.json() as { title?: string; category?: string; kind?: TxKind; amount?: number; accountAmount?: number; targetAmount?: number; feeAmount?: number; baseAmountCny?: number; fxRate?: number; fxSource?: string; fxCapturedAt?: string; currency?: string; accountId?: number; targetAccountId?: number | null; occurredAt?: string };
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

    const accountRows = await loadAccountGroups([accountId, targetAccountId, old.account_id, old.target_account_id]);
    const source = accountRows.get(accountId);
    const target = targetAccountId ? accountRows.get(targetAccountId) : null;
    const previous = oldDeltas(old, accountRows);
    if (!source || source.archived) return Response.json({ error: "找不到所选账户" }, { status: 404 });
    if ((kind === "transfer" || kind === "investment") && (!target || target.archived)) return Response.json({ error: "找不到转入账户" }, { status: 404 });
    if (source.asset_type === "crypto" || target?.asset_type === "crypto") return Response.json({ error: "Crypto 持仓请在资产页编辑数量" }, { status: 400 });
    const needsConversion = (kind === "income" || kind === "expense") && currency !== source.currency;
    const accountAmount = needsConversion ? Math.round(Number(payload.accountAmount) * 100) : amount;
    if (!Number.isFinite(accountAmount) || accountAmount <= 0) return Response.json({ error: "汇率尚未同步，暂时无法折算账户余额" }, { status: 400 });
    const storedCurrency = kind === "transfer" || kind === "investment" ? source.currency : currency;
    const feeAmount = Math.round(Number(payload.feeAmount ?? 0) * 100);
    const targetAmount = target ? Math.round(Number(payload.targetAmount ?? (target.currency === source.currency ? payload.amount : 0)) * 100) : null;
    const baseAmountCny = Math.round(Number(payload.baseAmountCny ?? (storedCurrency === "CNY" ? payload.amount : 0)) * 100);
    const fxRate = Number(payload.fxRate ?? (Number(payload.amount) > 0 ? Number(payload.baseAmountCny) / Number(payload.amount) : 0));
    const fxSource = String(payload.fxSource || (storedCurrency === "CNY" ? "CNY" : "未标注")).trim().slice(0, 48);
    const fxCapturedAt = payload.fxCapturedAt || new Date().toISOString();
    if (!Number.isFinite(feeAmount) || feeAmount < 0) return Response.json({ error: "手续费不能小于 0" }, { status: 400 });
    if (target && (!Number.isFinite(targetAmount) || !targetAmount || targetAmount <= 0)) return Response.json({ error: "请输入实际到账金额" }, { status: 400 });
    if (!Number.isFinite(baseAmountCny) || baseAmountCny <= 0) return Response.json({ error: "汇率尚未同步，无法锁定本笔交易的历史折算值" }, { status: 400 });
    const sourceDebit = (kind === "transfer" || kind === "investment") ? amount + feeAmount : accountAmount + feeAmount;
    const sourceChange = primaryDelta(kind, source.account_group, sourceDebit);
    const targetChange = target && targetAmount ? targetDelta(target.account_group, targetAmount) : 0;

    const d1 = env.DB;
    const statements = [d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents - ? WHERE id = ?").bind(previous.source, old.account_id)];
    if (old.target_account_id) statements.push(d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents - ? WHERE id = ?").bind(previous.target, old.target_account_id));
    statements.push(d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents + ? WHERE id = ?").bind(sourceChange, accountId));
    if (targetAccountId) statements.push(d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents + ? WHERE id = ?").bind(targetChange, targetAccountId));
    statements.push(d1.prepare("UPDATE ledger_transactions SET title = ?, category = ?, kind = ?, amount_cents = ?, currency = ?, account_id = ?, target_account_id = ?, source_delta_cents = ?, target_delta_cents = ?, target_amount_cents = ?, target_currency = ?, fee_amount_cents = ?, fee_currency = ?, base_amount_cny_cents = ?, fx_rate_text = ?, fx_source = ?, fx_captured_at = ?, occurred_at = ? WHERE id = ? AND deleted_at IS NULL").bind(title, category, kind, amount, storedCurrency, accountId, targetAccountId, sourceChange, targetChange, targetAmount, target?.currency ?? null, feeAmount, feeAmount ? source.currency : null, baseAmountCny, Number.isFinite(fxRate) && fxRate > 0 ? String(fxRate) : null, fxSource, fxCapturedAt, payload.occurredAt || old.occurred_at, id));
    await d1.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "流水更新失败");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = idFrom(request);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "流水编号无效" }, { status: 400 });
    const tx = await env.DB.prepare("SELECT id, kind, amount_cents, account_id, target_account_id, source_delta_cents, target_delta_cents, occurred_at FROM ledger_transactions WHERE id = ? AND deleted_at IS NULL").bind(id).first<TxRow>();
    if (!tx) return Response.json({ error: "找不到该流水" }, { status: 404 });
    const accountRows = await loadAccountGroups([tx.account_id, tx.target_account_id]);
    const previous = oldDeltas(tx, accountRows);
    const d1 = env.DB;
    const statements = [d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents - ? WHERE id = ?").bind(previous.source, tx.account_id)];
    if (tx.target_account_id) statements.push(d1.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents - ? WHERE id = ?").bind(previous.target, tx.target_account_id));
    statements.push(d1.prepare("UPDATE ledger_transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL").bind(id));
    await d1.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "流水删除失败");
  }
}
