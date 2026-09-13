import { MoneyMovementService, serviceDb } from '@lezzet/database';
import { natureProblemOf } from '@lezzet/application';
import { acceptsNature, classificationTypeOf, validateMovement, type MovementCheck } from '@lezzet/domain-core';
import { ADVERTISING_NATURE, type MoneyMovement, type MoneyMovementInsert } from '@lezzet/types';

/**
 * Para hareketi kapısı (12.1) — **uygulama katmanı orkestrasyonu**. DOMAIN §9.
 *
 * Karar motorun (`domain-core/money`: tipten yön türetimi, bağ zorunlulukları), yazım servisin.
 * İkisi birbirini bilmez (STACK §4); birleştiren yer burasıdır.
 *
 * İki ayrı "hayır" vardır ve karıştırılmaz:
 * - **`invalid`** — hareket ANLAMSIZ (tahsilat diyip parayı dışarı çıkarmak, siparişsiz sipariş
 *   ödemesi, gider türünü giren paraya vermek). Motorun ya da tür kapısının cevabı; kullanıcıya
 *   sebebiyle gösterilir.
 * - **veritabanı reddi** — veri BOZUK (karşı ucu olmayan transfer, sıfır tutar). Kısıt fırlatır;
 *   motor zaten önce yakalar, kısıt son emniyettir (başka bir yol satır yazmaya kalkarsa).
 */

/** Motorun reddi + tür kapısının reddi (13.09) — ikisi de "hiçbir şey yazılmadı" demektir, sebebiyle. */
export type MovementInvalidReason =
  | Extract<MovementCheck, { valid: false }>['reason']
  | 'unknown_nature'
  | 'nature_direction'
  | 'nature_not_applicable';

type MovementOutcome = { status: 'ok'; movement: MoneyMovement } | { status: 'invalid'; reason: MovementInvalidReason };

/**
 * Elle para hareketi girişi (kasa/banka ekranı). Tür verildiyse (13.09) tür kapısından da geçer:
 * sipariş parası, stok alımı ve transfer tür almaz; tür sözlükte, aktif ve paranın yönüne uygun
 * olmalı.
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
    // Türlü satırın kaba tipi TÜRDEN türer (motor: `classificationTypeOf`) — satırdaki seçicinin
    // kapısıyla aynı kural (`setMovementNature`): çıkışın türü gider, sermaye girişi sermaye, öteki
    // giriş sınıflandırılmamış giriş. Form uyumsuz ikiliyi göstermiyor; kapı son emniyet.
    const type = classificationTypeOf(input.direction, input.nature);
    return { status: 'ok', movement: await new MoneyMovementService(db).insert({ ...input, type }) };
  }
  return { status: 'ok', movement: await new MoneyMovementService(db).insert(input) };
}

/**
 * **Tedarikçiye ödeme** (12.3) — mal bedelinin ödenmesi. `supplierId` bağı zorunludur: tedarikçi
 * borcu (Σ giriş − Σ ödeme) o bağdan TÜRETİLİR, hiçbir yerde saklanmaz. `stockIntakeId` verilirse
 * ödeme hangi mal kabule ait olduğunu da taşır — kısmi ödemelerde hangi girişin kapandığı görünür.
 */
export function recordSupplierPayment(input: {
  supplierId: string;
  accountId: string;
  /** **Cent** (02.9 · STACK §8) — işaretsiz; yönü fonksiyonun kendisi belirler. */
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

/**
 * **Gider** (kira, akaryakıt, maaş, ambalaj…) — sınıflandırma TÜRLE (13.09 · ikinci karar): tek tür,
 * sözlükten. Etiket serbest işarettir, isteğe bağlı. Tür verilmezse gider yine yazılır ama izah
 * bekler — "bu para neyin parası" sorusu açık kalır ve kuyrukta görünür.
 */
export function recordExpense(input: {
  accountId: string;
  /** **Cent** (02.9 · STACK §8) — işaretsiz; yönü fonksiyonun kendisi belirler. */
  amountCents: number;
  nature: string | null;
  /** Kime ödendi (13.09) — kurum, hizmet veren, çalışan. */
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
 * **Reklam gideri** (12.5) — DOMAIN §350. `reklam` TÜRÜ + `meta.campaign` ile girer (13.09). Analitik
 * (13.2) kampanyanın **cirosunu ve giderini yan yana** koyar; gerçek ROI Excel'e taşınmaz.
 *
 * Kampanya künyesi **zorlanmaz, boşsa yazılmaz**: kampanyası bilinmeyen bir reklam ödemesi de
 * girilebilmelidir (ajans faturası aya yayılır, ekstre satırı sonra eşleşir). Reddetseydik operatör
 * onu `misc` yazardı ve gider reklam toplamından tamamen düşerdi. Künyesiz satır rapordaki `null`
 * kovasında görünür — eksik bilgi, kayıp bilgiden iyidir.
 */
export function recordAdvertisingExpense(input: {
  accountId: string;
  /** **Cent** (02.9 · STACK §8) — işaretsiz; yönü fonksiyonun kendisi belirler. */
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

/**
 * Hesaplar arası transfer — nakit→banka, Stripe→banka payout. TEK satır yazılır; para karşı hesaba
 * ters işaretle yansır (`account_movement` görünümü). Yön gönderenin gözündendir: `out`.
 */
export function transfer(input: {
  fromAccountId: string;
  toAccountId: string;
  /** **Cent** (02.9 · STACK §8) — işaretsiz; yönü fonksiyonun kendisi belirler. */
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
