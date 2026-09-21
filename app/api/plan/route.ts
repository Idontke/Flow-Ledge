import { env } from "cloudflare:workers";
import { d1ErrorResponse } from "../d1-resilience";

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { totalBudget?: number; savingsTarget?: number; categories?: Array<{ category?: string; amount?: number }> };
    const totalBudget = Math.round(Number(payload.totalBudget) * 100);
    const savingsTarget = Math.round(Number(payload.savingsTarget) * 100);
    if (!Number.isFinite(totalBudget) || totalBudget < 0 || !Number.isFinite(savingsTarget) || savingsTarget < 0) return Response.json({ error: "预算和储蓄目标不能小于 0" }, { status: 400 });
    const categories = (payload.categories ?? []).map((item) => ({ category: String(item.category ?? "").trim(), amount: Math.round(Number(item.amount) * 100) }));
    if (categories.some((item) => !item.category || item.category.length > 12 || !Number.isFinite(item.amount) || item.amount < 0)) return Response.json({ error: "分类名称或金额无效" }, { status: 400 });
    if (new Set(categories.map((item) => item.category)).size !== categories.length) return Response.json({ error: "分类预算名称不能重复" }, { status: 400 });

    const monthKey = currentMonthKey();
    const d1 = env.DB;
    const statements = [
      d1.prepare("INSERT INTO ledger_budget_plans (month_key, total_budget_cents, savings_target_cents, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(month_key) DO UPDATE SET total_budget_cents = excluded.total_budget_cents, savings_target_cents = excluded.savings_target_cents, updated_at = CURRENT_TIMESTAMP").bind(monthKey, totalBudget, savingsTarget),
      d1.prepare("DELETE FROM ledger_category_budgets WHERE month_key = ?").bind(monthKey),
    ];
    categories.forEach((item, index) => statements.push(d1.prepare("INSERT INTO ledger_category_budgets (month_key, category, amount_cents, sort_order) VALUES (?, ?, ?, ?)").bind(monthKey, item.category, item.amount, index)));
    await d1.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "计划保存失败");
  }
}
