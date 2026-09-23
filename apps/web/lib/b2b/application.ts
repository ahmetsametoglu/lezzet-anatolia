import 'server-only';
import { UserProfileService, serviceDb } from '@lezzet/database';
import {
  dispatchCustomerNotification,
  notificationPreferencesUrl,
  readB2bApplicant as readApplicant,
  submitB2bApplication as submitApplication,
  type B2bApplicantView,
} from '@lezzet/application';
import { resolveUserText, type B2bApplicationInput, type B2bCompanyFacts } from '@lezzet/domain-core';
import { localizedUrl } from '@lezzet/i18n';
import { captureError, SOURCES } from '@lezzet/observability';
import type { PreferredLanguage, UserProfile } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError } from '@/lib/customer-error';

/**
 * B2B başvurusunun web kapısı: kuralların gövdesi `@lezzet/application/customer/b2b`de, çünkü ikinci yüzey (mobil başvuru formu)
 * `apps/web`i import edemez. Burada kalan yalnız oturumdan kimlik çözümü ve sonucun `CustomerError`a çevrimi.
 */

/**
 * Kaydın son hâlini döndürür. Ret `CustomerError` olarak fırlatılır, çünkü müşteri yüzeyinin funnel'ı yalnız onu tanıyor; başka
 * bir hata sınıfı anahtarı kaybeder ve ekran düzeltilebilir bir eksiği "beklenmeyen hata" diye gösterirdi.
 */
export async function submitB2bApplication(
  customerId: string,
  input: B2bApplicationInput,
  facts: B2bCompanyFacts,
): Promise<UserProfile> {
  const outcome = await submitApplication(serviceDb(), customerId, input, facts);
  if (outcome.status === 'invalid_application') throw new CustomerError('invalid_application');
  if (outcome.status === 'profile_not_found') throw new CustomerError('unexpected');
  return outcome.profile;
}

/**
 * Girişli ziyaretçinin başvuru bağlamı; oturum yoksa `null`.
 *
 * Kimlik çözümü BURADA kalıyor (`currentCustomerId` çereze bakar, yani taşımaya bağlıdır) —
 * paketin kapısı kimliği parametre olarak alır.
 */
export async function readB2bApplicant(viewLanguage: PreferredLanguage): Promise<B2bApplicantView | null> {
  const customerId = await currentCustomerId();
  if (!customerId) return null;
  return readApplicant(serviceDb(), customerId, viewLanguage);
}

/**
 * **Başvuru sonucunu başvurana bildirir** (14.10).
 *
 * ── KAPATTIĞI BOŞLUK ────────────────────────────────────────────────────────
 * Ret gerekçesi veride ZORUNLU (`user_profiles_b2b_reject_stamp`), 20.2 onu üç dile çeviriyor ve
 * karar eyleminin kendi künyesi *"ret müşteriye e-postayla gittiği için gerekli"* diyordu. Ama
 * gönderen taraf hiç yazılmamıştı: zorunlu tutulan, çevrilen ve saklanan cümle **hiçbir okuyucuya
 * ulaşmıyordu** (müşteri şeridinin ölçümü, 04.08).
 *
 * ── GEREKÇE BAŞVURANIN DİLİNDE ÇÖZÜLÜR ──────────────────────────────────────
 * Operatör Türkçe yazar, başvuran kendi dilinde okur — okuma kapısıyla (`readB2bApplicant`) **aynı
 * çözüm**, aynı kaynak-dil kabulüyle. Ham metni geçirseydik Fransız bir kasap Türkçe bir cümle
 * okurdu ve gerekçenin zorunlu olmasının sebebi tam olarak okunabilmesiydi.
 *
 * ── FIRLATMAZ ───────────────────────────────────────────────────────────────
 * Bildirim kararı geri almaz: onay/ret zaten yazıldı, mail gitmedi diye kararı bozmak yanlış olurdu
 * (`NotifyResult` künyesinin kendi kuralı). Çağıran `void` ile çağırabilir.
 */
export async function notifyB2bDecision(customerId: string, approved: boolean): Promise<void> {
  try {
    const db = serviceDb();
    const profile = await new UserProfileService(db).getById(customerId);
    if (!profile?.email) return;

    const locale = profile.preferredLanguage ?? 'fr';
    // Gerekçe YALNIZ rette taşınır: onayda gösterilecek bir şey yok ve şablon da onu çizmiyor.
    const gerekce = approved
      ? null
      : resolveUserText(
          { text: profile.b2bRejectReason, language: 'tr', translations: profile.b2bRejectReasonTranslations },
          locale,
        ).text;

    // TEK KAPI (14.12): karar artık uygulama içinde de görünür. Dedupe YOK — yeniden başvuru
    // yeni bir karar doğurur ve her karar ayrı haberdir (ret damgası eskir, 0011 kuralı).
    await dispatchCustomerNotification(db, {
      event: 'b2b_application_result',
      customerId,
      recipient: { name: profile.name ?? null, email: profile.email, phone: profile.phone ?? null, locale },
      target: { type: 'customer', id: customerId },
      payload: { approved },
      data: {
        customerName: profile.name ?? null,
        locale,
        // Künyedeki ad RESMÎ addır (`legalName`) — ticari ad değil. Başvurunun konusu tüzel kişilik
        // olduğu için doğru olan da bu: onay o unvana veriliyor.
        companyName: profile.companyInfo?.legalName ?? null,
        approved,
        reason: gerekce,
        // Onayda toptan vitrine, rette hesaba: onaylanan kişinin yapacağı şey alışveriş, reddedilenin
        // yapacağı şey eksiği görmek. Tek adrese yönlendirmek ikisinden birini boşa çıkarırdı.
        actionUrl: localizedUrl(approved ? '/catalog' : '/account', locale),
        // Jetonlu (22.08) — tek kapıdan; gerekçesi `customer/notification-preferences` künyesinde.
        notificationPreferencesUrl: await notificationPreferencesUrl(db, locale, { customerId }),
      },
    });
  } catch (err) {
    captureError(err, { source: SOURCES.webAction, level: 'warning', context: { job: 'b2b_application_result', customerId } });
  }
}
