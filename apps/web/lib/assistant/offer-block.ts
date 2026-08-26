import { expiryFlagOf } from '@lezzet/domain-core';
import type { ProductDateType } from '@lezzet/types';

/**
 * Fırsat (parti teklifi) kararının YASAKLARI — kuyruk gövdesi ile karar düğmesinin ORTAK kapısı
 * (26.08, gövde turunun bulgusu).
 *
 * ── NEDEN AYRI BİR DOSYA ────────────────────────────────────────────────────
 * Aynı soru üç yerde soruluyordu ve üçü de kuralı ELLE kurmuştu (`tarih geçti && dateType ===
 * 'DLC'`): gövdenin uyarı satırı, karar düğmesinin engeli, ve kapının kendisi. Üç kopya bugün
 * aynı cevabı veriyordu — ama motor DDM'yi `expired_sellable` sayıyor ve kopyalardan biri bir gün
 * o dalı da kesse kimse fark etmezdi. Kural motorda (`expiryFlagOf`), çağrı burada, tüketiciler
 * ikisini de tek yerden okuyor.
 *
 * Ekranın gördüğü arıza şuydu: gövde doğru uyarıyordu (*"DLC geçti — bu parti satılamaz"*) ama
 * "Teklifi aç" düğmesi AÇIKTI ve basan hata alıyordu (kapı `must_discard` ile reddediyor).
 */

/**
 * Bu partinin satışı YASAK mı — motorun kelimesiyle `expired_blocked`.
 *
 * `dateType` bilinmiyorsa `false`: ölçülemeyen bir yasak, uydurma bir yasaktır (`CLAUDE §1`).
 * Uydurma yönü de önemli — "DLC olabilir" diye kesmek, satılabilir bir DDM partisini imhaya
 * yollardı; okunamayan tip satırda zaten tip yazmadan gösteriliyor.
 *
 * Toplam raf ömrü (`shelfLifeDays`) verilmiyor ve gerekmiyor: yasak "tarih geçti mi" sorusundan
 * çıkıyor, eşiğe yaklaşma (`near_expiry`) hesabından değil.
 */
export function offerBlockedByExpiry(dateType: ProductDateType | null | undefined, expiryDate: string): boolean {
  if (!dateType) return false;
  return expiryFlagOf(dateType, expiryDate, null) === 'expired_blocked';
}

/**
 * Karar düğmesinin engeli ve SEBEBİ; `null` ise yol açık.
 *
 * **Maliyetin altında fiyat engel DEĞİLDİR** — zararına satmak bir karardır, ekran onu cümleyle
 * söyler ve yolu kapatmaz. Engel yalnız YAZILAMAYACAK değerlerde ve YASAK partide.
 */
export function batchOfferBlock(params: {
  offerPriceCents: number | null;
  dateType: ProductDateType | null | undefined;
  expiryDate: string;
}): string | null {
  if (offerBlockedByExpiry(params.dateType, params.expiryDate)) {
    return 'DLC geçti — bu parti satılamaz, tek yol imha';
  }
  if (params.offerPriceCents === null) return 'Teklif fiyatı girilmeli';
  return params.offerPriceCents <= 0 ? 'Fiyat sıfırdan büyük olmalı' : null;
}
