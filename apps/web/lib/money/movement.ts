import { MoneyMovementService, serviceDb } from '@lezzet/database';
import { natureProblemOf } from '@lezzet/application';
import { acceptsNature, classificationTypeOf, validateMovement, type MovementCheck } from '@lezzet/domain-core';
import { ADVERTISING_NATURE, type MoneyMovement, type MoneyMovementInsert } from '@lezzet/types';

/**
 * Para hareketi kapısı: karar motorda, yazım serviste, ikisini burası birleştirir. Anlamsız hareket motorun sebepli `invalid`
 * cevabıdır; bozuk veri ise veritabanı kısıtına takılır ve kısıt son emniyettir.
 */

/** Motorun ya da tür kapısının reddi; ikisi de "hiçbir şey yazılmadı" demektir, sebebiyle. */
export type MovementInvalidReason =
  | Extract<MovementCheck, { valid: false }>['reason']
  | 'unknown_nature'
  | 'nature_direction'
  | 'nature_not_applicable';

type MovementOutcome = { status: 'ok'; movement: MoneyMovement } | { status: 'invalid'; reason: MovementInvalidReason };

/**
 * Elle para hareketi girişi. Tür verildiyse tür kapısından da geçer: sipariş parası, stok alımı ve transfer tür almaz; tür
 * sözlükte, aktif ve paranın yönüne uygun olmalı.
 */
export async function recordMovement(input: MoneyMovementInsert): Promise<MovementOutcome> {
  const verdict = validateMovement({
    accountId: input.accountId,
    direction: input.direction,
    amountCents: input.amountCents,
    type: input.type,
    counterAccountId: input.counterAccountId,
    orderId: input.orderId,
    stockIntakeId: input.stockIntakeId,
    supplierId: input.supplierId,
  });
  if (!verdict.valid) return { status: 'invalid', reason: verdict.reason };

  const db = serviceDb();
  if (input.nature) {
    if (!acceptsNature(input.type)) return { status: 'invalid', reason: 'nature_not_applicable' };
    const problem = await natureProblemOf(db, input.nature, input.direction);
    if (problem) return { status: 'invalid', reason: problem };
    // Türlü satırın kaba tipi türden türer; satırdaki seçicinin kapısıyla aynı kural.
    const type = classificationTypeOf(input.direction, input.nature);
    return { status: 'ok', movement: await new MoneyMovementService(db).insert({ ...input, type }) };
  }
  return { status: 'ok', movement: await new MoneyMovementService(db).insert(input) };
}

/**
 * Tedarikçiye ödeme: tedarikçi borcu `supplierId` bağından türetilir ve hiçbir yerde saklanmaz. `stockIntakeId` kısmi ödemede
 * hangi mal kabulün kapandığını gösterir.
 */
export function recordSupplierPayment(input: {
  supplierId: string;
  accountId: string;
  /** Cent, işaretsiz; yönü fonksiyonun kendisi belirler. */
  amountCents: number;
  stockIntakeId?: string | null;
  valueDate?: string;
  description?: string | null;
}): Promise<MovementOutcome> {
  return recordMovement({
    accountId: input.accountId,
    direction: 'out',
    amountCents: input.amountCents,
    type: 'purchase',
    supplierId: input.supplierId,
    stockIntakeId: input.stockIntakeId,
    valueDate: input.valueDate,
    description: input.description ?? 'Tedarikçi ödemesi',
  });
}

/** Gider: sınıflandırma sözlükten tek türle. Tür verilmezse gider yine yazılır ama izah bekleyen kuyrukta görünür. */
export function recordExpense(input: {
  accountId: string;
  /** Cent, işaretsiz; yönü fonksiyonun kendisi belirler. */
  amountCents: number;
  nature: string | null;
  /** Kime ödendi: kurum, hizmet veren, çalışan. */
  counterpartyId?: string | null;
  tags?: readonly string[];
  meta?: Record<string, unknown> | null;
  valueDate?: string;
  description?: string | null;
}): Promise<MovementOutcome> {
  return recordMovement({
    accountId: input.accountId,
    direction: 'out',
    amountCents: input.amountCents,
    type: 'expense',
    nature: input.nature,
    counterpartyId: input.counterpartyId,
    tags: [...(input.tags ?? [])],
    meta: input.meta,
    valueDate: input.valueDate,
    description: input.description,
  });
}

/**
 * Reklam gideri `reklam` türü ve `meta.campaign` ile girer ki analitik kampanyanın cirosunu ve giderini yan yana koysun. Künye
 * zorlanmaz: reddedilse operatör satırı `misc` yazar ve gider reklam toplamından düşerdi; künyesiz satır `null` kovasında görünür.
 */
export function recordAdvertisingExpense(input: {
  accountId: string;
  /** Cent, işaretsiz; yönü fonksiyonun kendisi belirler. */
  amountCents: number;
  counterpartyId?: string | null;
  /** Serbest etiketler; tür burada garanti edilir (`reklam`), çağıran yazmak zorunda değil. */
  tags?: readonly string[];
  campaign?: string | null;
  valueDate?: string;
  description?: string | null;
}): Promise<MovementOutcome> {
  const campaign = input.campaign?.trim();
  return recordExpense({
    accountId: input.accountId,
    amountCents: input.amountCents,
    nature: ADVERTISING_NATURE,
    counterpartyId: input.counterpartyId,
    tags: input.tags,
    // Boş künye yazılmaz: `{campaign: ''}` raporda kendi kovasını açar, künyesizden ayrı düşerdi.
    meta: campaign ? { campaign } : null,
    valueDate: input.valueDate,
    description: input.description ?? 'Reklam gideri',
  });
}

/** Hesaplar arası transfer tek satırdır ve karşı hesaba ters işaretle yansır (`account_movement`); yön gönderenin gözünden `out`. */
export function transfer(input: {
  fromAccountId: string;
  toAccountId: string;
  /** Cent, işaretsiz; yönü fonksiyonun kendisi belirler. */
  amountCents: number;
  valueDate?: string;
  description?: string | null;
}): Promise<MovementOutcome> {
  return recordMovement({
    accountId: input.fromAccountId,
    counterAccountId: input.toAccountId,
    direction: 'out',
    amountCents: input.amountCents,
    type: 'transfer',
    valueDate: input.valueDate,
    description: input.description,
  });
}
