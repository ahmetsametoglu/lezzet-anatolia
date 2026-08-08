import { ConversationService, MessageService, serviceDb } from '@lezzet/database';
import { serviceWindowExpiry } from '@lezzet/domain-core';
import { normalizePhone } from '@lezzet/helper';
import type { Conversation, Message, MessageBody, MessageKind, UserProfile } from '@lezzet/types';
import { findOrCreateCustomer } from '../identity/find-or-create';

/**
 * WhatsApp konuşma kapısı (15.1/15.2) — **motor ile servisi birleştiren yer** (STACK §4).
 *
 * Karar motorun (`resolveIdentity` kimliği, `serviceWindowExpiry` pencereyi), satır servisin
 * (`ConversationService`/`MessageService`). İkisi birbirini bilmez; burada buluşurlar.
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
    externalRef: phone,
    customerId: identity.profile.id,
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
  /** Metin — `text` mesajının gövdesi; kart/medyada başlık ya da alt yazı olarak okunur. */
  text: string;
  kind?: MessageKind;
  /** Sağlayıcı mesaj kimliği; adım 1'de yok (elle kayıt), adım 2'de webhook'tan gelir. */
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
    body: bodyOf(input.text),
    providerMessageId: input.providerMessageId,
    windowExpiresAt: serviceWindowExpiry(input.receivedAt),
  });
}

/**
 * **Giden mesaj** — pencereye DOKUNMAZ.
 *
 * Giden mesajın pencereyi uzatması zararsız görünür; sonucu ücretsiz süreyi kendi kendimize
 * uzatmaktır. Meta tarafında pencere kapanmıştır, gönderim ya reddedilir ya şablon ücretiyle
 * geçer — fatura sürpriz olur.
 */
export async function recordOutboundMessage(input: RecordMessageInput & { templateName?: string | null }): Promise<Message> {
  return new MessageService(serviceDb()).record({
    conversationId: input.conversationId,
    direction: 'outbound',
    kind: input.kind ?? (input.templateName ? 'template' : 'text'),
    body: bodyOf(input.text),
    templateName: input.templateName,
    providerMessageId: input.providerMessageId,
  });
}

/** Gövde tek yerde kurulur: iki yön aynı şekli yazmak zorunda, yoksa okuyan taraf ikisini ayırt eder. */
function bodyOf(text: string): MessageBody {
  return { text };
}
