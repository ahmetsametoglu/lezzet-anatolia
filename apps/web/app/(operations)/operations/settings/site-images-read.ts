import 'server-only';
import { SiteImageService, serviceDb } from '@lezzet/database';
import { imageOf } from '@lezzet/application';
import { cropOf, CROP_CENTER, type ImageCrop, type LocalizedText, type SiteImageSlot } from '@lezzet/types';
import { SITE_IMAGE_ORDER } from './site-images-catalog';

/**
 * Vitrin görselleri sekmesinin okuması (09.16 · `site_image`).
 *
 * **Dördü birden okunur** (`bySlot()`), slot başına ayrı çağrı değil: müşteri yüzeyinde her sayfa
 * tek slot çizer ve orada tek okuma doğrudur; burada dördü de aynı ekranda duruyor ve dört tur
 * atmanın karşılığı yok. Okumanın iki yüzü de aynı kapıdan geçiyor — ayrışmasınlar.
 *
 * **Boş slot = satır YOK ve bu bir hata hâli DEĞİL:** operatör henüz yüklememiştir. Ekran o slotu
 * gizlemez, boş kart olarak çizer — gizleseydi yükleme yolu da kaybolurdu.
 */
export interface SiteImageView {
  slot: SiteImageSlot;
  /** Kayıt kimliği — yalnız DOLU slotta var; kırpma yazması buna bağlı. */
  id: string | null;
  /** Okuma URL'i; kova ayarsızsa `null` gelir ve kart "yüklendi ama gösterilemiyor" der. */
  url: string | null;
  crop: ImageCrop;
  /** Alt metin; **taslak** çok dilli metindir (tüm diller boş olabilir) ve şekli `LocalizedText` ile aynı. */
  alt: LocalizedText | null;
}

export async function readSiteImages(): Promise<SiteImageView[]> {
  const bySlot = await new SiteImageService(serviceDb()).bySlot();

  return SITE_IMAGE_ORDER.map((slot) => {
    const row = bySlot.get(slot);
    if (!row) {
      // Boş slotun kırpımı MERKEZ: kaydı olmayan bir görselin odağı da yoktur ve sıfır yazmak
      // "sol üst köşeye odaklı" demek olurdu.
      return { slot, id: null, url: null, crop: CROP_CENTER, alt: null };
    }
    return { slot, id: row.id, url: imageOf(row).url, crop: cropOf(row), alt: row.imageAlt };
  });
}
