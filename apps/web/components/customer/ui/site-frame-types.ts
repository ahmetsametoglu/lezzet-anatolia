import type { ComponentProps, ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { BackButton } from './back-button';

/*
  Tipler ayrı dosyada: `site-frame.tsx` telefon kabuğunu içe aktarıyor, kabuk da bu tipleri okuyor;
  tipler orada dursa iki dosya birbirini içe aktarırdı (`no-circular`).
*/

// `home` ve `discover` masaüstü menüsünde satır değil ama sayfalar geçiriyor: anahtar kümesi sayfanın
// kimliğidir, menünün satırları değil.
export type NavKey = 'home' | 'catalog' | 'packages' | 'recipes' | 'discover' | 'pro';
/** Hesap alanının üç sekmesi (tasarım: `Hesabım · Siparişlerim · Taleplerim`). */
export type AccountTab = 'account' | 'orders' | 'support';

export interface SiteFrameProps {
  device: 'mobile' | 'desktop';
  locale: Locale;
  /**
   * Gezinmede aktif öğe. Sayfasız hâller (hata/404) vermez; mobil kabuk bunu okumaz, sekmesi rotadan yanar.
   */
  activeNav?: NavKey;
  /**
   * Mobil çerçeve kipi: `bare` başlık çizmez, sayfa kendi başlığını kurar (sepet, checkout, keşif).
   * Masaüstünde fark yoktur.
   */
  mobileChrome?: 'default' | 'bare';
  /**
   * Footer katmanı (yalnız masaüstü): `full` varsayılan, `slim` ürün/paket/tarif detayında, `none` huni
   * ve girişli yüzeylerde. Verilmezse `fill` ve hesap alanı `none`, kalan `full`.
   */
  footer?: 'full' | 'slim' | 'none';
  /**
   * Hesap alanının başlığı; verilirse vitrin başlığının yerine geçer. `SiteFrame` içinde durur, çünkü
   * `main` ve footer aynı kalıyor ve ayrı çerçeve footer'ı ikinci kez tanımlardı.
   */
  accountChrome?: {
    /** Masaüstünde sekme gezinmesi — geri bağıyla birlikte kullanılmaz (tasarımda ikisi ayrı ekran). */
    nav?: AccountTab;
    /** Sekme yerine geri bağı (sipariş detayı: "← Siparişlerim"). Href tipi `BackButton`ın
        fallback'i: mobil ‹ bunu `router.push`a verir; `Link` bu dar tipi zaten kabul eder. */
    back?: { label: string; href: ComponentProps<typeof BackButton>['fallback'] };
    /** Mobil üst barın başlığı — sayfanın adı ya da sipariş referansı. */
    title: string;
    /** Sağ uçtaki öğe — masaüstünde başlığın, mobilde `AppBar`ın ucu ("+ Yeni" · "↻ Tekrar sipariş"). */
    right?: ReactNode;
  };
  /**
   * Sayfa ekranı doldurur (yazışma yüzeyleri): cevap kutusu içeriğin bittiği yerde değil ekranın
   * dibinde durur. `main` kendi içinde kayar ve footer çizilmez.
   */
  fill?: boolean;
  children: ReactNode;
}
