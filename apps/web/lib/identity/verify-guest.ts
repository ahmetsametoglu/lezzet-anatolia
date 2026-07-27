import { EmailVerificationService, serviceDb } from '@lezzet/database';
import type { UserProfile } from '@lezzet/types';
import { findOrCreateCustomer } from './find-or-create';

/**
 * Misafir hızlı doğrulama — sunucu tarafı (04.6). DOMAIN §10.
 *
 * **"Hesapsız sipariş yoktur."** Müşteri şifresiz/profilsiz başlar ama son adımda e-postasına gelen
 * tek kullanımlık kodla (OTP) doğrulanır ve doğrulanmış bir kimliğe bağlanır. "Misafir" burada
 * hesapsızlık değil, **sürtünmesiz doğrulama** demektir.
 *
 * Kod doğrulanmadan müşteri açılmaz: doğrulama BAŞARILIYSA bul-veya-oluştur kapısından geçilir
 * (`find-or-create`) — böylece aynı kişi web, WhatsApp ve misafir akışında tek kayıtta birleşir.
 *
 * Ekranı modül 08'de; burası yalnız sunucu adımıdır.
 */

type VerifyGuestResult =
  | { status: 'verified'; profile: UserProfile; isNew: boolean }
  /** Kod tutmadı/yandı/süresi geçti — kimlik kurulmaz, müşteri AÇILMAZ. */
  | { status: 'wrong'; remainingAttempts: number }
  | { status: 'locked' | 'expired' | 'not_found' }
  /**
   * Doğrulama geçti ama anahtarlar birden çok profile çıktı: sessizce seçim yapılmaz, admin
   * birleştirir (DOMAIN §10). Çağıran akışı durdurup insana taşır.
   */
  | { status: 'conflict'; profileIds: string[] };

interface VerifyGuestInput {
  email: string;
  code: string;
  /** Checkout formunda girilmişse — kimliğin ikinci anahtarı, aynı turda karta yazılır. */
  phone?: string | null;
  name?: string | null;
}

export async function verifyGuestAndAttach(input: VerifyGuestInput): Promise<VerifyGuestResult> {
  const verification = await new EmailVerificationService(serviceDb()).verifyCode(input.email, input.code);
  if (verification.status !== 'ok') return verification;

  const identity = await findOrCreateCustomer({
    email: input.email,
    phone: input.phone,
    name: input.name,
    // Doğrulanmış kimlik taslak değildir — WhatsApp'tan otomatik açılan kayıttan farkı budur.
    asDraft: false,
  });

  switch (identity.status) {
    case 'attached':
      return { status: 'verified', profile: identity.profile, isNew: false };
    case 'created':
      return { status: 'verified', profile: identity.profile, isNew: true };
    case 'conflict':
      return identity;
    case 'insufficient':
      // E-posta doğrulandığına göre en az bir anahtar var; buraya düşmek çağıran hatasıdır.
      return { status: 'not_found' };
  }
}
