import { CartLinkService, CartService, ConversationService, UserProfileService, type Db } from '@lezzet/database';
import { readableCode } from '@lezzet/domain-core';
import { CART_LINK_PARAM, DEFAULT_LOCALE, LOCALES, localizedUrl, type Locale } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import type { CartItem, Conversation } from '@lezzet/types';
import { bindPhoneToAccount } from '../customer/whatsapp-link';

/*
  SEPET BAĞLANTISI (15.21 · 15.22 · kullanıcı kararı 07.09) — sohbette kurulan sepeti siteye TAŞIYAN jeton.

  ── KANAL İLKESİ ──────────────────────────────────────────────────────────────
  *"Hangi mesajlaşma platformunda olursa olsun en sonunda sepete yönlendirilir. Sepet onaylanır,
  sonra ödeme ekranına geçilir."* Sepet her kanalda kurulur; onay ve ödeme yalnız sitede. Bu dosya
  ikisinin arasındaki köprü: ajan bağlantıyı sohbete yazar (`startCartLink`), bağlantıyı açıp giriş
  yapan kişi sepetini ve kimliğini kazanır (`claimCartLink`).

  ── `wa_link_token`IN TERS YÖNÜ (04.10 · `whatsapp-link.ts`) ─────────────────
  Oradaki jeton siteden sohbete gider; buradaki sohbetten siteye. Kanıt aynı iki kattan oluşur:
  bağlantıyı ALAN kişi sohbetin öteki ucundadır (hattı/hesabı şu an elinde tutuyor), GİRİŞ yapan
  kişi posta kutusunun sahibidir. Numaranın hesaba bağlanması bu yüzden aynı gövdeden geçer
  (`bindPhoneToAccount`): taslak → hesaba birleşir, gerçek kayıt → kanal devredilir. İkinci bir kopya,
  iki kapının bir gün farklı davranması demekti.

  ── JETON, 6 HANELİ ÇAPA KODU DEĞİLDİR ────────────────────────────────────────
  DOMAIN §10'un *"koddan kimliğe gidilmez"* kuralı kısa çapa kodu içindir; burada sorgunun yönü
  zorunlu olarak jetondan sohbete gider (bağlantıyı kimin açacağı önceden bilinmez). Güvenlik
  ENTROPİDEN gelir: 12 hane okunabilir alfabe ≈ 60 bit + ömür + tek kullanım.

  ── ÖMÜR UZUN, ÇÜNKÜ BAĞLANTI BİR NİYETTİR ───────────────────────────────────
  Bağlama jetonu 15 dakika yaşar (ekranla WhatsApp arasındaki mesafe). Bu bağlantı ise sepet gibi
  BEKLEYEBİLİR: müşteri akşam yazar, ertesi gün açar. Stok ayrılmadığı için (DOMAIN §4) bekletmenin
  bedeli yok; fiyat açılış anında yeniden çözülür (DOMAIN §5). Yedi gün, davet çerezinin de ömrü —
  aynı "bir hafta içinde dönmeyen dönmemiştir" ölçüsü.

  ── SEPET DEVRİ MEVCUT KAPIDAN (07.1) ─────────────────────────────────────────
  Bağlantıdan gelen kalemler `CartService.takeOver`dan geçer — misafir sepetinin devralındığı kapı.
  Üçüncü bir birleştirme kuralı yok. SIRA ZORUNLU: önce sepet, sonra kimlik — `merge_customers`
  (0040) hedefin sepeti varsa KAYNAĞINKİNİ SİLER; birleşme önce koşsaydı sohbette kurulan sepet
  tam da taşınacağı anda kaybolurdu.
*/

/** Bağlantının ömrü — parametrik sabit; sepet bekleyebilir, bağlantı da bekleyebilir. Çerezin ömrü de bu (`invite-cookie.ts`). */
const CART_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Sepet sayfasının bağlantıyı okuduğu sorgu parametresi — adı `@lezzet/i18n`de (ara katman da okuyor, 08.09); burada yeniden yayılır. */
export { CART_LINK_PARAM };

/** 12 hane × okunabilir alfabe ≈ 60 bit (`readableCode`) — `wa_link_token` ile aynı ölçü. */
const TOKEN_LENGTH = 12;

/** Tekillik çakışmasında kaç kez yeniden üretilir — pratikte imkânsız, tekrar bir emniyet. */
const MAX_ATTEMPTS = 5;

const LOG = 'cart/link';

export type StartCartLinkOutcome =
  | { status: 'ok'; url: string; expiresAt: string }
  | { status: 'conversation_not_found' }
  /** Jeton üretilemedi (çakışma tekrarı tükendi) — arıza, sessiz geçmez. */
  | { status: 'unavailable' };

/**
 * Bağlantının dili — müşterinin tercihi, yoksa sitenin varsayılanı.
 *
 * Kimliksiz sohbette (Messenger/IG) tercih bilinmez; varsayılan dil sitenin ilk dilidir ve sayfa
 * açılınca müşteri dili kendisi değiştirebilir. Sohbetin dilinden çıkarım YAPILMIYOR: mesajın dili
 * kayıtlı bir alan değil ve tahmin, yanlış dilde açılan bir sayfadan pahalı değil ama daha iyi de değil.
 */
async function linkLocaleOf(db: Db, conversation: Conversation): Promise<Locale> {
  if (!conversation.customerId) return DEFAULT_LOCALE;
  const profile = await new UserProfileService(db).getById(conversation.customerId);
  const tercih = profile?.preferredLanguage;
  return tercih && (LOCALES as readonly string[]).includes(tercih) ? (tercih as Locale) : DEFAULT_LOCALE;
}

/** Bağlantının kendisi — sepet sayfası, müşterinin dilinde, jeton sorgu parametresinde. */
function cartLinkUrl(token: string, locale: Locale): string {
  return `${localizedUrl('/cart', locale)}?${CART_LINK_PARAM}=${token}`;
}

/**
 * **Bağlantı üret** — ajanın `sepet_baglantisi` aracının sunucu yarısı.
 *
 * Her çağrı YENİ jeton üretir ve sohbetin açık bağlantılarını kapatır (`expireOpen`): müşteri
 * "tekrar gönder" dediğinde eski bağlantı bir hafta daha geçerli kalmamalı. Kapatılan satır
 * silinmez — "kaç bağlantı üretildi, hangisi açıldı" sorusu sonradan da cevaplanır (0055).
 */
export async function startCartLink(db: Db, input: { conversationId: string }): Promise<StartCartLinkOutcome> {
  const conversation = await new ConversationService(db).getById(input.conversationId);
  if (!conversation) return { status: 'conversation_not_found' };

  const links = new CartLinkService(db);
  await links.expireOpen(conversation.id);
  const locale = await linkLocaleOf(db, conversation);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const token = readableCode(TOKEN_LENGTH);
    const expiresAt = new Date(Date.now() + CART_LINK_TTL_MS).toISOString();
    try {
      await links.insert({ token, conversationId: conversation.id, expiresAt });
      return { status: 'ok', url: cartLinkUrl(token, locale), expiresAt };
    } catch (err) {
      // Çakışma (23505) → yeniden dene. Başka hata gerçek bir arızadır, yukarı gider.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('23505') && !message.includes('cart_link_token_key')) throw err;
    }
  }

  // Jetonun KENDİSİ hiçbir hâlde log'a yazılmaz (CLAUDE §1) — kimlik yeter.
  logger.warn({ context: LOG, conversationId: conversation.id }, 'sepet bağlantısı üretilemedi (çakışma tekrarı tükendi)');
  return { status: 'unavailable' };
}

export type ClaimCartLinkOutcome =
  /**
   * Bağlantı geçersiz: süresi dolmuş, zaten açılmış, hiç var olmamış ya da sohbeti silinmiş.
   * **Hepsi tek cevap** ve bilinçli (`whatsapp-link` ile aynı karar): ayırmak, dışarıdan deneyene
   * "bu jeton vardı ama geç kaldın" demek, yani jetonun varlığını sızdırmak olurdu.
   */
  | { status: 'invalid' }
  /** Sohbet zaten bu hesabındı — yalnız sepet tazelendi (kalemler zaten onun sepetindeydi). */
  | { status: 'own'; customerId: string; movedItems: number }
  /** Kimliksiz sohbet (Messenger/IG) bu hesaba BAĞLANDI — kimlik köprüsü (15.22). */
  | { status: 'linked'; customerId: string; movedItems: number }
  /** WhatsApp taslağı hesaba BİRLEŞTİ ya da numara önceki kayıttan DEVRALINDI (`bindPhoneToAccount`). */
  | { status: 'merged' | 'transferred'; customerId: string; movedItems: number }
  /**
   * Sohbet operatörce BAŞKA bir gerçek hesaba bağlıydı ve bağlantıyı açan kişi farklı bir hesapla
   * girdi. İki gerçek kaydı birleştirmek ya da bağı kaydırmak insanın kararıdır (DOMAIN §10);
   * sepet yine de taşındı — kalemler bir niyettir, kimlik değil.
   */
  | { status: 'foreign_identity'; customerId: string; movedItems: number };

/**
 * **Bağlantıyı tüket** — giriş yapmış kişinin çerezden gelen jetonu (web `invite-handoff` kapısı).
 *
 * Sıra: jeton doğrula → TEK KULLANIM damgası (koşullu yazım, yarışın hakemi DB) → sepeti taşı →
 * kimliği bağla. Sepet kimlikten ÖNCE, çünkü birleşme hedefin sepeti varsa kaynağınkini siler
 * (dosya başındaki künye).
 */
export async function claimCartLink(db: Db, input: { token: string; customerId: string }): Promise<ClaimCartLinkOutcome> {
  const links = new CartLinkService(db);
  const link = await links.findByToken(input.token);
  if (!link || link.claimedAt || new Date(link.expiresAt).getTime() < Date.now()) return { status: 'invalid' };

  const conversation = await new ConversationService(db).getById(link.conversationId);
  if (!conversation) return { status: 'invalid' };

  // Damga ÖNCE: iki sekme aynı bağlantıyı aynı anda açarsa ikincisi burada düşer ve sepet iki kez
  // taşınmaz (adetler katlanmaz — `readCartAction`ın 29.07 dersi).
  if (!(await links.claim(link.id, input.customerId))) return { status: 'invalid' };

  if (!conversation.customerId) {
    const movedItems = await carryCart(db, conversation, input.customerId);
    // Kimliksiz sohbet → bu hesap. Kanıt operatörün değil SİSTEMİN doğruladığı jeton (yukarıda);
    // yazım yine koşullu (`updateIfNull`): bu sırada operatör bağladıysa dolu bağ ezilmez.
    const linked = await new ConversationService(db).linkCustomer(conversation.id, {
      customerId: input.customerId,
      linkedBy: null,
      proof: 'cart_link',
    });
    if (!linked) {
      logger.warn({ context: LOG, conversationId: conversation.id, customerId: input.customerId }, 'sepet bağlantısı: sohbet bu sırada başkasına bağlanmış');
      return { status: 'foreign_identity', customerId: input.customerId, movedItems };
    }
    logger.info({ context: LOG, conversationId: conversation.id, customerId: input.customerId }, 'sepet bağlantısı: kimliksiz sohbet hesaba bağlandı');
    return { status: 'linked', customerId: input.customerId, movedItems };
  }

  if (conversation.customerId === input.customerId) return { status: 'own', customerId: input.customerId, movedItems: 0 };

  if (conversation.source === 'whatsapp') {
    /* Sohbetin müşterisi taslak ya da gerçek kayıt; numara `external_ref`te. Sepet kimlikten ÖNCE
       taşınır (dosya başındaki sıra). Gerçek kayıttan DEVİR hâlinde o kaydın sepeti de taşınır ve
       bu bilinçli: 15.20 ajanın kalemlerini numaranın bağlı olduğu kayda yazıyor — yani sohbette
       kurulan sepet zaten o satırdaydı; devralan kişi hattı ŞU AN elinde tutuyor (DOMAIN §10, 26.08).
       Eski kaydın kendi sepeti yerinde kalır, buradan silinmez. */
    const movedItems = await carryCart(db, conversation, input.customerId);
    const bag = await bindPhoneToAccount(db, { accountId: input.customerId, phone: conversation.externalRef, context: LOG });
    if (bag.status === 'invalid') return { status: 'foreign_identity', customerId: input.customerId, movedItems };
    // `linked` burada "numara zaten bu hesaptaydı" demek — sohbetin müşterisi farklı olsa da kanal
    // bu hesabın; birleşme ile aynı sonuç, farklı yol. Çağırana tek sözcük yeter.
    return { status: bag.status === 'linked' ? 'merged' : bag.status, customerId: input.customerId, movedItems };
  }

  /* Messenger/IG sohbeti OPERATÖRCE başka bir hesaba bağlanmış, bağlantıyı açan kişi farklı bir
     hesapla girdi. Burada telefon kanıtı yok; iki gerçek kaydı birleştirmek ya da bağı kaydırmak
     insanın kararıdır (DOMAIN §10). Sepet de TAŞINMAZ: o sepet öteki hesabın satırı ve içinde
     sohbetten gelmeyen kalemler olabilir — bir hesabın sepetini başka hesaba kopyalamak, sızıntının
     kendisi. Müşteri sepetini boş görür, operatör kaydı görür. */
  logger.warn(
    { context: LOG, conversationId: conversation.id, customerId: input.customerId, holderId: conversation.customerId },
    'sepet bağlantısı: sohbet BAŞKA bir hesaba bağlı — kimlik kararı insana bırakıldı, sepet taşınmadı',
  );
  return { status: 'foreign_identity', customerId: input.customerId, movedItems: 0 };
}

/**
 * Sohbetin sepetini hesaba taşır — kaç kalem taşındığını döner.
 *
 * Kaynak, sohbetin sahibine göre: müşterili sohbette o müşterinin sepeti, kimliksizde sohbet sepeti.
 * Sohbet sepeti taşındıktan sonra SİLİNİR (sahipsiz satır kalmaz, 0055); müşteri sepeti kalır —
 * birleşmede RPC taşır/siler, devirde ise o sepet öteki hesabın malıdır ve buradan dokunulmaz.
 */
async function carryCart(db: Db, conversation: Conversation, customerId: string): Promise<number> {
  const carts = new CartService(db);
  const source = conversation.customerId ? await carts.get(conversation.customerId) : await carts.getFor({ conversationId: conversation.id });
  if (source.items.length === 0) return 0;

  await carts.takeOver(customerId, source.items.map(stripAddedAt));
  // Sohbetin İZİ hedef sepete geçer (15.23): bu sepetten çıkacak sipariş sohbetin kanalını taşır.
  await carts.stampChat({ customerId }, conversation.id);
  if (!conversation.customerId) await carts.clearFor({ conversationId: conversation.id });
  return source.items.length;
}

/** `addedAt` taşınmaz — devralan sepette ilk eklenme anı `takeOver`ın kendi kuralıyla doğar. */
function stripAddedAt(item: CartItem): Omit<CartItem, 'addedAt'> {
  return { variantId: item.variantId, bundleId: item.bundleId, qty: item.qty, unitPrice: item.unitPrice, stockId: item.stockId };
}
