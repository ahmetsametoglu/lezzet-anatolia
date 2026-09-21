'use client';

import tabBarCopy from '@lezzet/i18n/customer/tab-bar';
import type { IconName } from '@lezzet/design-tokens/icons';
import { Link, usePathname } from '@/i18n/navigation';
import type { routing } from '@/i18n/routing';
import { useWholesale } from '@/components/customer/account/account-context';
import { CartFab } from '@/components/customer/cart/cart-fab';
import { PlaceSheet } from '@/components/customer/delivery/place-sheet';
import { AppBar } from './app-bar';
import { BackButton } from './back-button';
import { FunnelHeader } from './funnel-header';
import { HomeHeader } from './home-header';
import { MobileIcon } from './mobile-icon';
import type { SiteFrameProps } from './site-frame-types';
import messages from './site-frame-messages.json';

type Copy = (typeof messages)['tr'];
type Route = keyof typeof routing.pathnames;
type TabKey = keyof (typeof tabBarCopy)['tr']['tabs'];

/**
 * Müşteri çerçevesinin telefon yüzü, native uygulamanın kabuğu: başlığı ekranın türü seçer ve sekme çubuğu yalnız sekme
 * köklerinde durur, çünkü native'de öteki her ekran yığında açılır. Footer yok; yasal bağlantılar ve dil seçimi hesap ekranında.
 */
type SiteFrameMobileProps = Pick<SiteFrameProps, 'locale' | 'mobileChrome' | 'accountChrome' | 'fill' | 'children'>;

interface Tab {
  key: TabKey;
  href: '/' | '/catalog' | '/packages' | '/orders' | '/account';
  icon: IconName;
}

/** Native sırası; üçüncü yuva kişiye göre (native `TABS` + `useWholesale`). */
function tabsFor(wholesale: boolean): readonly Tab[] {
  return [
    { key: 'index', href: '/', icon: 'home' },
    { key: 'catalog', href: '/catalog', icon: 'catalog' },
    wholesale ? { key: 'orders', href: '/orders', icon: 'orders' } : { key: 'packages', href: '/packages', icon: 'packages' },
    { key: 'account', href: '/account', icon: 'account' },
  ];
}

/** Sekme kökleri — native `(tabs)` grubunun rotaları; çubuk yalnız bunlarda görünür. */
const TAB_ROOTS: readonly string[] = ['/', '/catalog', '/packages', '/account'] satisfies Route[];
/** Yüzen sepet düğmesi: sekme köklerinde çubuğa bağlı, detayda sabit (native'in beş ekranı). */
const FAB_ON_TAB_BAR: readonly string[] = ['/', '/catalog'] satisfies Route[];
const FAB_ON_DETAIL: readonly string[] = ['/product/[slug]', '/package/[slug]', '/recipe/[slug]'] satisfies Route[];

/** Hangi başlık: vitrin selamlaması, hesabın yalnız başlığı, bölüm sayfasının büyük başlığı, yapışkan çubuk ya da hiçbiri. */
type HeaderKind = 'home' | 'title' | 'page' | 'bar' | 'none';

/** Başlığını KENDİSİ kuran ekranlar — çerçeve bunlarda başlık çizmez. */
const OWN_HEADER: readonly string[] = [
  '/catalog',
  '/packages',
  '/recipes',
  '/product/[slug]',
  '/package/[slug]',
  '/recipe/[slug]',
  '/login',
  '/discover',
  '/checkout',
  '/checkout/[reference]',
  '/legal/terms',
  '/legal/sales',
  '/legal/privacy',
  '/legal/delivery',
  '/legal/faq',
  '/support/[ticket]',
] satisfies Route[];
/** Eylemsiz bölüm sayfaları — native'in "sayfa başlığı" durağı. */
const SECTION_PAGES: readonly string[] = ['/orders', '/account/points', '/account/notifications'] satisfies Route[];

function headerOf(route: string, mobileChrome: SiteFrameProps['mobileChrome']): HeaderKind {
  if (mobileChrome === 'bare' || OWN_HEADER.includes(route)) return 'none';
  if (route === '/') return 'home';
  if (route === '/account') return 'title';
  if (SECTION_PAGES.includes(route)) return 'page';
  return 'bar';
}

/** Başlık metni — sayfa vermediğinde (hesap alanı veriyor). */
const TITLES: Partial<Record<Route, (t: Copy) => string>> = {
  '/cart': (t) => t.cart,
  '/orders': (t) => t.accountNav.orders,
  '/support': (t) => t.accountNav.support,
  '/professionals': (t) => t.nav.pro,
};

function titleOf(route: string, t: Copy): string {
  return TITLES[route as Route]?.(t) ?? '';
}

export function SiteFrameMobile({ locale, mobileChrome, accountChrome, fill, children }: SiteFrameMobileProps) {
  const t = messages[locale];
  const route: string = usePathname();
  const wholesale = useWholesale();
  const kind = headerOf(route, mobileChrome);
  const title = accountChrome?.title ?? titleOf(route, t);
  // Geçmiş boşken ‹'nin gideceği üst sayfa (`BackButton` sözleşmesi) — derin bağlantıyla gelen de döner.
  const fallback = accountChrome?.back?.href ?? '/';

  return (
    <div
      // Telefon yazı ölçeği: müşteri yazı kademeleri native'deki gibi bir adım büyük okunur; değişkenler `globals.css`te bu
      // öznitelikle yeniden tanımlanıyor. Yatay tutuşta çentik payı kökte, dikey tutuşta yan paylar 0.
      data-type-scale="phone"
      className={[
        'flex flex-col bg-sand-50 pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] text-ink',
        fill ? 'h-dvh overflow-hidden' : 'min-h-dvh',
      ].join(' ')}
    >
      {kind === 'home' && <HomeHeader locale={locale} />}
      {/* Native hesap başlığı: sekme kökü, geri yolu yok. Paylar native'in aynısı; başlık orada sayfa dolgusunun (18)
          içinde kendi 18'ini de aldığı için kartlardan içeride başlar. */}
      {kind === 'title' && <h1 className="px-9 pt-1.5 font-serif text-card-title text-ink">{title}</h1>}
      {kind === 'page' && <FunnelHeader backLabel={t.back} fallback={fallback} eyebrow={t.accountNav.account} title={title} />}
      {kind === 'bar' && <AppBar title={title} left={<BackButton label={t.back} fallback={fallback} />} right={accountChrome?.right} />}

      {/* `min-h-0`: flex çocuğu içeriğinden küçülmez; yazışma ekranında (`fill`) iç kaydırma ancak
          bununla dipte kalır — masaüstü çerçevesinin aynı kuralı. */}
      <main className={['flex flex-1 flex-col', fill ? 'min-h-0' : ''].join(' ')}>{children}</main>

      {TAB_ROOTS.includes(route) && (
        <TabBar locale={locale} route={route} tabs={tabsFor(wholesale)} menuLabel={t.menu} cartLabel={t.cart} fab={FAB_ON_TAB_BAR.includes(route)} />
      )}
      {FAB_ON_DETAIL.includes(route) && <CartFab label={t.cart} placement="detail" />}

      {/* Yer sorusu çekmecesi — vitrinin konum satırı ve sayfa içindeki "teslimat yerini değiştir"
          bağları aynı durumu açar (`PlaceProvider.panelOpen`); masaüstünde aynı durum başlığın
          altındaki paneli. */}
      <PlaceSheet locale={locale} />
    </div>
  );
}

interface TabBarProps {
  locale: SiteFrameProps['locale'];
  route: string;
  tabs: readonly Tab[];
  menuLabel: string;
  cartLabel: string;
  /** Yüzen sepet düğmesi bu kökte çubuğa bağlı mı (vitrin, katalog). */
  fab: boolean;
}

/**
 * Native'in alt sekme çubuğu: alt dolgu güvenli alanla 6px'in büyüğüdür, çünkü native'de ikisi toplanmaz. Rozet yok, sepet
 * sekme değil yüzen düğme.
 */
function TabBar({ locale, route, tabs, menuLabel, cartLabel, fab }: TabBarProps) {
  const copy = tabBarCopy[locale].tabs;

  return (
    <nav
      aria-label={menuLabel}
      className="sticky bottom-0 z-30 flex flex-none border-t-[1.5px] border-ink bg-sand-50/96 px-2 pt-2 pb-[max(6px,env(safe-area-inset-bottom))] backdrop-blur-sm"
    >
      {fab && <CartFab label={cartLabel} placement="tab-bar" />}
      {tabs.map((tab) => {
        const active = tab.href === route;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-1.5 transition-opacity',
              active ? 'text-terracotta' : 'text-muted hover:opacity-70',
            ].join(' ')}
          >
            <span className={['flex', active ? '-translate-y-0.5 scale-[1.12]' : ''].join(' ')}>
              <MobileIcon name={tab.icon} size={23} />
            </span>
            <span className="font-sans text-micro font-bold">{copy[tab.key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
