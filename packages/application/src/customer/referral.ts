import { UserProfileService } from '@lezzet/database';
import { readableCode } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  DAVET KODU KAPISI (17.7) — `apps/web/lib/feedback/referral.ts`teki `getOrCreateReferralCode`ın
  TERFİSİ (kopya değil, CLAUDE §1). Ölçüt karşılandı: kodu artık İKİ yüzey istiyor — web'in davet
  bloğu ve mobil hesap ekranının "puan kazanma yolları" bölümü. Web dosyası kendi ekranını
  beslemeye devam ediyor (KÖPRÜ); benimsemesi web şeridinin işi (`customer/profile.ts` terfisinin
  aynı sözleşmesi).

  TERFİ EDEN YALNIZ KOD GARANTİSİ. `resolveReferrer` ve `linkReferrer` web'de KALDI ve bilerek:
  ikisi de KAYIT akışının parçası (`lib/identity/find-or-create.ts`) ve bugün tek yüzeyleri var.
  Mobil kayıt akışı daveti kabul etmeye başladığı gün aynı yoldan buraya taşınırlar — erken
  taşımak, köprü/paket ikiliğini çağıransız kapılar için de açmak olurdu.

  KODUN NEREYE YAZILACAĞI (davet URL'i) BURADA YOK ve olmaması bir eksiklik beyanıdır: repoda
  kodu bir bağlantıya çeviren TEK bir kural yok — `@lezzet/i18n`in `PATHNAMES` sözlüğünde davet
  rotası tanımlı değil ve `findOrCreateCustomer`ın `referralCode` girdisini hiçbir çağıran
  doldurmuyor. Uydurma bir biçim (`?ref=…`) yazmak, hiçbir yerin okumadığı bir bağlantı üretmek
  olurdu. Bağlantı kuralı (biçim + karşılayan rota + kodu kayda bağlayan çağrı) doğduğunda evi
  burasıdır; bugün ekran KODUN KENDİSİNİ paylaşır.
*/

/** Kod uzunluğu — sipariş referansı ve kupon koduyla aynı alfabe (O/0, I/1 yok). */
const REFERRAL_CODE_LENGTH = 8;

/** Çakışmada kaç kez yeniden denenir. Alfabe 8 haneli; çakışma pratikte imkânsız, tekrar bir emniyet. */
const MAX_ATTEMPTS = 5;

/**
 * Müşterinin davet kodu — yoksa üretilir, varsa aynısı döner.
 *
 * **İstek üzerine üretilir, kayıtta değil:** müşterilerin çoğu hiç davet etmez; her satıra
 * kullanılmayacak bir kod yazmak, tekillik çakışmalarını da boşuna göze almak olurdu.
 *
 * **Tekilliği veritabanı söyler** (`user_profiles_referral_code_key`), uygulama değil: "bu kod var
 * mı" diye sorup sonra yazmak, iki eşzamanlı istek arasında yine çakışırdı.
 *
 * `null` iki hâlde: profil yok (kimliksiz bir davet kodu yoktur) ya da çakışma tekrarı tükendi.
 * İkincisi bir arızadır ve **sessiz geçmez** — log'a kimlik yazılır, kodun kendisi hiçbir hâlde
 * yazılmaz (CLAUDE §1: kimlik evet, içerik hayır; davet kodu paylaşılabilir bir sırdır).
 */
export async function ensureCustomerReferralCode(db: SupabaseClient, customerId: string): Promise<string | null> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return null;
  if (profile.referralCode) return profile.referralCode;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = readableCode(REFERRAL_CODE_LENGTH);
    try {
      const updated = await profiles.update({ id: customerId, referralCode: code });
      return updated.referralCode;
    } catch (err) {
      // Çakışma (23505) → yeniden dene. Başka hata gerçek bir arızadır, yukarı gider.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('23505') && !message.includes('user_profiles_referral_code_key')) throw err;
    }
  }

  logger.warn({ context: 'customer/referral', customerId }, 'davet kodu üretilemedi (çakışma tekrarı tükendi)');
  return null;
}
