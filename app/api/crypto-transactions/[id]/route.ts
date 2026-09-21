import { env } from "cloudflare:workers";
import { d1ErrorResponse } from "../../d1-resilience";
import { accountUpdateStatements, applyNewEffect, applyStoredEffect, calculateEffect, loadAccounts, type CryptoPayload } from "../logic";

type StoredCryptoRow = {
  id: number; account_id: number; target_account_id: number | null; funding_account_id: number | null;
  quantity_delta_text: string; target_quantity_delta_text: string; basis_delta_cny_cents: number;
  target_basis_delta_cny_cents: number; realized_delta_cny_cents: number; funding_delta_cents: number; occurred_at: string;
};

function idFrom(request: Request) {
  return Number(new URL(request.url).pathname.split("/").filter(Boolean).at(-1));
}

async function readStored(id: number) {
  return env.DB.prepare("SELECT id, account_id, target_account_id, funding_account_id, quantity_delta_text, target_quantity_delta_text, basis_delta_cny_cents, target_basis_delta_cny_cents, realized_delta_cny_cents, funding_delta_cents, occurred_at FROM ledger_crypto_transactions WHERE id = ? AND deleted_at IS NULL").bind(id).first<StoredCryptoRow>();
}

export async function PATCH(request: Request) {
  try {
    const id = idFrom(request);
    const old = Number.isInteger(id) && id > 0 ? await readStored(id) : null;
    if (!old) return Response.json({ error: "找不到该 Crypto 操作" }, { status: 404 });
    const payload = await request.json() as CryptoPayload;
    const accounts = await loadAccounts([old.account_id, old.target_account_id, old.funding_account_id, payload.accountId, payload.targetAccountId, payload.fundingAccountId]);
    applyStoredEffect(accounts, old, -1);
    const effect = calculateEffect({ ...payload, occurredAt: payload.occurredAt || old.occurred_at }, accounts);
    if ("error" in effect) return Response.json({ error: effect.error }, { status: 400 });
    applyNewEffect(accounts, effect);
    const statements = accountUpdateStatements(accounts, [old.account_id, old.target_account_id, old.funding_account_id, effect.accountId, effect.targetAccountId, effect.fundingAccountId]);
    statements.push(env.DB.prepare("UPDATE ledger_crypto_transactions SET account_id = ?, target_account_id = ?, funding_account_id = ?, kind = ?, quantity_text = ?, amount_cents = ?, currency = ?, fee_amount_cents = ?, base_amount_cny_cents = ?, fx_rate_text = ?, fx_source = ?, fx_captured_at = ?, quantity_delta_text = ?, target_quantity_delta_text = ?, basis_delta_cny_cents = ?, target_basis_delta_cny_cents = ?, realized_delta_cny_cents = ?, funding_delta_cents = ?, occurred_at = ?, note = ? WHERE id = ? AND deleted_at IS NULL").bind(effect.accountId, effect.targetAccountId, effect.fundingAccountId, effect.kind, String(effect.quantity), effect.amount, effect.currency, effect.feeAmount, effect.baseAmountCny, String(effect.fxRate), effect.fxSource, effect.fxCapturedAt, String(effect.quantityDelta), String(effect.targetQuantityDelta), effect.basisDeltaCny, effect.targetBasisDeltaCny, effect.realizedDeltaCny, effect.fundingDelta, effect.occurredAt, effect.note, id));
    await env.DB.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "Crypto 操作更新失败");
  }
}

export async function DELETE(request: Request) {
  try {
    const id = idFrom(request);
    const old = Number.isInteger(id) && id > 0 ? await readStored(id) : null;
    if (!old) return Response.json({ error: "找不到该 Crypto 操作" }, { status: 404 });
    const accounts = await loadAccounts([old.account_id, old.target_account_id, old.funding_account_id]);
    applyStoredEffect(accounts, old, -1);
    const statements = accountUpdateStatements(accounts, [old.account_id, old.target_account_id, old.funding_account_id]);
    statements.push(env.DB.prepare("UPDATE ledger_crypto_transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL").bind(id));
    await env.DB.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return d1ErrorResponse(error, "Crypto 操作删除失败");
  }
}
