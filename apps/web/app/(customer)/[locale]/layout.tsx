import type { ReactNode } from 'react';
import type { Metadata } from 'next';
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
import { AccountProvider } from '@/components/customer/account/account-context';
import { getDeliveryZones } from '@/lib/delivery/read';
import { currentCustomer } from '@/lib/guard';

// Müşteri evreni fontları. latin-ext → Türkçe (ş ğ ı) ve Almanca (ä ö ü ß) doğru gösterilir.
const lora = Lora({ subsets: ['latin', 'latin-ext'], variable: '--font-lora', display: 'swap' });
const karla = Karla({ subsets: ['latin', 'latin-ext'], variable: '--font-karla', display: 'swap' });

/**
 * `metadataBase` (08.1) — göreli `alternates` adreslerini mutlak hâle getiren kök.
 *
 * `hreflang` ve `canonical` MUTLAK adres ister; olmadan Next göreli değerleri olduğu gibi basar ve
 * tarayıcı onları "geçersiz" sayıp yok sayar. Yani bu satır olmadan bütün hreflang işi sessizce
 * çalışmaz — hata da vermez, sadece etkisiz kalır.
 *
 * Köken tek kaynaktan (`siteOrigin`): mailin gösterdiği adres ile sayfanın kanonik adresi aynı
 * olmalı, yoksa arama motoru mailden gelen bağı ayrı bir sayfa sanar.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: brand.name,
  description: `${brand.name} — donuk Türk gıdası`,
};

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

  // Teslimat bölgeleri BURADA, sunucuda okunur ve bağlama başlangıç verisi olarak iner: panel
  // açıldığında liste zaten elinde olur, istemciden ikinci bir tur atılmaz. Okuma önbellekli ve
  // etiketli (`lib/delivery/read.ts`) — her sayfa render'ında sorgu gitmez.
  const zones = await getDeliveryZones();
  // Oturum künyesi de KÖKTE okunur ve bağlama iner: başlıktaki hesap girişi bir istemci bileşeni
  // (`SiteFrame` hata sayfasında da kullanılıyor, orası `'use client'`) ve kendi başına sunucuya
  // soramaz. Her sayfada ayrı bir tur atmak yerine burada tek sorgu.
  const account = await currentCustomer();

  return (
    <RootShell lang={locale} surface="customer" className={`${lora.variable} ${karla.variable}`}>
      {/* Client component'ler (Link vb.) için locale bağlamı; mesajlar boş — metinler sayfa JSON'undan. */}
      <NextIntlClientProvider>
        {/* Sepet KÖKTE: sayaç başlıkta, aksiyonlar kartlarda ve ürün detayda — üçü de aynı durumu
            görmeli. Sayfa başına ayrı sağlayıcı, ekle-çıkar sonrası sayaç ile sayfayı ayrıştırırdı. */}
        {/* Teslimat yeri de KÖKTE ve sepetin dışında: başlıktaki hap, ürün/paket detayının
            teslimat satırı ve sepetteki kısıt bloğu aynı cevabı görmeli. Sepetin içine konsaydı
            ürün sayfası onu okumak için sepete bağımlı olurdu — oysa ikisi ayrı sorular. */}
        {/* Hesap künyesi de kökte: başlıktaki giriş her sayfada aynı kişiyi göstermeli. */}
        <AccountProvider account={account}>
          <PlaceProvider zones={zones}>
            <CartProvider locale={locale}>{children}</CartProvider>
          </PlaceProvider>
        </AccountProvider>
      </NextIntlClientProvider>
    </RootShell>
  );
}
