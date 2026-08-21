import { ConversationService, MessageService, serviceDb } from '@lezzet/database';
import { isAvoidableTemplate, serviceWindowExpiry, serviceWindowState } from '@lezzet/domain-core';
import { normalizePhone } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { Conversation, Message, MessageBody, MessageKind, TemplateCategory, UserProfile } from '@lezzet/types';
import { findOrCreateCustomer } from '../identity/find-or-create';

/**
 * Mesajlaşma konuşma kapısı (15.1/15.2; üç kanal 21.08, ADR-006) — **motor ile servisi birleştiren
 * yer** (STACK §4).
 *
 * Karar motorun (`resolveIdentity` kimliği, `serviceWindowExpiry` pencereyi), satır servisin
 * (`ConversationService`/`MessageService`). İkisi birbirini bilmez; burada buluşurlar.
 *
 * `openWhatsappConversation` adı KANALINI söylüyor ve tek açılış kapısı bilerek bu: telefon
 * kimlik çözümü yalnız WhatsApp'ta mümkün (Messenger PSID'si ve Instagram IGSID'si telefon
 * taşımaz). Messenger/IG konuşmalarını webhook açacak (15.7) — o kapı, tüketicisiyle birlikte
 * doğar; bugün yazılsaydı çağıranı olmayan ölü kod olurdu. `recordInbound/OutboundMessage` ise
 * kanal-nötr: konuşma kimliği üzerinden çalışırlar.
 *
 * Adım 1'de bu kapıdan admin geçer: gelen DM'i elle işler. Adım 2'de aynı kapıdan webhook geçecek —
 * yani buradaki akış, canlı kanalın da akışıdır. Kapı iki tüketici için de aynı olmalı, yoksa
 * WhatsApp'tan gelen müşteri elle işlendiğinde başka, otomatik işlendiğinde başka davranırdı.
 *
 * ── BEKLEYEN(04.10): NUMARA DOĞRULANMIŞ DEĞİL ───────────────────────────────
 * Bu kapı `user_profiles.phone`'u kimlik anahtarı olarak okuyor, ama o kolon bugün serbest metinden
 * yazılabiliyor (hesap kartı + misafir checkout). Yani kayıtlı olmayan bir numara ÖNCEDEN
 * sahiplenilebilir ve gerçek sahibi WhatsApp'tan yazınca konuşması yabancı bir hesaba bağlanır.
 * Açığı bu dosya AÇMIYOR (yazma tarafında ve zaten açık), ama sonucunu buraya taşıyor. Kapatan iş
 * kimlik modülünde: `04.10` — e-posta çapası + güvenlik kodu.
 */

/**
 * Kimlik kurulamayan hâller sessizce geçilmez: çağıran akışı insana taşımalı.
 *
 * İhraç EDİLMİYOR (knip): tipin adını yazan bir tüketici yok — çağıran `openWhatsappConversation`
 * dönüşünden çıkarım yapıyor. Ekran yazıldığında adı gerekirse o gün ihraç edilir.
 */
type OpenConversationResult =
  | { status: 'ok'; conversation: Conversation; customer: UserProfile; customerCreated: boolean }
  /** Numara E.164'e çevrilemedi — kimlik anahtarı yok, konuşma bir kişiye bağlanamaz. */
  | { status: 'invalid_phone' }
  /**
   * Telefon ve e-posta AYRI müşterilere çıktı — sessizce seçim yapılmaz (DOMAIN §10). Konuşma
   * AÇILMAZ: yanlış hesaba bağlanmış bir sohbet, bağlanmamış bir sohbetten pahalıdır.
   */
  | { status: 'conflict'; profileIds: string[] };

interface OpenConversationInput {
  /** Ham numara — normalize burada yapılır, çağıran biçim bilmek zorunda değil. */
  phone: string;
  /** WhatsApp profil adı; yalnız YENİ kayıtta kullanılır, mevcut müşterinin adını ezmez. */
  name?: string | null;
  /** İkinci kimlik anahtarı — biliniyorsa (elle işlemede admin girebilir). */
  email?: string | null;
}

/**
 * **Numaradan konuşmaya** (15.2): müşteriyi bul-veya-oluştur, konuşmayı aç-ya-da-bul.
 *
 * Eşleşmeyen numara `is_draft` taslak müşteri açar (DOMAIN §10): WhatsApp'tan yazan yabancıdan
 * e-posta istemek, WhatsApp'ı seçme sebebimizi bozar — sürtünme kaybedecek bir şeyin olduğu ilk
 * anda konur, "merhaba" diyen kişide değil.
 *
 * **Aynı numara ikinci kez taslak AÇMAZ** ve bunu iki ayrı tekillik birden garantiliyor:
 * `user_profiles_phone_key` (kişi) ve `conversation_external_ref_key` (sohbet). Uygulama katmanı
 * unutsa bile veri katmanı ikinciyi reddeder.
 */
export async function openWhatsappConversation(input: OpenConversationInput): Promise<OpenConversationResult> {
  // Normalize BURADA, çünkü `external_ref` ile `user_profiles.phone` AYNI dizeyi taşımak zorunda:
  // biri normalize edilip öteki edilmezse aynı kişi iki anahtarla iki kez görünür.
  const phone = normalizePhone(input.phone);
  if (!phone) return { status: 'invalid_phone' };

  const identity = await findOrCreateCustomer({
    phone,
    email: input.email,
    name: input.name,
    // WhatsApp'tan otomatik açılan kayıt TASLAKTIR: doğrulanmış bir girişten geçmedi.
    asDraft: true,
  });

  if (identity.status === 'conflict') return { status: 'conflict', profileIds: identity.profileIds };
  // `insufficient` buraya düşemez (telefon zaten normalize edildi), ama tip daraltması için gerekli;
  // sessizce `ok` dönmek, kimliksiz bir konuşmayı kimlikli sanmak olurdu.
  if (identity.status === 'insufficient') return { status: 'invalid_phone' };

  const conversation = await new ConversationService(serviceDb()).open({
    source: 'whatsapp',
    externalRef: phone,
    customerId: identity.profile.id,
    // Profil adı konuşmaya da yazılır: müşteri kaydı silinse/bağlanmasa da sohbetin bir başlığı olur.
    profileName: input.name?.trim() || null,
  });

  return {
    status: 'ok',
    conversation,
    customer: identity.profile,
    customerCreated: identity.status === 'created',
  };
}

interface RecordMessageInput {
  conversationId: string;
  /**
   * Metin — `text` mesajının gövdesi; kart/medyada başlık ya da alt yazı olarak okunur.
   * `null` yalnız metin-dışı türlerde meşru (webhook'tan başlıksız medya gelir); `text` türünde
   * boş gövdeyi DB kısıtı zaten keser (`message_text_body`).
   */
  text: string | null;
  kind?: MessageKind;
  /**
   * Türe özgü ham yapı (15.9'un açık bıraktığı sözlük): kart/medya/konum webhook'tan geldiği
   * gibi saklanır — bugün uydurulmuş bir kolon kümesi, yarın bırakılacak bir kolon kümesi olurdu.
   */
  payload?: Record<string, unknown> | null;
  /** Sağlayıcı mesaj kimliği; elle kayıtta yok, webhook'tan gelir (idempotency'nin son savunma hattı). */
  providerMessageId?: string | null;
}

/**
 * **Gelen mesaj** — servis penceresini AÇAN tek olay (ADR-005).
 *
 * `receivedAt` ZORUNLU ve varsayılanı YOK. Bir varsayılan ("şimdi") koymak ucuz görünür ama tam da
 * adım 1'de yanlış olur: admin sabah gelen bir DM'i öğlen işler, pencere ise müşteri yazdığında
 * başlamıştır. "Şimdi"den hesaplanan bitiş, Meta'nınkinden SAATLERCE geç olurdu — biz "serbest
 * metin gönderebilirim" derken sağlayıcı ya reddeder ya şablon ücretiyle geçer. Alan zorunlu
 * olunca çağıran düşünmek zorunda kalır; webhook yolunda zaten damga var, yani bedeli sıfır.
 */
export async function recordInboundMessage(input: RecordMessageInput & { receivedAt: string }): Promise<Message> {
  return new MessageService(serviceDb()).record({
    conversationId: input.conversationId,
    direction: 'inbound',
    kind: input.kind ?? 'text',
    body: bodyOf(input.text, input.payload),
    providerMessageId: input.providerMessageId,
    windowExpiresAt: serviceWindowExpiry(input.receivedAt),
  });
}

/**
 * **Giden mesaj** — pencereye DOKUNMAZ, ama pencereye BAKAR.
 *
 * Pencereyi uzatmamasının gerekçesi yukarıda (`serviceWindowExpiry` künyesi). Bakmasının gerekçesi
 * ayrı ve maliyet nöbetidir: pencere açıkken **pazarlama** içeriği serbest metinle ücretsiz giderdi;
 * aynı şeyi şablonla göndermek bedava olana para ödemektir.
 *
 * Kararı motor veriyor (`isAvoidableTemplate`), burası değil — ve kestirme "pencere açıkken şablon =
 * israf" YANLIŞ olurdu: `utility` (sipariş onayı/kargo) pencere içinde zaten ücretsiz ve ADR-005
 * onu orada ÖNERİYOR. Düz kestirme, doğru davranışı uyarıyla cezalandırırdı.
 *
 * **Kayıt REDDEDİLMEZ, işaretlenir** ve bu ayrım adım 1'de kritik: burada mesaj zaten gönderilmiş
 * oluyor (admin telefonundan yazıyor, biz deftere işliyoruz). Olmuş bir şeyi kaydetmeyi reddetmek
 * defteri yalancı yapardı — nöbetin işi gerçeği susturmak değil, görünür kılmak. Gönderimi
 * ENGELLEYEN kapı, gönderimin kendisi doğduğunda kurulur (15.11 · `packages/notify` sürücüsü) ve
 * kararı yine buradan (`serviceWindowState`) okur.
 *
 * Log'a yalnız kimlik yazılır (`CLAUDE §1`): hangi konuşma, hangi şablon, ne kadar süre boşa gitti —
 * mesajın içeriği değil.
 */
export async function recordOutboundMessage(
  input: RecordMessageInput & { templateName?: string | null; templateCategory?: TemplateCategory | null },
): Promise<Message> {
  const db = serviceDb();
  const conversation = await new ConversationService(db).getById(input.conversationId);
  const pencere = serviceWindowState(conversation?.windowExpiresAt);

  // Kalıp mesaj (template) bir WhatsApp kavramı: Meta-onaylı şablon + ücret sınıfı. Messenger/IG
  // ücretsiz kanallardır, şablonları yoktur — yanlış kanala yazılan şablon maliyet raporunu sessizce
  // kirletirdi. RPC de aynı kuralı zorlar (kural veride durur); burası hatayı erken ve okunur kılar.
  if (input.templateName && conversation && conversation.source !== 'whatsapp') {
    throw new Error(`kalıp mesaj yalnız WhatsApp konuşmasına yazılabilir (kanal: ${conversation.source})`);
  }

  // İsraf nöbeti de yalnız WhatsApp'ındır: pencere/şablon ekonomisi orada yaşar.
  if (conversation?.source === 'whatsapp' && isAvoidableTemplate(input.templateCategory, pencere)) {
    logger.warn(
      {
        context: 'messaging/outbound',
        conversationId: input.conversationId,
        templateName: input.templateName,
        msRemaining: pencere.msRemaining,
      },
      'pencere AÇIKKEN pazarlama şablonu gönderildi — serbest metin ücretsizdi',
    );
  }

  return new MessageService(db).record({
    conversationId: input.conversationId,
    direction: 'outbound',
    kind: input.kind ?? (input.templateName ? 'template' : 'text'),
    body: bodyOf(input.text, input.payload),
    templateName: input.templateName,
    templateCategory: input.templateCategory,
    providerMessageId: input.providerMessageId,
  });
}

/** Gövde tek yerde kurulur: iki yön aynı şekli yazmak zorunda, yoksa okuyan taraf ikisini ayırt eder. */
function bodyOf(text: string | null, payload?: Record<string, unknown> | null): MessageBody {
  return payload ? { text, payload } : { text };
}
