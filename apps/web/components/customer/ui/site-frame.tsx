import type { ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { LOCALES } from '@lezzet/i18n';
import { brand } from '@lezzet/brand';
import { Link } from '@/i18n/navigation';
import { LocaleSwitch } from './locale-switch';
import { SearchField } from './search-field';
import messages from './site-frame-messages.json';

/**
 * Müşteri site çerçevesi — K11 duyuru şeridi · K12 site başlığı · K16 footer. Hata sayfalarında
 * (404/500) müşteri "çıkmaz sokakta" bırakılmaz: marka ve ana sayfaya dönüş her zaman elinin
 * altında kalır.
 *
 * METİNLERİ KENDİ TAŞIR (`site-frame-messages.json`). Sayfa `messages.json`'undan geçirilseydi aynı
 * duyuru/gezinme/footer metni dört dosyada tekrarlanır, diller zamanla birbirinden kayardı — nitekim
 * katalog sayfası bir süre anasayfanın metinlerini import etti (27.07 düzeltildi). Çerçeve her
 * sayfada aynı olduğu için metni de tek yerde.
 *
 * Cihaz forku (Sapma 3): masaüstünde açık gezinme, mobilde sadeleşmiş başlık — `md:` akışkan
 * responsive DEĞİL, `device` ile çatallanır.
 */
type NavKey = 'catalog' | 'packages' | 'deals' | 'discover' | 'pro';

interface SiteFrameProps {
  device: 'mobile' | 'desktop';
  locale: Locale;
  /** Başlıkta arama kutusu görünsün mü — vitrin sayfalarında evet, hata ekranlarında hayır. */
  showSearch?: boolean;
  /**
   * Gezinmede hangi öğe AKTİF — tasarımda aktif sayfa zeytin rengi + 2px alt çizgi taşır (Katalog
   * ve Ürün Detay ekranlarında "Katalog", Hesap ekranında "Hesabım"). Ziyaretçi nerede olduğunu
   * başlıktan görmeli; verilmezse hiçbiri işaretlenmez (ana sayfa).
   */
  activeNav?: NavKey;
  children: ReactNode;
}

/**
 * Sayfa gövdesinin azami genişliği. Tasarımın masaüstü ekranı 1360 px çizilmiştir — bu bir viewport
 * temsili DEĞİL, düzenin kendisidir: içerik daha geniş ekranda yayılmaz, ortalanır. Zeminler (duyuru
 * şeridi, footer) tam genişlikte kalır; yalnız İÇERİK bu kabın içine girer.
 */
const SHELL = 'mx-auto w-full max-w-[1360px]';

/** Footer'ın dil sütunu — geçerli dil ✓ ile işaretli; diğerleri aynı sayfanın o dildeki hâline gider. */
const LOCALE_LABEL: Record<Locale, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

/**
 * Aktif gezinme öğesi: zeytin metin + 2px alt çizgi (tasarım K12).
 *
 * Alt çizgi HER öğede vardır, aktif olmayanda ŞEFFAFtır. Yalnız aktif öğeye verilirse o öğe 4px
 * uzar, satır yüksekliği büyür ve sayfa değiştikçe tüm menü yukarı-aşağı oynar (yaşandı — 27.07).
 * Yer baştan ayrılır, değişen tek şey renk olur.
 */
function navClass(key: NavKey, active: NavKey | undefined, base = ''): string {
  return [base, 'border-b-2 pb-0.5', active === key ? 'border-olive text-olive' : 'border-transparent'].filter(Boolean).join(' ');
}

export function SiteFrame({ device, locale, showSearch = false, activeNav, children }: SiteFrameProps) {
  const t = messages[locale];
  const isMobile = device === 'mobile';
  const bandItems = isMobile ? [t.announcement.mobile] : [t.announcement.cold, t.announcement.local, t.announcement.shipping];

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      {/* K11 · Duyuru şeridi */}
      <div className="bg-olive px-4 py-2 font-sans text-note font-medium text-cream">
        <div className={`${SHELL} flex justify-center gap-7 text-center`}>
          {bandItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      {/* K12 · Site başlığı */}
      {isMobile ? (
        <>
          <header className="flex items-center justify-between border-b border-sand-300 px-4 py-3">
            <span className="font-sans text-icon-sm font-bold text-ink">☰</span>
            <Link href="/" className="cursor-pointer">
              <img src="/logo.jpg" alt={brand.name} className="h-10 mix-blend-multiply" />
            </Link>
            <span className="font-sans text-icon-sm text-ink">🧺</span>
          </header>
          {showSearch && (
            <div className="mx-4 mt-3">
              <SearchField placeholder={t.search} fullWidth />
            </div>
          )}
        </>
      ) : (
        <header className={`${SHELL} flex items-center gap-9 border-b border-sand-300 px-12 py-4.5`}>
          <Link href="/" className="cursor-pointer">
            <img src="/logo.jpg" alt={brand.name} className="h-[58px] mix-blend-multiply" />
          </Link>
          <nav className="flex gap-7 font-sans text-body font-semibold text-ink">
            {/* Katalog dışındaki rotalar henüz açılmadı → düz metin; açıldıkça `<Link>`e döner. */}
            <Link href="/catalog" className={navClass('catalog', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
              {t.nav.catalog}
            </Link>
            <span className={navClass('packages', activeNav)}>{t.nav.packages}</span>
            {/* Fırsatlar her sayfada terracotta — kampanya vurgusu sabittir, aktiflikten bağımsız. */}
            <span className={navClass('deals', activeNav, 'text-terracotta')}>{t.nav.deals}</span>
            <span className={navClass('discover', activeNav)}>{t.nav.discover}</span>
            <span className={navClass('pro', activeNav)}>{t.nav.pro}</span>
          </nav>
          <div className="ml-auto flex items-center gap-4.5 font-sans text-body-sm font-semibold text-muted">
            {showSearch && <SearchField placeholder={t.search} />}
            <LocaleSwitch locale={locale} />
            <span className="text-icon text-ink">🧺</span>
          </div>
        </header>
      )}

      <main className={`${SHELL} flex flex-1 flex-col`}>{children}</main>

      {/* K16 · Footer — zemin tam genişlikte, içerik kabuk içinde (geniş ekranda zemin kesilmez). */}
      <footer className="bg-ink text-neutral-400">
        <div className={[SHELL, 'flex gap-8', isMobile ? 'flex-col px-4 py-6' : 'justify-between px-12 py-9'].join(' ')}>
          <div className="flex flex-col gap-1.5 font-sans text-body-sm">
            <span className="font-serif text-card-title-sm text-cream">{brand.name}</span>
            <span>{t.footer.address}</span>
            <span>{t.footer.whatsapp}</span>
          </div>

          <div className={['flex gap-8 font-sans text-body-sm', isMobile ? 'flex-wrap' : 'gap-12'].join(' ')}>
            <FooterColumn title={t.footer.shopping} items={[t.nav.catalog, t.nav.packages, t.nav.deals]} />
            <FooterColumn title={t.footer.corporate} items={[t.footer.about, t.nav.pro, t.footer.faq]} />
            {/* Dil sütunu tek gerçek bağlantı grubudur: diğer sütunların rotaları henüz açılmadı. */}
            <div className="flex flex-col gap-1.5">
              <span className="font-bold text-cream">{t.footer.language}</span>
              {LOCALES.map((l) => (
                <Link key={l} href="/" locale={l} className="cursor-pointer transition-colors hover:text-cream">
                  {LOCALE_LABEL[l]}
                  {l === locale ? ' ✓' : ''}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

interface FooterColumnProps {
  title: string;
  items: string[];
}

function FooterColumn({ title, items }: FooterColumnProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-bold text-cream">{title}</span>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
