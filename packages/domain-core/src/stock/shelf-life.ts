import { daysBetween } from '@lezzet/helper';
import type { ProductDateType } from '@lezzet/types';

/**
 * Raf ömrü kararları (03.5'in eki; 06.2/06.10 buradan çağırır) — DOMAIN §4.
 *
 * **Kararlar mutlak günle değil, kalan raf ömrü YÜZDESİYLE verilir:** 3 gün kalması taze bir
 * börekte normal, uzun ömürlü bir üründe alarmdır. Yüzde = (son tarih − bugün) ÷ toplam raf ömrü.
 *
 * İki eşik parametriktir (`Setting`, kod sabiti değil): yaklaşan-son-tarih **%25**, girişte kabul
 * (MLOR) **%75**. Varsayılanlar piyasa standardıdır.
 *
 * Tarih tipi kararı değiştirir: `DLC` **güvenlik** tarihidir — geçince satılamaz, imha edilir;
 * `DDM` **kalite** tarihidir — geçse de satılabilir (indirim/hediye havuzuna girer).
 */

export const NEAR_EXPIRY_PERCENT = 25;
export const MLOR_PERCENT = 75;

// `daysBetween` `@lezzet/helper`'a taşındı (denetim A6) — `stock/transfer` içinde ikinci, ham
// milisaniyeyi `floor`'layan bir tanım daha vardı ve saatli bir damgada ayrışacaklardı.

/**
 * Kalan raf ömrü yüzdesi. Ürünün toplam raf ömrü girilmemişse (`shelfLifeDays` null) **hesaplanamaz**
 * → `null` döner; çağıran o zaman eşik kararı vermez (uydurma yüzdeyle uyarı üretmek yanlış alarmdır).
 * Tarihi geçmiş partide negatif değil **0** döner; "ne kadar geçti" ayrı bir sorudur (`daysToExpiry`).
 */
export function remainingShelfLifePercent(
  expiryDate: string | Date,
  shelfLifeDays: number | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!shelfLifeDays || shelfLifeDays <= 0) return null;
  const remaining = daysBetween(now, new Date(expiryDate));
  if (remaining <= 0) return 0;
  return Math.min(100, (remaining / shelfLifeDays) * 100);
}

/** Son tarihe kalan gün (geçmişse negatif) — listelerde "2 gün kaldı / 3 gün geçti" bilgisi. */
export function daysToExpiry(expiryDate: string | Date, now: Date = new Date()): number {
  return daysBetween(now, new Date(expiryDate));
}

/**
 * Parti satılabilir mi: **DLC geçmişse hayır** (güvenlik), DDM geçmişse evet (kalite — indirimle
 * satılabilir). Son tarih günü dâhildir: o gün hâlâ satılır.
 */
export function isSellableBatch(dateType: ProductDateType, expiryDate: string | Date, now: Date = new Date()): boolean {
  if (dateType !== 'DLC') return true;
  return daysToExpiry(expiryDate, now) >= 0;
}

export type ExpiryFlag = 'ok' | 'near_expiry' | 'expired_sellable' | 'expired_blocked';

/**
 * Partinin uyarı durumu — depo listesi ve teklif önerisi bunu okur:
 * - `near_expiry` → sistem indirim/hediye/öne çıkarma **önerir**, kararı insan verir.
 * - `expired_sellable` → DDM geçmiş, satılabilir (indirim havuzuna girer).
 * - `expired_blocked` → DLC geçmiş, satılamaz; imha edilir (`StockAdjustment`).
 */
export function expiryFlagOf(
  dateType: ProductDateType,
  expiryDate: string | Date,
  shelfLifeDays: number | null | undefined,
  now: Date = new Date(),
  nearExpiryPercent: number = NEAR_EXPIRY_PERCENT,
): ExpiryFlag {
  if (daysToExpiry(expiryDate, now) < 0) return dateType === 'DLC' ? 'expired_blocked' : 'expired_sellable';
  const pct = remainingShelfLifePercent(expiryDate, shelfLifeDays, now);
  // Toplam raf ömrü bilinmiyorsa eşik kararı verilmez — yanlış alarm üretmektense sessiz kal.
  if (pct === null) return 'ok';
  return pct <= nearExpiryPercent ? 'near_expiry' : 'ok';
}

/**
 * **Mal kabulde MLOR kontrolü:** tedarikçiden gelen parti, toplam ömrünün en az %75'iyle gelmeli.
 * Altındaysa kabul **engellenmez**, uyarılır — karar mal kabul edende (DOMAIN §4).
 */
export function meetsMlor(
  expiryDate: string | Date,
  shelfLifeDays: number | null | undefined,
  now: Date = new Date(),
  mlorPercent: number = MLOR_PERCENT,
): { ok: boolean; remainingPercent: number | null } {
  const remainingPercent = remainingShelfLifePercent(expiryDate, shelfLifeDays, now);
  // Ömür bilinmiyorsa uyarı üretilmez (ölçüt yok) — kabul akışı durmaz.
  return { ok: remainingPercent === null || remainingPercent >= mlorPercent, remainingPercent };
}
