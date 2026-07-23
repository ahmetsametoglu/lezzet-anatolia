import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { brand } from '@lezzet/brand';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { buttonClass } from '@/components/ui/button';
import messages from './messages.json';

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = messages[locale];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="font-serif text-3xl font-semibold text-ink">{brand.name}</h1>
      <p className="font-sans text-sm text-body">{t.tagline}</p>
      <Link href="/connexion" className={buttonClass({ size: 'sm', className: 'mt-2' })}>
        {t.loginCta}
      </Link>
    </main>
  );
}
