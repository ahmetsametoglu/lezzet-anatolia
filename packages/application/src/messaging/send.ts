import type { SupabaseClient } from '@supabase/supabase-js';
import { ConversationService } from '@lezzet/database';
import { serviceWindowState } from '@lezzet/domain-core';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { ConversationSource, Message, MessageKind, TemplateCategory, TicketSender } from '@lezzet/types';
import { recordOutboundMessage } from './record';

/**
 * **GİDEN MESAJ KAPISI** (15.11 iskeleti) — gönderim ve defter yazımı TEK yerde.
 *
 * ── NEDEN TEK KAPI ──────────────────────────────────────────────────────────
 * İki ayrı çağrı bırakılsaydı (önce gönder, sonra ayrıca kaydet) iki yanlış hâl doğardı ve ikisi de
 * sessizdir: **gönderilmemiş bir mesajın deftere yazılması** (operatör müşteriye cevap verildiğini
 * sanır, müşteri bekler) ve **gönderilmiş bir mesajın deftere yazılmaması** (aynı cevap ikinci kez
 * yazılır). Kapı tek olunca ikisi de yapısal olarak imkânsızlaşır.
 *
 * ── SIRA: ÖNCE GÖNDER, SONRA YAZ ────────────────────────────────────────────
 * Tersi daha "güvenli" görünür (yaz, sonra gönder, düşerse geri al) ama değil: gönderim **geri
 * alınamaz** — müşteri mesajı okumuştur. Defter yazımı ise telafi edilebilir; elimizde sağlayıcı
 * mesaj kimliği vardır ve Messenger/IG'de echo webhook'u satırı zaten geri getirir.
 * Bu yüzden düşen defter yazımı `captureError`la GÜRÜLTÜ çıkarır, sessizce yutulmaz.
 *
 * ── SAĞLAYICI BİR PORTTUR, İSTEMCİ DEĞİL ────────────────────────────────────
 * Uygulama katmanı HTTP bilmez (`STACK §4`). `MessageSender` bir arayüzdür; Cloud API istemcisi onu
 * 15.11'in ikinci yarısında uygular, testler kendi sahtesini verir. Stripe'ın (`stripeClient`) ve
 * AI'ın (`AiTask`) aynı deseni.
 *
 * ── BUGÜN EKRANA BAĞLI DEĞİL VE BİLEREK ─────────────────────────────────────
 * Varsayılan sağlayıcı `unconfiguredSender`: her çağrıyı `not_configured` ile REDDEDER. Başarı
 * taklidi yapan bir sahte, bu dosyanın önlemek için yazıldığı arızanın ta kendisi olurdu — ekran
 * "gönderildi" der, mesaj hiçbir yere gitmez. Operasyon ekranının kutusu bu yüzden hâlâ DEFTER
 * kutusudur ve gerçek istemci gelene kadar öyle kalır.
 */

/** Kime ve hangi işletme hesabından — konuşmadan türer, çağıran uydurmaz. */
export interface SendTarget {
  source: ConversationSource;
  /** WhatsApp'ta E.164 telefon, Messenger/IG'de PSID/IGSID. */
  externalRef: string;
  /** WhatsApp'ta `phone_number_id`, Messenger/IG'de Sayfa kimliği. Yoksa gönderim yönlendirilemez. */
  accountRef: string | null;
}

export interface SendMessageInput {
  conversationId: string;
  text: string | null;
  kind?: MessageKind;
  payload?: Record<string, unknown> | null;
  /** Kim yazdı — özerk ajan `ai` geçer; boş bırakılırsa defter gideni personel sayar (`record.ts`). */
  author?: TicketSender | null;
  /** Dolu ise KALIP mesaj — yalnız WhatsApp, ve pencere kapalıyken tek gidebilen tür. */
  templateName?: string | null;
  templateCategory?: TemplateCategory | null;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; reason: string; retryable: boolean };

export interface MessageSender {
  /** Günlüğe yazılır — hangi sürücünün gönderdiği sonradan da sorulabilmeli. */
  readonly name: string;
  send(target: SendTarget, input: SendMessageInput): Promise<SendResult>;
}

/**
 * Yapılandırılmamış sağlayıcı — **varsayılan**. Her çağrıyı reddeder.
 *
 * Sessizce "başarılı" dönen bir sahte, gönderilmemiş mesajı deftere yazdırırdı. Reddetmek, gönderim
 * kanalı açılana kadar tek dürüst davranış.
 */
export const unconfiguredSender: MessageSender = {
  name: 'unconfigured',
  send: async () => ({ ok: false, reason: 'not_configured', retryable: false }),
};

export type SendOutcome =
  /**
   * Gönderildi. `message` **null OLABİLİR** ve bu bir kaçamak değil, gerçek bir hâlin adı: mesaj
   * gitti ama defter yazımı düştü. Tipin bunu söylemesi şart — `Message` diye yazıp boş dönmek,
   * okuyan tarafı olmayan bir satıra güvendirirdi.
   */
  | { status: 'sent'; message: Message | null; providerMessageId: string }
  | { status: 'refused'; reason: string }
  | { status: 'failed'; reason: string; retryable: boolean };

/**
 * Giden mesajı GÖNDER ve deftere yaz.
 *
 * Reddetme (`refused`) ile başarısızlık (`failed`) AYRI: ilki bizim kuralımızdır (pencere kapalı,
 * yanlış kanal) ve tekrar denemek anlamsızdır; ikincisi sağlayıcı tarafıdır ve `retryable` olabilir.
 * Tek kovaya atmak, çağıranı "yeniden dene" düğmesini yanlış yere koymaya iterdi.
 */
export async function sendOutboundMessage(
  db: SupabaseClient,
  sender: MessageSender,
  input: SendMessageInput,
): Promise<SendOutcome> {
  const conversation = await new ConversationService(db).getById(input.conversationId);
  if (!conversation) return { status: 'refused', reason: 'conversation_not_found' };

  // Kalıp mesaj bir WhatsApp kavramıdır (Meta-onaylı şablon + ücret sınıfı). Defter kapısı da aynı
  // kuralı taşıyor ama orada FIRLATIR; burada gönderimden ÖNCE reddediyoruz — sağlayıcıya boşuna
  // gitmek hem tur hem (yanlış kabul edilirse) para demektir.
  if (input.templateName && conversation.source !== 'whatsapp') {
    return { status: 'refused', reason: 'template_wrong_channel' };
  }

  /*
    PENCERE KURALI — bu kapının en pahalı kararı.

    Serbest metin ancak 24 saatlik servis penceresi AÇIKKEN gidebilir; üç kanalda da böyle. Pencere
    kapalıyken:
      · WhatsApp    → yalnız onaylı KALIP mesaj (ücretli)
      · Messenger/IG → "insan-temsilci" etiketiyle 7 güne kadar (ücretsiz) — BEKLEYEN(15.11)

    İkinci yol henüz yazılmadı, o yüzden bugün kapalı pencerede Messenger/IG'ye serbest metin
    REDDEDİLİYOR. Reddetmek, sağlayıcının reddedeceği bir isteği göndermekten iyidir: burada sebep
    okunur, orada ham hata kodu.
  */
  const pencere = serviceWindowState(conversation.windowExpiresAt);
  if (!input.templateName && !pencere.open) {
    return { status: 'refused', reason: pencere.everOpened ? 'window_closed' : 'window_never_opened' };
  }

  if (!conversation.providerAccountRef) {
    // Hangi işletme hesabından gideceği bilinmiyor: elle işlenmiş eski satırlarda bu alan boştur.
    return { status: 'refused', reason: 'account_ref_missing' };
  }

  const target: SendTarget = {
    source: conversation.source,
    externalRef: conversation.externalRef,
    accountRef: conversation.providerAccountRef,
  };

  const result = await sender.send(target, input);
  if (!result.ok) {
    logger.warn(
      { context: 'messaging/send', conversationId: conversation.id, driver: sender.name, reason: result.reason },
      'giden mesaj gönderilemedi — deftere YAZILMADI',
    );
    return { status: 'failed', reason: result.reason, retryable: result.retryable };
  }

  try {
    const message = await recordOutboundMessage(db, { ...input, providerMessageId: result.providerMessageId });
    return { status: 'sent', message, providerMessageId: result.providerMessageId };
  } catch (err) {
    /*
      Mesaj GİTTİ ama deftere yazılamadı — geri alınamaz bir olayın kaydı düştü. Sessiz kalmak, aynı
      cevabın ikinci kez yazılmasına yol açar. `captureError` hem stdout'a hem `error_log`'a yazar
      ve fırlatmaz; çağıran "gitti" bilgisini KAYBETMEMELİ, o yüzden `sent` dönüyoruz.
    */
    await captureError(err, {
      source: SOURCES.webServer,
      context: {
        area: 'messaging/send',
        conversationId: conversation.id,
        providerMessageId: result.providerMessageId,
        note: 'mesaj gönderildi ama deftere yazılamadı',
      },
    });
    // `sent` dönüyoruz: gönderim GERÇEKLEŞTİ ve çağıran bunu kaybetmemeli. `message: null` eksiği
    // söylüyor; çağıran isterse telafi eder (yeniden yazma değil, İZ bırakma).
    return { status: 'sent', message: null, providerMessageId: result.providerMessageId };
  }
}
