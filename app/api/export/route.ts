import { env } from "cloudflare:workers";
import { d1ErrorResponse, withD1ReadRetry } from "../d1-resilience";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  try {
    const [moneyRows, cryptoRows] = await withD1ReadRetry(() => env.DB.batch([
      env.DB.prepare("SELECT t.id, t.occurred_at, t.kind, t.title, t.category, t.amount_cents, t.currency, t.target_amount_cents, t.target_currency, t.fee_amount_cents, t.fee_currency, t.base_amount_cny_cents, t.fx_rate_text, t.fx_source, t.fx_captured_at, a.name AS source_account, b.name AS target_account FROM ledger_transactions t LEFT JOIN ledger_accounts a ON a.id = t.account_id LEFT JOIN ledger_accounts b ON b.id = t.target_account_id WHERE t.deleted_at IS NULL ORDER BY t.occurred_at DESC"),
      env.DB.prepare("SELECT t.id, t.occurred_at, t.kind, t.quantity_text, t.amount_cents, t.currency, t.fee_amount_cents, t.base_amount_cny_cents, t.fx_rate_text, t.fx_source, t.fx_captured_at, t.note, a.name AS source_account, b.name AS target_account, f.name AS funding_account FROM ledger_crypto_transactions t LEFT JOIN ledger_accounts a ON a.id = t.account_id LEFT JOIN ledger_accounts b ON b.id = t.target_account_id LEFT JOIN ledger_accounts f ON f.id = t.funding_account_id WHERE t.deleted_at IS NULL ORDER BY t.occurred_at DESC"),
    ]));
    const header = ["记录类型", "编号", "时间", "操作", "标题/备注", "分类", "来源账户", "目标账户", "资金账户", "原币金额", "币种", "到账金额", "到账币种", "数量", "手续费", "手续费币种", "锁定CNY金额", "锁定汇率", "汇率来源", "汇率锁定时间"];
    const rows = [header.map(csvCell).join(",")];
    for (const row of moneyRows.results) rows.push([
      "收支/转账", row.id, row.occurred_at, row.kind, row.title, row.category, row.source_account, row.target_account, "",
      Number(row.amount_cents || 0) / 100, row.currency, row.target_amount_cents == null ? "" : Number(row.target_amount_cents) / 100,
      row.target_currency, "", Number(row.fee_amount_cents || 0) / 100, row.fee_currency,
      Number(row.base_amount_cny_cents || 0) / 100, row.fx_rate_text, row.fx_source, row.fx_captured_at,
    ].map(csvCell).join(","));
    for (const row of cryptoRows.results) rows.push([
      "Crypto", row.id, row.occurred_at, row.kind, row.note, "Crypto", row.source_account, row.target_account, row.funding_account,
      Number(row.amount_cents || 0) / 100, row.currency, "", "", row.quantity_text,
      Number(row.fee_amount_cents || 0) / 100, row.currency, Number(row.base_amount_cny_cents || 0) / 100, row.fx_rate_text, row.fx_source, row.fx_captured_at,
    ].map(csvCell).join(","));
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`\uFEFF${rows.join("\n")}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="flowledger-${stamp}.csv"` } });
  } catch (error) {
    return d1ErrorResponse(error, "导出失败");
  }
}
