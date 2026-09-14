'use client';

import { Link, usePathname } from '@/i18n/navigation';
import type { routing } from '@/i18n/routing';
import { useCart } from '@/components/customer/cart/cart-context';
import { PlaceSheet } from '@/components/customer/delivery/place-sheet';
import { AppBar } from './app-bar';
import { BackButton } from './back-button';
import { FunnelHeader } from './funnel-header';
import { HomeHeader } from './home-header';
import { Icon, type IconName } from './icons';
import type { SiteFrameProps } from './site-frame';
import messages from './site-frame-messages.json';

type Copy = (typeof messages)['tr'];
type Route = keyof typeof routing.pathnames;

/**
 * Müşteri çerçevesinin MOBİL WEB yüzü — başlıkta native uygulamanın sistemi, altta Mobil v1'in
 * sekme çubuğu (kullanıcı kararları 13.09 · 14.09). Masaüstü çerçevesi `site-frame.tsx`te; bu
 * dosyayı yalnız cihaz mobilken o çağırır.
 *
 * ── BAŞLIK: NATIVE'İN SİSTEMİ (14.09) ───────────────────────────────────────────────
 * Native'de tek bir başlık yok; ekranın türü seçer (`design/KARARLAR.md` "üç header", 16.08) ve
 * burada da öyle. Seçim ROTADAN (`usePathname` locale'siz şablonu verir: `/product/[slug]`) —
 * sayfalar `SiteFrame`i bugünkü gibi çağırıyor, 25 çağrı yerine dokunulmadı:
 *   · vitrin → selamlama + konum satırı + zil (`HomeHeader`, native vitrin başlığı)
 *   · hesap → yalnız başlık (native hesap)
 *   · eylemsiz bölüm sayfaları → ‹ + "HESABIM" + büyük başlık (`FunnelHeader`; native siparişler ·
 *     puan geçmişi · bildirimler)
 *   · başlığını kendisi kuran ekranlar → çerçeve çizmez: katalog (başlık + sayı + arama, native
 *     katalogun arama başlığı gibi), sepet ve checkout (`bare`), giriş, keşif, sipariş onayı
 *   · geri kalanı → yapışkan `AppBar` (‹ · başlık · ekranın eylemi)
 * Mobil v1'in tek biçim üst barı, koyu sepet düğmesi ve yeşil yer satırı bu kararla kalktı; konum
 * vitrin başlığında, sepete sekme çubuğundan gidilir.
 *
 * ── YASAL BAĞLANTILAR VE DİL ────────────────────────────────────────────────────────
 * Mobilde footer yok. Yasal sayfalar ve dil seçimi hesap ekranının en altında (kullanıcı kararı
 * 13.09, `account/components/site-links.tsx`): sekme çubuğu her ekranda, yani her sayfadan iki
 * dokunuş — misafir de görür.
 */
type SiteFrameMobileProps = Pick<SiteFrameProps, 'locale' | 'mobileChrome' | 'detail' | 'accountChrome' | 'fill' | 'children'>;

/** v1 `tablar` — dört sekme kökü; sekme yalnız kendi ekranında yanar. */
const TABS: readonly { href: '/' | '/catalog' | '/cart' | '/account'; icon: IconName; label: (t: Copy) => string; badge?: true }[] = [
  { href: '/', icon: 'home', label: (t) => t.tabs.home },
  { href: '/catalog', icon: 'grid', label: (t) => t.nav.catalog },
  { href: '/cart', icon: 'basketPlain', label: (t) => t.tabs.cart, badge: true },
  { href: '/account', icon: 'user', label: (t) => t.accountNav.account },
];

/** Hangi başlık — künyedeki eşleme (`none`: sayfa kendi kuruyor). */
type HeaderKind = 'home' | 'title' | 'page' | 'bar' | 'none';

/** Başlığını KENDİSİ kuran ekranlar — çerçeve bunlarda başlık çizmez. */
const OWN_HEADER: readonly string[] = ['/catalog', '/login', '/discover', '/checkout', '/checkout/[reference]'] satisfies Route[];
/** Eylemsiz bölüm sayfaları — native'in "sayfa başlığı" durağı. */
const SECTION_PAGES: readonly string[] = ['/orders', '/account/points', '/account/notifications'] satisfies Route[];
/** v1 `tabVar` — giriş, keşif, checkout ve sipariş onayı: huninin içi ve sonu, sekme çubuğu yok. */
const WITHOUT_TAB_BAR: readonly string[] = ['/login', '/discover', '/checkout', '/checkout/[reference]'] satisfies Route[];

function headerOf(route: string, mobileChrome: SiteFrameProps['mobileChrome']): HeaderKind {
  if (mobileChrome === 'bare' || OWN_HEADER.includes(route)) return 'none';
  if (route === '/') return 'home';
  if (route === '/account') return 'title';
  if (SECTION_PAGES.includes(route)) return 'page';
  return 'bar';
}

/** Başlık metni — sayfa vermediğinde (detay ve hesap alanı veriyor). */
const TITLES: Partial<Record<Route, (t: Copy) => string>> = {
  '/packages': (t) => t.nav.packages,
  '/recipes': (t) => t.nav.recipes,
  '/cart': (t) => t.cart,
  '/orders': (t) => t.accountNav.orders,
  '/support': (t) => t.accountNav.support,
  '/professionals': (t) => t.nav.pro,
};

function titleOf(route: string, t: Copy): string {
  // Beş yasal sayfanın başlığı tek ("Bilgi"); sayfanın kendi adı içeriğin başlığında.
  if (route.startsWith('/legal/')) return t.info;
  return TITLES[route as Route]?.(t) ?? '';
}

export function SiteFrameMobile({ locale, mobileChrome, detail, accountChrome, fill, children }: SiteFrameMobileProps) {
  const t = messages[locale];
  const route: string = usePathname();
  const kind = headerOf(route, mobileChrome);
  const title = detail?.title ?? accountChrome?.title ?? titleOf(route, t);
  // Geçmiş boşken ‹'nin gideceği üst sayfa (`BackButton` sözleşmesi) — derin bağlantıyla gelen de döner.
  const fallback = detail?.fallback ?? accountChrome?.back?.href ?? '/';

  return (
    <div className={['flex flex-col bg-cream text-ink', fill ? 'h-dvh overflow-hidden' : 'min-h-dvh'].join(' ')}>
      {kind === 'home' && <HomeHeader locale={locale} />}
      {/* Native hesap: yalnız başlık, 24px serif — sekme kökü, geri yolu yok. */}
      {kind === 'title' && <h1 className="px-[18px] pt-5 font-serif text-card-title text-ink">{title}</h1>}
      {kind === 'page' && <FunnelHeader backLabel={t.back} fallback={fallback} eyebrow={t.accountNav.account} title={title} />}
      {kind === 'bar' && <AppBar title={title} left={<BackButton label={t.back} fallback={fallback} />} right={accountChrome?.right} />}

      {/* `min-h-0`: flex çocuğu içeriğinden küçülmez; yazışma ekranında (`fill`) iç kaydırma ancak
          bununla dipte kalır — masaüstü çerçevesinin aynı kuralı. */}
      <main className={['flex flex-1 flex-col', fill ? 'min-h-0' : ''].join(' ')}>{children}</main>

      {!WITHOUT_TAB_BAR.includes(route) && <TabBar t={t} route={route} />}

      {/* Yer sorusu çekmecesi — vitrinin konum satırı ve sayfa içindeki "teslimat yerini değiştir"
          bağları aynı durumu açar (`PlaceProvider.panelOpen`); masaüstünde aynı durum başlığın
          altındaki paneli. */}
      <PlaceSheet locale={locale} />
    </div>
  );
}

interface TabBarProps {
  t: Copy;
  route: string;
}

/**
 * v1'in alt sekme çubuğu. Akışın SONUNDA ve yapışkan: kısa sayfada ekranın dibinde, uzun sayfada
 * kaydırırken de dipte kalır — içerik altında kaybolmaz, çünkü çubuk kendi yerini akışta tutuyor.
 * Sepete giden yol burası (başlıkta sepet yok — native'in başlıkları da taşımıyor).
 */
function TabBar({ t, route }: TabBarProps) {
  const { view, ready } = useCart();
  // Sayı ilk okuma bitmeden çizilmez: girişli müşteriye bir an "boş" göstermez.
  const count = ready ? view.itemCount : 0;

  return (
    <nav
      aria-label={t.menu}
      className="sticky bottom-0 z-30 flex flex-none border-t border-sand-275 bg-cream px-2 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]"
    >
      {TABS.map((tab) => {
        const active = tab.href === route;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative flex flex-1 cursor-pointer flex-col items-center gap-1 py-1.5 transition-colors',
              active ? 'text-olive' : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            <Icon name={tab.icon} size={21} />
            <span className="font-sans text-[10px] font-bold tracking-[0.02em]">{tab.label(t)}</span>
            {tab.badge && count > 0 && (
              <span className="absolute top-0.5 right-[22px] rounded-lg bg-terracotta px-[5px] py-px font-sans text-[9.5px] font-bold text-white">{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
