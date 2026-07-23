import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { authErrorMessage } from '@/lib/auth/errors';
import { routing } from '@/i18n/routing';
import { LoginForm } from './LoginForm';
import messages from './messages.json';

// Arayüz metinleri messages.json'dan (tek kaynak); `Messages` tipi ondan TÜRETİLİR (elle
// interface yok). Türetme burada, çünkü JSON değerini yalnız server okur (client bundle'a
// girmesin); LoginForm tipi `import type` ile alır.
export type Messages = LocalizedCopy<typeof messages>;

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; reason?: string; error?: string }>;
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { next, reason, error } = await searchParams;
  const t: Messages = messages[locale];
  const subtitle = (reason && t.reasons[reason as keyof typeof t.reasons]) || t.reasons.default;
  const initialError = error === 'oauth' ? authErrorMessage('oauth_failed', locale as Locale) : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e9e6df] p-5 sm:p-10">
      <LoginForm
        next={next ?? null}
        locale={locale as Locale}
        subtitle={subtitle}
        t={t}
        errors={{
          invalidEmail: authErrorMessage('invalid_email', locale as Locale),
          googleUnavailable: authErrorMessage('google_unavailable', locale as Locale),
        }}
        initialError={initialError}
      />
    </main>
  );
}
