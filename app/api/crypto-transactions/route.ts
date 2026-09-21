import { env } from "cloudflare:workers";
import { d1ErrorResponse } from "../d1-resilience";
import { accountUpdateStatements, applyNewEffect, calculateEffect, loadAccounts, type CryptoPayload } from "./logic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as CryptoPayload;
    const accounts = await loadAccounts([payload.accountId, payload.targetAccountId, payload.fundingAccountId]);
    const effect = calculateEffect(payload, accounts);
    if ("error" in effect) return Response.json({ error: effect.error }, { status: 400 });
    applyNewEffect(accounts, effect);
    const statements = accountUpdateStatements(accounts, [effect.accountId, effect.targetAccountId, effect.fundingAccountId]);
    statements.push(env.DB.prepare("INSERT INTO ledger_crypto_transactions (account_id, target_account_id, funding_account_id, kind, quantity_text, amount_cents, currency, fee_amount_cents, base_amount_cny_cents, fx_rate_text, fx_source, fx_captured_at, quantity_delta_text, target_quantity_delta_text, basis_delta_cny_cents, target_basis_delta_cny_cents, realized_delta_cny_cents, funding_delta_cents, occurred_at, note, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)").bind(effect.accountId, effect.targetAccountId, effect.fundingAccountId, effect.kind, String(effect.quantity), effect.amount, effect.currency, effect.feeAmount, effect.baseAmountCny, String(effect.fxRate), effect.fxSource, effect.fxCapturedAt, String(effect.quantityDelta), String(effect.targetQuantityDelta), effect.basisDeltaCny, effect.targetBasisDeltaCny, effect.realizedDeltaCny, effect.fundingDelta, effect.occurredAt, effect.note));
    await env.DB.batch(statements);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return d1ErrorResponse(error, "Crypto 操作保存失败");
  }
}
