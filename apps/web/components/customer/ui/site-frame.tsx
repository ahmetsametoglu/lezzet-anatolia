import type { ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { brand } from '@lezzet/brand';
import { Link } from '@/i18n/navigation';
import { SearchField } from './search-field';

/**
 * Müşteri site çerçevesi — duyuru şeridi + marka başlığı + footer. Hata sayfalarında (404/500)
 * müşteri "çıkmaz sokakta" bırakılmaz: marka ve ana sayfaya dönüş her zaman elinin altında kalır.
 * Cihaz forku (Sapma 3): masaüstünde açık gezinme, mobilde sadeleşmiş başlık — `md:` akışkan
 * responsive DEĞİL, `device` ile çatallanır.
 *
 * Not: gezinme etiketleri (Katalog/Paketler…) şimdilik görsel çerçevedir; ilgili müşteri rotaları
 * (`/catalog` vb.) inince `<Link>`'e bağlanır (routing.ts pathnames). Gerçek site başlığı/footer
 * komponentleri (Envanter K11/K12/K16) kodlanınca bu çerçeve onlarla değişir.
 */
interface SiteFrameNav {
  catalog: string;
  packages: string;
  deals: string;
  discover: string;
  pro: string;
}

interface SiteFrameProps {
  device: 'mobile' | 'desktop';
  locale: Locale;
  /** Tek satırlık duyuru — mobilde ve `announcements` verilmediğinde kullanılır. */
  announcement: string;
  /**
   * Masaüstü duyuru şeridinin maddeleri (soğuk zincir · bölge teslimi · kargo). Verilmezse tek
   * satıra düşer: hata sayfaları tek mesaj gösterir, vitrin üç madde (tasarım: Anasayfa Web).
   */
  announcements?: string[];
  /** Verilirse başlıkta arama kutusu görünür. Arama İŞLEVİ 08.3'te — burada yalnız giriş noktası. */
  searchPlaceholder?: string;
  nav: SiteFrameNav;
  children: ReactNode;
}

/**
 * Sayfa gövdesinin azami genişliği. Tasarımın masaüstü ekranı 1360 px çizilmiştir — bu bir viewport
 * temsili DEĞİL, düzenin kendisidir: içerik daha geniş ekranda yayılmaz, ortalanır. Zeminler (duyuru
 * şeridi, footer) tam genişlikte kalır; yalnız İÇERİK bu kabın içine girer. Tek sabit — üç yerde
 * (başlık · gövde · footer) tekrar yazılmaz.
 */
const SHELL = 'mx-auto w-full max-w-[1360px]';

export function SiteFrame({ device, locale, announcement, announcements, searchPlaceholder, nav, children }: SiteFrameProps) {
  const bandItems = device === 'desktop' && announcements?.length ? announcements : [announcement];
  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      {/* Duyuru şeridi (K11) — hata sayfasında da render edilir */}
      <div className="bg-olive px-4 py-2 font-sans text-note font-medium text-cream">
        <div className={`${SHELL} flex justify-center gap-7 text-center`}>
          {bandItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      {/* Başlık (K12) */}
      {device === 'mobile' ? (
        <header className="flex items-center justify-between border-b border-sand-300 px-5 py-3">
          <span className="font-sans text-xl font-bold text-ink">☰</span>
          <Link href="/" className="cursor-pointer">
            <img src="/logo.jpg" alt={brand.name} className="h-10 mix-blend-multiply" />
          </Link>
          <span className="font-sans text-base text-ink">🧺</span>
        </header>
      ) : null}
      {device === 'mobile' && searchPlaceholder && (
        <div className="mx-4 mt-3">
          <SearchField placeholder={searchPlaceholder} fullWidth />
        </div>
      )}
      {device === 'desktop' && (
        <header className={`${SHELL} flex items-center gap-9 border-b border-sand-300 px-12 py-4`}>
          <Link href="/" className="cursor-pointer">
            <img src="/logo.jpg" alt={brand.name} className="h-[58px] mix-blend-multiply" />
          </Link>
          <nav className="flex gap-7 font-sans text-body font-semibold text-ink">
            <span>{nav.catalog}</span>
            <span>{nav.packages}</span>
            <span className="text-terracotta">{nav.deals}</span>
            <span>{nav.discover}</span>
            <span>{nav.pro}</span>
          </nav>
          <div className="ml-auto flex items-center gap-5 font-sans text-body font-semibold text-muted">
            {searchPlaceholder && <SearchField placeholder={searchPlaceholder} />}
            <span className="uppercase">{locale} ▾</span>
            <span className="text-ink">🧺</span>
          </div>
        </header>
      )}

      {/* İçerik — hata gövdesi */}
      <main className={`${SHELL} flex flex-1 flex-col`}>{children}</main>

      {/* Footer (K16) — cihaza göre düzen (mobilde alt alta, masaüstünde yan yana) */}
      {/* Zemin tam genişlikte, içerik kabuk içinde — sayfa geniş ekranda ortalanır, zemin kesilmez. */}
      <footer className="bg-ink py-6 text-neutral-400">
        <div
          className={[
            SHELL,
            'flex gap-3',
            device === 'mobile' ? 'flex-col px-6' : 'items-center justify-between px-12',
          ].join(' ')}
        >
          <span className="font-serif text-card-title-sm text-cream">{brand.name}</span>
          <div className="flex flex-wrap gap-x-7 gap-y-2 font-sans text-sm">
            <span>Mentions légales</span>
            <span>CGV</span>
            <span>Gizlilik</span>
            <span>SSS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
