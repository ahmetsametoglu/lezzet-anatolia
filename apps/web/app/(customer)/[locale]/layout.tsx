import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Lora, Karla } from 'next/font/google';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { brand } from '@lezzet/brand';
import { routing } from '@/i18n/routing';
import { RootShell } from '@/components/root-shell';

// Müşteri evreni fontları. latin-ext → Türkçe (ş ğ ı) ve Almanca (ä ö ü ß) doğru gösterilir.
const lora = Lora({ subsets: ['latin', 'latin-ext'], variable: '--font-lora', display: 'swap' });
const karla = Karla({ subsets: ['latin', 'latin-ext'], variable: '--font-karla', display: 'swap' });

export const metadata: Metadata = {
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

  return (
    <RootShell lang={locale} className={`${lora.variable} ${karla.variable}`}>
      {/* Client component'ler (Link vb.) için locale bağlamı; mesajlar boş — metinler sayfa JSON'undan. */}
      <NextIntlClientProvider>{children}</NextIntlClientProvider>
    </RootShell>
  );
}
