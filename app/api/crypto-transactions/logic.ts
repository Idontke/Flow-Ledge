import { env } from "cloudflare:workers";

export type CryptoKind = "buy" | "sell" | "deposit" | "withdrawal" | "transfer";
export type CryptoPayload = {
  accountId?: number;
  targetAccountId?: number | null;
  fundingAccountId?: number | null;
  kind?: CryptoKind;
  quantity?: number;
  amount?: number;
  currency?: string;
  feeAmount?: number;
  baseAmountCny?: number;
  fxRate?: number;
  fxSource?: string;
  fxCapturedAt?: string;
  occurredAt?: string;
  note?: string;
};

export type CryptoAccountRow = {
  id: number;
  account_group: string;
  balance_cents: number;
  currency: string;
  asset_type: string;
  asset_id: string | null;
  quantity_text: string | null;
  cost_basis_cny_cents: number;
  realized_pnl_cny_cents: number;
  archived: number;
};

export type CryptoEffect = {
  accountId: number;
  targetAccountId: number | null;
  fundingAccountId: number | null;
  kind: CryptoKind;
  quantity: number;
  amount: number;
  currency: string;
  feeAmount: number;
  baseAmountCny: number;
  fxRate: number;
  fxSource: string;
  fxCapturedAt: string;
  quantityDelta: number;
  targetQuantityDelta: number;
  basisDeltaCny: number;
  targetBasisDeltaCny: number;
  realizedDeltaCny: number;
  fundingDelta: number;
  occurredAt: string;
  note: string;
};

const currencies = new Set(["CNY", "USD", "USDT", "JPY", "HKD", "EUR", "GBP", "CAD"]);
const kinds = new Set<CryptoKind>(["buy", "sell", "deposit", "withdrawal", "transfer"]);

export async function loadAccounts(ids: Array<number | null | undefined>) {
  const unique = Array.from(new Set(ids.filter((id): id is number => Number.isInteger(id) && Number(id) > 0)));
  if (!unique.length) return new Map<number, CryptoAccountRow>();
  const placeholders = unique.map(() => "?").join(",");
  const rows = await env.DB.prepare(`SELECT id, account_group, balance_cents, currency, asset_type, asset_id, quantity_text, cost_basis_cny_cents, realized_pnl_cny_cents, archived FROM ledger_accounts WHERE id IN (${placeholders})`).bind(...unique).all<CryptoAccountRow>();
  return new Map(rows.results.map((row) => [row.id, row]));
}

export function applyStoredEffect(accounts: Map<number, CryptoAccountRow>, row: {
  account_id: number;
  target_account_id: number | null;
  funding_account_id: number | null;
  quantity_delta_text: string;
  target_quantity_delta_text: string;
  basis_delta_cny_cents: number;
  target_basis_delta_cny_cents: number;
  realized_delta_cny_cents: number;
  funding_delta_cents: number;
}, direction: 1 | -1) {
  const source = accounts.get(row.account_id);
  if (source) {
    source.quantity_text = String(Number(source.quantity_text ?? 0) + direction * Number(row.quantity_delta_text ?? 0));
    source.cost_basis_cny_cents += direction * Number(row.basis_delta_cny_cents ?? 0);
    source.realized_pnl_cny_cents += direction * Number(row.realized_delta_cny_cents ?? 0);
  }
  const target = row.target_account_id ? accounts.get(row.target_account_id) : null;
  if (target) {
    target.quantity_text = String(Number(target.quantity_text ?? 0) + direction * Number(row.target_quantity_delta_text ?? 0));
    target.cost_basis_cny_cents += direction * Number(row.target_basis_delta_cny_cents ?? 0);
  }
  const funding = row.funding_account_id ? accounts.get(row.funding_account_id) : null;
  if (funding) funding.balance_cents += direction * Number(row.funding_delta_cents ?? 0);
}

export function calculateEffect(payload: CryptoPayload, accounts: Map<number, CryptoAccountRow>): CryptoEffect | { error: string } {
  const accountId = Number(payload.accountId);
  const targetAccountId = payload.targetAccountId ? Number(payload.targetAccountId) : null;
  const fundingAccountId = payload.fundingAccountId ? Number(payload.fundingAccountId) : null;
  const kind = payload.kind;
  const quantity = Number(payload.quantity);
  const amount = Math.round(Number(payload.amount ?? 0) * 100);
  const feeAmount = Math.round(Number(payload.feeAmount ?? 0) * 100);
  const currency = String(payload.currency || "CNY").toUpperCase();
  const baseAmountCny = Math.round(Number(payload.baseAmountCny ?? (currency === "CNY" ? payload.amount ?? 0 : 0)) * 100);
  const fxRate = Number(payload.fxRate ?? (amount > 0 ? baseAmountCny / amount : currency === "CNY" ? 1 : 0));
  const source = accounts.get(accountId);
  const target = targetAccountId ? accounts.get(targetAccountId) : null;
  const funding = fundingAccountId ? accounts.get(fundingAccountId) : null;
  if (!kind || !kinds.has(kind)) return { error: "请选择 Crypto 操作类型" };
  if (!source || source.archived || source.asset_type !== "crypto") return { error: "找不到所选 Crypto 持仓" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "持币数量必须大于 0" };
  if (!currencies.has(currency)) return { error: "暂不支持该结算币种" };
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(feeAmount) || feeAmount < 0) return { error: "成交金额或手续费无效" };
  if ((kind === "buy" || kind === "sell") && amount <= 0) return { error: "买入或卖出需要填写成交总额" };
  if ((amount > 0 || feeAmount > 0) && (!Number.isFinite(fxRate) || fxRate <= 0 || baseAmountCny <= 0)) return { error: "汇率尚未同步，无法锁定本次操作成本" };
  if (funding && (funding.archived || funding.asset_type === "crypto" || funding.currency !== currency)) return { error: "资金账户必须是同币种的普通账户" };
  if ((kind === "buy" || kind === "sell") && fundingAccountId && !funding) return { error: "找不到资金账户" };
  if (kind === "transfer" && (!target || target.id === source.id || target.archived || target.asset_type !== "crypto" || target.asset_id !== source.asset_id)) return { error: "请选择另一个相同币种的 Crypto 持仓" };

  const currentQuantity = Number(source.quantity_text ?? 0);
  if (["sell", "withdrawal", "transfer"].includes(kind) && quantity > currentQuantity + 1e-12) return { error: "卖出或转出的数量超过当前持仓" };
  const feeBaseCny = Math.round(feeAmount * fxRate);
  const averageCost = currentQuantity > 0 ? source.cost_basis_cny_cents / currentQuantity : 0;
  const basisReduction = Math.min(source.cost_basis_cny_cents, Math.round(averageCost * quantity));
  let quantityDelta = 0;
  let targetQuantityDelta = 0;
  let basisDeltaCny = 0;
  let targetBasisDeltaCny = 0;
  let realizedDeltaCny = 0;
  let fundingDelta = 0;
  if (kind === "buy" || kind === "deposit") {
    quantityDelta = quantity;
    basisDeltaCny = baseAmountCny + feeBaseCny;
  } else {
    quantityDelta = -quantity;
    basisDeltaCny = -basisReduction;
    if (kind === "sell") realizedDeltaCny = baseAmountCny - feeBaseCny - basisReduction;
    if (kind === "transfer") {
      targetQuantityDelta = quantity;
      targetBasisDeltaCny = basisReduction;
    }
  }
  if (funding) {
    if (kind === "buy") fundingDelta = funding.account_group === "liability" ? amount + feeAmount : -(amount + feeAmount);
    if (kind === "sell") fundingDelta = funding.account_group === "liability" ? -(amount - feeAmount) : amount - feeAmount;
  }
  return {
    accountId, targetAccountId: kind === "transfer" ? targetAccountId : null, fundingAccountId: (kind === "buy" || kind === "sell") ? fundingAccountId : null,
    kind, quantity, amount, currency, feeAmount, baseAmountCny, fxRate,
    fxSource: String(payload.fxSource || (currency === "CNY" ? "CNY" : "未标注")).trim().slice(0, 48),
    fxCapturedAt: payload.fxCapturedAt || new Date().toISOString(),
    quantityDelta, targetQuantityDelta,
    basisDeltaCny, targetBasisDeltaCny, realizedDeltaCny, fundingDelta,
    occurredAt: payload.occurredAt || new Date().toISOString(), note: String(payload.note || "").trim().slice(0, 80),
  };
}

export function applyNewEffect(accounts: Map<number, CryptoAccountRow>, effect: CryptoEffect) {
  applyStoredEffect(accounts, {
    account_id: effect.accountId,
    target_account_id: effect.targetAccountId,
    funding_account_id: effect.fundingAccountId,
    quantity_delta_text: String(effect.quantityDelta),
    target_quantity_delta_text: String(effect.targetQuantityDelta),
    basis_delta_cny_cents: effect.basisDeltaCny,
    target_basis_delta_cny_cents: effect.targetBasisDeltaCny,
    realized_delta_cny_cents: effect.realizedDeltaCny,
    funding_delta_cents: effect.fundingDelta,
  }, 1);
}

export function accountUpdateStatements(accounts: Map<number, CryptoAccountRow>, ids: Array<number | null>) {
  const unique = Array.from(new Set(ids.filter((id): id is number => Boolean(id))));
  return unique.flatMap((id) => {
    const row = accounts.get(id);
    if (!row) return [];
    if (row.asset_type === "crypto") {
      return [env.DB.prepare("UPDATE ledger_accounts SET quantity_text = ?, cost_basis_cny_cents = ?, realized_pnl_cny_cents = ? WHERE id = ?").bind(String(Math.max(0, Number(row.quantity_text ?? 0))), Math.max(0, row.cost_basis_cny_cents), row.realized_pnl_cny_cents, id)];
    }
    return [env.DB.prepare("UPDATE ledger_accounts SET balance_cents = ? WHERE id = ?").bind(row.balance_cents, id)];
  });
}
