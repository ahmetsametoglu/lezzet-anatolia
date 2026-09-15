import type { ComponentProps } from 'react';
import { LOCALES } from '@lezzet/i18n';
import { brand, whatsappHref } from '@lezzet/brand';
import { Link } from '@/i18n/navigation';
import { Icon } from './icons';
import { LocaleLinks } from './locale-switch';
import { SiteFrameMobile } from './site-frame.mobile';
import type { AccountTab, NavKey, SiteFrameProps } from './site-frame-types';
import { NotificationBell } from '@/components/customer/account/notification-bell';
import { PlaceChip } from '@/components/customer/delivery/place-chip';
import { PlacePanel } from '@/components/customer/delivery/place-panel';
import { CartPill } from '@/components/customer/cart/cart-pill';
import { AccountEntry } from '@/components/customer/account/account-entry';
import messages from './site-frame-messages.json';

/**
 * Müşteri site çerçevesi: duyuru bandı, başlık ve footer. Metinleri kendi taşır, çünkü çerçeve her
 * sayfada aynıdır ve sayfa sözlüklerinde tekrarlansa diller birbirinden kayar.
 */

/**
 * Tasarımın masaüstü düzeni 1360 px genişliğindedir: içerik daha geniş ekranda yayılmaz, ortalanır.
 * Zeminler (duyuru bandı, footer) tam genişlikte kalır.
 */
const SHELL = 'mx-auto w-full max-w-[1360px]';

/**
 * Footer'ın yasal satırı; sıra tasarımın sırasıdır. Dizi sözlükte değil burada durur: hangi sayfaların
 * olduğu dile göre değişmez, sözlüğe gömülse bir dilde satır eksik kalabilirdi.
 */
export const LEGAL_LINKS = [
  { key: 'terms', href: '/legal/terms' },
  { key: 'sales', href: '/legal/sales' },
  { key: 'privacy', href: '/legal/privacy' },
  { key: 'delivery', href: '/legal/delivery' },
  { key: 'faq', href: '/legal/faq' },
] as const;

/**
 * Aktif gezinme öğesi: zeytin metin + 2px alt çizgi. Çizgi her öğede vardır, aktif olmayanda
 * şeffaftır; yalnız aktife verilse sayfa değiştikçe menü satırı 4px oynardı.
 */
function navClass(key: NavKey, active: NavKey | undefined, base = ''): string {
  return [base, 'border-b-2 pb-0.5', active === key ? 'border-olive text-olive' : 'border-transparent'].filter(Boolean).join(' ');
}

/** Hesap sekmesi — vitrin menüsüyle aynı kural (`navClass`). */
function tabClass(key: AccountTab, active: AccountTab | undefined, base = ''): string {
  return [base, 'border-b-2 pb-0.5', active === key ? 'border-olive text-olive' : 'border-transparent'].filter(Boolean).join(' ');
}

export function SiteFrame({ device, locale, activeNav, mobileChrome = 'default', accountChrome, fill, footer, children }: SiteFrameProps) {
  if (device === 'mobile') {
    return (
      <SiteFrameMobile locale={locale} mobileChrome={mobileChrome} accountChrome={accountChrome} fill={fill}>
        {children}
      </SiteFrameMobile>
    );
  }

  const t = messages[locale];
  // Hesap alanında duyuru bandı çizilmez ve başlık değişir.
  const account = accountChrome;
  const footerTier = footer ?? (fill || account ? 'none' : 'full');

  return (
    <div className={`flex flex-col bg-cream text-ink ${fill ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* Duyuru bandı — hesap alanında yok. */}
      {!account && (
      <div className="bg-olive px-4 py-2 font-sans text-note font-medium text-sand-50">
        <div className={`${SHELL} flex justify-center gap-7 text-center`}>
          {[t.announcement.cold, t.announcement.local, t.announcement.shipping].map((item, i) => (
            <span key={item} className="inline-flex items-center gap-1.5">
              {/* Kar tanesi yalnız ilk maddede: soğuk zincir sözünün işareti. */}
              {i === 0 && <Icon name="snowflake" size={13} />}
              {item}
            </span>
          ))}
        </div>
      </div>
      )}

      {/* Site başlığı — hesap alanında kendi başlığı. */}
      {account ? (
        <header className={`${SHELL} flex items-center gap-9 border-b border-sand-300 px-12 py-4.5`}>
          <Link href="/" className="cursor-pointer">
            <img src="/logo.jpg" alt={brand.name} className="h-[52px] mix-blend-multiply" />
          </Link>
          {account.nav ? (
            <nav className="flex gap-6 font-sans text-body-sm font-semibold text-muted">
              <Link href="/account" className={tabClass('account', account.nav, 'cursor-pointer transition-colors hover:text-olive')}>
                {t.accountNav.account}
              </Link>
              <Link href="/orders" className={tabClass('orders', account.nav, 'cursor-pointer transition-colors hover:text-olive')}>
                {t.accountNav.orders}
              </Link>
              <Link href="/support" className={tabClass('support', account.nav, 'cursor-pointer transition-colors hover:text-olive')}>
                {t.accountNav.support}
              </Link>
            </nav>
          ) : account.back ? (
            <Link href={account.back.href} className="cursor-pointer font-sans text-body-sm font-bold text-olive hover:text-olive-dark">
              {account.back.label}
            </Link>
          ) : null}
          <div className="ml-auto flex flex-none items-center gap-5">
            {/* Zil hesap alanının her ekranında: rozet müşteriyi bildirim akışına çağırır. */}
            <NotificationBell locale={locale} />
            {account.right}
          </div>
        </header>
      ) : (
        <>
          {/* Başlık yapışkan: kaydırırken yer hapı ve sepet elin altında kalır. */}
          <header className="sticky top-0 z-30 border-b border-sand-275 bg-cream/97 backdrop-blur-sm">
            <div className={`${SHELL} flex items-center gap-8.5 px-12 py-3.5`}>
              <Link href="/" className="flex-none cursor-pointer">
                <img src="/logo.jpg" alt={brand.name} className="h-[52px] mix-blend-multiply" />
              </Link>
              <nav className="flex gap-6.5 font-sans text-body font-semibold text-ink">
                <Link href="/catalog" className={navClass('catalog', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
                  {t.nav.catalog}
                </Link>
                <Link href="/packages" className={navClass('packages', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
                  {t.nav.packages}
                </Link>
                {/* Tarifler satın alınacak şeylerden sonra: tarif onları kullanmanın yolu. */}
                <Link href="/recipes" className={navClass('recipes', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
                  {t.nav.recipes}
                </Link>
                {/* Fırsatlar ve keşif menüde yok: yolları ana sayfanın kahraman düğmesi, fırsat bandı
                    (`/catalog?offers=1`) ve keşif bandı. */}
                <Link href="/professionals" className={navClass('pro', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
                  {t.nav.pro}
                </Link>
              </nav>
              <div className="ml-auto flex items-center gap-3">
                {/* Teslimat yeri sepetin solunda: sepete girmeden önce cevaplanan bir soru. */}
                <PlaceChip locale={locale} />
                <CartPill locale={locale} label={t.cart} copy={t.cartPill} />
                {/* Hesap en sağda: avatar menüsü başlığın ucundan açılır. */}
                <AccountEntry locale={locale} labels={{ orders: t.accountNav.orders, support: t.accountNav.support, pro: t.nav.pro }} />
              </div>
            </div>
          </header>
          <PlacePanel locale={locale} />
        </>
      )}

      {/* `min-h-0`: flex çocuğu varsayılan olarak içeriğinden küçülmez — o olmadan içerideki
          kaydırılabilir alan taşar ve sayfanın kendisi kaydırılır (yani kutu yine dipte durmaz). */}
      <main className={`${SHELL} flex flex-1 flex-col ${fill ? 'min-h-0' : ''}`}>{children}</main>

      {/* Footer zemini tam genişlikte, içerik kabuk içinde; katmanı `footerTier` seçer. */}
      {footerTier !== 'none' && (
      <footer className="bg-ink text-neutral-400">
        {footerTier === 'slim' ? (
          <div className={`${SHELL} flex items-center justify-between px-12 py-4 font-sans text-micro`}>
            <span className="font-serif text-body font-semibold text-cream">{brand.name}</span>
            <span className="uppercase">{LOCALES.join(' · ')}</span>
          </div>
        ) : (
        <div className={`${SHELL} flex justify-between gap-8 px-12 py-9`}>
          <div className="flex flex-col gap-1.5 font-sans text-body-sm">
            <span className="font-serif text-card-title-sm text-cream">{brand.name}</span>
            <span>{t.footer.address}</span>
            <a
              href={whatsappHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer transition-colors hover:text-cream"
            >
              {t.footer.whatsapp.replace('{phone}', brand.contact.phoneDisplay)}
            </a>
          </div>

          <div className="flex gap-12 font-sans text-body-sm">
            <FooterColumn
              title={t.footer.shopping}
              items={[
                { label: t.nav.catalog, href: '/catalog' },
                { label: t.nav.packages, href: '/packages' },
                { label: t.nav.recipes, href: '/recipes' },
              ]}
            />
            <FooterColumn
              title={t.footer.corporate}
              items={[
                { label: t.footer.about },
                { label: t.nav.pro, href: '/professionals' },
                { label: t.footer.faq, href: '/legal/faq' },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <span className="font-bold text-cream">{t.footer.language}</span>
              <LocaleLinks locale={locale} className="cursor-pointer transition-colors hover:text-cream" />
            </div>
          </div>
        </div>
        )}

        <div className={`${SHELL} flex flex-wrap gap-x-5 gap-y-1.5 border-t border-neutral-400/20 px-12 py-4 font-sans text-body-sm`}>
          {LEGAL_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="cursor-pointer transition-colors hover:text-cream">
              {t.legal[item.key]}
            </Link>
          ))}
        </div>
      </footer>
      )}
    </div>
  );
}

interface FooterColumnProps {
  title: string;
  /** `href` verilmeyen satır düz metin kalır: sayfası olmayan başlığı bağ yapmak ziyaretçiyi 404'e gönderir. */
  items: { label: string; href?: ComponentProps<typeof Link>['href'] }[];
}

function FooterColumn({ title, items }: FooterColumnProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-bold text-cream">{title}</span>
      {items.map((item) =>
        item.href ? (
          <Link key={item.label} href={item.href} className="cursor-pointer transition-colors hover:text-cream">
            {item.label}
          </Link>
        ) : (
          <span key={item.label}>{item.label}</span>
        ),
      )}
    </div>
  );
}
