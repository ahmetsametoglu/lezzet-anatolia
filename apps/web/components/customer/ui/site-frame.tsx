import type { ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { brand } from '@lezzet/brand';
import { Link } from '@/i18n/navigation';

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
  announcement: string;
  nav: SiteFrameNav;
  children: ReactNode;
}

export function SiteFrame({ device, locale, announcement, nav, children }: SiteFrameProps) {
  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      {/* Duyuru şeridi (K11) — hata sayfasında da render edilir */}
      <div className="bg-olive px-4 py-2 text-center font-sans text-[13px] font-medium text-cream">{announcement}</div>

      {/* Başlık (K12) */}
      {device === 'mobile' ? (
        <header className="flex items-center justify-between border-b border-sand-300 px-5 py-3">
          <span className="font-sans text-xl font-bold text-ink">☰</span>
          <Link href="/" className="cursor-pointer font-serif text-[22px] font-semibold text-ink transition-colors hover:text-olive">
            {brand.name}
          </Link>
          <span className="font-sans text-base text-ink">🧺</span>
        </header>
      ) : (
        <header className="flex items-center gap-9 border-b border-sand-300 px-12 py-4">
          <Link href="/" className="cursor-pointer font-serif text-2xl font-semibold text-ink transition-colors hover:text-olive">
            {brand.name}
          </Link>
          <nav className="flex gap-7 font-sans text-[15px] font-semibold text-ink">
            <span>{nav.catalog}</span>
            <span>{nav.packages}</span>
            <span className="text-terracotta">{nav.deals}</span>
            <span>{nav.discover}</span>
            <span>{nav.pro}</span>
          </nav>
          <div className="ml-auto flex items-center gap-5 font-sans text-sm font-semibold text-muted">
            <span className="uppercase">{locale} ▾</span>
            <span className="text-ink">🧺</span>
          </div>
        </header>
      )}

      {/* İçerik — hata gövdesi */}
      <main className="flex flex-1 flex-col">{children}</main>

      {/* Footer (K16) — cihaza göre düzen (mobilde alt alta, masaüstünde yan yana) */}
      <footer
        className={[
          'flex gap-3 bg-ink py-6 text-neutral-400',
          device === 'mobile' ? 'flex-col px-6' : 'items-center justify-between px-12',
        ].join(' ')}
      >
        <span className="font-serif text-[17px] font-semibold text-cream">{brand.name}</span>
        <div className="flex flex-wrap gap-x-7 gap-y-2 font-sans text-sm">
          <span>Mentions légales</span>
          <span>CGV</span>
          <span>Gizlilik</span>
          <span>SSS</span>
        </div>
      </footer>
    </div>
  );
}
