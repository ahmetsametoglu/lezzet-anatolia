import { MoneyMovementService, serviceDb } from '@lezzet/database';
import { validateMovement, type MovementCheck } from '@lezzet/domain-core';
import { ADVERTISING_CATEGORY, type MoneyMovement, type MoneyMovementInsert } from '@lezzet/types';

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
    amountCents: input.amountCents,
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
 * **Gider** (kira, akaryakıt, maaş, ambalaj…) — kategori SERBEST METİNDİR, enum değil: gider
 * kalemleri işletmeyle büyür, enum olsaydı her yeni kalem migration isterdi.
 */
export function recordExpense(input: {
  accountId: string;
  /** **Cent** (02.9 · STACK §8) — işaretsiz; yönü fonksiyonun kendisi belirler. */
  amountCents: number;
  category: string;
  meta?: Record<string, unknown> | null;
  valueDate?: string;
  description?: string | null;
}): Promise<MovementOutcome> {
  return recordMovement({
    accountId: input.accountId,
    direction: 'out',
    amountCents: input.amountCents,
    type: 'expense',
    category: input.category,
    meta: input.meta,
    valueDate: input.valueDate,
    description: input.description,
  });
}

/**
 * **Reklam gideri** (12.5) — DOMAIN §350. Kampanya etiketiyle girer: `category=advertising` +
 * `meta.campaign`. Analitik (13.2) kampanyanın **cirosunu ve giderini yan yana** koyar; gerçek ROI
 * Excel'e taşınmaz.
 *
 * Etiket **zorlanmaz, boşsa yazılmaz**: kampanyası bilinmeyen bir reklam ödemesi de girilebilmelidir
 * (ajans faturası aya yayılır, ekstre satırı sonra eşleşir). Reddetseydik operatör onu `misc`
 * yazardı ve gider reklam toplamından tamamen düşerdi. Etiketsiz satır rapordaki `null` kovasında
 * görünür — eksik bilgi, kayıp bilgiden iyidir.
 */
export function recordAdvertisingExpense(input: {
  accountId: string;
  /** **Cent** (02.9 · STACK §8) — işaretsiz; yönü fonksiyonun kendisi belirler. */
  amountCents: number;
  campaign?: string | null;
  valueDate?: string;
  description?: string | null;
}): Promise<MovementOutcome> {
  const campaign = input.campaign?.trim();
  return recordExpense({
    accountId: input.accountId,
    amountCents: input.amountCents,
    category: ADVERTISING_CATEGORY,
    // Boş etiket yazılmaz: `{campaign: ''}` raporda kendi kovasını açar, etiketsizden ayrı düşerdi.
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
