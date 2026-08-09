import 'server-only';
import { SiteImageService, serviceDb } from '@lezzet/database';
import { imageOf, type StorefrontImage } from '@lezzet/application';
import { resolveLocalizedText, type SiteImageSlot } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

/**
 * SAYFA GÖRSELİ okuması (09.16 · `site_image`) — bir varlığa değil bir SAYFA YERİNE ait görseller:
 * ana sayfa kahramanı, Paketler ve Professionnels kahramanları, boş sepet çizimi.
 *
 * **Boş slot = satır YOK** ve ekran bugünkü yer tutucusunu çizmeye devam eder (`FramedImage` zaten
 * `src={null}` ile doğru davranıyor). Kova erişilemezse de aynı yola düşülür: `publicImageUrl`
 * taban adres ayarlı değilken `null` döndürüyor, yani R2'siz yerelde sayfa görselsiz çalışır ama
 * KIRILMAZ. Görselin yokluğu bir hata hâli değildir — operatör henüz yüklememiştir.
 *
 * **`imageOf` yeniden yazılmadı:** `SiteImage` de kardeşleri gibi `ImageMetaSchema`'dan türüyor, o
 * yüzden URL+kırpım indirgemesi ürün/kategori/paketle AYNI fonksiyondan geliyor. İkinci bir nüsha
 * yazılsaydı sürüm damgası (`?v=`) ya da prefix çözümü bir gün ötekinden ayrışırdı.
 */
export interface SitePageImage extends StorefrontImage {
  /**
   * Operatörün yazdığı alternatif metin — **varsa sayfanın kendi metnini EZER.**
   *
   * Sıra bilinçli: sayfanın `messages.json`'undaki alt metni görselin ne olduğunu değil, orada bir
   * görsel olduğunu anlatır ("Sofra fotoğrafı"); operatör gerçek fotoğrafı yükleyen kişi olarak ne
   * olduğunu bilir. Boşsa sayfa metni kalır — uydurma bir cümle yazmaktansa genel olan doğrudur.
   */
  alt: string | null;
}

/**
 * Tek slot — yalnız o sayfayı çizen okuma.
 *
 * Slot başına ayrı çağrı, `bySlot()` haritası DEĞİL: müşteri yüzeyinde hiçbir sayfa iki slot
 * çizmiyor ve dördünü birden okumak her sayfaya üç gereksiz satır getirirdi. Harita operasyonun
 * "Vitrin görselleri" sekmesinin okumasıdır — orada dördü birden gerekiyor.
 */
export async function readSiteImage(slot: SiteImageSlot, locale: Locale): Promise<SitePageImage | null> {
  const row = await new SiteImageService(serviceDb()).getSlot(slot);
  if (!row) return null;
  return { ...imageOf(row), alt: row.imageAlt ? resolveLocalizedText(row.imageAlt, locale) : null };
}
