import { createHmac, timingSafeEqual } from 'node:crypto';
import { answerEmailAnchor, offerAnchorIfDue, verifySecurityCode } from '../customer/anchor';
import { buttonReplyText, CART_ADD_PREFIX } from '../catalog/product-card';
import { consumeChatLink } from '../customer/chat-link';
import { consumeWhatsappLink, waLinkTokenIn } from '../customer/whatsapp-link';
import { ringConversationBell, ringConversationsBell } from '../realtime/bell';
import { metaSenderFromEnv } from './meta-sender';
import { storeConversationMedia, storeConversationMediaFromUrl, type MessengerAttachmentType } from './meta-media';
import { transcribeConversationAudio } from './voice';
import { recordInboundMessage, recordOutboundMessage } from './record';
import { sendOutboundMessage } from './send';
import { ConversationService, CustomerPhoneService, MessageService, WebhookEventService, serviceDb } from '@lezzet/database';
import { maskSecretsInText, sixDigitCodeIn } from '@lezzet/domain-core';
import { normalizePhone } from '@lezzet/helper';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { Conversation, ConversationSource, Message, MessageKind, PreferredLanguage } from '@lezzet/types';
import { resolveOutboundLanguage, translateConversationMessageNow } from './translate';
import { defaultConversationHandler } from './default-handler';
import { findOrCreateCustomer } from '../customer/find-or-create';
import { fetchMetaProfileName } from './meta-profile';
import { runAutonomousConversationReply } from '../ticket/ai';
import { displayName, variantNames } from '../warehouse/names';
import type { TicketHandler } from '@lezzet/types';

/**
 * Ses çözümü, çeviri ve ajan webhook'un dışında koşar: olay yazımdan önce sahiplenildiği için istek zaman aşımına uğrarsa Meta'nın
 * tekrarı "zaten alındı" diye atlanır ve mesaj kaybolurdu. Sıra sabit: ajan transkripti görmeden koşarsa "duyamıyorum" deyip
 * devreder, çeviri ajandan önce gelir ki devirde operatör sohbeti Türkçesiyle açsın.
 */
function triggerInboundPipeline(input: {
  message: Message;
  conversation: Conversation;
  media: { key: string; mime: string } | null;
}): void {
  void (async () => {
    // Sohbet ekranı kendi zilini dinler ve zil iki kez çalınır: mesaj düştüğü an görünmeli, transkript ve çeviri saniyeler
    // sonra gelince ekran yeniden okumalı.
    await ringConversationBell(input.conversation.id);

    let mesaj = input.message;
    if (input.media?.mime.startsWith('audio/')) {
      const metin = await transcribeConversationAudio(input.media.key, input.media.mime, {
        conversationId: input.conversation.id,
      });
      // Çözülemese de zincir sürer: "duyamıyorum, bir arkadaşım dinleyecek" da müşteriyi sessiz bırakmayan bir cevaptır.
      if (metin) mesaj = (await new MessageService(serviceDb()).setTranscript(mesaj.id, metin)) ?? mesaj;
    }
    await translateConversationMessageNow(serviceDb(), mesaj);
    // İkinci zil: transkript ve çeviri artık satırda.
    await ringConversationBell(input.conversation.id);
    triggerAutonomousReply(input.conversation.id, input.conversation.handledBy);
  })().catch((err: unknown) =>
    captureError(err, {
      source: SOURCES.webhook,
      context: { area: 'messaging/inbound-pipeline', conversationId: input.conversation.id },
    }),
  );
}

/**
 * Cevap beklenmez: model çağrısı saniyeler sürer, açık kalan isteği Meta başarısız sayıp olayı yeniden gönderir ve her tekrar
 * yeni bir model çağrısı doğururdu. Çift cevap koruması `runAutonomousConversationReply`in kendi kilidindedir.
 */
function triggerAutonomousReply(conversationId: string, handledBy: TicketHandler): void {
  if (handledBy !== 'ai') return;
  void runAutonomousConversationReply(serviceDb(), metaSenderFromEnv(), conversationId).catch(
    (err: unknown) =>
      captureError(err, {
        source: SOURCES.webhook,
        context: { area: 'messaging/autonomous-trigger', conversationId },
      }),
  );
}

/**
 * Sistem mesajı olduğu için elle üç dilde: makine çevirisi her seferinde bir model turu ödeyip aynı cümlenin varyantlarını
 * üretirdi. Kısa tutulur: hangi hesap, hangi numara sohbete taşınmaz.
 */
const LINK_CONFIRMATION: Record<PreferredLanguage, string> = {
  tr: 'Numaranız hesabınıza bağlandı — buradan siparişlerinizi sorabilirsiniz. Nasıl yardımcı olabiliriz?',
  fr: 'Votre numéro est désormais lié à votre compte — vous pouvez suivre vos commandes ici. Comment pouvons-nous vous aider ?',
  de: 'Ihre Nummer ist jetzt mit Ihrem Konto verknüpft — Sie können Ihre Bestellungen hier verfolgen. Wie können wir helfen?',
};

/** Messenger/Instagram'da bağlanan şey numara değil sohbettir; cümle onu söyler. */
const CHAT_LINK_CONFIRMATION: Record<PreferredLanguage, string> = {
  tr: 'Bu sohbet hesabınıza bağlandı — buradan siparişlerinizi sorabilirsiniz. Nasıl yardımcı olabiliriz?',
  fr: 'Cette conversation est désormais liée à votre compte — vous pouvez suivre vos commandes ici. Comment pouvons-nous vous aider ?',
  de: 'Dieser Chat ist jetzt mit Ihrem Konto verknüpft — Sie können Ihre Bestellungen hier verfolgen. Wie können wir helfen?',
};

async function bagalamaOnayiGonder(
  conversation: Pick<Conversation, 'id' | 'language'>,
  customerId: string | null,
  confirmation: Record<PreferredLanguage, string> = LINK_CONFIRMATION,
): Promise<void> {
  const db = serviceDb();
  // Bağ az önce kuruldu: `conversation.customerId` bayat, taze kimlik parametreden.
  const { language: dil } = await resolveOutboundLanguage(db, { language: conversation.language, customerId });
  const sonuc = await sendOutboundMessage(db, metaSenderFromEnv(), {
    conversationId: conversation.id,
    text: confirmation[dil],
    author: 'admin',
    language: dil,
  });
  // Onay gitmezse bağ yine geçerlidir, yalnız müşteri bilmez; iz bırakılır ki bu hâl teşhis edilebilsin.
  if (sonuc.status !== 'sent') {
    logger.warn({ context: 'messaging/link-confirm', conversationId: conversation.id, outcome: sonuc.status }, 'bağlama onayı gönderilemedi');
  }
}

/** Yoksa uç 503 döner: doğrulanamayan gövde işlenmez. */
export function metaAppSecret(): string | null {
  return process.env.META_APP_SECRET ?? null;
}

/** Kurulum el sıkışmasının bizim uydurduğumuz dizesi; Meta paneline aynısı yazılır. */
export function metaVerifyToken(): string | null {
  return process.env.META_WEBHOOK_VERIFY_TOKEN ?? null;
}

/**
 * `timingSafeEqual` şart: düz karşılaştırma imzayı bayt bayt tahmin etmeye açık bir zaman kanalı bırakır. Kimlik kurgusunun
 * temeli budur: "mesaj şu numaradan geldi" beyanına ancak imza doğruysa güvenilir.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}

// Meta gövdesi zod'a dökülmez: sağlayıcı alan ekledikçe kendi kapımızı kırardık; tanınmayan yapı işlenmez ve loglanır.

interface WaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } } & Record<string, unknown>;
  button?: { text?: string; payload?: string };
  [key: string]: unknown;
}

interface MessengerEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
    quick_reply?: { payload?: string };
    [key: string]: unknown;
  };
  postback?: { title?: string; payload?: string; [key: string]: unknown };
  reaction?: { reaction?: string; emoji?: string; action?: string; mid?: string; [key: string]: unknown };
  [key: string]: unknown;
}

type MetaWebhookOutcome =
  | { status: 'ok'; written: number; duplicates: number; ignored: number }
  | { status: 'error'; error: string };

interface Tally {
  written: number;
  duplicates: number;
  ignored: number;
  errors: number;
}

export interface MetaWebhookOptions {
  /** Testler sahte geçerek kapıyı ağdan koparır; üretimde küresel `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Üç kanal tek kapıda: Meta üç aboneliği aynı adrese yollar ve tepe `object` kanalı söyler. Tek mesajın yazımı düşerse kabuk
 * 500 döner ve Meta'nın tekrarında yazılmışlar `duplicate` atlanır; tanınmayan olay tipi hata değildir, sayılıp 200 geçilir.
 */
export async function handleMetaWebhook(
  body: unknown,
  opts: MetaWebhookOptions = {},
): Promise<MetaWebhookOutcome> {
  const root = body as { object?: string; entry?: unknown[] } | null;
  if (!root?.object || !Array.isArray(root.entry)) {
    logger.warn({ object: root?.object ?? null }, 'meta webhook: tanınmayan gövde yapısı — işlenmedi');
    return { status: 'ok', written: 0, duplicates: 0, ignored: 1 };
  }

  const tally: Tally = { written: 0, duplicates: 0, ignored: 0, errors: 0 };

  for (const entry of root.entry) {
    if (root.object === 'whatsapp_business_account') {
      await ingestWhatsappEntry(entry as Record<string, unknown>, tally, opts.fetchImpl);
    } else if (root.object === 'page' || root.object === 'instagram') {
      await ingestMessengerEntry(
        root.object === 'page' ? 'messenger' : 'instagram',
        entry as Record<string, unknown>,
        tally,
        opts.fetchImpl,
      );
    } else {
      tally.ignored += 1;
      logger.warn({ object: root.object }, 'meta webhook: abone olunmamış obje — yok sayıldı');
    }
  }

  // Zil tek kez ve yalnız yazım olduysa: ekran sunucudan okur, yük taşınmaz; zil düşerse kayıt düşmez.
  if (tally.written > 0) await ringConversationsBell();

  if (tally.errors > 0) return { status: 'error', error: `${tally.errors} olay işlenemedi (webhook_event.error)` };
  return { status: 'ok', written: tally.written, duplicates: tally.duplicates, ignored: tally.ignored };
}

async function ingestWhatsappEntry(entry: Record<string, unknown>, tally: Tally, fetchImpl?: typeof fetch): Promise<void> {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  for (const change of changes as { field?: string; value?: Record<string, unknown> }[]) {
    // `messages` alanı hem gelen mesajları hem giden `statuses`'ı taşır.
    if (change.field !== 'messages' || !change.value) {
      tally.ignored += 1;
      continue;
    }
    const value = change.value;

    // Taşıyıcının `failed` beyanı kimlik şüphesinin erken tetiğidir; ölçülmezse motorun o dalı hiç çalışmaz.
    await tasiyiciBeyani(value);

    const messages = Array.isArray(value.messages) ? (value.messages as WaMessage[]) : [];
    if (messages.length === 0) {
      tally.ignored += 1; // yalnız statuses taşıyan teslimat
      continue;
    }

    const contacts = Array.isArray(value.contacts) ? (value.contacts as { wa_id?: string; profile?: { name?: string } }[]) : [];
    const phoneNumberId = (value.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ?? null;

    for (const message of messages) {
      if (!message.id || !message.from) {
        tally.ignored += 1;
        continue;
      }
      // Tepki bir mesaj değil, mesaja düşülmüş bir işarettir: defter satırı açmaz.
      if (message.type === 'reaction') {
        tally.ignored += 1;
        continue;
      }
      await ingestOne(tally, {
        provider: 'meta',
        eventId: message.id,
        type: `whatsapp.${message.type ?? 'unknown'}`,
        payload: message as Record<string, unknown>,
        write: async () => {
          // wa_id `+`sız gelir; doğrudan normalize etmek çift ülke kodu üretirdi.
          const phone = normalizePhone(`+${message.from}`) ?? `+${message.from}`;
          const profileName = contacts.find((c) => c.wa_id === message.from)?.profile?.name?.trim() || null;
          const { kind, text, payload } = await waBodyOf(message);

          // Önce bağlama jetonu, sonra kimlik çözümü: çözüm önce koşarsa tanımadığı numaraya taslak açar ve jeton o taslağa bakardı.
          let customerId: string | null = null;
          const bag = await consumeWhatsappLink(serviceDb(), phone, text);
          // `transferred` de bağlıdır: numara önceki kayıttan alınıp bu hesaba verildi, eski kaydın geçmişi yerinde kalır.
          const bagliMi = bag.status === 'linked' || bag.status === 'merged' || bag.status === 'transferred';
          if (bagliMi) customerId = bag.customerId;

          // `phoneProven` yalnız burada doğru ve dayanağı imza doğrulamasıdır: bu gövdeyi Meta imzaladı, "şu numaradan mesaj geldi"
          // beyan değil kanıttır. Kimlik çözülemezse konuşma kimliksiz açılır ve mesaj yine yazılır.
          if (!customerId) {
            const identity = await findOrCreateCustomer({ phone, phoneProven: true, name: profileName, asDraft: true });
            if (identity.status === 'conflict') {
              logger.warn({ conversationRef: phone.slice(-4), profileIds: identity.profileIds }, 'meta webhook: kimlik çakışması — konuşma kimliksiz açıldı');
            } else if (identity.status !== 'insufficient') {
              customerId = identity.profile.id;
            }
          }

          // Çapa cevabı kimlik çözümünden sonra: jeton kimliği kurar, çapa cevabı kimliği varsayar. Kapı yalnız bekleyen bir soru
          // varken iş yapar, çünkü altı haneli sayı gelen mesajlarda boldur.
          const kimlikSirri = customerId ? await cevabiIsle(phone, text) : null;

          const conversation = await new ConversationService(serviceDb()).open({
            source: 'whatsapp',
            externalRef: phone,
            customerId,
            providerAccountRef: phoneNumberId,
            profileName,
            // Yalnız yeni sohbete uygulanır, RPC çakışmada dokunmaz.
            handledBy: await defaultConversationHandler(serviceDb()),
          });

          // Medya indirilemezse `null` döner ve satır medyasız yazılır: indirme mesajın ön koşulu değildir.
          const mediaId = kind === 'media' ? waMediaIdOf(payload) : null;
          const medya = mediaId
            ? await storeConversationMedia(conversation.id, mediaId, process.env.META_ACCESS_TOKEN ?? null, fetchImpl)
            : null;

          // Sır deftere düz yazılmaz: bağlama jetonu hesap devralmaya, güvenlik kodu aylarca geçerli bir sırra açılır ve defter
          // kalıcıdır. Maskeleme yazımdan önce, çünkü düz yazılan satır anında ekranlara da düşer.
          const yazilan = await recordInboundMessage(serviceDb(), {
            conversationId: conversation.id,
            text: maskSecretsInText(text, [waLinkTokenIn(text), kimlikSirri]),
            kind,
            payload,
            mediaKey: medya?.key ?? null,
            mediaMime: medya?.mime ?? null,
            providerMessageId: message.id,
            // Pencere mesajın kendi anından başlar: gecikmeli webhook'ta "şimdi" Meta'nın penceresinden geç biter ve kalıp ücreti ödetirdi.
            receivedAt: waTimestamp(message.timestamp),
          });

          // Güvenlik kodu burada gider, çünkü gelen mesaj 24 saatlik ücretsiz pencereyi tanımı gereği açar. Mesaj kaydından sonra:
          // kod bir cevaptır.
          if (customerId) {
            await offerAnchorIfDue(serviceDb(), metaSenderFromEnv(), {
              conversationId: conversation.id,
              customerId,
            });
          }

          // Bağlama başarısını sistem söyler ve ajan tetiklenmez: ajan anlamadığı mesajı devredip başarılı işlemi insana düşürürdü.
          if (bagliMi) {
            await bagalamaOnayiGonder(conversation, customerId);
            return;
          }

          triggerInboundPipeline({ message: yazilan, conversation, media: medya });
        },
      });
    }
  }
}

/** Gövde dar, çünkü okunan tek şey ulaşılıp ulaşılmadığı. */
interface WaStatus {
  status?: string;
  recipient_id?: string;
}

/**
 * `failed` tahmin değil beyandır ve kimlik şüphesinin erken tetiğidir; `delivered`/`read` damgayı siler. Belirsiz durumlar
 * (`sent`, okunmamış teslim) yazılmaz: ağ gecikmesi ile terk edilmiş hat aynı görünür.
 */
async function tasiyiciBeyani(value: Record<string, unknown>): Promise<void> {
  const statuses = Array.isArray(value.statuses) ? (value.statuses as WaStatus[]) : [];
  const phones = new CustomerPhoneService(serviceDb());

  for (const status of statuses) {
    if (!status.recipient_id) continue;
    const basarisiz = status.status === 'failed';
    if (!basarisiz && status.status !== 'delivered' && status.status !== 'read') continue;

    // wa_id `+`sız gelir: kanıt satırıyla aynı normalize.
    const phone = normalizePhone(`+${status.recipient_id}`) ?? `+${status.recipient_id}`;
    const row = await phones.markDelivery(phone, basarisiz);
    if (row && basarisiz) {
      logger.info({ conversationRef: phone.slice(-4), customerId: row.customerId }, 'kimlik: taşıyıcı ulaşamadı — erken tetik damgalandı');
    }
  }
}

/**
 * Önce bekleyen e-posta çapası (tek seferlik soru), sonra güvenlik kodu: ters sırada bekleyen bağlama varken gelen doğru kod sayaç
 * yakardı. Dönen sır maskeleme içindir ve yalnız gerçek denemede dolar: her altı haneyi maskelemek defteri okunmaz yapardı.
 */
async function cevabiIsle(phone: string, text: string | null): Promise<string | null> {
  const capa = await answerEmailAnchor(serviceDb(), phone, text);
  if (capa.status !== 'none' && capa.status !== 'not_pending') {
    // Kodun kendisi hiçbir hâlde loglanmaz; kimlik ve sonuç yeter.
    logger.info({ conversationRef: phone.slice(-4), outcome: capa.status }, 'çapa: e-posta bağlama cevabı işlendi');
    return sixDigitCodeIn(text);
  }

  const kod = await verifySecurityCode(serviceDb(), phone, text);
  if (kod.status !== 'none' && kod.status !== 'no_code') {
    logger.info({ conversationRef: phone.slice(-4), outcome: kod.status }, 'çapa: güvenlik kodu denendi');
    return sixDigitCodeIn(text);
  }
  return null;
}

/**
 * Çoklu ekte ilki alınır: defterde tek medya alanı var, ham liste `payload.attachments`ta durur. Bağlantı önizlemesi ve şablon
 * dosya değildir, atlanır.
 */
function messengerAttachmentOf(attachments: unknown[] | undefined): { type: MessengerAttachmentType; url: string } | null {
  if (!Array.isArray(attachments)) return null;
  for (const raw of attachments) {
    const ek = raw as { type?: unknown; payload?: { url?: unknown } } | null;
    const type = ek?.type;
    const url = ek?.payload?.url;
    if ((type === 'audio' || type === 'image' || type === 'video' || type === 'file') && typeof url === 'string' && url) {
      return { type, url };
    }
  }
  return null;
}

/** Messenger'ın üç boydaki beğeni çıkartması; metin karşılığı `👍`, çünkü ajan beğeniyi cevap olarak okur. */
const LIKE_STICKER_IDS = new Set(['369239263222822', '369239343222814', '369239383222810']);
/** Ajan "bir şey gönderdi, onay olabilir" diye okur, fotoğraf sanmaz. */
const OTHER_STICKER_TEXT = '[çıkartma]';

function messengerStickerOf(attachments: unknown[] | undefined): string | null {
  if (!Array.isArray(attachments)) return null;
  for (const raw of attachments) {
    const ek = raw as { payload?: { sticker_id?: unknown } } | null;
    const id = ek?.payload?.sticker_id;
    if (id === undefined || id === null) continue;
    return LIKE_STICKER_IDS.has(String(id)) ? '👍' : OTHER_STICKER_TEXT;
  }
  return null;
}

/** Bozuk kimlikle veri okunmaz: uuid kolonuna düz metin sorgusu hata verirdi. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tek boylu ürünün düğmesi yalnız "Sepete ekle" yazar; ürün kimlikte olduğu için ad veriden çözülür. Çözülemezse düğme başlığına
 * düşer ve iz log'da kalır, mesaj kaybolmaz.
 */
async function buttonChoiceText(id: string | null | undefined, title: string | null | undefined): Promise<string | null> {
  const variantId = id?.startsWith(CART_ADD_PREFIX) ? id.slice(CART_ADD_PREFIX.length) : null;
  if (!variantId || !UUID.test(variantId)) return buttonReplyText(id, title);
  try {
    const ad = (await variantNames(serviceDb(), [variantId])).get(variantId);
    return buttonReplyText(id, title, ad ? displayName(ad) : null);
  } catch (err) {
    logger.warn(
      { context: 'messaging/meta-webhook', variantId, err: err instanceof Error ? err.message : String(err) },
      'düğmenin boyu çözülemedi — başlığıyla yazılıyor',
    );
    return buttonReplyText(id, title);
  }
}

/** Tanınmayan tip payload'ıyla `media` kovasına düşer, kaybolmaz. */
async function waBodyOf(message: WaMessage): Promise<{ kind: MessageKind; text: string | null; payload: Record<string, unknown> | null }> {
  if (message.type === 'text') return { kind: 'text', text: message.text?.body ?? '', payload: null };
  if (message.type === 'interactive') {
    // `sepete_ekle:` önekli kimlikte metin ürün adıyla kurulur ki ajan hangi kalemi eklediğini bilsin.
    const secim = message.interactive?.button_reply ?? message.interactive?.list_reply;
    return { kind: 'interactive', text: await buttonChoiceText(secim?.id, secim?.title), payload: { interactive: message.interactive ?? null } };
  }
  // Karusel düğmesi `button_reply` değil `type: "button"` olarak gelir; yalnız başlık yazılsaydı ajan ürünü göremezdi.
  if (message.type === 'button') {
    return { kind: 'interactive', text: await buttonChoiceText(message.button?.payload, message.button?.text), payload: { button: message.button ?? null } };
  }
  const media = message.type ? (message[message.type] as { caption?: string } | undefined) : undefined;
  return { kind: 'media', text: media?.caption?.trim() || null, payload: { type: message.type ?? 'unknown', body: media ?? null } };
}

/**
 * Sağlayıcı biçimini bilen tek yer: ham gövdeyi indirme kapısına geçirmek biçimi ikinci bir dosyaya sızdırırdı. `null` ise
 * indirme denenmez, mesaj yine yazılır.
 */
function waMediaIdOf(payload: Record<string, unknown> | null): string | null {
  const body = payload?.body as { id?: unknown } | null | undefined;
  return typeof body?.id === 'string' && body.id.trim() ? body.id : null;
}

/** Saniye cinsinden (Messenger/Instagram milisaniye); karıştırmak pencereyi 1970'e kurar. */
function waTimestamp(timestamp: string | undefined): string {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

/**
 * Ad ayrı bir Graph çağrısıyla gelir, çünkü webhook taşımaz; yalnız ad boşken, konuşma başına bir kez. Çağrı düşerse konuşma
 * adsız kalır, mesaj yine yazılır.
 */
async function openSocialConversation(
  source: ConversationSource,
  personId: string,
  accountRef: string | null,
  fetchImpl?: typeof fetch,
) {
  const service = new ConversationService(serviceDb());
  const conversation = await service.open({
    source,
    externalRef: personId,
    // PSID/IGSID telefon taşımaz: kimlik çözümü denenmez, konuşma kimliksiz doğar.
    customerId: null,
    providerAccountRef: accountRef,
    // Webhook ad taşımaz; aşağıda Graph'tan çekilir.
    profileName: null,
    // Yalnız yeni sohbete uygulanır.
    handledBy: await defaultConversationHandler(serviceDb()),
  });
  if (conversation.profileName) return conversation;

  const name = await fetchMetaProfileName(source, personId, fetchImpl);
  if (!name) return conversation;
  // `setProfileName` de yalnız boşsa yazar: aynı anda düşen iki mesajdan ikincisi ezmez.
  return (await service.setProfileName(conversation.id, name)) ?? conversation;
}

async function ingestMessengerEntry(
  source: ConversationSource,
  entry: Record<string, unknown>,
  tally: Tally,
  fetchImpl?: typeof fetch,
): Promise<void> {
  // Sayfa ya da Instagram hesabı: cevabın hangi hesaptan gideceği.
  const accountRef = typeof entry.id === 'string' ? entry.id : null;
  const events = Array.isArray(entry.messaging) ? (entry.messaging as MessengerEvent[]) : [];
  if (events.length === 0) {
    tally.ignored += 1; // standby / bilinmeyen zarf
    return;
  }

  for (const event of events) {
    if (event.message?.mid) {
      const echo = event.message.is_echo === true;
      // Echo'da sender sayfadır, kişi recipient'tadır: ters okumak iki kişiyi tek sohbette birleştirir.
      const personId = echo ? event.recipient?.id : event.sender?.id;
      if (!personId) {
        tally.ignored += 1;
        continue;
      }
      const message = event.message;
      await ingestOne(tally, {
        provider: 'meta',
        eventId: message.mid as string,
        type: `${source}.${echo ? 'echo' : 'message'}`,
        payload: message as Record<string, unknown>,
        write: async () => {
          const conversation = await openSocialConversation(source, personId, accountRef, fetchImpl);

          const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
          // Beğeni çıkartması metindir: fotoğraf sanılsaydı ajan "göremiyorum" deyip devrederdi, oysa müşteri öneriyi onaylamıştır.
          const sticker = messengerStickerOf(message.attachments);
          const text = typeof message.text === 'string' && message.text.trim() ? message.text : sticker;
          const kind: MessageKind = text ? 'text' : 'media';
          const payload = hasAttachments || message.quick_reply
            ? { attachments: message.attachments ?? null, quickReply: message.quick_reply ?? null }
            : null;

          if (echo) {
            // Sayfadan giden cevap (Business Suite, telefon): defter kendiliğinden dolar, pencereye dokunmaz.
            await recordOutboundMessage(serviceDb(), { conversationId: conversation.id, text, kind, payload, providerMessageId: message.mid });
          } else {
            // Kod kaydı düşmeden önce tüketilir; bağ kurulursa ajan tetiklenmez, başarıyı sistem söyler.
            const bag = await consumeChatLink(serviceDb(), conversation, text);
            // Ek CDN adresinden indirilir; düşerse satır medyasız yazılır, WhatsApp'la aynı kural.
            const ek = sticker ? null : messengerAttachmentOf(message.attachments);
            const medya = ek ? await storeConversationMediaFromUrl(conversation.id, ek, fetchImpl) : null;
            const yazilan = await recordInboundMessage(serviceDb(), {
              conversationId: conversation.id,
              // Kod deftere düz yazılmaz: tüketilmiş olsa da hesap devralmaya açılan bir sırdı.
              text: maskSecretsInText(text, [waLinkTokenIn(text)]),
              kind,
              payload,
              mediaKey: medya?.key ?? null,
              mediaMime: medya?.mime ?? null,
              providerMessageId: message.mid,
              receivedAt: msTimestamp(event.timestamp),
            });
            if (bag.status === 'linked') {
              await bagalamaOnayiGonder(conversation, bag.customerId, CHAT_LINK_CONFIRMATION);
              return;
            }
            triggerInboundPipeline({ message: yazilan, conversation, media: medya });
          }
        },
      });
    } else if (event.postback && event.sender?.id) {
      // Postback'in kendi mid'i yok: claim anahtarı teslimatla değişmeyen alanlardan türetilir.
      const personId = event.sender.id;
      await ingestOne(tally, {
        provider: 'meta',
        eventId: `${source}:${accountRef ?? '?'}:${personId}:${event.timestamp ?? 0}:postback`,
        type: `${source}.postback`,
        payload: event.postback as Record<string, unknown>,
        write: async () => {
          const conversation = await openSocialConversation(source, personId, accountRef, fetchImpl);
          await recordInboundMessage(serviceDb(), {
            conversationId: conversation.id,
            text: await buttonChoiceText(event.postback?.payload, event.postback?.title),
            kind: 'interactive',
            payload: { postback: event.postback ?? null },
            receivedAt: msTimestamp(event.timestamp),
          });
        },
      });
    } else if (event.reaction && event.sender?.id) {
      // Tepki bir cevaptır: müşteri "evet" yazmak yerine balona 👍 basar ve ajan onu cevap olarak okur. `unreact` yok sayılır:
      // geri alınan tepkiyi silmek yerine hiç yazmamak yeter.
      const personId = event.sender.id;
      if (event.reaction.action !== 'react') {
        tally.ignored += 1;
        continue;
      }
      const reaction = event.reaction;
      const emoji = typeof reaction.emoji === 'string' && reaction.emoji.trim() ? reaction.emoji.trim() : '👍';
      await ingestOne(tally, {
        provider: 'meta',
        eventId: `${source}:${accountRef ?? '?'}:${personId}:${event.timestamp ?? 0}:reaction`,
        type: `${source}.reaction`,
        payload: reaction as Record<string, unknown>,
        write: async () => {
          const conversation = await openSocialConversation(source, personId, accountRef, fetchImpl);
          const yazilan = await recordInboundMessage(serviceDb(), {
            conversationId: conversation.id,
            text: emoji,
            kind: 'text',
            // Hangi balona verildiği ve Meta'nın adı ham durur: ekran isterse tepki diye çizer.
            payload: { reaction },
            receivedAt: msTimestamp(event.timestamp),
          });
          triggerInboundPipeline({ message: yazilan, conversation, media: null });
        },
      });
    } else {
      // read / delivery / optin defter olayı değil; sayılır, tekrar döngüsüne girmez.
      tally.ignored += 1;
    }
  }
}

/** Messenger/Instagram damgası milisaniye cinsindendir. */
function msTimestamp(timestamp: number | undefined): string {
  return Number.isFinite(timestamp) && (timestamp as number) > 0 ? new Date(timestamp as number).toISOString() : new Date().toISOString();
}

/** `23505` tek başına yetmez: aynı kod başka kısıttan da gelebilir ve onu tekrar saymak gerçek bir arızayı yutardı. */
function isDuplicateProviderMessage(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === '23505' && (e.message ?? '').includes('message_provider_message_key');
}

async function ingestOne(
  tally: Tally,
  input: { provider: string; eventId: string; type: string; payload: Record<string, unknown>; write: () => Promise<void> },
): Promise<void> {
  const events = new WebhookEventService(serviceDb());
  const { fresh, event } = await events.claim({
    provider: input.provider,
    eventId: input.eventId,
    type: input.type,
    // Ham yük RLS'si kapalı tabloda saklanır: kişisel veri loglara değil buraya düşer.
    payload: input.payload,
  });
  if (!fresh) {
    tally.duplicates += 1;
    return;
  }

  try {
    await input.write();
    await events.markProcessed(event.id);
    tally.written += 1;
  } catch (error) {
    // Son savunma hattı tetiklendiyse mesaj zaten defterdedir (gönderdiğimiz mesajın echo'su böyle çarpar). Hata sayılsaydı kabuk
    // 500 döner ve Meta aynı echo'yu 7 gün yeniden gönderirdi.
    if (isDuplicateProviderMessage(error)) {
      await events.markProcessed(event.id);
      tally.duplicates += 1;
      return;
    }
    // Damga atılmaz ki Meta'nın tekrarı bu olayı yeniden işleyebilsin; log'a yalnız kimlik.
    await events.markFailed(event.id, error instanceof Error ? error.message : String(error));
    captureError(error, { source: SOURCES.webhook, context: { provider: input.provider, eventId: input.eventId, type: input.type } });
    tally.errors += 1;
  }
}
