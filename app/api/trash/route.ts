import { env } from "cloudflare:workers";
import { d1ErrorResponse } from "../d1-resilience";
import { accountUpdateStatements, applyStoredEffect, loadAccounts } from "../crypto-transactions/logic";

type TrashType = "account" | "transaction" | "crypto" | "bill";
type MoneyRow = {
  id: number;
  kind: "expense" | "income" | "transfer" | "investment";
  amount_cents: number;
  account_id: number;
  target_account_id: number | null;
  source_delta_cents: number;
  target_delta_cents: number;
};
type CryptoRow = {
  id: number;
  account_id: number;
  target_account_id: number | null;
  funding_account_id: number | null;
  quantity_delta_text: string;
  target_quantity_delta_text: string;
  basis_delta_cny_cents: number;
  target_basis_delta_cny_cents: number;
  realized_delta_cny_cents: number;
  funding_delta_cents: number;
};

const types = new Set<TrashType>(["account", "transaction", "crypto", "bill"]);

function primaryDelta(kind: MoneyRow["kind"], group: string, amount: number) {
  if (kind === "income") return group === "liability" ? -amount : amount;
  return group === "liability" ? amount : -amount;
}

function targetDelta(group: string, amount: number) {
  return group === "liability" ? -amount : amount;
}

function readPayload(payload: Record<string, unknown>) {
  const type = String(payload.type || "") as TrashType;
  const id = Number(payload.id);
  if (!types.has(type) || !Number.isInteger(id) || id <= 0) return null;
  return { type, id };
}

export async function POST(request: Request) {
  try {
    const item = readPayload(await request.json() as Record<string, unknown>);
    if (!item) return Response.json({ error: "回收站项目无效" }, { status: 400 });

    if (item.type === "account") {
      const row = await env.DB.prepare("UPDATE ledger_accounts SET archived = 0, archived_at = NULL WHERE id = ? AND archived = 1 RETURNING id").bind(item.id).first();
      if (!row) return Response.json({ error: "找不到该账户" }, { status: 404 });
      return Response.json({ ok: true });
    }

    if (item.type === "bill") {
      const row = await env.DB.prepare("UPDATE ledger_recurring_bills SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL RETURNING id").bind(item.id).first();
      if (!row) return Response.json({ error: "找不到该固定账单" }, { status: 404 });
      return Response.json({ ok: true });
    }

    if (item.type === "transaction") {
      const tx = await env.DB.prepare("SELECT id, kind, amount_cents, account_id, target_account_id, source_delta_cents, target_delta_cents FROM ledger_transactions WHERE id = ? AND deleted_at IS NOT NULL").bind(item.id).first<MoneyRow>();
      if (!tx) return Response.json({ error: "找不到该流水" }, { status: 404 });
      const rows = await env.DB.prepare("SELECT id, account_group FROM ledger_accounts WHERE id IN (?, ?)").bind(tx.account_id, tx.target_account_id ?? -1).all<{ id: number; account_group: string }>();
      const source = rows.results.find((row) => row.id === tx.account_id);
      const target = rows.results.find((row) => row.id === tx.target_account_id);
      if (!source || (tx.target_account_id && !target)) return Response.json({ error: "关联账户不存在，无法恢复这笔流水" }, { status: 409 });
      const sourceChange = tx.source_delta_cents || primaryDelta(tx.kind, source.account_group, tx.amount_cents);
      const targetChange = tx.target_delta_cents || (target ? targetDelta(target.account_group, tx.amount_cents) : 0);
      const statements = [env.DB.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents + ? WHERE id = ?").bind(sourceChange, tx.account_id)];
      if (tx.target_account_id) statements.push(env.DB.prepare("UPDATE ledger_accounts SET balance_cents = balance_cents + ? WHERE id = ?").bind(targetChange, tx.target_account_id));
      statements.push(env.DB.prepare("UPDATE ledger_transactions SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").bind(item.id));
      await env.DB.batch(statements);
      return Response.json({ ok: true });
    }

    const tx = await env.DB.prepare("SELECT id, account_id, target_account_id, funding_account_id, quantity_delta_text, target_quantity_delta_text, basis_delta_cny_cents, target_basis_delta_cny_cents, realized_delta_cny_cents, funding_delta_cents FROM ledger_crypto_transactions WHERE id = ? AND deleted_at IS NOT NULL").bind(item.id).first<CryptoRow>();
    if (!tx) return Response.json({ error: "找不到该 Crypto 操作" }, { status: 404 });
    const accounts = await loadAccounts([tx.account_id, tx.target_account_id, tx.funding_account_id]);
    if (!accounts.get(tx.account_id) || (tx.target_account_id && !accounts.get(tx.target_account_id)) || (tx.funding_account_id && !accounts.get(tx.funding_account_id))) {
      return Response.json({ error: "关联账户不存在，无法恢复这次操作" }, { status: 409 });
    }
    applyStoredEffect(accounts, tx, 1);
    for (const row of accounts.values()) {
      if (row.asset_type === "crypto" && (Number(row.quantity_text ?? 0) < -1e-12 || row.cost_basis_cny_cents < 0)) {
        return Response.json({ error: "当前持仓不足以恢复这次操作，请先校准账户" }, { status: 409 });
      }
    }
    const statements = accountUpdateStatements(accounts, [tx.account_id, tx.target_account_id, tx.funding_account_id]);
    statements.push(env.DB.prepare("UPDATE ledger_crypto_transactions SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL").bind(item.id));
    await env.DB.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "恢复失败");
  }
}

export async function DELETE(request: Request) {
  try {
    const item = readPayload(await request.json() as Record<string, unknown>);
    if (!item) return Response.json({ error: "回收站项目无效" }, { status: 400 });
    if (item.type === "account") {
      const linked = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM ledger_transactions WHERE account_id = ? OR target_account_id = ?) + (SELECT COUNT(*) FROM ledger_crypto_transactions WHERE account_id = ? OR target_account_id = ? OR funding_account_id = ?) + (SELECT COUNT(*) FROM ledger_recurring_bills WHERE account_id = ?) AS total").bind(item.id, item.id, item.id, item.id, item.id, item.id).first<{ total: number }>();
      if (Number(linked?.total ?? 0) > 0) return Response.json({ error: "该账户仍关联历史记录，只能保留在归档中" }, { status: 409 });
      const row = await env.DB.prepare("DELETE FROM ledger_accounts WHERE id = ? AND archived = 1 RETURNING id").bind(item.id).first();
      if (!row) return Response.json({ error: "找不到该账户" }, { status: 404 });
      return Response.json({ ok: true });
    }
    const table = item.type === "transaction" ? "ledger_transactions" : item.type === "crypto" ? "ledger_crypto_transactions" : "ledger_recurring_bills";
    const row = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL RETURNING id`).bind(item.id).first();
    if (!row) return Response.json({ error: "找不到该回收站项目" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "永久删除失败");
  }
}
