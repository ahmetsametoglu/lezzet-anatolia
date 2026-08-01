import type { ComponentProps, ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { LOCALES } from '@lezzet/i18n';
import { brand } from '@lezzet/brand';
import { Link } from '@/i18n/navigation';
import { LocaleLinks } from './locale-switch';
import { ShareButton } from './share-button';
import { PlaceChip } from '@/components/customer/delivery/place-chip';
import { CartBadge } from '@/components/customer/cart/cart-badge';
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
 * Cihaz forku (Sapma 3): masaüstünde açık gezinme, mobilde sadeleşmiş başlık — `md:` akışkan
 * responsive DEĞİL, `device` ile çatallanır.
 *
 * **Arama BURADA DEĞİL, KATALOGDA** (28.07). Başlıkta duruyordu ve her sayfada görünüyordu; teslimat
 * yeri hapı gelince satır kalabalıklaştı. Arama zaten yalnız kataloğu süzüyor — sonucunu gösteren
 * sayfada durması hem satırı boşaltıyor hem de "ne aradığım" bilgisini sonucun yanında tutuyor.
 * Diğer sayfalardan aramaya giden yol menüdeki "Katalog".
 */
type NavKey = 'catalog' | 'packages' | 'deals' | 'discover' | 'pro';
/** Hesap alanının üç sekmesi (tasarım: `Hesabım · Siparişlerim · Taleplerim`). */
type AccountTab = 'account' | 'orders' | 'support';

interface SiteFrameProps {
  device: 'mobile' | 'desktop';
  locale: Locale;
  /**
   * Gezinmede hangi öğe AKTİF — tasarımda aktif sayfa zeytin rengi + 2px alt çizgi taşır (Katalog
   * ve Ürün Detay ekranlarında "Katalog", Hesap ekranında "Hesabım"). Ziyaretçi nerede olduğunu
   * başlıktan görmeli; verilmezse hiçbiri işaretlenmez (ana sayfa).
   */
  activeNav?: NavKey;
  /**
   * MOBİL çerçeve varyantı (K11/K12/K16). `detail` ürün ve paket detayları içindir: duyuru şeridi
   * gösterilmez ("yerini üst bar alır"), başlık gezinme yerine GERİ + paylaş taşır ve footer tek
   * satıra iner. Sebep davranışsal: detay sayfası sosyal/WhatsApp trafiğinin indiği yerdir —
   * ziyaretçi siteye baştan girmemiştir, ekranın üstü onu geldiği yere döndürmeye ayrılır.
   * Masaüstünde fark YOKTUR; tasarım orada normal başlığı gösterir.
   */
  mobileChrome?: 'default' | 'detail';
  /** `detail` başlığındaki geri bağlantısı ("← Katalog"). Metin sayfaya aittir, çerçeveye değil. */
  back?: { label: string; href: ComponentProps<typeof Link>['href'] };
  /**
   * **HESAP ALANININ BAŞLIĞI** (08.14) — verilirse vitrin başlığının YERİNE geçer.
   *
   * Tasarımda hesap/siparişler/sipariş detay ekranlarının başlığı vitrinden farklıdır: logo +
   * (sekmeler | geri bağı) + sağ uçta ekrana özel bir öğe. Duyuru şeridi de yoktur — hesap alanı
   * girişli bir yardımcı yüzey, kampanya duyurusunun yeri değil (üç `.dc.html`'de de çizili değil).
   *
   * Neden `SiteFrame` içinde ve ayrı bir bileşen değil: `main` ve footer aynı kalıyor. Ayrı bir
   * çerçeve yazmak footer'ı ikinci kez tanımlamak, yani dil listesini iki yerde tutmak olurdu.
   */
  accountChrome?: {
    /** Masaüstünde sekme gezinmesi — geri bağıyla birlikte kullanılmaz (tasarımda ikisi ayrı ekran). */
    nav?: AccountTab;
    /** Sekme yerine geri bağı (sipariş detayı: "← Siparişlerim"). */
    back?: { label: string; href: ComponentProps<typeof Link>['href'] };
    /** Mobil başlığın orta/sol metni — sayfanın adı ya da sipariş referansı. */
    title: string;
    /** Sağ uçtaki öğe: "Çıkış yap" · "← Kataloğa dön" · "↻ Tekrar sipariş". Sayfanın kararı. */
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

/**
 * Sayfa gövdesinin azami genişliği. Tasarımın masaüstü ekranı 1360 px çizilmiştir — bu bir viewport
 * temsili DEĞİL, düzenin kendisidir: içerik daha geniş ekranda yayılmaz, ortalanır. Zeminler (duyuru
 * şeridi, footer) tam genişlikte kalır; yalnız İÇERİK bu kabın içine girer.
 */
const SHELL = 'mx-auto w-full max-w-[1360px]';

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

export function SiteFrame({ device, locale, activeNav, mobileChrome = 'default', back, accountChrome, fill, children }: SiteFrameProps) {
  const t = messages[locale];
  const isMobile = device === 'mobile';
  // Mobil detayda çerçevenin tamamı sadeleşir: şerit yok, arama yok, footer tek satır.
  const isMobileDetail = isMobile && mobileChrome === 'detail';
  // Hesap alanında duyuru şeridi ÇİZİLMEZ (üç tasarımda da yok) ve başlık tamamen değişir.
  const account = accountChrome;
  const bandItems = isMobile ? [t.announcement.mobile] : [t.announcement.cold, t.announcement.local, t.announcement.shipping];

  return (
    <div className={`flex flex-col bg-cream text-ink ${fill ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* K11 · Duyuru şeridi — mobil detayda gösterilmez, yerini üst bar alır. */}
      {!isMobileDetail && !account && (
      <div className="bg-olive px-4 py-2 font-sans text-note font-medium text-cream">
        <div className={`${SHELL} flex justify-center gap-7 text-center`}>
          {bandItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      )}

      {/* K12 · Site başlığı — hesap alanında kendi başlığı (08.14) */}
      {account ? (
        isMobile ? (
          /* Mobil: [geri] · başlık · [sağ öğe]. Geri yoksa başlık sola yerleşir (tasarım: hesap
             ekranında "Hesabım" solda, sağda "Çıkış"; siparişlerde "← Hesabım" solda, başlık ortada). */
          <header className="flex items-center justify-between gap-3 border-b border-sand-300 px-4 py-3">
            {account.back && (
              <Link href={account.back.href} className="flex-none cursor-pointer font-sans text-body-sm font-bold text-olive">
                {account.back.label}
              </Link>
            )}
            <span className="truncate font-serif text-lead font-semibold leading-tight text-ink">{account.title}</span>
            {/* Sağ uç boşsa yer AYRILIR: başlığın ortada kalması buna bağlı (tasarımda 36–40px boşluk). */}
            {account.right ?? <span className="w-10 flex-none" aria-hidden="true" />}
          </header>
        ) : (
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
            {account.right && <div className="ml-auto flex flex-none items-center">{account.right}</div>}
          </header>
        )
      ) : isMobileDetail ? (
        <header className="flex items-center justify-between px-4 py-3">
          {back ? (
            <Link href={back.href} className="cursor-pointer font-sans text-body font-bold text-olive hover:text-olive-dark">
              {back.label}
            </Link>
          ) : (
            <span />
          )}
          <Link href="/" className="cursor-pointer">
            <img src="/logo.jpg" alt={brand.name} className="h-9 mix-blend-multiply" />
          </Link>
          <div className="flex items-center gap-3.5">
            <ShareButton label={t.share} />
            <CartBadge label={t.cart} compact />
          </div>
        </header>
      ) : isMobile ? (
        <>
          <header className="flex items-center justify-between border-b border-sand-300 px-4 py-3">
            <span className="font-sans text-icon-sm font-bold text-ink">☰</span>
            <Link href="/" className="cursor-pointer">
              <img src="/logo.jpg" alt={brand.name} className="h-10 mix-blend-multiply" />
            </Link>
            <CartBadge label={t.cart} compact />
          </header>
          {/* Mobilde hap başlık satırına SIĞMAZ (☰ · logo · sepet zaten üç öğe) — kendi satırında,
              aramanın üstünde durur. Detay başlığında hiç yoktur: orada geri bağlantısı ve paylaş
              var, dördüncü bir öğe satırı kırıyor; kısıt bilgisini o sayfada teslimat satırı verir. */}
          <div className="mx-4 mt-3 flex">
            <PlaceChip locale={locale} compact />
          </div>
        </>
      ) : (
        <header className={`${SHELL} flex items-center gap-9 border-b border-sand-300 px-12 py-4.5`}>
          <Link href="/" className="cursor-pointer">
            <img src="/logo.jpg" alt={brand.name} className="h-[58px] mix-blend-multiply" />
          </Link>
          <nav className="flex gap-7 font-sans text-body font-semibold text-ink">
            {/* Açılmamış rotalar düz metin kalır; açıldıkça `<Link>`e döner. */}
            <Link href="/catalog" className={navClass('catalog', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
              {t.nav.catalog}
            </Link>
            <Link href="/packages" className={navClass('packages', activeNav, 'cursor-pointer transition-colors hover:text-olive')}>
              {t.nav.packages}
            </Link>
            {/* Fırsatlar her sayfada terracotta — kampanya vurgusu sabittir, aktiflikten bağımsız. */}
            <span className={navClass('deals', activeNav, 'text-terracotta')}>{t.nav.deals}</span>
            <span className={navClass('discover', activeNav)}>{t.nav.discover}</span>
            <span className={navClass('pro', activeNav)}>{t.nav.pro}</span>
          </nav>
          <div className="ml-auto flex items-center gap-4.5 font-sans text-body-sm font-semibold text-muted">
            {/* K30 · Teslimat yeri — dil ve sepetin SOLUNDA: sepete girmeden önce cevaplanan bir
                soru, sepet rozetinin sağında dursa alışverişin sonuna ait gibi okunurdu. */}
            <PlaceChip locale={locale} />
            {/* Hesap girişi sepetin SOLUNDA (tasarım): "kim olarak alışveriş yapıyorum" sorusu
                sepete bakmadan önce cevaplanır. Misafirde tek bir "Giriş" bağlantısına iner. */}
            <AccountEntry locale={locale} />
            <CartBadge label={t.cart} />
          </div>
        </header>
      )}

      {/* `min-h-0`: flex çocuğu varsayılan olarak içeriğinden küçülmez — o olmadan içerideki
          kaydırılabilir alan taşar ve sayfanın kendisi kaydırılır (yani kutu yine dipte durmaz). */}
      <main className={`${SHELL} flex flex-1 flex-col ${fill ? 'min-h-0' : ''}`}>{children}</main>

      {/* K16 · Footer — zemin tam genişlikte, içerik kabuk içinde (geniş ekranda zemin kesilmez).
          Mobil detayda tek satıra iner: o ekranın altı sabit satın alma çubuğuna ayrılmıştır,
          altına üç sütunluk bir footer yığmak çubuğu ekranın dışına iter.
          `fill` yüzeylerinde HİÇ çizilmez — gerekçe prop'un künyesinde. */}
      {!fill && (
      <footer className="bg-ink text-neutral-400">
        {isMobileDetail ? (
          <div className="flex items-center justify-between px-4 py-4 font-sans text-micro">
            <span className="font-serif text-body font-semibold text-cream">{brand.name}</span>
            <span className="uppercase">{LOCALES.join(' · ')}</span>
          </div>
        ) : (
        <div className={[SHELL, 'flex gap-8', isMobile ? 'flex-col px-4 py-6' : 'justify-between px-12 py-9'].join(' ')}>
          <div className="flex flex-col gap-1.5 font-sans text-body-sm">
            <span className="font-serif text-card-title-sm text-cream">{brand.name}</span>
            <span>{t.footer.address}</span>
            <span>{t.footer.whatsapp}</span>
          </div>

          <div className={['flex font-sans text-body-sm', isMobile ? 'gap-8' : 'gap-12'].join(' ')}>
            <FooterColumn title={t.footer.shopping} items={[t.nav.catalog, t.nav.packages, t.nav.deals]} />
            <FooterColumn title={t.footer.corporate} items={[t.footer.about, t.nav.pro, t.footer.faq]} />
            {/* Dil MASAÜSTÜNDE üçüncü sütun, MOBİLDE alttaki ayrı satır (aşağıda) — tasarımın kararı:
                dar ekranda üç sütun yan yana sığmıyor, üçüncüsü alta kaçıp hizayı bozuyor. */}
            {!isMobile && (
              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-cream">{t.footer.language}</span>
                <LocaleLinks locale={locale} className="cursor-pointer transition-colors hover:text-cream" />
              </div>
            )}
          </div>

          {isMobile && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-neutral-400/25 pt-2.5 font-sans text-body-sm">
              <span>{t.footer.language}:</span>
              <LocaleLinks locale={locale} className="cursor-pointer transition-colors hover:text-cream" separator="·" />
            </div>
          )}
        </div>
        )}
      </footer>
      )}
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
