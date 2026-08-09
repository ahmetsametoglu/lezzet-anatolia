import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontHome } from '@/lib/storefront/storefront-types';
import type { SitePageImage } from '@/lib/storefront/site-image';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Anasayfa tip/sözleşme modülü (view DEĞİL — gerçek view'lar home.desktop/home.mobile).

/** Arayüz metinleri messages.json'dan TÜRETİLİR (elle interface yok). */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Masaüstü ve mobil sunum varyantlarının paylaştığı sözleşme. Anasayfa durumsuzdur: veri sunucuda
 * çözülür, varyantlar yalnız DÜZENİ değiştirir (Sapma 3 — çatallanma client sınırında).
 */
export interface HomeViewProps {
  t: Messages;
  locale: Locale;
  data: StorefrontHome;
  /**
   * Kahraman görseli (`site_image.home_hero`) — **`data`'nın İÇİNDE değil, YANINDA.**
   *
   * `StorefrontHome` katalog verisidir (kategori · seçki · fırsat · paket · tarif); sayfanın kendi
   * süsü oraya girseydi vitrin okumasının tipi bir sayfanın yerleşimine bağlanırdı. Ayrı prop, ayrı
   * kaynak: biri katalogdan, öteki `site_image` slotundan.
   *
   * `null` = operatör henüz yüklemedi → `FramedImage` yer tutucusunu çizer, sayfa kırılmaz.
   */
  hero: SitePageImage | null;
}

/** "En fazla {n} adet" şablonunu doldurur — sayı yerleşimi tek yerde, iki varyantta tekrarlanmaz. */
export function limitText(template: string, limit: string | null): string | null {
  return limit ? template.replace('{n}', limit) : null;
}

// `HERO_IMAGE` sabiti KALKTI (09.08 · 08.33): kahraman artık `site_image.home_hero` slotundan
// geliyor ve `public/hero-sofra.jpg` silindi. Geçici dosyanın künyesi "kalıcı yol geldiğinde bu
// satır kapıdan gelen künyeyle değişir, dosya silinir" diyordu — kapı geldi, söz tutuldu.
