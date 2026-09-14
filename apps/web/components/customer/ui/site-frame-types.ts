import type { ComponentProps, ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { BackButton } from './back-button';

/*
  ÇERÇEVENİN TİPLERİ — `site-frame.tsx` (masaüstü ve cihaz forku) ile `site-frame.mobile.tsx`
  (telefon kabuğu) ikisi de okur.

  NEDEN AYRI DOSYA: tipler `site-frame.tsx`teydi ve kabuk onları oradan okuyordu; `site-frame.tsx`
  de kabuğu içe aktarıyor. İki dosya birbirini içe aktarınca `no-circular` kuralı kırıldı
  (depcruise tip içe aktarımlarını da sayar — `tsPreCompilationDeps`). Tipin ortak bir yerde durması
  döngüyü kaldırır; iki dosya da buradan okur.
*/

// `deals` 09.08'de düştü: menüden kaldırıldı (kullanıcı kararı) ve aktif işareti verilecek bir
// menü öğesi kalmadı. Katalog `?offers=1` ile açıldığında aktif olan öğe `catalog` — doğrusu da bu,
// çünkü gidilen yer katalogun kendisi.
// `home` ve `discover` masaüstü şeridinde satır değil (logo · anasayfa bandı) ama sayfalar geçiriyor:
// anahtar kümesi sayfanın kimliğidir, menünün satırları değil.
export type NavKey = 'home' | 'catalog' | 'packages' | 'recipes' | 'discover' | 'pro';
/** Hesap alanının üç sekmesi (tasarım: `Hesabım · Siparişlerim · Taleplerim`). */
export type AccountTab = 'account' | 'orders' | 'support';

export interface SiteFrameProps {
  device: 'mobile' | 'desktop';
  locale: Locale;
  /**
   * Gezinmede hangi öğe AKTİF — tasarımda aktif sayfa zeytin rengi + 2px alt çizgi taşır (Katalog
   * ve Ürün Detay ekranlarında "Katalog", Hesap ekranında "Hesabım"). Ziyaretçi nerede olduğunu
   * başlıktan görmeli. Ana sayfa `home` geçirir: masaüstü şeridinde satırı yok (o işi logo görür).
   * Hata/404 gibi sayfasız hâller vermez. Mobil kabuk bunu okumaz — sekmesi rotadan yanar.
   */
  activeNav?: NavKey;
  /**
   * MOBİL çerçeve kipi. `bare` başlık çizmez: sayfa kendi başlığını kuruyor — sepet ve checkout
   * (`FunnelHeader`) ve keşif (tam ekran örtü). Öteki ekranların başlığı rotadan seçilir: native
   * uygulamanın başlık sistemi (14.09, `site-frame.mobile.tsx`). Masaüstünde fark YOKTUR.
   */
  mobileChrome?: 'default' | 'bare';
  /* `detail` (detay sayfasının mobil üst bar künyesi) 14.09'da kalktı: ürün, paket ve tarif detayı telefonda
     başlığını kendisi kuruyor (native'in ekranları) — çerçeve bu rotalarda başlık çizmiyor, künyeyi okuyan kalmadı. */
  /**
   * Footer katmanı — YALNIZ MASAÜSTÜ (kullanıcı kararı 20.08 — sayfa TÜRÜNE bağlı):
   *   `full` → giriş kapıları: ana sayfa, Professionnels, yasal/statik sayfalar.
   *   `slim` → marka + dil tek satırı: katalog/paket/tarif listeleri ve tüm detay sayfaları.
   *   `none` → huni ve girişli yardımcı yüzeyler: sepet, checkout, keşif, hesap alanı.
   * Verilmezse: `fill` ve hesap alanı `none`, kalan `full`. Mobil web v1 footer çizmiyor — yasal
   * bağlantılar ve dil orada hesap ekranının en altında (kullanıcı kararı 13.09).
   */
  footer?: 'full' | 'slim' | 'none';
  /**
   * **HESAP ALANININ BAŞLIĞI** (08.14) — verilirse vitrin başlığının YERİNE geçer.
   *
   * Masaüstünde tasarımın hesap başlığı: logo + (sekmeler | geri bağı) + sağ uçta ekrana özel öğe.
   * Mobilde `title` başlığın metni, `back.href` ‹'nin üst sayfası, `right` `AppBar`ın sağ yuvası
   * (native: "+ Yeni" gibi ekranın eylemi — 14.09). Duyuru şeridi hesap alanında yok — girişli bir
   * yardımcı yüzey, kampanya duyurusunun yeri değil.
   *
   * Neden `SiteFrame` içinde ve ayrı bir bileşen değil: `main` ve footer aynı kalıyor. Ayrı bir
   * çerçeve yazmak footer'ı ikinci kez tanımlamak, yani dil listesini iki yerde tutmak olurdu.
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
   * **Sayfa EKRANI DOLDURUR** — yazışma yüzeyleri için (08.6).
   *
   * Normalde gövde içeriği kadar uzar ve altında footer durur; bu doğru davranıştır, sayfalar
   * okunmak için var. Ama yazışma bir SAYFA değil bir ALAN: cevap kutusu ekranın dibinde durmalı,
   * içeriğin bittiği yerde değil. Kısa bir yazışmada kutu ekranın ortasında asılı kalıyordu.
   *
   * Üç şey birlikte değişir: dış kap `h-screen` olur (en az değil, TAM), `main` kalanı alır ve
   * kendi içinde kaydırılabilir hale gelir (`min-h-0` olmadan flex çocuğu küçülmez), **footer
   * çizilmez**. Footer'ın gitmesi bir kayıp değil bağlam kararı: gelen kutusunun altında site
   * bağlantıları aranmaz, ve dururken kaydırılabilir alandan yer çalardı.
   */
  fill?: boolean;
  children: ReactNode;
}
