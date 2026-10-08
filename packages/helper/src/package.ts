import type { PlaceMarkTone } from './delivery';

/**
 * Hazır paketin iki yüzeyde ortak kuralları: native paket ekranları ve web'in kartları aynı eşlemeleri okur, çünkü iki yerde
 * yazılan eşlemenin düzeltmesi birine yazılıp ötekinde unutulur.
 */

/**
 * Paket detayındaki adet seçicinin tavanı — stoktan değil şablondan gelir, çünkü paket bütün olarak satılır ve
 * teklif partisi kavramı yoktur. Parametrik.
 */
export const PACKAGE_QUANTITY_MAX = 20;

/**
 * Paketin yolu ürün kartının stok diline çevrilir, çünkü müşteri aynı bilgiyi iki kartta farklı sözcüklerle okumamalı. Kargo yolu `shipping`,
 * kapıya kilitli ya da tam takımı hiçbir havuzda olmayan paket `elsewhere`, yerelden gelen ve yeri bilinmeyen `null`; `soldOut` çağıranda önce bakılır.
 */
export function packageRouteStatusOf(route: string | null): 'shipping' | 'elsewhere' | null {
  if (route === 'shipping') return 'shipping';
  if (route === 'not_shippable_here' || route === 'unavailable') return 'elsewhere';
  return null;
}

/** Kartın alt satırının metni; ortak paket sözlüğünün `note` bölümü (`@lezzet/i18n/customer/packages`). */
export interface PackageNoteCopy {
  coldChain: string;
  shippable: string;
  regionOnly: string;
}

/**
 * Paket kartının alt satırı paketin kendi kalıcı gerçeğidir (soğuk zincir ve teslim yolu). Kapalı kapıda yer notu soğuk zinciri de
 * söylediği için alt satır susar (`''`).
 */
export function packageNoteOf(
  pack: { coldChain: boolean; inRouteOnly: boolean },
  tone: PlaceMarkTone | null,
  copy: PackageNoteCopy,
  locale: string,
): string {
  if (tone === 'blocked') return '';
  const where = pack.inRouteOnly ? copy.regionOnly : copy.shippable;
  if (pack.coldChain) return `${copy.coldChain} · ${where}`;
  // Önek yoksa parça cümlenin başıdır.
  return where.charAt(0).toLocaleUpperCase(locale) + where.slice(1);
}

/**
 * Kartın içerik satırı: ürün adları, birden çok adette ortak sözlüğün `item` kalıbıyla ("{label} (×{qty})"). Aynı ürünün iki boyu
 * boy etiketiyle yazılır, yoksa satırda iki aynı ad birbirinden ayırt edilmezdi.
 */
export function packageContentsLine(items: readonly { name: string; unitLabel: string; qty: number }[], itemTemplate: string): string {
  return items
    .map((item) => {
      const repeated = items.filter((other) => other.name === item.name).length > 1;
      const label = repeated && item.unitLabel !== '' ? `${item.name} ${item.unitLabel}` : item.name;
      return item.qty > 1 ? itemTemplate.replace('{label}', label).replace('{qty}', String(item.qty)) : label;
    })
    .join(', ');
}

/**
 * Kartın foto yığını: aynı ürünün iki boyu tek halkadır, çünkü iki aynı fotoğraf yan yana içerik çeşitliliği gibi okunurdu. Fazlası
 * `more` olarak döner ve yığının sonunda "+N" yazılır.
 */
export function packageThumbsOf<T extends { name: string }>(items: readonly T[], max: number): { shown: T[]; more: number } {
  const distinct = items.filter((item, index) => items.findIndex((other) => other.name === item.name) === index);
  return { shown: distinct.slice(0, max), more: Math.max(0, distinct.length - max) };
}
