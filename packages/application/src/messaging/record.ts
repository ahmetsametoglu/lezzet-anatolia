import { ConversationService, MessageService } from '@lezzet/database';
import { isAvoidableTemplate, serviceWindowExpiry, serviceWindowState } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import type { Message, MessageBody, MessageKind, TemplateCategory, TicketSender } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  MESAJ DEFTERİ KAPILARI — terfi 21.08 (kaynağı `apps/web/lib/messaging/conversation.ts`tı).

  Terfi tetiği paketin kendi ölçütü (index.ts: "en az iki yüzeyin çağırdığı orkestrasyon"): web'in
  sosyal gelen kutusu + Meta webhook'u zaten çağırıyordu, mobil operasyonun `/social` uçları da
  aynı deftere yazmak zorunda — `apps/mobile-api` web'den import edemez, kural ya kopyalanır
  (yasak) ya buraya çıkar. Konuşma AÇILIŞI (`openWhatsappConversation`) webde KALDI: kimlik
  çözümü (`findOrCreateCustomer`) web'in identity katmanında yaşıyor ve tek tüketicisi web
  (webhook + elle işleme); ikinci yüzey doğduğu gün o da terfi eder.

  Karar motorun (`serviceWindowExpiry` pencereyi, `isAvoidableTemplate` israfı), satır servisin
  (`MessageService`). Kapı taşıma bilmez: `db` çağırandan gelir (Next action `serviceDb()`, Hono
  ucu `serviceDb()` — hangi anahtarla bağlanılacağı yüzeyin kararıdır).
*/

export interface RecordMessageInput {
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
  /**
   * Kim yazdı (15.8). Verilmezse RPC yönden türetir (gelen → `customer`, giden → `admin`) ve bu
   * doğru varsayılandır: elle işlenen satırı gerçekten personel yazmıştır. **Özerk ajan kendini
   * `ai` diye bildirmek ZORUNDA** — yoksa defter "bunu kim söyledi" sorusuna personel der ve
   * ekranın AI tonu ile kuyruğun AI süzgeci sessizce yanlış kümeyi gösterir.
   */
  author?: TicketSender | null;
  /** Sağlayıcı mesaj kimliği; elle kayıtta yok, webhook'tan gelir (idempotency'nin son savunma hattı). */
  providerMessageId?: string | null;
}

/**
 * **Gelen mesaj** — servis penceresini AÇAN tek olay (ADR-005).
 *
 * `receivedAt` ZORUNLU ve varsayılanı YOK. Bir varsayılan ("şimdi") koymak ucuz görünür ama tam da
 * elle işlemede yanlış olur: admin sabah gelen bir DM'i öğlen işler, pencere ise müşteri yazdığında
 * başlamıştır. "Şimdi"den hesaplanan bitiş, Meta'nınkinden SAATLERCE geç olurdu — biz "serbest
 * metin gönderebilirim" derken sağlayıcı ya reddeder ya şablon ücretiyle geçer. Alan zorunlu
 * olunca çağıran düşünmek zorunda kalır; webhook yolunda zaten damga var, yani bedeli sıfır.
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
  });
}

/**
 * **Giden mesaj** — pencereye DOKUNMAZ, ama pencereye BAKAR.
 *
 * Pencereyi uzatmamasının gerekçesi motorda (`serviceWindowExpiry` künyesi). Bakmasının gerekçesi
 * ayrı ve maliyet nöbetidir: pencere açıkken **pazarlama** içeriği serbest metinle ücretsiz giderdi;
 * aynı şeyi şablonla göndermek bedava olana para ödemektir.
 *
 * Kararı motor veriyor (`isAvoidableTemplate`), burası değil — ve kestirme "pencere açıkken şablon =
 * israf" YANLIŞ olurdu: `utility` (sipariş onayı/kargo) pencere içinde zaten ücretsiz ve ADR-005
 * onu orada ÖNERİYOR. Düz kestirme, doğru davranışı uyarıyla cezalandırırdı.
 *
 * **Kayıt REDDEDİLMEZ, işaretlenir** ve bu ayrım defter evresinde kritik: mesaj zaten gönderilmiş
 * oluyor (operatör telefonundan yazıyor ya da echo düşüyor, biz deftere işliyoruz). Olmuş bir şeyi
 * kaydetmeyi reddetmek defteri yalancı yapardı — nöbetin işi gerçeği susturmak değil, görünür
 * kılmak. Gönderimi ENGELLEYEN kapı, gönderimin kendisi doğduğunda kurulur (15.11 · `packages/
 * notify` sürücüsü) ve kararı yine buradan (`serviceWindowState`) okur.
 *
 * Log'a yalnız kimlik yazılır (`CLAUDE §1`): hangi konuşma, hangi şablon, ne kadar süre boşa gitti —
 * mesajın içeriği değil.
 */
export async function recordOutboundMessage(
  db: SupabaseClient,
  input: RecordMessageInput & { templateName?: string | null; templateCategory?: TemplateCategory | null },
): Promise<Message> {
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
    author: input.author,
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
