import { targetMarginFor } from '@lezzet/domain-core';
import { percent } from '@/components/operation/ui/format';
import type { ChipTone } from '@/components/operation/ui/chip';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { PricesData, PriceRow } from './prices-types';
import type { PriceScope, PriceTab } from './prices-url';

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
  // Hedef, EN DAR marjın kanalına göre çözülür (15.08): B2B'ye özel hedef varsa ve dar kanal
  // B2B ise ipucu o hedefi söyler — ortak hedefi söylemek yanlış kıyası doğrularmış gibi olurdu.
  const effective = targetMarginFor(row.marginChannel ?? 'b2c', row.targetMarginPercent, row.targetMarginB2bPercent);
  const b2bNote = row.marginChannel === 'b2b' && row.targetMarginB2bPercent !== null ? ' (B2B’ye özel)' : '';
  const target = effective === null ? 'hedef yazılmamış' : `hedef ${percent(effective)}${b2bNote}`;
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


/**
 * Süzgeç çipinin TONU — anlam taşır: marj-altı bir KAYIP uyarısıdır (kırmızı), eksik fiyat bir
 * eksikliktir (amber), otomatik fiyat bir davranış işaretidir (zeytin) — hata değil.
 *
 * İki yüzeyde ayrı yazılmıştı; biri harita, öteki ternary'ydi ve `auto` dalı mobilde yoktu.
 */
export const SCOPE_TONE: Record<PriceScope, ChipTone> = {
  all: 'olive',
  below: 'red',
  missing: 'amber',
  auto: 'olive',
};

/**
 * Sekmenin alt başlığı — masaüstü ve telefon AYNI cümleyi kurar.
 *
 * Mobilde sabit bir metin vardı ve her sekmede kanal sayaçlarını yazıyordu: okuma sekmeye bağlı
 * olduğu için "Kupon"da başlık "0 boy yüklendi · 0 marj-altı · 0 fiyatı eksik" diyordu. İki yüzey
 * aynı ekranın başlığını iki ayrı yerde yazarsa, biri sekmeyi unutur.
 *
 * Sayaçlar YÜKLENMİŞ sayfaya aittir ve metin bunu söyler — "3 marj-altı" yazıp katalogun tamamını
 * kastetmek, görülmemiş satırları sessizce yok saymaktı.
 */
export function tabSubtitle(tab: PriceTab, data: PricesData, counts: { rows: number; below: number; missing: number }): string {
  switch (tab) {
    case 'customers':
      return `${data.customerPrices.length} özel fiyat · ${data.discountCustomers.length} müşteride genel indirim oranı`;
    case 'coupons':
      return 'Kupon ve otomatik kampanya — indirim motoruna bağlı';
    case 'offers':
      return `${data.offers.length} parti karar bekliyor · teklif partiye bağlıdır, liste fiyatını değiştirmez`;
    default:
      return `${counts.rows} boy yüklendi · ${counts.below} marj-altı · ${counts.missing} fiyatı eksik`;
  }
}
