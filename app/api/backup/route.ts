import { env } from "cloudflare:workers";
import { d1ErrorResponse, withD1ReadRetry } from "../d1-resilience";

const tableNames = ["ledger_accounts", "ledger_budget_plans", "ledger_category_budgets", "ledger_transactions", "ledger_crypto_transactions", "ledger_recurring_bills"] as const;
type Backup = { schemaVersion?: number; exportedAt?: string; tables?: Partial<Record<(typeof tableNames)[number], Array<Record<string, unknown>>>> };

export async function GET() {
  try {
    const tables: Record<string, Array<Record<string, unknown>>> = {};
    const results = await withD1ReadRetry(() => env.DB.batch(tableNames.map((table) => env.DB.prepare(`SELECT * FROM ${table}`))));
    tableNames.forEach((table, index) => { tables[table] = results[index].results as Array<Record<string, unknown>>; });
    const body = JSON.stringify({ schemaVersion: 3, exportedAt: new Date().toISOString(), product: "FlowLedger", tables }, null, 2);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="flowledger-backup-${stamp}.json"` } });
  } catch (error) {
    return d1ErrorResponse(error, "备份失败");
  }
}

function insert(table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  if (!columns.length) throw new Error(`备份中的 ${table} 记录为空`);
  const allowed = new Set([
    "id", "name", "account_group", "balance_cents", "currency", "asset_type", "asset_id", "asset_symbol", "quantity_text", "cost_basis_cny_cents", "realized_pnl_cny_cents", "color", "short_label", "sort_order", "archived", "archived_at", "created_at",
    "month_key", "total_budget_cents", "savings_target_cents", "updated_at", "category", "amount_cents", "kind", "title", "account_id", "target_account_id", "funding_account_id", "source_delta_cents", "target_delta_cents", "target_amount_cents", "target_currency", "fee_amount_cents", "fee_currency", "base_amount_cny_cents", "fx_rate_text", "fx_source", "fx_captured_at", "quantity_delta_text", "target_quantity_delta_text", "basis_delta_cny_cents", "target_basis_delta_cny_cents", "realized_delta_cny_cents", "funding_delta_cents", "occurred_at", "note", "due_day", "active", "frequency", "next_due_date", "trial_ends_at", "deleted_at",
  ]);
  if (columns.some((column) => !allowed.has(column))) throw new Error(`备份包含无法识别的字段：${table}`);
  const sql = `INSERT INTO ${table} (${columns.map((column) => `\`${column}\``).join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
  return env.DB.prepare(sql).bind(...columns.map((column) => row[column]));
}

export async function POST(request: Request) {
  try {
    const backup = await request.json() as Backup;
    if (![2, 3].includes(Number(backup.schemaVersion)) || !backup.tables || !Array.isArray(backup.tables.ledger_accounts)) return Response.json({ error: "这不是可识别的 FlowLedger 备份" }, { status: 400 });
    for (const table of tableNames) if (backup.tables[table] != null && !Array.isArray(backup.tables[table])) return Response.json({ error: `备份表 ${table} 格式无效` }, { status: 400 });
    const statements = [
      env.DB.prepare("DELETE FROM ledger_crypto_transactions"),
      env.DB.prepare("DELETE FROM ledger_transactions"),
      env.DB.prepare("DELETE FROM ledger_category_budgets"),
      env.DB.prepare("DELETE FROM ledger_recurring_bills"),
      env.DB.prepare("DELETE FROM ledger_budget_plans"),
      env.DB.prepare("DELETE FROM ledger_accounts"),
    ];
    for (const table of tableNames) for (const row of backup.tables[table] ?? []) statements.push(insert(table, row));
    await env.DB.batch(statements);
    return Response.json({ ok: true, restoredAt: new Date().toISOString() });
  } catch (error) {
    return d1ErrorResponse(error, "恢复备份失败");
  }
}
