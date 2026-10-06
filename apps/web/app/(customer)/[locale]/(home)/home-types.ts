import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { PhoneHome } from '@/lib/storefront/home-view';
import type { StorefrontHome } from '@/lib/storefront/storefront-types';
import type { SitePageImage } from '@/lib/storefront/site-image';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Anasayfa tip/sözleşme modülü (view DEĞİL — gerçek view'lar home.desktop/home.mobile).

/** Arayüz metinleri messages.json'dan TÜRETİLİR (elle interface yok). */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Masaüstü anasayfasının sözleşmesi. Anasayfa durumsuzdur: veri sunucuda çözülür, görünüm yalnız
 * DÜZENİ kurar (Sapma 3 — çatallanma client sınırında).
 */
export interface HomeViewProps {
  t: Messages;
  locale: Locale;
  data: StorefrontHome;
  /**
   * Kahraman görseli (`site_image.home_hero`) `data`'nın yanında durur, çünkü `StorefrontHome` katalog verisidir ve sayfanın süsü oraya
   * girerse vitrin okumasının tipi sayfanın yerleşimine bağlanır. `null` = operatör henüz yüklemedi, çerçeve yer tutucusunu çizer.
   */
  hero: SitePageImage | null;
  /** Keşif bandı çizilir mi; profesyonel müşteriye tur yoktur. */
  discover: boolean;
}

/**
 * Telefon vitrininin sözleşmesi: veri native vitrinin okumasından (`readHome`) ve iki kimlikli okumadan (`home-view.ts`) gelir; metnin
 * çoğu ortak sözlükte (`@lezzet/i18n/customer/home`), sayfanın sözlüğünden yalnız arama motorunun okuduğu başlık gelir.
 */
export interface HomeMobileProps {
  t: Messages;
  locale: Locale;
  data: PhoneHome;
}

/** "En fazla {n} adet" şablonunu doldurur — sayı yerleşimi tek yerde, iki varyantta tekrarlanmaz. */
export function limitText(template: string, limit: string | null): string | null {
  return limit ? template.replace('{n}', limit) : null;
}
