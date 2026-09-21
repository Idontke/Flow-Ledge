import { env } from "cloudflare:workers";
import { d1ErrorResponse } from "../d1-resilience";

const groups = new Set(["cash", "investment", "liability"]);
const currencies = new Set(["CNY", "USD", "USDT"]);
const assetTypes = new Set(["manual", "crypto"]);

function validate(payload: Record<string, unknown>) {
  const name = String(payload.name ?? "").trim();
  const group = String(payload.group ?? "");
  const currency = String(payload.currency ?? "CNY").toUpperCase();
  const color = String(payload.color ?? "#213547");
  const assetType = String(payload.assetType ?? "manual");
  const assetId = assetType === "crypto" ? String(payload.assetId ?? "").trim().toLowerCase() : null;
  const assetSymbol = assetType === "crypto" ? String(payload.assetSymbol ?? "").trim().toUpperCase() : null;
  const rawBalance = Number(payload.balance);
  const balance = assetType === "crypto" ? 0 : Math.round(rawBalance * 100);
  const quantity = assetType === "crypto" ? String(payload.balance ?? "0") : null;
  const costBasisCny = assetType === "crypto" ? Math.round(Number(payload.costBasisCny ?? 0) * 100) : 0;
  if (!name || name.length > 24) return { error: "账户名称需要在 1–24 个字符之间" };
  if (!groups.has(group)) return { error: "请选择账户类型" };
  if (!currencies.has(currency)) return { error: "暂不支持该币种" };
  if (!assetTypes.has(assetType) || (assetType === "crypto" && group !== "investment")) return { error: "Crypto 只能添加为投资账户" };
  if (assetType === "crypto" && (!assetId || !assetSymbol)) return { error: "请选择 Crypto 币种" };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { error: "账户颜色无效" };
  if (!Number.isFinite(rawBalance) || rawBalance < 0) return { error: assetType === "crypto" ? "持币数量不能小于 0" : "余额不能小于 0" };
  if (!Number.isFinite(costBasisCny) || costBasisCny < 0) return { error: "持仓成本不能小于 0" };
  return { name, group, currency, color, balance, assetType, assetId, assetSymbol, quantity, costBasisCny, short: assetSymbol || Array.from(name)[0]?.toUpperCase() || "账" };
}

function toClient(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: String(row.name),
    group: String(row.account_group),
    balance: String(row.asset_type) === "crypto" ? Number(row.quantity_text ?? 0) : Number(row.balance_cents) / 100,
    currency: String(row.currency),
    assetType: String(row.asset_type ?? "manual"),
    assetId: row.asset_id ? String(row.asset_id) : null,
    assetSymbol: row.asset_symbol ? String(row.asset_symbol) : null,
    costBasisCny: Number(row.cost_basis_cny_cents ?? 0) / 100,
    realizedPnlCny: Number(row.realized_pnl_cny_cents ?? 0) / 100,
    color: String(row.color),
    short: String(row.short_label),
    archived: Boolean(row.archived),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const values = validate(payload);
    if ("error" in values) return Response.json({ error: values.error }, { status: 400 });
    const result = await env.DB.prepare(
      "INSERT INTO ledger_accounts (name, account_group, balance_cents, currency, asset_type, asset_id, asset_symbol, quantity_text, cost_basis_cny_cents, color, short_label, sort_order, archived, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ledger_accounts), 0, NULL) RETURNING id, name, account_group, balance_cents, currency, asset_type, asset_id, asset_symbol, quantity_text, cost_basis_cny_cents, realized_pnl_cny_cents, color, short_label, archived, archived_at",
    ).bind(values.name, values.group, values.balance, values.currency, values.assetType, values.assetId, values.assetSymbol, values.quantity, values.costBasisCny, values.color, values.short).first<Record<string, unknown>>();
    if (!result) throw new Error("账户创建失败");
    return Response.json({ account: toClient(result) }, { status: 201 });
  } catch (error) {
    return d1ErrorResponse(error, "账户创建失败");
  }
}
