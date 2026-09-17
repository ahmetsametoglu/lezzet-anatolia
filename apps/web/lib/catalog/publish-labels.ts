import type { PublishGap } from '@lezzet/domain-core';

/**
 * Yayın eksiklerinin operatör cümlesi — kural veride ve motorda, onu Türkçeye çeviren yer burası.
 * Etiketler formun kendi etiketleriyle aynı olmalı ki operatör cümledeki alanı formda bulsun; form da buradan okur.
 */
export const PUBLISH_FIELD_LABEL: Record<PublishGap['field'], string> = {
  name: 'Ürün adı',
  description: 'Ürün açıklaması',
  ingredients: 'İçindekiler',
  storageInstructions: 'Saklama ve hazırlama',
  // Aile etiketi ürün formunda değil, ÜRÜNLER ekranının aile bölümünde düzenleniyor — cümle o
  // yüzden alanın adını değil işlevini söylüyor.
  familyLabel: 'Aile etiketi',
};

/** Dil kodunun operatöre görünen hâli — form dil sekmeleriyle aynı (TR · FR · DE). */
const LOCALE_LABEL: Record<'tr' | 'fr' | 'de', string> = { tr: 'TR', fr: 'FR', de: 'DE' };

/**
 * Eksikleri ne yapılacağını söyleyen tek cümleye çevirir.
 * Boş liste `null` döner: çağıran "eksik yok"u bir cümleyle değil yokluğuyla okur.
 */
export function publishGapMessage(gaps: PublishGap[]): string | null {
  if (gaps.length === 0) return null;
  const parts = gaps.map((gap) => `${PUBLISH_FIELD_LABEL[gap.field]} (${gap.missing.map((l) => LOCALE_LABEL[l]).join(', ')})`);
  return `Ürün yayına alınamıyor — şu alanlar üç dilde de dolu olmalı: ${parts.join(' · ')}.`;
}
