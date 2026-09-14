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
 * Müşteri site çerçevesi — K11 duyuru şeridi · K12 site başlığı · K16 footer. Hata sayfalarında
 * (404/500) müşteri "çıkmaz sokakta" bırakılmaz: marka ve ana sayfaya dönüş her zaman elinin
 * altında kalır.
 *
 * METİNLERİ KENDİ TAŞIR (`site-frame-messages.json`). Sayfa `messages.json`'undan geçirilseydi aynı
 * duyuru/gezinme/footer metni dört dosyada tekrarlanır, diller zamanla birbirinden kayardı — nitekim
 * katalog sayfası bir süre anasayfanın metinlerini import etti (27.07 düzeltildi). Çerçeve her
 * sayfada aynı olduğu için metni de tek yerde.
 *
 * Cihaz forku (Sapma 3): mobil web kabuğu KENDİ DOSYASINDA (`site-frame.mobile.tsx`, Mobil v1,
 * 13.09) — bu dosya cihaz mobilse işi ona bırakır, geri kalanı masaüstüdür. `md:` akışkan
 * responsive DEĞİL, `device` ile çatallanır.
 *
 * **Arama BURADA DEĞİL, KATALOGDA** (28.07). Başlıkta duruyordu ve her sayfada görünüyordu; teslimat
 * yeri hapı gelince satır kalabalıklaştı. Arama zaten yalnız kataloğu süzüyor — sonucunu gösteren
 * sayfada durması hem satırı boşaltıyor hem de "ne aradığım" bilgisini sonucun yanında tutuyor.
 * Diğer sayfalardan aramaya giden yol menüdeki "Katalog".
 *
 * **Masaüstü başlığı v1'e göre (13.09):** yapışkan satır; menüde dört öğe; sağda yer hapı → koyu
 * sepet hapı (adet + ödenecek tutar) → "Giriş yap" hapı ya da baş harfli avatar. Yer hapına basınca
 * soru başlığın ALTINDA açılır (`PlacePanel`).
 */
// Çerçevenin tipleri (`NavKey` · `AccountTab` · `SiteFrameProps`) `site-frame-types.ts`te: telefon
// kabuğu da onları okuyor ve buradan okusaydı iki dosya birbirini içe aktarırdı (`no-circular`).

/**
 * Sayfa gövdesinin azami genişliği. Tasarımın masaüstü ekranı 1360 px çizilmiştir — bu bir viewport
 * temsili DEĞİL, düzenin kendisidir: içerik daha geniş ekranda yayılmaz, ortalanır. Zeminler (duyuru
 * şeridi, footer) tam genişlikte kalır; yalnız İÇERİK bu kabın içine girer.
 */
const SHELL = 'mx-auto w-full max-w-[1360px]';

/**
 * Footer'ın yasal satırı (08.8) — sıra tasarımın sırası: künye → satış koşulları → gizlilik →
 * teslimat → SSS. Genelden özele iniyor ve sonuncusu ziyaretçinin en çok tıklayacağı olan.
 *
 * Dizi burada, `messages.json`da değil: metin dile göre değişir ama HANGİ sayfaların olduğu ve
 * hangi sırayla durdukları dile göre değişmez. Sözlüğe gömülseydi bir dilde bir satır eksik
 * kalabilir ve o dilin ziyaretçisi sayfayı hiç göremezdi. Mobil webde aynı liste hesap ekranının
 * en altında (`account/components/legal-directory.tsx`, native'in bilgi kartı) — footer'ı olmayan
 * kabuğun yasal yolu.
 */
export const LEGAL_LINKS = [
  { key: 'terms', href: '/legal/terms' },
  { key: 'sales', href: '/legal/sales' },
  { key: 'privacy', href: '/legal/privacy' },
  { key: 'delivery', href: '/legal/delivery' },
  { key: 'faq', href: '/legal/faq' },
] as const;

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

/**
 * Hesap sekmesi — vitrin menüsüyle AYNI kural: alt çizgi her sekmede var, aktif olmayanda şeffaf.
 * Yalnız aktife verilirse sekme 4px uzar ve sayfa değiştikçe satır oynar (`navClass` künyesi).
 */
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
  // Hesap alanında duyuru şeridi ÇİZİLMEZ (üç tasarımda da yok) ve başlık tamamen değişir.
  const account = accountChrome;
  const footerTier = footer ?? (fill || account ? 'none' : 'full');

  return (
    <div className={`flex flex-col bg-cream text-ink ${fill ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* K11 · Duyuru şeridi — hesap alanında yok. */}
      {!account && (
      <div className="bg-olive px-4 py-2 font-sans text-note font-medium text-sand-50">
        <div className={`${SHELL} flex justify-center gap-7 text-center`}>
          {[t.announcement.cold, t.announcement.local, t.announcement.shipping].map((item, i) => (
            <span key={item} className="inline-flex items-center gap-1.5">
              {/* Kar tanesi yalnız ilk maddede — soğuk zincir sözünün işareti (v1; eski ❄ emojisi). */}
              {i === 0 && <Icon name="snowflake" size={13} />}
              {item}
            </span>
          ))}
        </div>
      </div>
      )}

      {/* K12 · Site başlığı — hesap alanında kendi başlığı (08.14) */}
      {account ? (
        <header className={`${SHELL} flex items-center gap-9 border-b border-sand-300 px-12 py-4.5`}>
          <Link href="/" className="cursor-pointer">
            {/* Hesap başlığında logo 52px — vitrin başlığındaki 58px'ten küçük (tasarım). */}
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
            {/* Zil hesap alanının HER ekranında (14.15): rozet müşteriyi bildirim akışına çağırır. */}
            <NotificationBell locale={locale} />
            {account.right}
          </div>
        </header>
      ) : (
        <>
          {/* v1: başlık YAPIŞKAN ve zemini hafif saydam — kaydırırken yer hapı ve sepet elin altında
              kalır. Zemin tam genişlikte, içerik kabuk içinde. */}
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
                {/* Tarifler (08.24) — satın alınacak şeylerden (katalog, paket) sonra: tarif onları
                    KULLANMANIN yolu, "önce ne pişireceğim, sonra ne kadara" akışını koruyor. */}
                <Link href="/recipes" className={navClass('recipes', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
                  {t.nav.recipes}
                </Link>
                {/* **"Fırsatlar" menüden KALDIRILDI (kullanıcı kararı 09.08)** — katalogun teklif süzgeçli
                    hâlinin kopyasıydı. Fırsata iki anlamlı yol kaldı: ana sayfanın kahraman düğmesi ve
                    fırsat bandının "Tüm fırsatlar →" bağı (`/catalog?offers=1`).
                    **"Keşif" de masaüstü menüsünden çıktı (v1, 13.09):** tasarımın menüsü dört öğe;
                    keşfe yol anasayfanın "Keşfe başla" bandı ve hesabın hızlı bağlantısı. Mobil
                    menüde duruyor — v1 mobil çizmiyor. */}
                {/* Professionnels ARTIK CANLI (08.7): etiket üç dilde de aynı marka sözcüğü, adres dile
                    göre çevriliyor — gerekçe `PATHNAMES`te. */}
                <Link href="/professionals" className={navClass('pro', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
                  {t.nav.pro}
                </Link>
              </nav>
              <div className="ml-auto flex items-center gap-3">
                {/* K30 · Teslimat yeri — sepetin SOLUNDA: sepete girmeden önce cevaplanan bir soru. */}
                <PlaceChip locale={locale} />
                <CartPill locale={locale} label={t.cart} copy={t.cartPill} />
                {/* Hesap en sağda (v1): avatar menüsü başlığın ucundan açılır. */}
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

      {/* K16 · Footer — zemin tam genişlikte, içerik kabuk içinde (geniş ekranda zemin kesilmez).
          Katman `footerTier`den gelir (prop künyesi): tam / tek satır / yok. Tek satırlı hâl
          detayların eski davranışı; artık liste sayfaları da onu taşıyor (tasarımın katalog karesi
          zaten böyle çiziyordu). `fill` ve hesap alanı varsayılanda `none`. */}
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
            {/* Numara YER TUTUCUYDU ("+33 6 XX XX XX XX") ve aylardır öyle duruyordu — ziyaretçiye
                arayamayacağı bir numara göstermek, hiç göstermemekten kötü. Gerçek numara artık
                `@lezzet/brand`te tek yerde; satır da bağ oldu: bir WhatsApp satırının işlevi
                WhatsApp'ı açmaktır (CLAUDE.md §3, "statik ≠ işlevsiz"). */}
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
            {/* Sütun satırları ölü `<span>`dı; sayfası OLANLAR bağlandı (03.08).
                "Fırsatlar" burada da YOK (kullanıcı kararı 09.08): üst menüden kaldırılırken
                footer'da bırakmak, aynı kopyayı sayfanın dibinde saklamak olurdu — künyenin kendi
                kuralı zaten "iki yerde farklı davranmamalı" diyordu. */}
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

        {/* YASAL SATIR (08.8) — statik sayfaların tasarımında footer'ın en altında, tek satır:
            "Mentions légales · CGV · Gizlilik · Teslimat/İade · SSS".
            Üstteki sütunların aksine bunlar GERÇEK bağ: beş sayfanın beşi de var. */}
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
  /**
   * Sütun satırları. `href` VERİLMEYEN satır düz metin kalır — sayfası olmayan bir başlığı bağ
   * yapmak ziyaretçiyi 404'e gönderir (`nav`'ın "açılmamış rotalar düz metin kalır" kuralı, aynı
   * gerekçe). Bugün bağsız kalan ikisi: "Hakkımızda" (sayfası yok) ve "Professionnels" (08.7).
   */
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
