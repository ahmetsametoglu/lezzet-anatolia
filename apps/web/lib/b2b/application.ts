import 'server-only';
import { serviceDb } from '@lezzet/database';
import {
  notifyB2bDecision as notifyDecision,
  readB2bApplicant as readApplicant,
  submitB2bApplication as submitApplication,
  type B2bApplicantView,
} from '@lezzet/application';
import type { B2bApplicationInput, B2bCompanyFacts } from '@lezzet/domain-core';
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

/** Paketteki kapıya köprü: karar iki yüzeyden de verilebiliyor, haber tek yerden gider. */
export function notifyB2bDecision(customerId: string, approved: boolean): Promise<void> {
  return notifyDecision(serviceDb(), customerId, approved);
}
