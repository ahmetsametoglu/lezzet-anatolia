import { linkReferrer } from '@lezzet/application';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { resolveIdentity } from '@lezzet/domain-core';
import type { UserProfile, UserProfileInsert } from '@lezzet/types';

/**
 * Bul-veya-oluştur: kimliğin **tek kapısı** (04.4/04.5) — DOMAIN §10.
 *
 * Hangi yüzeyden gelinirse gelinsin (web girişi, misafir doğrulaması, WhatsApp, elle kayıt) kişi
 * buradan geçer ve tek `Customer`'da birleşir. İki anahtar vardır: **telefon** (E.164 normalize) ve
 * **e-posta**; biri eşleşirse aynı müşteridir.
 *
 * Neden uygulama katmanında: karar motorun (`resolveIdentity` — saf, DB'siz, testli), satır
 * servisin; ikisi birbirini bilmez (STACK §4). Birleştiren yer burasıdır. Bugünkü tek tüketici web;
 * WhatsApp (modül 15) de aynı kapıyı isteyince paylaşılan bir yere taşınır — bugünden iki tüketicisi
 * olmayan bir paket açmak erken soyutlama olurdu.
 */

interface FindOrCreateInput {
  phone?: string | null;
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

  // 1) Anahtarları normalize et ve adayları getir. Normalizasyon motorun içindedir; aramayı
  //    normalize EDİLMİŞ değerle yapmak zorundayız, yoksa "+33 6.." ile "0033 6.." ayrı kişi olur.
  const identity = { phone: input.phone, email: input.email, authUserId: input.authUserId };
  const probe = resolveIdentity(identity);
  if (probe.action === 'insufficient') return { status: 'insufficient' };

  const normalizedPhone = 'normalizedPhone' in probe ? probe.normalizedPhone : null;
  const email = 'email' in probe ? probe.email : null;
  const candidates = await profiles.findIdentityCandidates(normalizedPhone, email);
  // Üçüncü anahtar: giriş anında DB trigger'ı (0002) profili zaten açmış/bağlamış olabilir.
  // Ondan habersiz davranırsak aynı auth kullanıcısını ikinci profile yazmaya çalışırız.
  if (input.authUserId) {
    candidates.byAuthUser = (await profiles.findByAuthUserId(input.authUserId))?.id ?? null;
  }

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
      return { status: 'attached', profile: await enrich(profiles, existing, input, decision) };
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
  // BEKLEYEN(04.10): checkout formundan gelen numara DOĞRULANMADAN kimlik anahtarına yazılıyor.
  // Dolu olanı ezmiyor (yukarıdaki koşul), ama boşta duran bir numarayı sahiplenmeye yetiyor.
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
