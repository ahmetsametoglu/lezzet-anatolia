import { OrderService, UserProfileService } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Aynı iş yeri için müşterinin kendi açtığı boş hesapla ofisin kaydı yan yana durduğunda girişi ofisin kaydına taşır. Birleştirme
  kullanılmaz: boş hesap GDPR silmeyle kapanır (giriş silinir, e-posta boşalır), e-posta ofisin kaydına yazılır ve müşteri aynı
  adresle yeniden girince kayıt ve siparişleri ona bağlanır (DOMAIN §10).
*/

export type SiretHandoverOutcome =
  | { status: 'ok'; target: UserProfile }
  | { status: 'not_found' }
  /** Başvuru hesabı bir girişe bağlı değil; taşınacak giriş yok. */
  | { status: 'applicant_not_bound' }
  /** Ofisin kaydı zaten bir girişe bağlı; bir kayıt tek giriş taşır. */
  | { status: 'target_bound' }
  | { status: 'siret_mismatch' }
  /** Başvuru hesabında sipariş var; boş değildir ve silinirse sipariş sahipsiz kalır. */
  | { status: 'applicant_has_orders' }
  /** Hesap silindi ama e-posta ofisin kaydına yazılamadı; adres elle yazılsın diye döner. */
  | { status: 'email_not_written'; email: string };

export async function bindLoginToSiretRecord(
  db: SupabaseClient,
  input: { applicantId: string; targetId: string },
): Promise<SiretHandoverOutcome> {
  const profiles = new UserProfileService(db);
  const [applicant, target] = await Promise.all([profiles.getById(input.applicantId), profiles.getById(input.targetId)]);
  if (!applicant || !target || applicant.id === target.id) return { status: 'not_found' };
  if (!applicant.authUserId || !applicant.email) return { status: 'applicant_not_bound' };
  if (target.authUserId) return { status: 'target_bound' };
  const siret = applicant.companyInfo?.siret;
  if (!siret || siret !== target.companyInfo?.siret) return { status: 'siret_mismatch' };
  if ((await new OrderService(db).countForCustomer(applicant.id)) > 0) return { status: 'applicant_has_orders' };

  const email = applicant.email;
  // Silme önce gelir, çünkü e-posta tekildir ve ancak boşalınca ofisin kaydına yazılabilir.
  await profiles.anonymize(applicant.id);
  try {
    return { status: 'ok', target: await profiles.update({ id: target.id, email }) };
  } catch (err) {
    await captureError(err, {
      source: SOURCES.applicationB2b,
      context: { flow: 'b2b/bindLoginToSiretRecord', applicantId: applicant.id, targetId: target.id },
    });
    return { status: 'email_not_written', email };
  }
}
