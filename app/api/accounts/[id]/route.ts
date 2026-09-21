import { env } from "cloudflare:workers";
import { d1ErrorResponse } from "../../d1-resilience";

const groups = new Set(["cash", "investment", "liability"]);
const currencies = new Set(["CNY", "USD", "USDT"]);

function accountIdFrom(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return Number(parts.at(-1));
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

export async function PATCH(request: Request) {
  try {
    const id = accountIdFrom(request);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "账户编号无效" }, { status: 400 });
    const payload = await request.json() as Record<string, unknown>;

    if (payload.archived === false && !payload.name) {
      const restored = await env.DB.prepare(
        "UPDATE ledger_accounts SET archived = 0, archived_at = NULL WHERE id = ? RETURNING id, name, account_group, balance_cents, currency, asset_type, asset_id, asset_symbol, quantity_text, cost_basis_cny_cents, realized_pnl_cny_cents, color, short_label, archived, archived_at",
      ).bind(id).first<Record<string, unknown>>();
      if (!restored) return Response.json({ error: "找不到该账户" }, { status: 404 });
      return Response.json({ account: toClient(restored) });
    }

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
    if (!name || name.length > 24) return Response.json({ error: "账户名称需要在 1–24 个字符之间" }, { status: 400 });
    if (!groups.has(group)) return Response.json({ error: "请选择账户类型" }, { status: 400 });
    if (!currencies.has(currency)) return Response.json({ error: "暂不支持该币种" }, { status: 400 });
    if (!['manual', 'crypto'].includes(assetType) || (assetType === "crypto" && group !== "investment")) return Response.json({ error: "Crypto 只能添加为投资账户" }, { status: 400 });
    if (assetType === "crypto" && (!assetId || !assetSymbol)) return Response.json({ error: "请选择 Crypto 币种" }, { status: 400 });
    if (!/^#[0-9a-f]{6}$/i.test(color)) return Response.json({ error: "账户颜色无效" }, { status: 400 });
    if (!Number.isFinite(rawBalance) || rawBalance < 0) return Response.json({ error: assetType === "crypto" ? "持币数量不能小于 0" : "余额不能小于 0" }, { status: 400 });
    if (!Number.isFinite(costBasisCny) || costBasisCny < 0) return Response.json({ error: "持仓成本不能小于 0" }, { status: 400 });
    const short = assetSymbol || Array.from(name)[0]?.toUpperCase() || "账";
    const updated = await env.DB.prepare(
      "UPDATE ledger_accounts SET name = ?, account_group = ?, balance_cents = ?, currency = ?, asset_type = ?, asset_id = ?, asset_symbol = ?, quantity_text = ?, cost_basis_cny_cents = ?, color = ?, short_label = ? WHERE id = ? RETURNING id, name, account_group, balance_cents, currency, asset_type, asset_id, asset_symbol, quantity_text, cost_basis_cny_cents, realized_pnl_cny_cents, color, short_label, archived, archived_at",
    ).bind(name, group, balance, currency, assetType, assetId, assetSymbol, quantity, costBasisCny, color, short, id).first<Record<string, unknown>>();
    if (!updated) return Response.json({ error: "找不到该账户" }, { status: 404 });
    return Response.json({ account: toClient(updated) });
  } catch (error) {
    return d1ErrorResponse(error, "账户更新失败");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = accountIdFrom(request);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "账户编号无效" }, { status: 400 });
    const existing = await env.DB.prepare("SELECT id FROM ledger_accounts WHERE id = ? AND archived = 0").bind(id).first();
    if (!existing) return Response.json({ error: "找不到该账户" }, { status: 404 });
    const linked = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM ledger_transactions WHERE account_id = ? OR target_account_id = ?) + (SELECT COUNT(*) FROM ledger_crypto_transactions WHERE account_id = ? OR target_account_id = ? OR funding_account_id = ?) + (SELECT COUNT(*) FROM ledger_recurring_bills WHERE account_id = ?) AS total").bind(id, id, id, id, id, id).first<{ total: number }>();
    const total = Number(linked?.total ?? 0);
    await env.DB.prepare("UPDATE ledger_accounts SET archived = 1, archived_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    return Response.json({ accountId: id, mode: "archived", linkedTransactions: total });
  } catch (error) {
    return d1ErrorResponse(error, "账户删除失败");
  }
}
