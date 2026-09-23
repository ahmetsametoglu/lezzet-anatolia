import { UserProfileService } from '@lezzet/database';
import { resolveUserText } from '@lezzet/domain-core';
import { localizedUrl } from '@lezzet/i18n';
import { captureError, SOURCES } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchCustomerNotification } from '../notification/dispatch';
import { notificationPreferencesUrl } from './notification-preferences';

/**
 * Başvurunun sonucunu başvurana bildirir; karar hangi yüzeyden verilirse verilsin haber buradan doğar. Gerekçe başvuranın
 * dilinde çözülür (operatör Türkçe yazar) ve kapı fırlatmaz, çünkü yazılmış karar mail gitmedi diye geri alınmaz.
 */
export async function notifyB2bDecision(db: SupabaseClient, customerId: string, approved: boolean): Promise<void> {
  try {
    const profile = await new UserProfileService(db).getById(customerId);
    if (!profile?.email) return;

    const locale = profile.preferredLanguage ?? 'fr';
    // Gerekçe yalnız rette taşınır: onayda gösterilecek bir şey yok ve şablon da onu çizmiyor.
    const gerekce = approved
      ? null
      : resolveUserText(
          { text: profile.b2bRejectReason, language: 'tr', translations: profile.b2bRejectReasonTranslations },
          locale,
        ).text;

    // Tekilleştirme yok: yeniden başvuru yeni bir karar doğurur ve her karar ayrı haberdir.
    await dispatchCustomerNotification(db, {
      event: 'b2b_application_result',
      customerId,
      recipient: { name: profile.name ?? null, email: profile.email, phone: profile.phone ?? null, locale },
      target: { type: 'customer', id: customerId },
      payload: { approved },
      data: {
        customerName: profile.name ?? null,
        locale,
        // Künyedeki ad resmî addır, ticari ad değil: onay o tüzel kişiliğe veriliyor.
        companyName: profile.companyInfo?.legalName ?? null,
        approved,
        reason: gerekce,
        // Onayda toptan vitrine, rette hesaba: onaylananın yapacağı şey alışveriş, reddedilenin eksiği görmek.
        actionUrl: localizedUrl(approved ? '/catalog' : '/account', locale),
        notificationPreferencesUrl: await notificationPreferencesUrl(db, locale, { customerId }),
      },
    });
  } catch (err) {
    captureError(err, { source: SOURCES.applicationNotification, level: 'warning', context: { job: 'b2b_application_result', customerId } });
  }
}
