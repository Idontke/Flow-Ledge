import { env } from "cloudflare:workers";
import { d1ErrorResponse } from "../../d1-resilience";

const currencies = new Set(["CNY", "USD", "USDT", "JPY", "HKD", "EUR", "GBP", "CAD"]);

function idFrom(request: Request) {
  return Number(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
}

function validate(payload: Record<string, unknown>) {
  const title = String(payload.title ?? "").trim();
  const category = String(payload.category ?? "固定支出").trim() || "固定支出";
  const amount = Math.round(Number(payload.amount) * 100);
  const currency = String(payload.currency || "CNY").toUpperCase();
  const dueDay = Number(payload.dueDay);
  const accountId = payload.accountId ? Number(payload.accountId) : null;
  const active = payload.active !== false;
  const frequency = String(payload.frequency || "monthly") === "yearly" ? "yearly" : "monthly";
  const nextDueDate = payload.nextDueDate ? String(payload.nextDueDate) : null;
  const trialEndsAt = payload.trialEndsAt ? String(payload.trialEndsAt) : null;
  if (!title || title.length > 24) return { error: "账单名称需要在 1–24 个字符之间" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "账单金额必须大于 0" };
  if (!currencies.has(currency)) return { error: "暂不支持该账单币种" };
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return { error: "扣款日需要在 1–31 日之间" };
  if (nextDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) return { error: "下次扣款日期无效" };
  if (trialEndsAt && !/^\d{4}-\d{2}-\d{2}$/.test(trialEndsAt)) return { error: "试用结束日期无效" };
  return { title, category, amount, currency, dueDay, accountId, active, frequency, nextDueDate, trialEndsAt };
}

function toClient(row: Record<string, unknown>) {
  return { id: Number(row.id), title: String(row.title), category: String(row.category), amount: Number(row.amount_cents) / 100, currency: String(row.currency || "CNY"), dueDay: Number(row.due_day), accountId: row.account_id ? Number(row.account_id) : null, active: Boolean(row.active), frequency: String(row.frequency || "monthly"), nextDueDate: row.next_due_date ? String(row.next_due_date) : null, trialEndsAt: row.trial_ends_at ? String(row.trial_ends_at) : null };
}

export async function PATCH(request: Request) {
  try {
    const id = idFrom(request);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "账单编号无效" }, { status: 400 });
    const values = validate(await request.json() as Record<string, unknown>);
    if ("error" in values) return Response.json({ error: values.error }, { status: 400 });
    if (values.accountId) {
      const account = await env.DB.prepare("SELECT id FROM ledger_accounts WHERE id = ? AND archived = 0").bind(values.accountId).first();
      if (!account) return Response.json({ error: "找不到扣款账户" }, { status: 404 });
    }
    const row = await env.DB.prepare("UPDATE ledger_recurring_bills SET title = ?, category = ?, amount_cents = ?, currency = ?, due_day = ?, account_id = ?, active = ?, frequency = ?, next_due_date = ?, trial_ends_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id, title, category, amount_cents, currency, due_day, account_id, active, frequency, next_due_date, trial_ends_at").bind(values.title, values.category, values.amount, values.currency, values.dueDay, values.accountId, values.active ? 1 : 0, values.frequency, values.nextDueDate, values.trialEndsAt, id).first<Record<string, unknown>>();
    if (!row) return Response.json({ error: "找不到该账单" }, { status: 404 });
    return Response.json({ bill: toClient(row) });
  } catch (error) {
    return d1ErrorResponse(error, "固定账单更新失败");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = idFrom(request);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "账单编号无效" }, { status: 400 });
    const result = await env.DB.prepare("UPDATE ledger_recurring_bills SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL RETURNING id").bind(id).first();
    if (!result) return Response.json({ error: "找不到该账单" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "固定账单删除失败");
  }
}
