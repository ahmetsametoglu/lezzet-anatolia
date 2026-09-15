import { ConversationService, MessageService } from '@lezzet/database';
import { isAvoidableTemplate, serviceWindowExpiry, serviceWindowState } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { Message, MessageBody, MessageKind, SourceLanguage, TemplateCategory, TicketSender, TranslationBag } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

// Defter kapıları pakette: web, webhook ve native uçlar aynı deftere yazar ve `apps/mobile-api` web'den import edemez. `db`
// çağırandan gelir, çünkü hangi anahtarla bağlanılacağı yüzeyin kararıdır.

export interface RecordMessageInput {
  conversationId: string;
  /** `null` yalnız metin dışı türlerde meşru; `text` türünde boş gövdeyi DB kısıtı keser. */
  text: string | null;
  kind?: MessageKind;
  /** Kart ve medya webhook'tan geldiği gibi saklanır: uydurulmuş kolon kümesi yarın bırakılacak bir küme olurdu. */
  payload?: Record<string, unknown> | null;
  /** Medya mesajında bile boş kalabilir: indirme düşse de satır yazılır, defterin ilk kuralı mesajın kaybolmamasıdır. */
  mediaKey?: string | null;
  mediaMime?: string | null;
  /** Çözülemezse boş kalır; transkript mesajın ön koşulu değildir. */
  mediaTranscript?: string | null;
  /**
   * Verilmezse RPC yönden türetir. Özerk ajan kendini `ai` diye bildirmek zorunda: yoksa ekranın AI tonu ve kuyruğun AI süzgeci
   * yanlış kümeyi gösterir.
   */
  author?: TicketSender | null;
  /** İdempotency'nin son savunma hattı. */
  providerMessageId?: string | null;
  /** Giden mesajda gönderim kapısı doldurur; gelen mesajda ve echo'da boş kalır, çeviri sonra koşar. */
  language?: SourceLanguage | null;
  translations?: TranslationBag | null;
  translatedAt?: string | null;
}

/**
 * `receivedAt` zorunlu ve varsayılansız: "şimdi"den hesaplanan bitiş, gecikmeli yazımda Meta'nınkinden saatlerce geç olur ve
 * gönderim reddedilir ya da kalıp ücretiyle geçerdi.
 */
export async function recordInboundMessage(
  db: SupabaseClient,
  input: RecordMessageInput & { receivedAt: string },
): Promise<Message> {
  return new MessageService(db).record({
    conversationId: input.conversationId,
    direction: 'inbound',
    kind: input.kind ?? 'text',
    body: bodyOf(input.text, input.payload),
    providerMessageId: input.providerMessageId,
    windowExpiresAt: serviceWindowExpiry(input.receivedAt),
    mediaKey: input.mediaKey,
    mediaMime: input.mediaMime,
    mediaTranscript: input.mediaTranscript,
    language: input.language,
    translations: input.translations,
    translatedAt: input.translatedAt,
  });
}

/**
 * Pencereye dokunmaz ama bakar: açık pencerede pazarlama kalıbı ücretsiz serbest metnin yerine para ödemektir (`utility` ise
 * pencere içinde ücretsiz, kararı motor verir). Kayıt reddedilmez, işaretlenir: mesaj zaten gitmiştir ve reddetmek defteri yalancı yapardı.
 */
export async function recordOutboundMessage(
  db: SupabaseClient,
  input: RecordMessageInput & { templateName?: string | null; templateCategory?: TemplateCategory | null },
): Promise<Message> {
  const conversation = await new ConversationService(db).getById(input.conversationId);
  const pencere = serviceWindowState(conversation?.windowExpiresAt);

  // Kalıp WhatsApp kavramıdır; RPC de reddeder, burası hatayı erken ve okunur kılar.
  if (input.templateName && conversation && conversation.source !== 'whatsapp') {
    throw new Error(`kalıp mesaj yalnız WhatsApp konuşmasına yazılabilir (kanal: ${conversation.source})`);
  }

  // İsraf nöbeti de yalnız WhatsApp'ındır: pencere ve kalıp ekonomisi orada yaşar.
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
    author: input.author,
    kind: input.kind ?? (input.templateName ? 'template' : 'text'),
    body: bodyOf(input.text, input.payload),
    templateName: input.templateName,
    templateCategory: input.templateCategory,
    providerMessageId: input.providerMessageId,
    language: input.language,
    translations: input.translations,
    translatedAt: input.translatedAt,
  });
}

/** İki yön aynı şekli yazmalı, yoksa okuyan taraf ikisini ayırt eder. */
function bodyOf(text: string | null, payload?: Record<string, unknown> | null): MessageBody {
  return payload ? { text, payload } : { text };
}
