import { linkReferrer } from '@lezzet/application';
import { CustomerPhoneService, UserProfileService, serviceDb } from '@lezzet/database';
import { resolveIdentity } from '@lezzet/domain-core';
import { normalizePhone } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { UserProfile, UserProfileInsert } from '@lezzet/types';

/**
 * Bul-veya-oluştur: kimliğin **tek kapısı** (04.4/04.5) — DOMAIN §10.
 *
 * Hangi yüzeyden gelinirse gelinsin (web girişi, misafir doğrulaması, WhatsApp, elle kayıt) kişi
 * buradan geçer ve tek `Customer`'da birleşir. İki anahtar vardır: **telefon** (E.164 normalize,
 * ama YALNIZ kanıtlıysa — aşağıda) ve **e-posta**; biri eşleşirse aynı müşteridir.
 *
 * Neden uygulama katmanında: karar motorun (`resolveIdentity` — saf, DB'siz, testli), satır
 * servisin; ikisi birbirini bilmez (STACK §4). Birleştiren yer burasıdır. Bugünkü tek tüketici web;
 * WhatsApp (modül 15) de aynı kapıyı isteyince paylaşılan bir yere taşınır — bugünden iki tüketicisi
 * olmayan bir paket açmak erken soyutlama olurdu.
 *
 * ── TELEFON İKİ FARKLI YERDE YAŞIYOR (04.10) ────────────────────────────────────────────────────
 * `user_profiles.phone` → iletişim numarası: formdan gelir, doğrulanmamıştır, burada **anahtar
 *                          olarak okunmaz** ve yalnız boş olduğunda tamamlanır.
 * `customer_phone`      → kimlik anahtarı: satırın varlığı zilyetlik kanıtıdır. Bu kapı onu
 *                          **yalnız `phoneProven` ile** okur ve **yalnız `phoneProven` ile** yazar.
 */

interface FindOrCreateInput {
  phone?: string | null;
  /**
   * Numaranın zilyetliği kanıtlandı mı — **varsayılan HAYIR** ve varsayılanın yönü tasarımdır
   * (04.10). Kanıt bugün tek yerden gelir: imzası doğrulanmış Meta webhook'undan düşen mesaj
   * (15.7). Operatörün elle yazdığı numara, hesap kartı ve checkout formu kanıt DEĞİLDİR —
   * klavyeden geçmek zilyetlik göstermez.
   *
   * Kanıtlı çağrıda iki şey birden olur: numara kimlik anahtarı olarak ARANIR, ve eşleşen/açılan
   * müşteriye kanıt satırı YAZILIR. Kanıtsız çağrıda ikisi de olmaz; numara yalnız iletişim
   * bilgisi olarak karta düşer.
   */
  phoneProven?: boolean;
  email?: string | null;
  name?: string | null;
  /** Auth ile gelen kullanıcı — eşleşen müşteriye bağlanır (04.4). */
  authUserId?: string | null;
  /** WhatsApp'tan otomatik açılan kayıt taslaktır; doğrulanmış girişte değildir. */
  asDraft?: boolean;
  /** Yeni kayıt açılırken uygulanacak ek alanlar (dil, ülke, izinler...). */
  defaults?: Partial<UserProfileInsert>;
  /**
   * Davet kodu (17.7) — **yalnız YENİ kayıtta** getiren bağını kurar; mevcut müşteriye
   * bağlanırken yok sayılır.
   *
   * **Müşteri yüzeyinin ASIL kayıt yolu buradan geçmiyor** (17.9 ölçümü): web ve mobil girişte
   * kart `auth.users` trigger'ıyla doğuyor ve davet bağı orada kuruluyor
   * (`@lezzet/application/auth/otp` → `attachReferrer`). Bu parametre WhatsApp'tan ve misafir
   * doğrulamasından açılan kayıtların yolu; bugün onu dolduran bir çağıran YOK ve künyenin bunu
   * söylemesi bilinçli — 17.7 satırı "kayıt akışı `?ref=…` değerini geçirir" diyordu ve o cümle
   * hiç doğru olmamıştı. O yol daveti kabul edecekse kodu buraya taşır.
   *
   * Neden yalnız yeni kayıtta: davet, bir müşteriyi KAZANDIRMANIN ödülüdür. Zaten müşterimiz olan
   * birinin bir davet bağlantısına tıklaması onu yeniden kazandırmaz — ve o kapı açık olsaydı iki
   * müşteri birbirinin bağlantısına tıklayıp puanı birbirine yazdırırdı.
   *
   * **Geçersiz kod kaydı DURDURMAZ:** bağlantı yanlış kopyalanmış olabilir; bir dize yüzünden
   * kazanılmış bir müşteriyi çevirmek olmaz. Kod sessizce düşer, kayıt tamamlanır.
   */
  referralCode?: string | null;
}

type FindOrCreateResult =
  /** Mevcut müşteriye bağlanıldı. */
  | { status: 'attached'; profile: UserProfile }
  /** Yeni müşteri açıldı. */
  | { status: 'created'; profile: UserProfile }
  /**
   * Anahtarlar BİRDEN ÇOK profile çıktı — sessizce seçim yapılmaz, admin birleştirir (DOMAIN §10).
   * Çağıran akışı durdurup insana taşır.
   */
  | { status: 'conflict'; profileIds: string[] }
  /** Ne telefon ne e-posta verildi — kimlik kurulamaz ("hesapsız sipariş yok"). */
  | { status: 'insufficient' };

export async function findOrCreateCustomer(input: FindOrCreateInput): Promise<FindOrCreateResult> {
  const profiles = new UserProfileService(serviceDb());
  const phones = new CustomerPhoneService(serviceDb());

  // 1) Anahtarları normalize et ve adayları getir. Aramayı normalize EDİLMİŞ değerle yapmak
  //    zorundayız, yoksa "+33 6.." ile "0033 6.." ayrı kişi olur.
  //
  //    **Normalizasyon burada, ama kural motorda.** Bir tur bu iki satır da motora sorularak
  //    yapılıyordu ("önce bir yokla, yetersizse hiç sorgulama") ve 04.10 ile o sıra bozuldu:
  //    kanıtsız numara motora göre tek başına kimlik AÇAMAZ, ama defterde karşılığı olabilir —
  //    yani yoklama, sorgulamadan önce "yetersiz" der ve asıl cevabı hiç aramazdık. Motor artık
  //    tek kez, adaylar elde olduğunda çağrılıyor; `normalizePhone` her iki tarafta da aynı saf
  //    fonksiyon ve ikinci kez uygulanması sonucu değiştirmiyor.
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : null;
  const email = input.email?.trim().toLowerCase() || null;
  const identity = {
    phone: normalizedPhone,
    phoneProven: input.phoneProven === true,
    email,
    authUserId: input.authUserId,
  };

  // İki anahtar, İKİ TABLO, tek tur (04.10): telefon `customer_phone`da, e-posta `user_profiles`ta.
  // Telefon araması KANIT İSTEMEZ — o defterin her satırı zaten bir kanıt ve sormak yeni bir iddia
  // üretmiyor. Kanıt, yeni kimlik AÇARKEN sorulur (motorun künyesi).
  const [byPhone, byEmail, byAuthUser] = await Promise.all([
    normalizedPhone ? phones.findActive(normalizedPhone) : Promise.resolve(null),
    email ? profiles.findByEmail(email) : Promise.resolve(null),
    // Üçüncü anahtar: giriş anında DB trigger'ı (0002) profili zaten açmış/bağlamış olabilir.
    // Ondan habersiz davranırsak aynı auth kullanıcısını ikinci profile yazmaya çalışırız.
    input.authUserId ? profiles.findByAuthUserId(input.authUserId) : Promise.resolve(null),
  ]);
  const candidates = {
    byPhone: byPhone?.customerId ?? null,
    byEmail: byEmail?.id ?? null,
    byAuthUser: byAuthUser?.id ?? null,
  };

  // 2) Kararı motor verir: bağlan / oluştur / çakışma.
  const decision = resolveIdentity(identity, candidates);

  switch (decision.action) {
    case 'insufficient':
      return { status: 'insufficient' };

    case 'conflict':
      return { status: 'conflict', profileIds: decision.customerIds };

    case 'attach': {
      const existing = await profiles.getById(decision.customerId);
      if (!existing) return { status: 'insufficient' }; // yarışta silinmiş — çağıran tekrar dener
      const profile = await enrich(profiles, existing, input, decision);
      await kaniti(phones, profile.id, input, decision.normalizedPhone);
      return { status: 'attached', profile };
    }

    case 'create': {
      const profile = await profiles.insert({
        ...input.defaults,
        // Ad zorunlu ama kimlik anahtarı değil: WhatsApp taslağında numaradan başka bilgi olmayabilir.
        name: input.name?.trim() || decision.normalizedPhone || decision.email || 'Yeni müşteri',
        phone: decision.normalizedPhone,
        email: decision.email,
        authUserId: input.authUserId ?? null,
        isDraft: input.asDraft ?? false,
      });
      await kaniti(phones, profile.id, input, decision.normalizedPhone);
      // Getiren bağı kayıttan SONRA kurulur: `linkReferrer` kendini-getirme ve "ilk getiren kazanır"
      // kurallarını taşıyor ve bunlar yeni satırın kimliğini bilmeden uygulanamaz. Ödül burada
      // DOĞMAZ — o, getirilen kişinin ilk siparişinin PARASI ALINDIĞINDA doğar (17.9:
      // `application/order/payment.ts` → `finalize` → `rewardReferralOnPaidOrder`).
      if (input.referralCode) {
        const bagli = await linkReferrer(serviceDb(), profile.id, input.referralCode);
        return { status: 'created', profile: bagli === 'linked' ? ((await profiles.getById(profile.id)) ?? profile) : profile };
      }
      return { status: 'created', profile };
    }
  }
}

/**
 * Kanıt satırını yazar — **yalnız kanıtlı çağrıda** (04.10).
 *
 * Kimlik kararı verildikten SONRA çalışır ve kararı değiştirmez: numara zaten yukarıda anahtar
 * olarak arandı, yani buraya gelindiğinde ya satır yok ya da bu müşteriye ait. `taken` dönmesi bu
 * yüzden yalnız YARIŞ demektir — iki webhook mesajı aynı anda düştü ve numarayı öteki bağladı.
 *
 * **Yarışta kimlik kararı geri alınmaz ve bu bilinçli:** mesaj zaten yazılacak, konuşma zaten
 * açılacak; kararı geri almak müşteriyi ortada bırakırdı. Ama sessiz de geçilmez — iz bırakılır,
 * çünkü tekrar eden bir `taken` bir yarış değil, aynı numaranın iki kimliğe düştüğü gerçek bir
 * arızadır ve o zaman insan bakmalıdır (log'a kimlik yazılır, numara YAZILMAZ — CLAUDE §1).
 */
async function kaniti(
  phones: CustomerPhoneService,
  customerId: string,
  input: FindOrCreateInput,
  normalizedPhone: string | null,
): Promise<void> {
  if (input.phoneProven !== true || !normalizedPhone) return;
  const sonuc = await phones.recordProof(customerId, normalizedPhone);
  if (sonuc.status === 'taken') {
    logger.warn(
      { customerId, holderId: sonuc.row?.customerId ?? null },
      'kimlik: kanıtlı numara başka müşteride aktif — kanıt satırı yazılmadı',
    );
  }
}

/**
 * Mevcut kayda dokunuş: **eksik olanı tamamlar, dolu olanı EZMEZ.** Aynı kişi ikinci anahtarıyla
 * geldiğinde (telefonla tanınan müşteri web'den e-postayla giriyor) o anahtar da karta yazılır;
 * böylece bir sonraki gelişte tek sorguda bulunur. Ad gibi kullanıcı verisini üzerine yazmayız —
 * müşterinin kendi düzelttiği bilgiyi otomatik akış bozmamalı.
 */
async function enrich(
  profiles: UserProfileService,
  existing: UserProfile,
  input: FindOrCreateInput,
  decision: { normalizedPhone: string | null; email: string | null },
): Promise<UserProfile> {
  const patch: Record<string, unknown> = {};
  // Telefon burada İLETİŞİM bilgisidir, anahtar değil (04.10) — "boşta duran numarayı sahiplenme"
  // riski bu satırdan kalktı: kolonun tekilliği yok, kimlik çözümü de onu okumuyor. Kimlik anahtarı
  // yalnız kanıtla yazılır (`kaniti`).
  if (!existing.phone && decision.normalizedPhone) patch.phone = decision.normalizedPhone;
  if (!existing.email && decision.email) patch.email = decision.email;
  // Auth bağı doğrulanmış kimliktir: geldiğinde taslak işareti düşer (04.4).
  if (!existing.authUserId && input.authUserId) {
    patch.authUserId = input.authUserId;
    patch.isDraft = false;
  }

  if (Object.keys(patch).length === 0) return existing;
  return profiles.update({ id: existing.id, ...patch });
}
