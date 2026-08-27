import type { PublishGap } from '@lezzet/domain-core';

/**
 * Yayın eksiklerinin OPERATÖR CÜMLESİ (05.36).
 *
 * **Kural veride, cümle burada** — `constraint-message.ts`in künyesindeki ayrımın aynısı. Motor
 * (`productPublishGaps`) hangi alanın hangi dilde eksik olduğunu söyler; onu Türkçeye çeviren ve
 * operatörün formda GÖRDÜĞÜ kelimeyle eşleştiren yer burasıdır.
 *
 * **Etiketler formun kendi etiketleriyle AYNI olmalı** ve bu yüzden tek sözlükte duruyor: cümle
 * "Saklama ve hazırlama eksik" derken formda "Saklama talimatı" yazsaydı operatör aradığı alanı
 * bulamazdı. Form da buradan okuyor (`product-form/index.tsx`).
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
 * Eksikleri tek cümleye çevirir. Boş liste `null` döner — çağıran "eksik yok"u bir cümleyle değil
 * yokluğuyla okusun.
 *
 * Cümle NE YAPILACAĞINI söylüyor ("şu alanları doldurun"), ne olmadığını değil: operatör hata
 * mesajını okuduğunda formda gideceği yeri bilmeli.
 */
export function publishGapMessage(gaps: PublishGap[]): string | null {
  if (gaps.length === 0) return null;
  const parts = gaps.map((gap) => `${PUBLISH_FIELD_LABEL[gap.field]} (${gap.missing.map((l) => LOCALE_LABEL[l]).join(', ')})`);
  return `Ürün yayına alınamıyor — şu alanlar üç dilde de dolu olmalı: ${parts.join(' · ')}.`;
}
