import { brand } from '@lezzet/brand';
import { UserProfileService } from '@lezzet/database';
import { MarketingSubscribedEmail, marketingSubscribedSubject, sendEmail } from '@lezzet/email';
import { localizedUrl } from '@lezzet/i18n';
import { POSTAL_ADDRESS } from '@lezzet/notify';
import { captureError, SOURCES } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BackgroundRunner } from '../order/effects';
import { ensureNotificationToken, notificationPreferencesUrl } from './notification-preferences';

/**
 * Kampanya e-postası açılınca abone olana bilgi e-postası gönderir; düğmesi aboneliği jetonla tek tıkla sonlandırır. Fırlatmaz,
 * çünkü yazılmış izin e-posta gitmedi diye geri alınmaz; `runLater` verilirse gönderim yanıttan sonraya kalır.
 */
export async function announceEmailSubscription(db: SupabaseClient, customerId: string, runLater?: BackgroundRunner): Promise<void> {
  const send = () => sendSubscriptionNotice(db, customerId);
  if (runLater) runLater(send);
  else await send();
}

async function sendSubscriptionNotice(db: SupabaseClient, customerId: string): Promise<void> {
  try {
    const profile = await new UserProfileService(db).getById(customerId);
    if (!profile?.email) return;
    // Jetonsuz bağlantı kurulamaz; üretilemeyen jeton `ensureNotificationToken`da kimlikle loglanır.
    const token = await ensureNotificationToken(db, customerId);
    if (!token) return;

    const locale = profile.preferredLanguage ?? 'fr';
    const data = {
      customerName: profile.name ?? null,
      locale,
      unsubscribeUrl: localizedUrl('/unsubscribe/[token]', locale, { token }),
      notificationPreferencesUrl: await notificationPreferencesUrl(db, locale, { customerId }),
    };
    const mail = await sendEmail({
      to: profile.email,
      subject: marketingSubscribedSubject(data),
      react: MarketingSubscribedEmail({ data, brandName: brand.name, postalAddress: POSTAL_ADDRESS }),
    });
    if (mail.error) throw new Error(`Kampanya bilgi e-postası gönderilemedi: ${mail.error}`);
  } catch (err) {
    await captureError(err, { source: SOURCES.applicationNotification, level: 'warning', context: { job: 'marketing_subscribed', customerId } });
  }
}
