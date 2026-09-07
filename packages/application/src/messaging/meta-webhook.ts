import { createHmac, timingSafeEqual } from 'node:crypto';
import { answerEmailAnchor, offerAnchorIfDue, verifySecurityCode } from '../customer/anchor';
import { consumeWhatsappLink, waLinkTokenIn } from '../customer/whatsapp-link';
import { ringConversationsBell } from '../realtime/bell';
import { messageSenderFor } from './meta-sender';
import { storeConversationMedia } from './meta-media';
import { transcribeConversationAudio } from './voice';
import { recordInboundMessage, recordOutboundMessage } from './record';
import { sendOutboundMessage } from './send';
import { ConversationService, CustomerPhoneService, MessageService, UserProfileService, WebhookEventService, serviceDb } from '@lezzet/database';
import { maskSecretsInText, sixDigitCodeIn } from '@lezzet/domain-core';
import { normalizePhone } from '@lezzet/helper';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { ConversationSource, MessageKind, PreferredLanguage } from '@lezzet/types';
import { findOrCreateCustomer } from '../customer/find-or-create';
import { fetchMetaProfileName } from './meta-profile';
import { runAutonomousConversationReply } from '../ticket/ai';
import type { TicketHandler } from '@lezzet/types';

/**
 * **ÖZERK CEVABI OLAY ANINDA TETİKLE** (06.09 · kullanıcı sorusu) — tarama emniyet ağına düşer.
 *
 * Tarama dakikada bir koşuyor ve bu bedava; ama gecikmenin kendisi bedava değil — müşteri sohbette
 * bekliyor. Gelen mesaj zaten elimizde, o hâlde cevabı beklemenin sebebi yok.
 *
 * ── CEVAP BEKLENMİYOR VE BU ŞART ────────────────────────────────────────────
 * Model çağrısı saniyeler sürüyor; `await` edilseydi Meta'nın webhook isteği o kadar açık kalırdı.
 * Meta yavaş cevabı BAŞARISIZ sayıp aynı olayı yeniden gönderir — ve tekrar teslimi defterde
 * `duplicates` olarak eleniyor olsa da, her tekrar yeni bir model çağrısı doğururdu. Yani
 * `await`, gecikmeyi çözerken maliyeti çoğaltırdı.
 *
 * ── ÇİFT CEVAP RİSKİ KAPIDA KAPALI ──────────────────────────────────────────
 * Tetik ile tarama aynı sohbete aynı anda girebilir; koruma `runAutonomousConversationReply`in
 * kendi kilidinde (`in_flight`), burada değil. Çağıran tarafta olsaydı üçüncü bir çağıran onu
 * unutabilirdi.
 *
 * ── SESSİZ DÜŞMEZ ───────────────────────────────────────────────────────────
 * Beklenmeyen hata `captureError`la gürültü çıkarır (`CLAUDE §1`: sessiz `catch` yok). Cevap
 * üretilemezse zaten kayıp yok: satır `awaiting_reply` kalır ve bir sonraki tarama devralır.
 */
/**
 * **SES ÇÖZÜMÜ WEBHOOK'UN DIŞINDA** (15.26 · 07.09 · ölçümle düzeltildi).
 *
 * Bir tur çözüm webhook'un İÇİNDE koşuyordu ve gerekçem *"defter güncellenmez, transkript yazımla
 * birlikte gelmeli"*ydi. Ölçüm o gerekçeyi çürüttü ve yerine çok daha ciddi bir risk koydu:
 *
 * `ingestOne` olayı YAZIMDAN ÖNCE sahipleniyor (`webhook_event.claim`) ve tekrar geldiğinde
 * `fresh:false` görüp ATLIYOR. Yani istek çözüm sürerken zaman aşımına uğrarsa olay sahiplenilmiş
 * ama mesaj hiç yazılmamış olur; Meta tekrar gönderir, biz "bunu zaten aldım" deyip geçeriz —
 * **müşterinin mesajı sessizce kaybolur.** Defterin ilk kuralını korumak için yazılan kod, tam onu
 * tehdit ediyordu.
 *
 * Webhook'un işi Meta'ya MAKBUZ vermektir, müşteriye cevap değil (kullanıcı sorusu 07.09 bu
 * ayrımı netleştirdi): mesajı yaz, 200 dön, bitir. Yavaş cevap müşteriyi bekletmez — Meta'ya
 * teslimatı başarısız saydırır ve aynı olayı 7 gün boyunca üstümüze döktürür.
 *
 * ── AJAN ÇÖZÜMÜ BEKLER, ÖTEKİ MESAJLARDA BEKLEMEZ ───────────────────────────
 * Sesli mesajda ajan tetiği çözümün ARDINDAN koşuyor: sırayla değil de paralel koşsaydı ajan tam
 * da okuması gereken turda transkripti göremez, "duyamıyorum" deyip devrederdi — çözümün varlık
 * sebebi ortadan kalkardı. Metin mesajında bekleme yok, tetik doğrudan.
 */
function triggerVoiceTranscript(input: {
  messageId: string;
  conversationId: string;
  mediaKey: string;
  mediaMime: string;
  handledBy: TicketHandler;
}): void {
  void (async () => {
    const metin = await transcribeConversationAudio(input.mediaKey, input.mediaMime, {
      conversationId: input.conversationId,
    });
    // Çözülemese de ajan koşar: "duyamıyorum, bir arkadaşım dinleyecek" da bir cevaptır ve
    // müşteriyi sessiz bırakmaz.
    if (metin) await new MessageService(serviceDb()).setTranscript(input.messageId, metin);
    triggerAutonomousReply(input.conversationId, input.handledBy);
  })().catch((err: unknown) =>
    captureError(err, {
      source: SOURCES.webhook,
      context: { area: 'messaging/voice-trigger', conversationId: input.conversationId },
    }),
  );
}

function triggerAutonomousReply(conversationId: string, handledBy: TicketHandler): void {
  if (handledBy !== 'ai') return;
  void runAutonomousConversationReply(serviceDb(), messageSenderFor(process.env.META_ACCESS_TOKEN), conversationId).catch(
    (err: unknown) =>
      captureError(err, {
        source: SOURCES.webhook,
        context: { area: 'messaging/autonomous-trigger', conversationId },
      }),
  );
}

/**
 * Bağlama onayı — müşterinin KENDİ dilinde (07.09).
 *
 * Gönderim yolunda çeviri YOK (ölçüldü: `send.ts`te çeviri adımı yok; ajanın metnini çeviren
 * mekanizma talep kanalınındır). Bu yüzden metin burada dile göre seçiliyor — Fransız müşteriye
 * Türkçe onay göndermek, doğru işi yanlış dilde bildirmek olurdu ve hazır mesajı Fransızca
 * gönderdiğimiz akışta özellikle tuhaf kaçardı.
 *
 * Metin KISA ve tek işi var: işlemin OLDUĞUNU söylemek. Ne yapıldığının ayrıntısı (hangi hesap,
 * hangi numara) müşteriye bir şey katmaz, kimlik bilgisini sohbete taşırdı.
 */
const LINK_CONFIRMATION: Record<PreferredLanguage, string> = {
  tr: 'Numaranız hesabınıza bağlandı — buradan siparişlerinizi sorabilirsiniz. Nasıl yardımcı olabiliriz?',
  fr: 'Votre numéro est désormais lié à votre compte — vous pouvez suivre vos commandes ici. Comment pouvons-nous vous aider ?',
  de: 'Ihre Nummer ist jetzt mit Ihrem Konto verknüpft — Sie können Ihre Bestellungen hier verfolgen. Wie können wir helfen?',
};

async function bagalamaOnayiGonder(conversationId: string, customerId: string | null): Promise<void> {
  const db = serviceDb();
  const dil = customerId ? ((await new UserProfileService(db).getById(customerId))?.preferredLanguage ?? 'fr') : 'fr';
  const sonuc = await sendOutboundMessage(db, messageSenderFor(process.env.META_ACCESS_TOKEN), {
    conversationId,
    text: LINK_CONFIRMATION[dil],
    author: 'admin',
  });
  // Onay gitmezse bağlama YİNE geçerlidir — yalnız müşteri bilmez. Sessiz geçilmez ki
  // "bağladım ama söyleyemedim" hâli teşhis edilebilsin (`CLAUDE §1`: sessiz catch yok).
  if (sonuc.status !== 'sent') {
    logger.warn({ context: 'messaging/link-confirm', conversationId, outcome: sonuc.status }, 'bağlama onayı gönderilemedi');
  }
}

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
export interface MetaWebhookOptions {
  /**
   * Graph'a çıkan TEK dış çağrının (Messenger/IG profil adı) `fetch`i. Üretimde geçilmez —
   * varsayılan küresel `fetch`tir. Testler sahte geçerek kapıyı ağdan koparır; gerekçe
   * `meta-profile.ts`'in künyesinde.
   */
  fetchImpl?: typeof fetch;
}

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

  // Zil TEK KEZ ve yazım olduysa: ekran sunucudan yeniden okur; yük taşınmaz, içerik sızmaz.
  // Zil düşerse kayıt düşmez (ringBell hatayı kendi yutar) — bildirim, kaydın kendisinden önemli değildir.
  if (tally.written > 0) await ringConversationsBell();

  if (tally.errors > 0) return { status: 'error', error: `${tally.errors} olay işlenemedi (webhook_event.error)` };
  return { status: 'ok', written: tally.written, duplicates: tally.duplicates, ignored: tally.ignored };
}

// ── WhatsApp: entry → changes[] → value.messages[] ───────────────────────────

async function ingestWhatsappEntry(entry: Record<string, unknown>, tally: Tally, fetchImpl?: typeof fetch): Promise<void> {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  for (const change of changes as { field?: string; value?: Record<string, unknown> }[]) {
    // `messages` alanı hem gelen mesajları hem giden `statuses`'ı taşır.
    if (change.field !== 'messages' || !change.value) {
      tally.ignored += 1;
      continue;
    }
    const value = change.value;

    // Statuses'ın DEFTER yarısı (mesaj durumu kolonu, teslim/okundu izleme) hâlâ 15.11'in işi.
    // Buradaki okuma o değil, KİMLİK yarısı (04.10): taşıyıcının `failed` beyanı kimlik şüphesinin
    // erken tetiğidir ve tetik ölçülemezse motorun o dalı hiç çalışmaz.
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
          const { kind, text, payload } = waBodyOf(message);

          // ── ÖNCE BAĞLAMA JETONU, SONRA KİMLİK ÇÖZÜMÜ (04.10) ─────────────────────────────────
          // Sıra ZORUNLU: kimlik çözümü önce koşarsa tanımadığı numara için yeni bir taslak açar ve
          // jeton o taslağa bakar — bağlamak istediğimiz hesap ortada kalırdı.
          //
          // Mesajların ezici çoğunluğunda jeton yoktur (`none`) ve bu kapı tek bir düzenli ifadeye
          // mal olur; DB'ye ancak jeton görüldüğünde gidilir.
          let customerId: string | null = null;
          const bag = await consumeWhatsappLink(serviceDb(), phone, text);
          // `transferred` de bağlanmış sayılır: numara önceki kayıttan alındı ve bu hesaba verildi
          // (04.10, kullanıcı kararı 26.08). Konuşma yeni sahibine gider — eski kaydın geçmişi
          // yerinde kalır, taşınan yalnız kanaldır.
          const bagliMi = bag.status === 'linked' || bag.status === 'merged' || bag.status === 'transferred';
          if (bagliMi) customerId = bag.customerId;

          // Kimliği çözmeyi DENE; çözülemezse kimliksiz aç — mesaj her durumda yazılır.
          //
          // **`phoneProven` yalnız BURADA true** (04.10, DOMAIN §10) ve dayanağı yukarıdaki imza
          // doğrulamasıdır (`verifyMetaSignature`): bu gövdeyi Meta imzaladı, yani "şu numaradan
          // mesaj geldi" bir beyan değil kanıttır — o hattı bugün elinde tutan biri bize yazdı.
          // İmza olmasaydı bu bayrak da olamazdı; herkes uca istek atıp istediği numarayı iddia
          // ederdi (DOMAIN §10: *"bu güvenin dayanağı webhook imzasıdır"*).
          if (!customerId) {
            const identity = await findOrCreateCustomer({ phone, phoneProven: true, name: profileName, asDraft: true });
            if (identity.status === 'conflict') {
              logger.warn({ conversationRef: phone.slice(-4), profileIds: identity.profileIds }, 'meta webhook: kimlik çakışması — konuşma kimliksiz açıldı');
            } else if (identity.status !== 'insufficient') {
              customerId = identity.profile.id;
            }
          }

          // ── ÇAPA CEVABI: kimlik çözümünden SONRA (04.10) ─────────────────────────────────────
          // Sıra bağlama jetonunun TERSİ ve gerekçesi de ters: jeton kimliği KURAR, çapa cevabı
          // kimliği VARSAYAR. Zincir tek yönlü — numara → kimlik → o kimliğin bekleyen sorusu →
          // kod ona karşı doğrulanır (DOMAIN §10: *"koddan kimliğe gidilmez"*).
          //
          // Altı haneli sayı gelen mesajlarda boldur (referans, adet, tutar, saat); bu yüzden kapı
          // yalnız BEKLEYEN bir soru varken iş yapar — kapılar `not_pending`/`no_code` ile sessizce
          // düşer ve tahmin denemesine ücretsiz tur açılmaz.
          const kimlikSirri = customerId ? await cevabiIsle(phone, text) : null;

          const conversation = await new ConversationService(serviceDb()).open({
            source: 'whatsapp',
            externalRef: phone,
            customerId,
            providerAccountRef: phoneNumberId,
            profileName,
          });

          /*
            ── SIR DEFTERE DÜZ YAZILMAZ (07.09 · kullanıcı bulgusu) ─────────────────────────────
            Kural 30.07'de yazılmıştı ve yalnız LOG tarafında uygulanmıştı; defter tarafı — belgenin
            *"şart"* dediği taraf — hiç yapılmamıştı. Ekranda `LA-WA-PVK7LRQJ9FLG` düz görününce
            ortaya çıktı.

            İki sır geçebilir: hesabı numaraya bağlayan JETON (yanlış ellerde hesap devralma) ve
            6 haneli GÜVENLİK KODU (aylarca geçerli). Defter kalıcıdır ve operasyon ekranı bütün
            konuşmaları okutuyor (15.5) — log döner, defter KALIR.

            Maskeleme yazımdan ÖNCE: bir kez düz yazılırsa geri alınamaz, üstelik satırın kopyası
            gerçek zamanlı olarak ekranlara da düşer (`ringConversationsBell`).
          */
          // Medya varsa Meta'dan indirilip PRIVATE kovaya yazılır. Düşerse `null` döner ve satır
          // medyasız yazılır — indirme mesajın ön koşulu değildir.
          const mediaId = kind === 'media' ? waMediaIdOf(payload) : null;
          const medya = mediaId
            ? await storeConversationMedia(conversation.id, mediaId, process.env.META_ACCESS_TOKEN ?? null, fetchImpl)
            : null;


          const yazilan = await recordInboundMessage(serviceDb(), {
            conversationId: conversation.id,
            text: maskSecretsInText(text, [waLinkTokenIn(text), kimlikSirri]),
            kind,
            payload,
            mediaKey: medya?.key ?? null,
            mediaMime: medya?.mime ?? null,
            providerMessageId: message.id,
            // Pencere mesajın KENDİ anından başlar — webhook gecikmeli düşebilir, "şimdi" Meta'nın
            // penceresinden geç biter ve şablon ücreti ödetir (motorun kendi künyesi).
            receivedAt: waTimestamp(message.timestamp),
          });

          // ── ÇAPAYI KENDİLİĞİNDEN VER (04.10) ─────────────────────────────────────────────────
          // Sipariş vermiş ama çapasız müşteriye güvenlik kodu burada gider ve yeri BURASI: gelen
          // mesaj 24 saatlik ücretsiz pencereyi tanımı gereği açar. Sipariş anında denenseydi
          // pencere kapalı olabilirdi ve tek yol ücretli kalıp mesaj olurdu (DOMAIN §11).
          //
          // Mesaj kaydından SONRA: kod bir CEVAPTIR, müşterinin mesajı deftere girmeden gönderilen
          // bir cevap yazışmayı ters sırada gösterirdi.
          if (customerId) {
            await offerAnchorIfDue(serviceDb(), messageSenderFor(process.env.META_ACCESS_TOKEN), {
              conversationId: conversation.id,
              customerId,
            });
          }

          /*
            ── BAĞLAMA BAŞARISI MÜŞTERİYE SÖYLENİR, AJAN ARAYA GİRMEZ (07.09 · ölçülmüş arıza) ──
            Ölçülen akış şuydu: müşteri `LA-WA-…` mesajını gönderdi, jeton tüketildi, taslak kayıt
            gerçek hesapla birleşti — yani her şey ÇALIŞTI — ve müşteriye hiçbir şey söylenmedi.
            Sonra olan bitenden habersiz ajan, anlamadığı mesaja *"bir yetkilimiz yardımcı olacak"*
            diye cevap verdi. Üç ayrı zarar: müşteri işlemin olmadığını sandı, kimsenin tutmayacağı
            bir söz verildi, ve devir yüzünden sohbet YZ modundan `human`a düştü — yani BAŞARILI
            bir otomatik işlem, otomasyonu kapattı.

            Bağlama mesajı bir SORU değil, sistem mesajıdır: cevabı ajan değil sistem bilir. O yüzden
            onayı burada gönderiyor ve tetiği çağırmıyoruz.
          */
          if (bagliMi) {
            await bagalamaOnayiGonder(conversation.id, customerId);
            return;
          }

          /*
            SESLİ MESAJDA SIRA: çöz → satıra yaz → ajanı tetikle; hepsi webhook'un DIŞINDA
            (`triggerVoiceTranscript` künyesi). Ötekilerde ajan doğrudan tetikleniyor.
          */
          if (medya?.mime.startsWith('audio/')) {
            triggerVoiceTranscript({
              messageId: yazilan.id,
              conversationId: conversation.id,
              mediaKey: medya.key,
              mediaMime: medya.mime,
              handledBy: conversation.handledBy,
            });
            return;
          }

          triggerAutonomousReply(conversation.id, conversation.handledBy);
        },
      });
    }
  }
}

/**
 * **Çapa cevabını işle** (04.10) — gelen mesajda altı hane varsa, BEKLEYEN bir soruya karşı dener.
 *
 * İki çapa iki ayrı kitledir ve aynı müşteride bir arada bulunmaz (DOMAIN §10), ama bir müşteri
 * kodu varken e-posta çapası da başlatabilir. Sıra bu yüzden belirli: **önce bekleyen e-posta**
 * (açıkça istenmiş, kısa ömürlü ve tek seferlik bir soru), sonra güvenlik kodu (kalıcı sır). Ters
 * sırada, bekleyen bir bağlama isteği varken gelen doğru kod sayaç yakardı.
 *
 * **Hiçbir hâl mesajın kaydını etkilemez:** yanlış kod da, süresi geçmiş cevap da deftere normal
 * bir mesaj olarak yazılır. Cevabı müşteriye ajan verir; bu kapı yalnız gerçeği işler.
 */
/** Taşıyıcının durum olayı — gövde bu kadar dar çünkü okuduğumuz tek şey ULAŞILDI MI. */
interface WaStatus {
  status?: string;
  recipient_id?: string;
}

/**
 * **Taşıyıcının teslim beyanını numaranın kimlik künyesine yaz** (04.10) — DOMAIN §10.
 *
 * `failed` bir tahmin değil, **beyandır**: numara kapanmış ya da bizi engellemiş. Kimlik şüphesinin
 * ERKEN tetiği budur; 3 aylık sessizliği beklemenin anlamı yok, bağ zaten şüpheli.
 *
 * **Belirsiz durumlar yazılmaz ve bu kararın yarısıdır.** `delivered` gelip okunmaması hâlâ
 * belirsizdir (telefon kapalı, bildirim kapalı, umursamamış), `sent`te kalan mesaj da hiçbir şey
 * söylemez — ağ gecikmesi ile terk edilmiş hat aynı görünür. Yalnız iki uç işleniyor: `failed`
 * damgalar, `delivered`/`read` damgayı SİLER (sonraki başarılı teslim, önceki başarısızlığı
 * gerçekten çürütür).
 *
 * **Defter yarısı burada DEĞİL:** mesaj durumu kolonu ve teslim/okundu izleme 15.11'in işi. Bu kapı
 * yalnız kimlik künyesine dokunuyor; tanımadığı numarada sessizce düşer (kanıt satırı yoksa
 * güncellenecek kimlik de yoktur).
 */
async function tasiyiciBeyani(value: Record<string, unknown>): Promise<void> {
  const statuses = Array.isArray(value.statuses) ? (value.statuses as WaStatus[]) : [];
  const phones = new CustomerPhoneService(serviceDb());

  for (const status of statuses) {
    if (!status.recipient_id) continue;
    const basarisiz = status.status === 'failed';
    if (!basarisiz && status.status !== 'delivered' && status.status !== 'read') continue;

    // wa_id '+'SIZ gelir — kanıt satırıyla aynı normalize (gelen mesaj yolundaki gerekçenin aynısı).
    const phone = normalizePhone(`+${status.recipient_id}`) ?? `+${status.recipient_id}`;
    const row = await phones.markDelivery(phone, basarisiz);
    if (row && basarisiz) {
      logger.info({ conversationRef: phone.slice(-4), customerId: row.customerId }, 'kimlik: taşıyıcı ulaşamadı — erken tetik damgalandı');
    }
  }
}

/**
 * Çapa/kod cevabını işler ve **metnin bir SIR taşıyıp taşımadığını söyler** (07.09).
 *
 * Dönüş değeri maskeleme içindir: defter bu metni yazmadan önce sırrı silmek zorunda
 * (`secret-masking` künyesi). Sırrın kendisi döndürülüyor, "evet/hayır" değil — maskeleyici
 * şekil bilmiyor, silinecek dizeyi çağırandan alıyor.
 *
 * **YALNIZ gerçek bir denemede maskeleniyor.** Altı haneli sayı gelen mesajlarda boldur (referans,
 * adet, tutar, saat); her altı haneyi maskelemek defteri okunmaz yapardı. Kapılar zaten bekleyen
 * bir soru yokken `not_pending`/`no_code` ile düşüyor — o hâlde sayı sır değildir ve dokunulmuyor.
 * Yanlış ya da kilitli deneme ise maskelenir: yanlış girilen kod da gerçek kodun yakınında olabilir.
 */
async function cevabiIsle(phone: string, text: string | null): Promise<string | null> {
  const capa = await answerEmailAnchor(serviceDb(), phone, text);
  if (capa.status !== 'none' && capa.status !== 'not_pending') {
    // Kodun kendisi ASLA loglanmaz (CLAUDE §1) — kimlik ve sonuç yeter.
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

/**
 * `waBodyOf`un kurduğu medya gövdesinden Meta'nın MEDYA KİMLİĞİ (`id`).
 *
 * Biçimi bilen tek yer burası: gövde `{ type, body }` şeklinde saklanıyor ve `body` sağlayıcının
 * ham nesnesi. İndirme kapısına ham gövdeyi geçirip orada ayrıştırmak, sağlayıcı biçimini ikinci
 * bir dosyaya sızdırırdı.
 *
 * `null` = kimlik yok (tanınmayan tür, gövdesiz medya) — indirme hiç denenmez, mesaj yine yazılır.
 */
function waMediaIdOf(payload: Record<string, unknown> | null): string | null {
  const body = payload?.body as { id?: unknown } | null | undefined;
  return typeof body?.id === 'string' && body.id.trim() ? body.id : null;
}

/** WhatsApp damgası SANİYE cinsindendir (Messenger/IG milisaniye — karıştıran, pencereyi 1970'e kurar). */
function waTimestamp(timestamp: string | undefined): string {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

// ── Messenger / Instagram: entry → messaging[] ───────────────────────────────

/**
 * Messenger/IG konuşmasını aç ve — ilk kez açılıyorsa — sağlayıcı profil adını doldur (22.08).
 *
 * Ad AYRI bir Graph çağrısıyla gelir çünkü webhook onu taşımıyor (künyesi `meta-profile.ts`).
 * Çağrı YALNIZ ad boşken yapılır: konuşma başına bir kez, her mesajda değil. Düşerse konuşma adsız
 * kalır ve mesaj yine yazılır — ad bilinmiyor olabilir, mesaj kaybolamaz.
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
    // PSID/IGSID telefon taşımaz — kimlik çözümü DENENMEZ, konuşma kimliksiz doğar (15.16).
    customerId: null,
    providerAccountRef: accountRef,
    // Webhook ad taşımıyor; aşağıda Graph'tan çekiliyor. `open` yalnız boş alanı doldurur.
    profileName: null,
  });
  if (conversation.profileName) return conversation;

  const name = await fetchMetaProfileName(source, personId, fetchImpl);
  if (!name) return conversation;
  // `setProfileName` de "yalnız boşsa yazar" — iki mesaj aynı anda düşerse ikincisi ezmez.
  return (await service.setProfileName(conversation.id, name)) ?? conversation;
}

async function ingestMessengerEntry(
  source: ConversationSource,
  entry: Record<string, unknown>,
  tally: Tally,
  fetchImpl?: typeof fetch,
): Promise<void> {
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
          const conversation = await openSocialConversation(source, personId, accountRef, fetchImpl);

          const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
          const text = typeof message.text === 'string' && message.text.trim() ? message.text : null;
          const kind: MessageKind = text ? 'text' : 'media';
          const payload = hasAttachments || message.quick_reply
            ? { attachments: message.attachments ?? null, quickReply: message.quick_reply ?? null }
            : null;

          if (echo) {
            // Sayfadan giden cevap (Business Suite / telefon) — defter kendiliğinden dolar; pencereye
            // dokunmaz (giden mesaj pencere açmaz) ve yazar operatördür (RPC yönden türetir).
            await recordOutboundMessage(serviceDb(), { conversationId: conversation.id, text, kind, payload, providerMessageId: message.mid });
          } else {
            await recordInboundMessage(serviceDb(), {
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
          const conversation = await openSocialConversation(source, personId, accountRef, fetchImpl);
          await recordInboundMessage(serviceDb(), {
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

/**
 * Yazım, mesaj defterinin TEKİLLİK indeksine mi çarptı?
 *
 * Yalnız `23505` yetmez: aynı kod başka bir kısıttan da gelebilir (konuşma tekilliği gibi) ve onu
 * "tekrar" saymak gerçek bir arızayı sessizce yutardı. İndeksin ADI aranıyor — kısıt veride durur,
 * kontrol de onun adına bakar.
 */
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
    /*
      ── AYNI MESAJ ZATEN DEFTERDE: HATA DEĞİL, TEKRAR ──────────────────────────
      Veri katmanının son savunma hattı (`message_provider_message_key`) tetiklendiyse, o mesaj
      deftere ZATEN yazılmış demektir — yapılacak iş kalmadı, olay işlenmiştir.

      **Ölçüldü 24.08 (`send-echo.test.ts`):** biz Messenger'a bir mesaj gönderiyoruz ve saniyeler
      sonra Meta aynı mesajı `message_echoes` olarak geri düşürüyor. Claim onu YENİ bir olay
      sayıyor (echo'nun kendi `mid`'i ilk kez görülüyor), yazım tekillik indeksine çarpıyor ve
      eskiden bu `errors`e düşüyordu: kabuk 500 dönüyor → Meta aynı echo'yu 7 GÜN boyunca yeniden
      gönderiyor → hiçbir zaman başarılı olamayacak bir olay kuyruğu ve `error_log`'u şişiriyordu.
      Defter zaten doğruydu; yalan söyleyen CEVAPTI.

      Bu yol ancak gönderim ve echo birlikte taklit edilebildiği gün kurulabildi — sağlayıcı
      kapalıyken iki yarısı da yoktu.
    */
    if (isDuplicateProviderMessage(error)) {
      await events.markProcessed(event.id);
      tally.duplicates += 1;
      return;
    }
    // Damga atılmaz: Meta'nın tekrar denemesi bu olayı yeniden işleyebilsin. Log'a yalnız kimlik.
    await events.markFailed(event.id, error instanceof Error ? error.message : String(error));
    captureError(error, { source: SOURCES.webhook, context: { provider: input.provider, eventId: input.eventId, type: input.type } });
    tally.errors += 1;
  }
}
