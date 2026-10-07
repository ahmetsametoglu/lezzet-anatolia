import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import feedbackCopy from '@lezzet/i18n/customer/feedback';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { openFeedbackInvite } from '@/lib/feedback/invite';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { PhoneFeedbackMissing } from './components/phone-feedback-missing';
import { FeedbackClient } from './feedback-client';
import messages from './messages.json';

/**
 * Değerlendirme davetinin e-postadan indiği sayfa; tek giriş yolu bağlantıdır ve belirteç oturum yerine geçer. Tanınmayan ya da kartsız
 * davet masaüstünde 404, telefonda native gibi kendi ekranı; "var ama senin değil" denmez, çünkü bu olmayan bir kaydı doğrulardı.
 */
interface FeedbackPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export default async function FeedbackPage({ params }: FeedbackPageProps) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/feedback/[token]');

  const copy = feedbackCopy[locale];
  const [invite, device] = await Promise.all([openFeedbackInvite(locale, token), detectDevice()]);
  const missing = !invite || invite.cards.length === 0;
  if (missing && device === 'desktop') notFound();

  const body = missing ? (
    <PhoneFeedbackMissing copy={copy} />
  ) : (
    <FeedbackClient device={device} locale={locale} token={token} invite={invite} copy={copy} t={messages[locale]} />
  );
  // Masaüstü akışı sayfa kabuğu olmadan çizilir; telefon native gibi çerçevenin içinde, başlık çubuğunu kendisi kurar.
  return device === 'mobile' ? (
    <SiteFrame device={device} locale={locale} mobileChrome="bare">
      {body}
    </SiteFrame>
  ) : (
    body
  );
}
