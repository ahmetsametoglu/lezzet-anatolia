import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Lora, Karla } from 'next/font/google';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { brand } from '@lezzet/brand';
import { siteOrigin } from '@lezzet/i18n';
import { routing } from '@/i18n/routing';
import { RootShell } from '@/components/root-shell';
import { CartProvider } from '@/components/customer/cart/cart-context';
import { PlaceProvider } from '@/components/customer/delivery/place-context';
import { ToastProvider } from '@/components/customer/ui/toast';
import { AccountProvider } from '@/components/customer/account/account-context';
import { VisitPing } from '@/components/customer/account/visit-ping';
import { getDeliveryZones } from '@/lib/delivery/read';
import { readPlaceSnapshot } from '@/lib/delivery/read-place';
import { currentCustomer } from '@/lib/guard';
import { detectDevice } from '@/lib/device';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { TITLE_TEMPLATE } from '@/lib/seo/title';
import layoutMessages from './layout-messages.json';

// Müşteri evreni fontları. latin-ext → Türkçe (ş ğ ı) ve Almanca (ä ö ü ß) doğru gösterilir.
const lora = Lora({ subsets: ['latin', 'latin-ext'], variable: '--font-lora', display: 'swap' });
const karla = Karla({ subsets: ['latin', 'latin-ext'], variable: '--font-karla', display: 'swap' });

/**
 * `metadataBase` MUTLAK olmalı: `hreflang` ve `canonical` göreli adresi kabul etmez, Next onu olduğu gibi
 * basar ve tarayıcı sessizce yok sayar — hata da vermez. Başlık şablonu ile açıklama sayfalarda değil
 * burada, çünkü her sayfa markayı kendi başlığına eklerse biri unutulur ve açıklama dile göre
 * çözülmezse Fransız ziyaretçinin sayfası Türkçe açıklama beyan eder.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = hasLocale(routing.locales, locale) ? layoutMessages[locale] : layoutMessages[routing.defaultLocale];
  return {
    metadataBase: new URL(siteOrigin()),
    title: { template: TITLE_TEMPLATE, default: brand.name },
    description: t.description,
  };
}

/**
 * `viewport-fit=cover`: telefon görünümünün alt sekme çubuğu kendi payını `env(safe-area-inset-bottom)`
 * değerinden hesaplıyor, bu ayar olmadan iPhone o değeri 0 verir. Ölçek kilidi telefon yüzünü uygulamaya
 * benzetir — native ekranda sayfa parmakla büyütülmez; masaüstü forkuna dokunmaz, çünkü viewport meta'sını
 * yalnız mobil tarayıcılar okur.
 */
export const viewport: Viewport = { viewportFit: 'cover', maximumScale: 1, userScalable: false };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface CustomerLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

// Müşteri yüzeyi kökü (iki-yüzey mimarisi): tr/fr/de. Operasyon ayrı kök (Türkçe).
export default async function CustomerLayout({ children, params }: CustomerLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Bölgeler, oturum künyesi, yerin ilk karesi, cihaz ipucu ve fiyat kapısı KÖKTE okunur: başlık ve
  // çerçeve birer istemci bileşeni, sunucuya kendileri soramaz. Her sayfanın ayrı tur atması aynı
  // cevabı tekrarlardı — okumalar önbellekli, istek başına tek çözüm.
  const [zones, account, placeSnapshot, device, viewer] = await Promise.all([
    getDeliveryZones(),
    currentCustomer(),
    readPlaceSnapshot(),
    detectDevice(),
    readPricingViewer(),
  ]);

  return (
    <RootShell lang={locale} surface="customer" className={`${lora.variable} ${karla.variable}`}>
      {/* Client component'ler (Link vb.) için locale bağlamı; mesajlar boş — metinler sayfa JSON'undan. */}
      <NextIntlClientProvider>
        {/* Sepet, teslimat yeri ve hesap künyesi KÖKTE ve birbirinden ayrı: sayaç başlıkta, kısıt
            sepette, teslimat satırı ürün detayında — hepsi aynı durumu görmeli. Yer sepetin içine
            konsaydı ürün sayfası onu okumak için sepete bağımlı olurdu, oysa ikisi ayrı sorular. */}
        <AccountProvider account={account} wholesale={viewer.channel === 'b2b'}>
          {/* Günlük ziyaret puanı yalnız girişli müşteride monte edilir, ziyaretçi için boşuna sunucu
              turu atılmaz. Yazmayı istemci efekti yapar — render yan etkisiz olmalı, buraya konan
              defter yazımı her prefetch'te tetiklenirdi. */}
          {account && <VisitPing />}
          {/* Bildirim kökte: kim çıkarırsa çıkarsın tek hap, aynı yerde. */}
          <ToastProvider device={device}>
            <PlaceProvider
              zones={zones}
              initialPlace={placeSnapshot.place}
              initialAddress={placeSnapshot.address}
              initialUnresolved={placeSnapshot.unresolved}
              initialPickup={placeSnapshot.pickup}
            >
              <CartProvider locale={locale}>{children}</CartProvider>
            </PlaceProvider>
          </ToastProvider>
        </AccountProvider>
      </NextIntlClientProvider>
    </RootShell>
  );
}
