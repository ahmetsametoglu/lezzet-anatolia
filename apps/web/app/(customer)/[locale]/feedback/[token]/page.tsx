import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { openFeedbackInvite } from '@/lib/feedback/invite';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { FeedbackClient } from './feedback-client';
import type { Messages } from './feedback-types';
import messages from './messages.json';

/**
 * Alım-sonrası değerlendirme daveti (08.7 · 17.2) — **giden mailin indiği sayfa**.
 *
 * Bu rota `PATHNAMES`te aylardır kayıtlıydı ve `send-feedback-invites` işi bağı üretip
 * gönderiyordu; **sayfa yoktu, yani her davet mailinin düğmesi 404'e düşüyordu.** Sipariş
 * mailinde düzeltilen hatanın (08.16) aynı sınıfı, daha ağır hâli: orada yanlış kimlikle de olsa
 * bir sayfa vardı, burada hiç yoktu.
 *
 * **Menüde YOKTUR, tek giriş yolu bağlantıdır** (tasarım §5) ve `robots.ts` bu yolu taramaya
 * kapatıyor: taranan bir belirteç, kayıtlara düşen bir belirteçtir.
 *
 * **Token oturum yerine geçer.** Giriş sorulmuyor — tasarımın şartı "akıcılık bozulmamalı" ve
 * müşteri zaten kendi mailinden geliyor. Geçersiz token 404: "böyle bir davet var ama senin değil"
 * demek, olmayan bir kaydın varlığını doğrulamaktır (`openFeedbackInvite` künyesi).
 *
 * Kartı olmayan davet de 404 — sipariş kalemleri silinmişse gösterilecek bir akış yok ve boş bir
 * ekran müşteriye "bozuk" der.
 */
interface FeedbackPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export default async function FeedbackPage({ params }: FeedbackPageProps) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView();

  const t: Messages = messages[locale];
  const [invite, device] = await Promise.all([openFeedbackInvite(locale as Locale, token), detectDevice()]);
  if (!invite || invite.cards.length === 0) notFound();

  return <FeedbackClient t={t} locale={locale as Locale} token={token} invite={invite} device={device} />;
}
