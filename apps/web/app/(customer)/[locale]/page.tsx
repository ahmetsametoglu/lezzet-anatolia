import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { brand } from '@lezzet/brand';
import { getSessionUser } from '@/lib/guard';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { buttonClass } from '@/components/customer/ui/button';
import messages from './messages.json';

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // İki-yüzey kuralı: personel ana sayfada karşılanmaz → Operasyon'a. (Vitrini görmek isterse
  // kataloğa doğrudan gidebilir; yalnız kök `/` yönlendirir.)
  const user = await getSessionUser();
  if (user && (await new UserProfileService(serviceDb()).isStaff(user.id))) {
    redirect('/operations');
  }

  const t = messages[locale];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="font-serif text-3xl font-semibold text-ink">{brand.name}</h1>
      <p className="font-sans text-sm text-body">{t.tagline}</p>
      <Link href="/login" className={buttonClass({ size: 'sm', className: 'mt-2' })}>
        {t.loginCta}
      </Link>
    </main>
  );
}
