import { createHmac, timingSafeEqual } from 'node:crypto';
import { ringConversationsBell } from '@lezzet/application';
import { ConversationService, WebhookEventService, serviceDb } from '@lezzet/database';
import { normalizePhone } from '@lezzet/helper';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { ConversationSource, MessageKind } from '@lezzet/types';
import { findOrCreateCustomer } from '../identity/find-or-create';
import { recordInboundMessage, recordOutboundMessage } from './conversation';

/**
 * Meta webhook İŞLEYİCİSİ (15.7) — HTTP'siz, test edilebilir; kabuk `app/api/webhooks/meta/route.ts`.
 *
 * ÜÇ KANAL TEK KAPIDA: Meta üç aboneliği de (whatsapp_business_account · page · instagram) aynı
 * adrese yollar ve tepe `object` alanı kanalı söyler. Kanal başına ayrı uç açmak, aynı imza ve
 * aynı defter yazımını üç kez yaşatmak olurdu — ayrışan yalnız AYRIŞTIRMA, o da kanal başına
 * kendi fonksiyonunda.
 *
 * ── YERLEŞİM: apps/web (STACK §7'den bilinçli sapma — Stripe emsali) ────────
 * Blueprint webhook'u `apps/backend`'e koyar; Stripe 07.5'te aynı gerekçeyle buraya indi
 * (`lib/order/stripe-webhook.ts` künyesi): defterin kapıları (`lib/messaging`, `lib/identity`)
 * burada yaşıyor — işleyiciyi onların yanına koymak, taşıma günü tek dosya taşımak demek.
 *
 * ── İKİ KATLI TEKRAR GÜVENLİĞİ ──────────────────────────────────────────────
 * Meta teslim edilemeyen webhook'u 7 gün boyunca yeniden dener ve bir POST birden çok mesaj
 * taşıyabilir (batch) — teslimat düzeyi idempotency bu yüzden YETMEZ, olay MESAJ düzeyinde
 * sahiplenilir: `webhook_event.claim('meta', <mesaj kimliği>)` (Stripe ile aynı servis; yarışın
 * kazananını DB seçer). Son savunma hattı veride: `message_provider_message_key` kısmi tekilliği —
 * claim'in atlandığı bir yol aynı sağlayıcı mesajını deftere iki kez yazamaz.
 *
 * ── KİMLİK: MESAJ KAYBOLMAZ ─────────────────────────────────────────────────
 * WhatsApp'ta telefon kimlik anahtarıdır: çözmeyi DENERİZ (bul-veya-oluştur, taslak); çakışma/
 * çözümsüzlükte konuşma KİMLİKSİZ açılır ve mesaj yine yazılır — kimlik çözülemediği için mesajın
 * kaybolduğu bir yol olamaz (0039 kuralı). Messenger/IG'de PSID/IGSID telefon taşımaz — kimlik
 * çözümü hiç denenmez, konuşma kimliksiz doğar (bağlama 15.16).
 *
 * ── ECHO = DEFTERİN OTOMATİK DOLMASI ────────────────────────────────────────
 * Messenger/IG `message_echoes` sayfadan giden HER mesajı düşürür (Business Suite'ten/telefondan
 * yazılan cevaplar dahil) — operatörün "deftere işle" adımı canlı kanalda kendiliğinden kapanır.
 * Echo'da sender/recipient TERS döner; kişi anahtarı echo'da `recipient.id`'dir.
 */

// ── Env — Stripe deseni (`lib/stripe.ts`): tembel oku, yokluk graceful ────────

/** App Secret — her POST'un HMAC imzası bununla doğrulanır. Yoksa uç nokta 503: doğrulanamayan gövde işlenmez. */
export function metaAppSecret(): string | null {
  return process.env.META_APP_SECRET ?? null;
}

/** Kurulum el sıkışması (GET hub.challenge) — bizim uydurduğumuz dize; Meta paneline aynısı yazılır. */
export function metaVerifyToken(): string | null {
  return process.env.META_WEBHOOK_VERIFY_TOKEN ?? null;
}

/**
 * `X-Hub-Signature-256` doğrulaması — HAM gövde üzerinden HMAC-SHA256.
 *
 * `timingSafeEqual` ŞART: düz `===` karşılaştırması, imzayı bayt bayt tahmin etmeye açık bir zaman
 * kanalı bırakır. Uzunluk farkında erken dönüş güvenli — uzunluk zaten başlıktan bellidir, sır değil.
 * İmza kimlik kurgusunun TEMELİ (15.7 künyesi): "mesaj şu numaradan geldi" beyanına ancak imza
 * doğruysa güvenilir; imza düşerse 04.10'un güvenlik kodu da düşer.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}

// ── Meta gövdesinin işleyiciye bakan yüzü ─────────────────────────────────────
// Dış sağlayıcının sözleşmesi bizim şemamız değil (Stripe emsali: SDK tipi kapıda sadeleşir) —
// zod'a dökmek, Meta alan ekledikçe kendi kapımızı kırmak olurdu. Okuma savunmacı: tanınmayan
// yapı işlenmez, düşürülmez, loglanır.

interface WaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } & Record<string, unknown>;
  button?: { text?: string };
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
  [key: string]: unknown;
}

type MetaWebhookOutcome =
  | { status: 'ok'; written: number; duplicates: number; ignored: number }
  | { status: 'error'; error: string };

/** Bir POST'un içindeki sayım — kabuk cevabı ve log bundan kurulur. */
interface Tally {
  written: number;
  duplicates: number;
  ignored: number;
  errors: number;
}

/**
 * Doğrulanmış Meta gövdesini deftere işler. İmza KABUKTA doğrulanmıştır — buraya yalnız
 * güvenilen gövde girer.
 *
 * Hata politikası Stripe ile aynı: tek mesajın yazımı düşerse olayın claim'i `markFailed` kalır ve
 * kabuk 500 döner → Meta tekrar dener → yazılabilenler `duplicate` olarak atlanır, düşen yeniden
 * denenir. Tanınmayan olay tipi ise HATA DEĞİL: tekrar almak fayda sağlamaz, sayılır ve 200 geçilir.
 */
export async function handleMetaWebhook(body: unknown): Promise<MetaWebhookOutcome> {
  const root = body as { object?: string; entry?: unknown[] } | null;
  if (!root?.object || !Array.isArray(root.entry)) {
    logger.warn({ object: root?.object ?? null }, 'meta webhook: tanınmayan gövde yapısı — işlenmedi');
    return { status: 'ok', written: 0, duplicates: 0, ignored: 1 };
  }

  const tally: Tally = { written: 0, duplicates: 0, ignored: 0, errors: 0 };

  for (const entry of root.entry) {
    if (root.object === 'whatsapp_business_account') {
      await ingestWhatsappEntry(entry as Record<string, unknown>, tally);
    } else if (root.object === 'page' || root.object === 'instagram') {
      await ingestMessengerEntry(root.object === 'page' ? 'messenger' : 'instagram', entry as Record<string, unknown>, tally);
    } else {
      tally.ignored += 1;
      logger.warn({ object: root.object }, 'meta webhook: abone olunmamış obje — yok sayıldı');
    }
  }

  // Zil TEK KEZ ve yazım olduysa: ekran sunucudan yeniden okur; yük taşınmaz, içerik sızmaz.
  // Zil düşerse kayıt düşmez (ringBell hatayı kendi yutar) — bildirim, kaydın kendisinden önemli değildir.
  if (tally.written > 0) await ringConversationsBell();

  if (tally.errors > 0) return { status: 'error', error: `${tally.errors} olay işlenemedi (webhook_event.error)` };
  return { status: 'ok', written: tally.written, duplicates: tally.duplicates, ignored: tally.ignored };
}

// ── WhatsApp: entry → changes[] → value.messages[] ───────────────────────────

async function ingestWhatsappEntry(entry: Record<string, unknown>, tally: Tally): Promise<void> {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  for (const change of changes as { field?: string; value?: Record<string, unknown> }[]) {
    // `messages` alanı hem gelen mesajları hem giden `statuses`'ı taşır. Statuses adım 1'de
    // BİLEREK işlenmiyor: defterde mesaj durumu kolonu yok (teslim/okundu izleme 15.11'in işi) —
    // sayıp geçiyoruz, tekrar döngüsüne sokmuyoruz.
    if (change.field !== 'messages' || !change.value) {
      tally.ignored += 1;
      continue;
    }
    const value = change.value;
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
      // Reaction bir mesaj değil, mesaja düşülmüş bir işarettir — defter satırı açmaz.
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
          // wa_id '+'SIZ gelir; doğrudan normalize etmek çift ülke kodu üretirdi ('+3333…') —
          // '+' önekiyle normalize edilir, external_ref sözleşmesi '+33…' (0039).
          const phone = normalizePhone(`+${message.from}`) ?? `+${message.from}`;
          const profileName = contacts.find((c) => c.wa_id === message.from)?.profile?.name?.trim() || null;

          // Kimliği çözmeyi DENE; çözülemezse kimliksiz aç — mesaj her durumda yazılır.
          let customerId: string | null = null;
          const identity = await findOrCreateCustomer({ phone, name: profileName, asDraft: true });
          if (identity.status === 'conflict') {
            logger.warn({ conversationRef: phone.slice(-4), profileIds: identity.profileIds }, 'meta webhook: kimlik çakışması — konuşma kimliksiz açıldı');
          } else if (identity.status !== 'insufficient') {
            customerId = identity.profile.id;
          }

          const conversation = await new ConversationService(serviceDb()).open({
            source: 'whatsapp',
            externalRef: phone,
            customerId,
            providerAccountRef: phoneNumberId,
            profileName,
          });

          const { kind, text, payload } = waBodyOf(message);
          await recordInboundMessage({
            conversationId: conversation.id,
            text,
            kind,
            payload,
            providerMessageId: message.id,
            // Pencere mesajın KENDİ anından başlar — webhook gecikmeli düşebilir, "şimdi" Meta'nın
            // penceresinden geç biter ve şablon ücreti ödetir (motorun kendi künyesi).
            receivedAt: waTimestamp(message.timestamp),
          });
        },
      });
    }
  }
}

/** WhatsApp mesaj tipi → defter türü. Enum dar ve bilinçli: tanınmayan tip payload'ıyla `media` kovasına düşer, kaybolmaz. */
function waBodyOf(message: WaMessage): { kind: MessageKind; text: string | null; payload: Record<string, unknown> | null } {
  if (message.type === 'text') return { kind: 'text', text: message.text?.body ?? '', payload: null };
  if (message.type === 'interactive') {
    const title = message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
    return { kind: 'interactive', text: title, payload: { interactive: message.interactive ?? null } };
  }
  if (message.type === 'button') return { kind: 'interactive', text: message.button?.text ?? null, payload: { button: message.button ?? null } };
  const media = message.type ? (message[message.type] as { caption?: string } | undefined) : undefined;
  return { kind: 'media', text: media?.caption?.trim() || null, payload: { type: message.type ?? 'unknown', body: media ?? null } };
}

/** WhatsApp damgası SANİYE cinsindendir (Messenger/IG milisaniye — karıştıran, pencereyi 1970'e kurar). */
function waTimestamp(timestamp: string | undefined): string {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

// ── Messenger / Instagram: entry → messaging[] ───────────────────────────────

async function ingestMessengerEntry(source: ConversationSource, entry: Record<string, unknown>, tally: Tally): Promise<void> {
  // entry.id = sayfa / IG hesabı kimliği — konuşmanın aktığı İŞLETME hesabı (cevap yönlendirme anahtarı).
  const accountRef = typeof entry.id === 'string' ? entry.id : null;
  const events = Array.isArray(entry.messaging) ? (entry.messaging as MessengerEvent[]) : [];
  if (events.length === 0) {
    tally.ignored += 1; // standby / bilinmeyen zarf
    return;
  }

  for (const event of events) {
    if (event.message?.mid) {
      const echo = event.message.is_echo === true;
      // Echo'da sender sayfadır, KİŞİ recipient'tadır — ters okumak iki kişiyi tek sohbette birleştirir.
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
          const conversation = await new ConversationService(serviceDb()).open({
            source,
            externalRef: personId,
            // PSID/IGSID telefon taşımaz — kimlik çözümü DENENMEZ, konuşma kimliksiz doğar (15.16).
            customerId: null,
            providerAccountRef: accountRef,
            // Webhook profil adı taşımaz; User Profile API çağrısı gönderim turunda (15.11, token'la).
            profileName: null,
          });

          const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
          const text = typeof message.text === 'string' && message.text.trim() ? message.text : null;
          const kind: MessageKind = text ? 'text' : 'media';
          const payload = hasAttachments || message.quick_reply
            ? { attachments: message.attachments ?? null, quickReply: message.quick_reply ?? null }
            : null;

          if (echo) {
            // Sayfadan giden cevap (Business Suite / telefon) — defter kendiliğinden dolar; pencereye
            // dokunmaz (giden mesaj pencere açmaz) ve yazar operatördür (RPC yönden türetir).
            await recordOutboundMessage({ conversationId: conversation.id, text, kind, payload, providerMessageId: message.mid });
          } else {
            await recordInboundMessage({
              conversationId: conversation.id,
              text,
              kind,
              payload,
              providerMessageId: message.mid,
              receivedAt: msTimestamp(event.timestamp),
            });
          }
        },
      });
    } else if (event.postback && event.sender?.id) {
      // Postback'in kendi mid'i yok — claim anahtarı teslimatla değişmeyen alanlardan türetilir.
      const personId = event.sender.id;
      await ingestOne(tally, {
        provider: 'meta',
        eventId: `${source}:${accountRef ?? '?'}:${personId}:${event.timestamp ?? 0}:postback`,
        type: `${source}.postback`,
        payload: event.postback as Record<string, unknown>,
        write: async () => {
          const conversation = await new ConversationService(serviceDb()).open({
            source,
            externalRef: personId,
            customerId: null,
            providerAccountRef: accountRef,
            profileName: null,
          });
          await recordInboundMessage({
            conversationId: conversation.id,
            text: event.postback?.title ?? null,
            kind: 'interactive',
            payload: { postback: event.postback ?? null },
            receivedAt: msTimestamp(event.timestamp),
          });
        },
      });
    } else {
      // read / delivery / reaction / optin — defter olayı değil; sayılır, tekrar döngüsüne girmez.
      tally.ignored += 1;
    }
  }
}

/** Messenger/IG damgası MİLİSANİYE cinsindendir. */
function msTimestamp(timestamp: number | undefined): string {
  return Number.isFinite(timestamp) && (timestamp as number) > 0 ? new Date(timestamp as number).toISOString() : new Date().toISOString();
}

// ── Ortak sahiplenme iskeleti — Stripe deseni: claim → işle → markProcessed/markFailed ──

async function ingestOne(
  tally: Tally,
  input: { provider: string; eventId: string; type: string; payload: Record<string, unknown>; write: () => Promise<void> },
): Promise<void> {
  const events = new WebhookEventService(serviceDb());
  const { fresh, event } = await events.claim({
    provider: input.provider,
    eventId: input.eventId,
    type: input.type,
    // Ham yük tabloda saklanır (0022 gerekçesi: teşhis) — tablo RLS deny-by-default, kişisel veri
    // loglara DEĞİL buraya düşer.
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
    // Damga atılmaz: Meta'nın tekrar denemesi bu olayı yeniden işleyebilsin. Log'a yalnız kimlik.
    await events.markFailed(event.id, error instanceof Error ? error.message : String(error));
    captureError(error, { source: SOURCES.webhook, context: { provider: input.provider, eventId: input.eventId, type: input.type } });
    tally.errors += 1;
  }
}
