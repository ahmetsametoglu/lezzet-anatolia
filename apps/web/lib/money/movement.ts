import { MoneyMovementService, serviceDb } from '@lezzet/database';
import { validateMovement, type MovementCheck } from '@lezzet/domain-core';
import type { MoneyMovement, MoneyMovementInsert } from '@lezzet/types';

/**
 * Para hareketi kapısı (12.1) — **uygulama katmanı orkestrasyonu**. DOMAIN §9.
 *
 * Karar motorun (`domain-core/money`: tipten yön türetimi, bağ zorunlulukları), yazım servisin.
 * İkisi birbirini bilmez (STACK §4); birleştiren yer burasıdır.
 *
 * İki ayrı "hayır" vardır ve karıştırılmaz:
 * - **`invalid`** — hareket ANLAMSIZ (tahsilat diyip parayı dışarı çıkarmak, siparişsiz sipariş
 *   ödemesi). Motorun cevabı; kullanıcıya sebebiyle gösterilir.
 * - **veritabanı reddi** — veri BOZUK (karşı ucu olmayan transfer, sıfır tutar). Kısıt fırlatır;
 *   motor zaten önce yakalar, kısıt son emniyettir (başka bir yol satır yazmaya kalkarsa).
 */

type MovementOutcome =
  | { status: 'ok'; movement: MoneyMovement }
  | { status: 'invalid'; reason: Extract<MovementCheck, { valid: false }>['reason'] };

/** Elle para hareketi girişi (kasa/banka ekranı). */
export async function recordMovement(input: MoneyMovementInsert): Promise<MovementOutcome> {
  const verdict = validateMovement({
    accountId: input.accountId,
    direction: input.direction,
    amount: input.amount,
    type: input.type,
    counterAccountId: input.counterAccountId,
    orderId: input.orderId,
    stockIntakeId: input.stockIntakeId,
    supplierId: input.supplierId,
  });
  if (!verdict.valid) return { status: 'invalid', reason: verdict.reason };

  return { status: 'ok', movement: await new MoneyMovementService(serviceDb()).insert(input) };
}

/**
 * Hesaplar arası transfer — nakit→banka, Stripe→banka payout. TEK satır yazılır; para karşı hesaba
 * ters işaretle yansır (`account_movement` görünümü). Yön gönderenin gözündendir: `out`.
 */
export function transfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  valueDate?: string;
  description?: string | null;
}): Promise<MovementOutcome> {
  return recordMovement({
    accountId: input.fromAccountId,
    counterAccountId: input.toAccountId,
    direction: 'out',
    amount: input.amount,
    type: 'transfer',
    valueDate: input.valueDate,
    description: input.description,
  });
}
