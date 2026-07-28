import { percent } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { PriceRow } from './prices-types';

// Fiyat ekranının SÖZLÜĞÜ — sayıdan cümleye geçiş tek yerde. Karar burada verilmez (motorun işi);
// burada yalnız kararın nasıl okunacağı yazar.

/**
 * Marj rozetinin tonu. Üç hâl var ve üçü de farklı şey söyler:
 *  · hedef yok/maliyet yok → ÖLÇÜ YOK (nötr) — "iyi" demek değil, "bilinmiyor" demek
 *  · hedefin altında       → kayıp riski (kırmızı)
 *  · zarar (negatif marj)  → maliyetin altında satış; hedef yazılmamış olsa bile kırmızı
 */
export function marginTone(row: PriceRow): OpsTone {
  if (row.marginPercent === null) return 'neutral';
  if (row.marginPercent < 0) return 'red';
  if (row.belowTarget === true) return 'red';
  if (row.belowTarget === null) return 'slate';
  return 'olive';
}

/** Marj rozetinin metni — bilinmeyen marj TIRE ile yazılır, sıfır sanılmasın. */
export function marginText(row: PriceRow): string {
  return row.marginPercent === null ? '—' : percent(row.marginPercent);
}

/**
 * Marjın açıklaması (tooltip): hangi kanaldan geldiği ve hedefe göre yeri. Ekranda tek sayı var,
 * ama o sayı iki fiyattan en darı — hangisi olduğu görünmezse operatör yanlış fiyatı düzeltir.
 */
export function marginHint(row: PriceRow): string {
  if (row.costCents === null) return 'Maliyet bilinmiyor — fiyatlı parti girilmemiş, marj hesaplanamaz.';
  if (row.marginPercent === null) return 'Hiçbir kanalda fiyat yok — marj hesaplanamaz.';
  const channel = row.marginChannel === 'b2b' ? 'B2B' : 'B2C';
  const target = row.targetMarginPercent === null ? 'hedef yazılmamış' : `hedef ${percent(row.targetMarginPercent)}`;
  return `En dar marj ${channel} fiyatından · ${target}`;
}

/** Kanal hücresinin tonu: fiyatı olmayan kanal AMBER — eksiklik, sıfır değil. */
export function channelHint(channel: 'b2c' | 'b2b', hasPrice: boolean): string {
  const base = channel === 'b2c' ? 'Perakende liste fiyatı (KDV dahil)' : 'Toptan liste fiyatı (KDV hariç)';
  return hasPrice ? base : `${base} — girilmemiş, bu kanalda satışa kapalı`;
}

/** Satırın durum eki: neden satılmıyor sorusunun cevabı ("ürün pasif", "boy kapalı"). */
export function rowStateNote(row: PriceRow): string {
  const notes: string[] = [];
  if (row.status === 'passive') notes.push('ürün pasif');
  if (row.status === 'candidate') notes.push('aday ürün');
  if (!row.variantActive) notes.push('boy kapalı');
  // Maliyet sıçraması yalnız OTOMATİK üründe bir eylem çağrısıdır: orada fiyat beklemektedir.
  // Elle yönetilen üründe aynı sıçrama bir bilgidir, marj sütunu zaten yeni tabana göre konuşuyor.
  if (row.costJump && row.autoPrice) notes.push(`maliyet %${row.costJump.deviationPercent} sıçradı — otomatik fiyat bekliyor`);
  return notes.length ? ` · ${notes.join(' · ')}` : '';
}
