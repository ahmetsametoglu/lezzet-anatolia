import { OrderService, UserProfileService } from '@lezzet/database';
import { readableCode } from '@lezzet/domain-core';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  DAVET ALTYAPISI (17.7 zemin · 17.9 bağlantı) — kodun doğduğu, çözüldüğü, bağlandığı ve
  paylaşılabilir bir ADRESE çevrildiği tek yer.

  ── ARTIK BÜTÜN: dört kapı da burada ─────────────────────────────────────────
  Kod garantisi (`ensureCustomerReferralCode`) 17.7'de terfi etmişti; `resolveReferrer` ve
  `linkReferrer` web'de bırakılmıştı ve gerekçesi "bugün tek yüzeyleri var" idi. O gerekçe 17.9'da
  düştü: davet bağını kuran çağrı artık OTP doğrulamasının içinde (`auth/otp.ts`) ve o akışı İKİ
  yüzey çağırıyor — web action'ı ve mobil `/api/v1/auth/otp/verify`. Web'de kalsalardı mobilden
  kaydolan davetli sessizce bağsız kalırdı: ödül yazılmaz, kimse de fark etmezdi.

  ── BAĞLANTI KURALI DA BURADA (17.9) ─────────────────────────────────────────
  17.7 künyesi "kodu bir bağlantıya çeviren tek bir kural yok, doğduğunda evi burasıdır" diye
  bitiyordu. Bugün doğdu: `/invite/[code]` rotası `PATHNAMES`te (üç dil) ve `inviteUrl` o tablodan
  TAM adresi üretiyor. Adres bir yerde daha kurulmaz — kuran ikinci bir yer, rota adı değiştiğinde
  sessizce 404'e düşen ikinci bir bağlantı demektir (`PATHNAMES` künyesinin kendi dersi).

  ── DAVET EDENİN GÖRÜNEN YÜZÜ YALNIZ ADIDIR ──────────────────────────────────
  Karşılama sayfası kodu bir İSME çevirir, kimliğe değil: bağlantı WhatsApp'ta dolaşır ve onu açan
  herkes cevabı görür. Ad da TEK PARÇA (ilk sözcük) — soyadı, e-posta, telefon, sipariş sayısı
  hiçbiri geçmez. Kod geçersizse cevap "yok"tur; "böyle bir kod var ama sana söylemem" demek,
  olmayan bir kaydın varlığını doğrulamaktır (`openFeedbackInvite` künyesindeki aynı ders).
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

/**
 * Kodun paylaşılabilir TAM adresi — `https://…/fr/parrainage/AB12CD34`.
 *
 * Dil PAYLAŞANIN dilidir, davetlininki değil: davetlinin dili bağlantı üretilirken bilinemez ve
 * bir tahmin yapmak gerekiyorsa en iyisi paylaşanın kendi dilidir (çevresine kendi dilinde yazar).
 * Ziyaretçi sayfada dilini değiştirebiliyor; kod dile bağlı değil.
 */
export function inviteUrl(code: string, locale: Locale): string {
  return localizedUrl('/invite/[code]', locale, { code });
}

/** Kodun sahibi kim — davet bağlantısıyla gelen ziyaretçi için. Geçersiz kod `null`, hata değil. */
export async function resolveReferrer(db: SupabaseClient, code: string): Promise<string | null> {
  const referrer = await new UserProfileService(db).findByReferralCode(code.trim());
  return referrer?.id ?? null;
}

/**
 * Karşılama sayfasının gördüğü hâl. Beşinci başarısız hâl (`already_referred`) burada YOK ve
 * olmaması doğru: o ancak kaydolma anında bilinebilir — ziyaretçi henüz kimse değilken "senin
 * zaten bir getirenin var" denemez.
 */
export type InviteWelcome =
  /** Kod bir müşteriye ait; ekran daveti çizer. `referrerName` yalnız ilk sözcüktür. */
  | { status: 'ok'; referrerName: string }
  /** Kod tanınmıyor — yanlış kopyalanmış ya da sahibinin hesabı kapanmış (`referral_code` düşer). */
  | { status: 'unknown' }
  /** Ziyaretçi kendi bağlantısını açtı; ekran "bu senin bağlantın" der, davet çizilmez. */
  | { status: 'self' }
  /** Ziyaretçi zaten müşteri — davet YENİ müşteri içindir; bağ kurulmaz, alışverişe devam. */
  | { status: 'already_customer' };

/**
 * Davet bağlantısının karşılama durumu.
 *
 * `viewerId` giriş yapmış ziyaretçinin PROFİL kimliğidir (auth kimliği değil — ikisi ayrıdır).
 * Verilmezse ziyaretçi tanınmıyor demektir ve yalnız kodun kendisine bakılır.
 *
 * **Sıralama önemli:** önce "bu benim kodum mu", sonra "zaten müşteri miyim". Tersi olsaydı kendi
 * bağlantısını açan müşteri "zaten müşterimizsin" cevabını görürdü — doğru ama işe yaramaz bir
 * cümle; oysa ona söylenecek şey bağlantısının ÇALIŞTIĞIDIR.
 */
export async function readInviteWelcome(db: SupabaseClient, code: string, viewerId?: string | null): Promise<InviteWelcome> {
  const referrer = await new UserProfileService(db).findByReferralCode(code.trim());
  if (!referrer) return { status: 'unknown' };
  if (viewerId && viewerId === referrer.id) return { status: 'self' };
  if (viewerId) return { status: 'already_customer' };
  return { status: 'ok', referrerName: firstName(referrer.name) };
}

/**
 * Adın yalnız ilk sözcüğü. Boş isim `null` DEĞİL boş dize dönmez — ekran isimsiz bir davet de
 * çizebilmeli ("bir müşterimiz seni davet etti"), o cümleyi kuran taraf ekrandır.
 */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** `linkReferrer`ın cevabı — beşi de gerçekten oluyor ve dördü sessiz REDDİR (aşağıdaki künye). */
export type LinkReferrerOutcome = 'linked' | 'unknown_code' | 'self' | 'already_referred' | 'already_customer';

/**
 * **Getiren bağını KİMLİKLE kurar** — kodla kuran `linkReferrer`ın kardeşi ve ikisinin de gövdesi.
 *
 * Ayrı bir kapı gerekti çünkü ikinci bir çağıran doğdu: **komşu daveti** (kullanıcı kararı 17.08).
 * Orada elde kod yok, davet edenin kimliği var — `neighborInviteUrl` yalnız token taşıyor. Kuralları
 * kopyalamak yerine gövde buraya alındı; `linkReferrer` artık kodu kimliğe çevirip buraya veriyor.
 *
 * Dört sessiz ret ve gerekçeleri:
 *   · **Kendini getirmek** — kişi kendini getiremez.
 *   · **Zaten bağlı** — ilk getiren kazanır; sonradan gelen bir bağ, kazanılmış olanı çalamaz.
 *   · **Zaten müşteri** — davet YENİ müşteri kazandırmanın ödülüdür (★ karar 2f: *"yeni müşteri
 *     500"*). Taslak ve iptal sayılmaz (`countPlacedForCustomer`): ödeme adımında vazgeçmiş bir
 *     ziyaretçi "zaten müşterimiz" değildir ve bir daha hiç davet edilememesi sessiz bir kayıp olurdu.
 *   · **Bilinmeyen kişi** — profil okunamadı.
 *
 * **Ödül burada DOĞMAZ**, bağ kurulur: ödül getirilen kişinin parası defterde göründüğünde doğar
 * (`order/payment.ts` → `finalize`). Kullanıcının kuralı (17.08): *"benim davet ettiğim kişi bana
 * davet ödülü kazandırabilmesi için öyle veya böyle bir tane başarılı sipariş gerçekleştirmesi
 * lazım."* Seferle ilgisi yoktur — komşu ödülünden ayrıldığı yer tam burasıdır.
 */
export async function linkReferrerById(db: SupabaseClient, newCustomerId: string, referrerId: string): Promise<LinkReferrerOutcome> {
  if (referrerId === newCustomerId) return 'self';

  const profiles = new UserProfileService(db);
  const yeni = await profiles.getById(newCustomerId);
  if (!yeni) return 'unknown_code';
  if (yeni.referredBy) return 'already_referred';
  if ((await new OrderService(db).countPlacedForCustomer(newCustomerId)) > 0) return 'already_customer';

  await profiles.update({ id: newCustomerId, referredBy: referrerId });
  return 'linked';
}

/**
 * Yeni müşteriyi getirene BAĞLAR. Kayıt akışı çağırır (`auth/otp.ts`, yalnız YENİ müşteride).
 *
 * Üç şey sessizce reddedilir ve üçü de gerçekten olur:
 *   · **Kendi kodunu kullanmak** — kişi kendini getiremez.
 *   · **Zaten bağlı bir müşteri** — ilk getiren kazanır; sonradan gelen bir kod, kazanılmış bir
 *     bağı çalamaz. (Yoksa müşteri her yeni bağlantıya tıkladığında getiren değişirdi.)
 *   · **Geçersiz kod** — kayıt yine tamamlanır; bir dize yüzünden müşteriyi çevirmek olmaz.
 *
 * **Reddin GEREKÇESİ dönüyor, yalnız "oldu/olmadı" değil** (17.9): çağıran akış giriş adımıdır ve
 * müşteriye bir şey söylemez, ama gerekçe olmadan "davet neden yazılmadı" sorusu ancak veriye
 * bakılarak yanıtlanabilirdi. Ödül burada DOĞMAZ — o, getirilen kişinin parası defterde
 * göründüğünde doğar (`order/payment.ts` → `finalize`).
 */
export async function linkReferrer(db: SupabaseClient, newCustomerId: string, code: string): Promise<LinkReferrerOutcome> {
  const referrerId = await resolveReferrer(db, code);
  if (!referrerId) return 'unknown_code';
  return linkReferrerById(db, newCustomerId, referrerId);
}

/**
 * **Girişten sonra davet bağını kuran TEK kapı** — hangi giriş yolundan gelinirse gelinsin (17.11).
 *
 * ── NEDEN DOĞDU: ÖLÇÜLMÜŞ SESSİZ BOŞLUK ─────────────────────────────────────
 * 17.9 bağı OTP akışının içine koymuştu ve gerekçesi doğruydu — *"müşteri kartının doğduğu tek yer
 * burası"*. Ama o cümle YALNIZ OTP için doğruydu: **Google (OAuth) akışı oradan geçmiyor.** Web'de
 * `auth/callback/route.ts`, mobilde PKCE doğrudan Supabase'e gidiyor ve profili `0002` trigger'ı
 * açıyor. Sonuç: davet bağlantısına tıklayıp *"Google ile devam et"* diyen davetli **sessizce
 * bağsız** kalıyordu — hata yok, log yok, ödül yok. Üstelik en olası yol bu: davetli çoğu zaman
 * telefonunda oturumu açık bir Google hesabıyla geliyor. (Mobil şeridin notu, 11.08.)
 *
 * Çare iki yüzeyi ayrı ayrı yamamak DEĞİL — o, 17.9'da kapatılan boşluğun ikizini açardı. Kapı tek
 * ve ortak: her giriş yolu, oturum kurulduktan sonra bunu çağırır.
 *
 * ── "YENİ MÜŞTERİ" ÖLÇÜTÜ DEĞİŞTİ: KAYIT ANI → SİPARİŞSİZLİK ────────────────
 * OTP yolunda ölçüt `!knownBefore` idi (kart bu çağrıda mı doğdu). OAuth'ta o an ölçülemiyor:
 * oturum kurulduğunda trigger profili çoktan yazmış olur ve "az önce mi yazıldı" sorusunun cevabı
 * ancak bir ZAMAN PENCERESİYLE tahmin edilebilirdi — saniyelere bağlı, sessizce yanlışlanabilir
 * bir ölçüt. Onun yerine alan bir soru soruluyor: **bu kişi bizden hiç alışveriş yaptı mı?**
 *
 * Ölçüt daha geniş ve genişlemesi bilinçli: aylar önce hesap açıp hiç sipariş vermemiş biri, bir
 * arkadaşının davetiyle gerçekten kazanılıyorsa o davet ödülü hak ediyor. Sömürüye de kapı açmıyor,
 * çünkü ödül hâlâ **karşı tarafın parasının defterde görünmesine** bağlı (17.9): bağ kurmak tek
 * başına hiçbir şey ödemiyor.
 *
 * Öteki üç ret aynen yürürlükte (`linkReferrer`): kendini getirme · ilk getiren kazanır · geçersiz
 * kod. Kapı **idempotent**: ikinci giriş bağı değiştirmez.
 */
export async function attachReferralOnLogin(
  db: SupabaseClient,
  input: { authUserId: string; referralCode: string },
): Promise<LinkReferrerOutcome | 'no_profile'> {
  const profile = await new UserProfileService(db).findByAuthUserId(input.authUserId);
  // Profil yoksa trigger henüz yazmamıştır: davet yüzünden girişi bekletmeyiz, çerez duruyor ve
  // bir sonraki giriş aynı kapıdan geçer.
  if (!profile) return 'no_profile';
  // Üç ret ölçütü (`already_referred` · `already_customer` · `self`) artık `linkReferrerById`te,
  // tek yerde: komşu daveti de aynı bağı kuruyor ve iki kapının bir gün ayrışması, davetin bir
  // yoldan kabul edilip öbüründen sessizce reddedilmesi demekti.
  return linkReferrer(db, profile.id, input.referralCode);
}
