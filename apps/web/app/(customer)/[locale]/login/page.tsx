import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { authErrorMessage } from '@/lib/auth/errors';
import { detectDevice } from '@/lib/device';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { LoginClient } from './login-client';
import type { Messages } from './login-types';
import messages from './messages.json';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; reason?: string; error?: string }>;
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/login');

  const { next, reason, error } = await searchParams;
  const t: Messages = messages[locale];
  const subtitle = (reason && t.reasons[reason as keyof typeof t.reasons]) || t.reasons.default;
  const initialError = error === 'oauth' ? authErrorMessage('oauth_failed', locale as Locale) : null;
  const device = await detectDevice();

  return (
    <LoginClient
      next={next ?? null}
      locale={locale as Locale}
      subtitle={subtitle}
      t={t}
      errors={{
        invalidEmail: authErrorMessage('invalid_email', locale as Locale),
        googleUnavailable: authErrorMessage('google_unavailable', locale as Locale),
      }}
      initialError={initialError}
      device={device}
    />
  );
}
