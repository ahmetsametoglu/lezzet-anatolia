import { targetMarginFor } from '@lezzet/domain-core';
import { COUNTRY_LABELS, type Channel, type Country } from '@lezzet/types';
import { countryColumnLabel, FOREIGN_COUNTRIES } from '@/components/operation/prices/country-prices';
import { percent } from '@/components/operation/ui/format';
import type { ChipTone } from '@/components/operation/ui/chip';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { PriceCounts, PricesData, PriceRow } from './prices-types';
import type { PriceScope, PriceTab } from './prices-url';

// Fiyat ekranının SÖZLÜĞÜ — sayıdan cümleye geçiş tek yerde. Karar burada verilmez (motorun işi); burada yalnız kararın nasıl
// okunacağı yazar.

/**
 * Marj rozetinin tonu: ölçü yoksa nötr, çünkü "bilinmiyor" "iyi" demek değildir. Hedefin altı da zarar da kırmızıdır; zarar hedef
 * yazılmamış olsa bile maliyetin altında satıştır.
 */
export function marginTone(row: PriceRow): OpsTone {
  if (row.marginPercent === null) return 'neutral';
  if (row.marginPercent < 0) return 'red';
  if (row.belowTarget === true) return 'red';
  if (row.belowTarget === null) return 'slate';
  return 'olive';
}

/** Marj rozetinin metni: bilinmeyen marj tire ile yazılır ki sıfır sanılmasın; en dar marj ülke fiyatındaysa ülke kodu eklenir. */
export function marginText(row: PriceRow): string {
  if (row.marginPercent === null) return '—';
  return row.marginCountry === null ? percent(row.marginPercent) : `${percent(row.marginPercent)} ${row.marginCountry}`;
}

/**
 * Marjın açıklaması: hangi fiyattan geldiği ve hedefe göre yeri. Rozet dört fiyatın en darıdır; hangi fiyat olduğu görünmezse operatör
 * yanlış fiyatı düzeltir.
 */
export function marginHint(row: PriceRow): string {
  if (row.costCents === null) return 'Maliyet bilinmiyor — fiyatlı parti girilmemiş, marj hesaplanamaz.';
  if (row.marginPercent === null || row.marginChannel === null) return 'Hiçbir kanalda fiyat yok — marj hesaplanamaz.';
  // Hedef en dar marjın kanalına göre çözülür; ortak hedefi söylemek yanlış kıyası doğrulamış gibi olurdu.
  const effective = targetMarginFor(row.marginChannel, row.targetMarginPercent, row.targetMarginB2bPercent);
  const b2bNote = row.marginChannel === 'b2b' && row.targetMarginB2bPercent !== null ? ' (B2B’ye özel)' : '';
  const target = effective === null ? 'hedef yazılmamış' : `hedef ${percent(effective)}${b2bNote}`;
  const price = row.marginCountry === null ? row.marginChannel.toUpperCase() : countryColumnLabel(row.marginChannel, row.marginCountry);
  return `En dar marj ${price} fiyatından · ${target}`;
}

const VAT_BASE: Record<Channel, string> = { b2c: 'KDV dahil', b2b: 'KDV hariç' };

/** Kanal hücresinin açıklaması; fiyatı olmayan kanal bir eksikliktir, sıfır değil. */
export function channelHint(channel: Channel, hasPrice: boolean): string {
  const base = channel === 'b2c' ? `Perakende liste fiyatı (${VAT_BASE.b2c})` : `Toptan liste fiyatı (${VAT_BASE.b2b})`;
  return hasPrice ? base : `${base} — girilmemiş, bu kanalda satışa kapalı`;
}

/** Ülke hücresinin açıklaması: kendi fiyatı mı, genel fiyat mı geçiyor, yoksa o ülkenin tüketicisine hiç satılmıyor mu. */
export function countryHint(
  channel: Channel,
  country: Country,
  cell: { hasPrice: boolean; hasGeneral: boolean; sellable: boolean },
): string {
  const name = COUNTRY_LABELS[country];
  if (!cell.sellable) return `${name} KDV oranı girilmemiş — ${name}’daki tüketiciye satılmaz`;
  const base = `${name} ${channel === 'b2c' ? 'perakende' : 'toptan'} fiyatı (${VAT_BASE[channel]})`;
  if (cell.hasPrice) return base;
  return cell.hasGeneral ? `${base} yazılmamış — genel fiyat geçer` : `${base} yazılmamış, genel fiyat da yok — bu kanalda satışa kapalı`;
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
 * Süzgeç çipinin tonu anlam taşır: marj-altı bir kayıp uyarısıdır (kırmızı), eksik fiyat bir eksikliktir (amber), otomatik fiyat bir
 * davranış işaretidir (zeytin), hata değil.
 */
export const SCOPE_TONE: Record<PriceScope, ChipTone> = {
  all: 'olive',
  below: 'red',
  missing: 'amber',
  auto: 'olive',
};

/**
 * Sekmenin alt başlığı, masaüstü ve telefon aynı cümleyi kurar ki biri sekmeyi unutmasın. Sayaçlar yüklenmiş sayfaya aittir ve
 * metin bunu söyler.
 */
export function tabSubtitle(tab: PriceTab, data: PricesData, counts: PriceCounts): string {
  switch (tab) {
    case 'customers':
      return `${data.customerPrices.length} özel fiyat · ${data.priceRuleCustomers.length} müşteride genel fiyat kuralı`;
    case 'coupons':
      return 'Kupon ve otomatik kampanya — indirim motoruna bağlı';
    case 'offers':
      return `${data.offers.length} parti karar bekliyor · teklif partiye bağlıdır, liste fiyatını değiştirmez`;
    default: {
      const countries = FOREIGN_COUNTRIES.map(
        (country) => ` · ${counts.countryPrices[country] ?? 0} ${COUNTRY_LABELS[country]} fiyatı`,
      ).join('');
      return `${counts.rows} boy yüklendi · ${counts.below} marj-altı · ${counts.missing} fiyatı eksik${countries}`;
    }
  }
}
