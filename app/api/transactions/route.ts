import { env } from "cloudflare:workers";
import { d1ErrorResponse, withD1ReadRetry } from "../d1-resilience";

const kinds = new Set(["expense", "income", "transfer", "investment"]);

type TransactionRow = {
  id: number; title: string; category: string; kind: "expense" | "income" | "transfer" | "investment";
  amount_cents: number; currency: string; account_id: number; target_account_id: number | null;
  source_delta_cents: number; target_delta_cents: number; target_amount_cents: number | null; target_currency: string | null;
  fee_amount_cents: number; fee_currency: string | null; base_amount_cny_cents: number;
  fx_rate_text: string | null; fx_source: string | null; fx_captured_at: string | null; occurred_at: string;
};

function toClient(row: TransactionRow) {
  return {
    id: row.id, title: row.title, category: row.category, kind: row.kind,
    amount: row.amount_cents / 100, currency: row.currency, accountId: row.account_id, targetAccountId: row.target_account_id,
    sourceDelta: row.source_delta_cents / 100, targetDelta: row.target_delta_cents / 100,
    targetAmount: row.target_amount_cents == null ? null : row.target_amount_cents / 100, targetCurrency: row.target_currency,
    feeAmount: row.fee_amount_cents / 100, feeCurrency: row.fee_currency, baseAmountCny: row.base_amount_cny_cents / 100,
    fxRate: row.fx_rate_text, fxSource: row.fx_source, fxCapturedAt: row.fx_captured_at, occurredAt: row.occurred_at,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit")) || 10));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const kind = url.searchParams.get("kind") || "all";
    const query = (url.searchParams.get("q") || "").trim().slice(0, 80);
    if (kind !== "all" && !kinds.has(kind)) return Response.json({ error: "流水类型无效" }, { status: 400 });

    const clauses = ["t.deleted_at IS NULL"];
    const bindings: Array<string | number> = [];
    if (kind !== "all") { clauses.push("t.kind = ?"); bindings.push(kind); }
    if (query) {
      clauses.push("(t.title LIKE ? OR t.category LIKE ? OR a.name LIKE ? OR b.name LIKE ?)");
      const pattern = `%${query}%`;
      bindings.push(pattern, pattern, pattern, pattern);
    }
    const where = clauses.join(" AND ");
    const from = "FROM ledger_transactions t LEFT JOIN ledger_accounts a ON a.id = t.account_id LEFT JOIN ledger_accounts b ON b.id = t.target_account_id";
    const select = "SELECT t.id, t.title, t.category, t.kind, t.amount_cents, t.currency, t.account_id, t.target_account_id, t.source_delta_cents, t.target_delta_cents, t.target_amount_cents, t.target_currency, t.fee_amount_cents, t.fee_currency, t.base_amount_cny_cents, t.fx_rate_text, t.fx_source, t.fx_captured_at, t.occurred_at";
    const [rowsResult, countResult] = await withD1ReadRetry(() => env.DB.batch([
      env.DB.prepare(`${select} ${from} WHERE ${where} ORDER BY t.occurred_at DESC, t.id DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      env.DB.prepare(`SELECT COUNT(*) AS total ${from} WHERE ${where}`).bind(...bindings),
    ]));
    const rows = rowsResult.results as TransactionRow[];
    const count = countResult.results[0] as { total?: number } | undefined;
    const total = Number(count?.total ?? 0);
    return Response.json({ transactions: rows.map(toClient), total, offset, limit, hasMore: offset + rows.length < total });
  } catch (error) {
    return d1ErrorResponse(error, "无法读取历史流水");
  }
}
