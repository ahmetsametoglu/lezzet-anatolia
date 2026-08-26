import { CustomerPhoneService, UserProfileService } from '@lezzet/database';
import { readableCode } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  ── WHATSAPP BAĞLAMA (04.10) ─────────────────────────────────────────────────────────────────────
  Müşterinin hesabını kendi WhatsApp numarasına bağlayan akış. DOMAIN §10.

  ── NEDEN GEREKİYOR: KANIT İLE KİMLİK AYRI İKİ SORU ──────────────────────────────────────────────
  Gelen bir WhatsApp mesajı numaranın zilyetliğini KANITLAR ("bu hat bu kişide") ama hangi HESAP
  olduğunu söylemez. Web'den e-postasıyla kaydolmuş bir müşteri bize kendiliğinden yazdığında
  elimizde onu hesabına bağlayacak hiçbir şey yoktur — yeni bir taslak doğar ve aynı insan sistemde
  iki kez görünür.

  Jeton o boşluğu kapatır: giriş yapmış müşteriye üretilir, ÖNCEDEN YAZILI mesajın içine konur,
  müşteri gönderir. Webhook iki şeyi birden görür — **kimden geldiği** (kanıt) ve **jeton** (hesap).

  ── BİZ MESAJ GÖNDERMİYORUZ, PARA DA HARCAMIYORUZ ───────────────────────────────────────────────
  Akışı müşteri başlatır: `wa.me` bağlantısına basar, kendi WhatsApp'ından gönderir. Ücretli
  `authentication` şablonu yok, Meta'dan şablon onayı beklemek yok, hız sınırı derdi yok — üstelik
  gelen mesaj 24 saatlik ücretsiz servis penceresini de açar (DOMAIN §11).

  ── JETON, 6 HANELİ GÜVENLİK KODU DEĞİLDİR ───────────────────────────────────────────────────────
  DOMAIN §10 *"koddan kimliğe gidilmez, kimlikten koda gidilir"* der ve bu, dönen müşteriye sorulan
  6 hanelik ÇAPA kodu içindir: o kod kısadır (10⁶) ve gücünü **numaraya bağlı olmaktan** alır.
  Burada sorgunun yönü zorunlu olarak jetondan kimliğedir — mesaj gelene kadar kimin yazdığını
  bilmiyoruz. O yüzden güvenlik ENTROPİDEN gelmek zorunda: 12 hane okunabilir alfabe ≈ 60 bit, artı
  kısa ömür, artı tek kullanım. Tahminle bulunan bir jeton, bulanın NUMARASINI başkasının hesabına
  yazdırırdı; yani hesap devralma. Kısa bir kod burada asla yeterli olmazdı.
*/

/** Jetonun tanınabilir kabuğu — mesajın içinden bunu arıyoruz. Marka öneki sipariş referansıyla aynı aile. */
const WA_LINK_MARK = 'LA-WA-';

/** 12 hane × okunabilir alfabe ≈ 60 bit. Uzunluk UX'i bozmuyor: müşteri yazmıyor, hazır mesajda geliyor. */
const WA_LINK_TOKEN_LENGTH = 12;

/** Ömür: ekranla WhatsApp arasındaki mesafe. Uzun tutmanın hiçbir faydası, kısa tutmanın açık faydası var. */
export const WA_LINK_TTL_MS = 15 * 60 * 1000;

/** Tekillik çakışmasında kaç kez yeniden üretilir — pratikte imkânsız, tekrar bir emniyet. */
const MAX_ATTEMPTS = 5;

/** Mesajın içindeki jeton — yoksa `null`. Büyük/küçük harfe duyarsız: müşterinin klavyesi düzeltebilir. */
export function waLinkTokenIn(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = new RegExp(`${WA_LINK_MARK}([A-Z0-9]{${WA_LINK_TOKEN_LENGTH}})`, 'i').exec(text);
  return match ? match[1]!.toUpperCase() : null;
}

export type StartWhatsappLinkOutcome =
  /** `code` önceden yazılı mesaja OLDUĞU GİBİ konur (kabuğuyla birlikte). */
  | { status: 'ok'; code: string; expiresAt: string }
  | { status: 'profile_not_found' }
  /** Jeton üretilemedi (çakışma tekrarı tükendi) — arıza, sessiz geçmez. */
  | { status: 'unavailable' };

/**
 * **Bağlama jetonunu üret** — "WhatsApp'ımı bağla" düğmesinin sunucu yarısı.
 *
 * Her basışta YENİ jeton üretir ve öncekini geçersizler: müşteri bağlantıyı açıp vazgeçmiş,
 * telefonunu değiştirmiş ya da mesajı göndermemiş olabilir. Eskisini yaşatmak, ekranda görünmeyen
 * bir jetonun günlerce geçerli kalması demekti.
 *
 * **Mesaj metni BURADA KURULMAZ** (`whatsappHref` künyesinin aynı kuralı): metin müşteriye görünen
 * i18n kopyasıdır ve sayfanın kendi `messages.json`'unda yaşar. Bu kapı yalnız `code` döner.
 */
export async function startWhatsappLink(db: SupabaseClient, customerId: string): Promise<StartWhatsappLinkOutcome> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return { status: 'profile_not_found' };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const token = readableCode(WA_LINK_TOKEN_LENGTH);
    const expiresAt = new Date(Date.now() + WA_LINK_TTL_MS).toISOString();
    try {
      await profiles.update({ id: customerId, waLinkToken: token, waLinkExpiresAt: expiresAt });
      return { status: 'ok', code: `${WA_LINK_MARK}${token}`, expiresAt };
    } catch (err) {
      // Çakışma (23505) → yeniden dene. Başka hata gerçek bir arızadır, yukarı gider.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('23505') && !message.includes('user_profiles_wa_link_token_key')) throw err;
    }
  }

  // Jetonun KENDİSİ hiçbir hâlde log'a yazılmaz (CLAUDE §1) — kimlik yeter.
  logger.warn({ context: 'customer/whatsapp-link', customerId }, 'bağlama jetonu üretilemedi (çakışma tekrarı tükendi)');
  return { status: 'unavailable' };
}

export type ConsumeWhatsappLinkOutcome =
  /** Mesajda jeton yok — olağan hâl, gelen mesajların ezici çoğunluğu. */
  | { status: 'none' }
  /**
   * Jeton bulundu ama geçerli değil: süresi dolmuş, zaten kullanılmış ya da hiç var olmamış.
   * **Üçü tek cevaba düşürüldü** ve bu bilinçli — ayırmak, dışarıdan deneyen birine "bu jeton
   * vardı ama geç kaldın" demek, yani jetonun varlığını sızdırmak olurdu.
   */
  | { status: 'invalid' }
  /** Bağ kuruldu (ya da zaten vardı, tazelendi). */
  | { status: 'linked'; customerId: string }
  /**
   * Numara BAŞKA bir gerçek kayıtta aktifti; bağ o kayıttan ALINDI ve buraya verildi (04.10).
   *
   * **Taşınan tek şey KANAL.** Eski kaydın siparişleri, puanları, geçmişi yerinde kalır — birleşme
   * değil, devir. `DOMAIN §10`: *"Numarayı çıkarmak bir KANALI kapatır, geçmişi geri almaz."*
   */
  | { status: 'transferred'; customerId: string; previousHolderId: string }
  /** Numara bir TASLAĞA bağlıydı; taslak hesaba birleştirildi ve bağ hesaba geçti. */
  | { status: 'merged'; customerId: string; mergedId: string };

/**
 * **Gelen mesajdaki jetonu tüket** — webhook'un kimlik çözümünden ÖNCE çağırdığı kapı.
 *
 * Sıra zorunlu: bu kapı önce koşmazsa, kimlik çözümü tanımadığı numara için yeni bir taslak açar ve
 * jeton o taslağa bakar — bağlamak istediğimiz hesap ortada kalırdı.
 *
 * ── TASLAK BİRLEŞTİRME: bu bir kenar durum DEĞİL, EN SIK hâl ────────────────────────────────────
 * Müşteri çoğu zaman önce bize yazar (taslak doğar, numara ona kanıtlanır), sonra siteden hesap
 * açar, sonra "bağla"ya basar. O anda numara zaten taslağa bağlıdır — bağlama başarısız olsaydı
 * akış tam da işe yarayacağı yerde çalışmazdı.
 *
 * Taslağı hesaba birleştirmek, admin'in aynı vakada elle yaptığı şeydir (09.10) — ve buradaki kanıt
 * onunkinden GÜÇLÜDÜR: admin kayıtlara bakıp karar verir, burada müşteri hem oturumunu hem hattını
 * kanıtlamıştır. Yön sabittir: taslak KAYNAK, hesap HEDEF (kapanan taraf her zaman taslaktır).
 *
 * **Sahip gerçek bir kayıtsa BİRLEŞTİRME yok, DEVİR var** (kullanıcı kararı 26.08). İki gerçek
 * kaydı birleştirmek hâlâ yasak — geri alınamaz. Ama numaranın eski kayıtta kalması da bir karardı
 * ve bedeli ağırdı: yeni sahibin siparişleri, adresi, adı **yabancı bir kaydın içine** yazılırdı.
 * Bağ bu yüzden kopuyor, geçmiş ise yerinde kalıyor (ayrıntı gövdedeki künyede).
 */
export async function consumeWhatsappLink(db: SupabaseClient, phone: string, text: string | null): Promise<ConsumeWhatsappLinkOutcome> {
  const token = waLinkTokenIn(text);
  if (!token) return { status: 'none' };

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByWaLinkToken(token);
  if (!profile) return { status: 'invalid' };

  const suresiGecti = !profile.waLinkExpiresAt || new Date(profile.waLinkExpiresAt).getTime() < Date.now();
  if (suresiGecti) {
    await temizle(profiles, profile.id);
    return { status: 'invalid' };
  }

  const phones = new CustomerPhoneService(db);
  const kanit = await phones.recordProof(profile.id, phone);
  // Jeton her hâlde düşer: TEK KULLANIM bir güvenlik özelliğidir ve başarısız denemede de geçerli.
  await temizle(profiles, profile.id);

  if (kanit.status !== 'taken') return { status: 'linked', customerId: profile.id };

  const holderId = kanit.row?.customerId ?? null;
  if (!holderId) return { status: 'invalid' }; // yarışta emekliye ayrılmış — müşteri tekrar dener

  const holder = await profiles.getById(holderId);
  const taslakMi = holder?.isDraft === true && holder.authUserId === null && holder.mergedIntoId === null;
  if (!holder || !taslakMi) {
    /*
      ── NUMARA GERÇEK BİR KAYITTAN DEVRALINIYOR (kullanıcı kararı 26.08) ──────────────────────────
      Bir tur bu hâl `conflict` deyip insana gidiyordu. Kullanıcı daha iyisini gösterdi: **bağı
      koparan şey bir zaman aşımı değil, OLUMLU bir olay olmalı** — biri çıkıp "bu numara bende"
      diyor ve bunu kanıtlıyor.

      Kanıt burada iki katlı: bu kişi hem HESABINI açmış (posta kutusuna gelen kodla girdi) hem de
      hattı ŞU AN elinde tutuyor (jetonu o numaradan gönderdi). Eski bağ ise hattın GEÇMİŞTEKİ bir
      anına dayanıyor. Hatlar devredilir; taze zilyetlik eski zilyetliği geçer.

      **Birleşme YOK, devir var.** Eski kaydın siparişleri, puanları ve geçmişi yerinde kalıyor;
      taşınan tek şey kanaldır. Emekli satır da silinmiyor — "bu numara bir zamanlar kimdeydi"
      sorusu sonradan da cevaplanabilmeli.

      **Bedeli biliyoruz ve kabul ediyoruz:** aile telefonu. Anne hesabına bağlı hattan oğul
      kaydolup bağlarsa numara oğula geçer ve annenin gelen mesajları artık onda görünür. Geri
      alınabilir (anne kendi hattından yeniden bağlar) ve hiçbir veri kaybolmaz. Alternatifi her
      devri insan kuyruğuna almaktı — DOMAIN §10'un uyardığı "bedeli kendi müşterilerimize ödeten
      kapı" tam olarak o olurdu.
    */
    if (kanit.row) await phones.retire(kanit.row.id);
    const yeni = await phones.recordProof(profile.id, phone);
    if (yeni.status === 'taken') {
      // Yarış: emeklilik ile yeni yazım arasında başkası kaptı. Sessiz geçilmez — tekrar eden bir
      // `taken` yarış değil, aynı numaranın iki kimliğe düştüğü gerçek bir arızadır.
      logger.warn({ context: 'customer/whatsapp-link', customerId: profile.id, holderId }, 'bağlama: devir yarışta kaybedildi');
      return { status: 'invalid' };
    }
    logger.info({ context: 'customer/whatsapp-link', customerId: profile.id, previousHolderId: holderId }, 'bağlama: numara önceki kayıttan DEVRALINDI');
    return { status: 'transferred', customerId: profile.id, previousHolderId: holderId };
  }

  // Taslak → hesap. Kanıt satırı da `merge_customers` içinde taşınıyor (0040), ayrıca yazılmaz.
  await profiles.merge({ targetId: profile.id, sourceId: holderId });
  logger.info({ context: 'customer/whatsapp-link', customerId: profile.id, mergedId: holderId }, 'bağlama: WhatsApp taslağı hesaba birleştirildi');
  return { status: 'merged', customerId: profile.id, mergedId: holderId };
}

/** Jetonu düşür — ikisi birlikte gider (DB kısıtı: biri olmadan öteki yazılamaz). */
function temizle(profiles: UserProfileService, customerId: string): Promise<unknown> {
  return profiles.update({ id: customerId, waLinkToken: null, waLinkExpiresAt: null });
}
