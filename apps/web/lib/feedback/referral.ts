import 'server-only';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { readableCode } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';

/**
 * **Davet (referral) kapıları** (17.7) — "getiren müşteri" bağının kurulduğu yer.
 *
 * Zemin 29.07'den beri hazırdı ama iki ucu bağlanmamıştı: `referred_by` kolonunu HİÇBİR kod
 * yazmıyordu ve müşterinin paylaşacağı bir bağlantı yoktu. Yani `awardReferralPoints` doğru
 * çalışıyor ama tetikleyecek veri hiç doğmuyordu.
 *
 * **Ödülün ANI burada değil, siparişte** (`rewardCompletedOrder`): kayıt anında ödemek, sahte
 * kayıtla puan basmaya açık kapı bırakırdı. Getiren, getirdiği kişi GERÇEKTEN müşteri olunca
 * kazanır — ilk siparişi eline geçtiğinde.
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
 * **Tekilliği veritabanı söyler** (`user_profiles_referral_code_key`), uygulama değil: "bu kod
 * var mı" diye sorup sonra yazmak, iki eşzamanlı istek arasında yine çakışırdı.
 */
export async function getOrCreateReferralCode(customerId: string): Promise<string | null> {
  const profiles = new UserProfileService(serviceDb());
  const profile = await profiles.getById(customerId);
  if (!profile) return null;
  if (profile.referralCode) return profile.referralCode;

  for (let deneme = 0; deneme < MAX_ATTEMPTS; deneme += 1) {
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
  logger.warn({ context: 'feedback/referral', customerId }, 'davet kodu üretilemedi (çakışma tekrarı tükendi)');
  return null;
}

/**
 * Kodun sahibi kim — davet bağlantısıyla gelen ziyaretçi için.
 *
 * Geçersiz kod `null` döner ve bu bir hata değildir: bağlantı yanlış kopyalanmış olabilir.
 */
export async function resolveReferrer(code: string): Promise<string | null> {
  const referrer = await new UserProfileService(serviceDb()).findByReferralCode(code);
  return referrer?.id ?? null;
}

/**
 * Yeni müşteriyi getirene BAĞLAR. Kayıt akışı bunu çağırır (müşteri yüzeyi, 04).
 *
 * Üç şey sessizce reddedilir ve üçü de gerçekten olur:
 *   · **Kendi kodunu kullanmak** — kişi kendini getiremez.
 *   · **Zaten bağlı bir müşteri** — ilk getiren kazanır; sonradan gelen bir kod, kazanılmış bir
 *     bağı çalamaz. (Yoksa müşteri her yeni bağlantıya tıkladığında getiren değişirdi.)
 *   · **Geçersiz kod** — kayıt yine tamamlanır; bir dize yüzünden müşteriyi çevirmek olmaz.
 *
 * Dönüş: bağ kuruldu mu. Ekran buna bakıp "davetle geldin" diyebilir, ama söz VERMEZ — ödül
 * getirenin, ve o da ilk siparişte doğar.
 */
export async function linkReferrer(newCustomerId: string, code: string): Promise<boolean> {
  const profiles = new UserProfileService(serviceDb());
  const [yeni, referrerId] = await Promise.all([profiles.getById(newCustomerId), resolveReferrer(code)]);
  if (!yeni || !referrerId) return false;
  if (referrerId === newCustomerId) return false;
  if (yeni.referredBy) return false;

  await profiles.update({ id: newCustomerId, referredBy: referrerId });
  return true;
}
