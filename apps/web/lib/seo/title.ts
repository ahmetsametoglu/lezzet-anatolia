import { brand } from '@lezzet/brand';

/**
 * **Sekme başlığının marka eki** (08.1) — tek kaynak.
 *
 * Sayfalar kendi başlığını yazıyor ("Baklava Fıstıklı") ve marka adı hiçbir yerde görünmüyordu:
 * paylaşılan bir sekme ya da yer imi kimin sayfası olduğunu söylemiyordu. Şablon layout'ta
 * (`title.template`), yani sayfaların hiçbiri markayı elle eklemiyor.
 *
 * **AMA Next şablonu KENDİ SEGMENTİNE UYGULAMAZ** — yalnız ALT rotalara. Ana sayfa layout'la aynı
 * segmentte (`[locale]/page.tsx` ↔ `[locale]/layout.tsx`), dolayısıyla ekini almıyor ve bu ölçüldü
 * (ürün sayfasında ek var, ana sayfada yoktu). Sitenin en çok aranan sayfası markasız kalamaz;
 * ana sayfa eki kendisi ekliyor.
 *
 * İkisi de buradan besleniyor — ayırıcıyı iki yerde yazsaydık biri "·" öteki "—" olurdu ve fark
 * yalnız arama sonucunda, aylar sonra görünürdü.
 */
const SEPARATOR = '·';

/** Layout'un `title.template` değeri — alt rotalara marka ekini basar. */
export const TITLE_TEMPLATE = `%s ${SEPARATOR} ${brand.name}`;

/** Şablonun ULAŞAMADIĞI yerde (kendi segmenti) aynı eki elle kurar. */
export function titleWithBrand(title: string): string {
  return `${title} ${SEPARATOR} ${brand.name}`;
}
