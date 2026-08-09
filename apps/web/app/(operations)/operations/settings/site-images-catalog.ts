import { SITE_IMAGE_SLOTS, type ImageRole, type SiteImageSlot } from '@lezzet/types';

/**
 * VİTRİN GÖRSELLERİ sözlüğü (09.16 · `site_image`) — hangi slot nerede görünüyor, hangi çerçevede.
 *
 * ── SLOT LİSTESİ KODDA SABİT, AYARDA DEĞİL ──────────────────────────────────
 * Karar arka uçta zaten verilmiş: `site_image_slot` bir **enum**, yani yeni slot ancak migration'la
 * doğar. Gerekçe iki şeridin ortak cevabı: karşılığı olmayan bir slot boş bir kutudur ve serbest
 * metin, hiçbir yerde görünmeyecek bir görselin yüklenmesine izin verirdi. Bu sözlük enum'u
 * genişletmez, ona **okunur bir yüz** verir — yeni slot eklendiği gün burada karşılığı yoksa
 * derleyici uyarır (`Record<SiteImageSlot, …>`).
 *
 * ── ORAN SLOT'A GÖRE DEĞİŞİYOR ──────────────────────────────────────────────
 * Aynı fotoğraf 16:9 ile 13:10 çerçeveye bambaşka oturur, o yüzden her slot kendi çerçevesini ve
 * kırpma önizlemesini taşıyor. Dört ayrı yükleyici YAZILMADI: kart tek bileşen, oranı bu sözlükten
 * parametre alıyor — dördüncü slot eklendiğinde dört yerde düzeltme gerekmesin.
 */
interface SiteImageSlotSpec {
  /** Operatörün gördüğü ad — "hangi görsel". */
  label: string;
  /** Nerede çıkıyor — operatör yüklediği şeyin nereye düşeceğini bilmeli. */
  where: string;
  /** Kırpma çerçevesi (`IMAGE_ROLES`); oran ve ideal kaynak oradan gelir. */
  role: ImageRole;
  /**
   * Alt metnin VARSAYILANI dolu mu — yani operatör boş bırakırsa sayfanın kendi cümlesi mi kalıyor.
   * Müşteri şeridinin kararı: kahramanlarda sayfa metni var, dekoratif görsellerde varsayılan BOŞ
   * (yanındaki başlık aynı şeyi zaten söylüyor). Ekran bunu yazıyor ki operatör alanı boş
   * bırakmanın ne demek olduğunu bilsin.
   */
  altFallback: 'sayfa metni' | 'boş (dekoratif)';
}

export const SITE_IMAGE_CATALOG: Record<SiteImageSlot, SiteImageSlotSpec> = {
  home_hero: {
    label: 'Ana sayfa kahramanı',
    where: 'Ana sayfanın en üstü — masaüstü ve mobil web aynı görseli kullanır',
    role: 'banner',
    altFallback: 'sayfa metni',
  },
  packages_hero: {
    label: 'Paketler kahramanı',
    where: 'Paketler sayfasının başı — yalnız masaüstünde çizilir',
    role: 'page_wide',
    altFallback: 'boş (dekoratif)',
  },
  professionals_hero: {
    label: 'Professionnels kahramanı',
    where: 'İşletmelere yönelik sayfanın başı',
    role: 'banner',
    altFallback: 'sayfa metni',
  },
  empty_cart: {
    label: 'Boş sepet çizimi',
    where: 'Sepet boşken görünen anlatım görseli',
    role: 'illustration',
    altFallback: 'boş (dekoratif)',
  },
};

/** Ekranın çizeceği sıra — enum sırası (migration'ın sırası), ekranın uydurduğu bir sıra değil. */
export const SITE_IMAGE_ORDER = SITE_IMAGE_SLOTS;
