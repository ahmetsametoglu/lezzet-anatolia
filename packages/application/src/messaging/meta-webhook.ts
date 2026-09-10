import { createHmac, timingSafeEqual } from 'node:crypto';
import { answerEmailAnchor, offerAnchorIfDue, verifySecurityCode } from '../customer/anchor';
import { buttonReplyText, CART_ADD_PREFIX } from '../catalog/product-card';
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
 * ── AJAN ÇÖZÜMÜ BEKLER ──────────────────────────────────────────────────────
 * Sesli mesajda ajan tetiği çözümün ARDINDAN koşuyor: sırayla değil de paralel koşsaydı ajan tam
 * da okuması gereken turda transkripti göremez, "duyamıyorum" deyip devrederdi — çözümün varlık
 * sebebi ortadan kalkardı.
 *
 * ── ÇEVİRİ DE BU ZİNCİRDE, AJANDAN ÖNCE (15.28) ─────────────────────────────
 * Gelen metin (ya da transkript) ajandan önce Türkçeye çevrilir. Ajanın buna ihtiyacı yok (üç
 * dili de okur); operatörün var — ajan devrettiğinde zil çalar ve operatör sohbeti AÇTIĞI AN
 * Türkçesini görmeli, "yaz → çevir → haber ver" sırası (talep kanalının 17.08 kararı). Bedeli
 * ajanın cevabına eklenen bir-iki saniye; çeviri düşerse ajan yine koşar, satır kuyrukta kalır.
 * Zincir üç kanalda aynı; Messenger/IG'nin eki de artık iniyor (08.09), ses basamağı orada da dolu.
 */
function triggerInboundPipeline(input: {
  message: Message;
  conversation: Conversation;
  /** İndirilmiş medya — WhatsApp'ta medya kimliğinden, Messenger/IG'de CDN adresinden (08.09); ses ise önce çözülür. */
  media: { key: string; mime: string } | null;
}): void {
  void (async () => {
    /*
      ── AÇIK YAZIŞMANIN ZİLİ, İKİ KEZ (21.291 · ölçülen arıza 08.09) ──────────
      Kuyruk zili (`ringConversationsBell`, çoğul) toplu POST'un sonunda BİR kez çalıyor ve listeyi
      uyandırıyor; ama o zil sohbet ekranını uyandıramaz — kuyruktaki her hareket, okunan yazışmayı
      yeniden çizdirirdi. Sohbet ekranı bu yüzden kendi kanalını dinliyor ve zili burada çalınıyor.

      İKİ KEZ ÇALINMASI BİLİNÇLİ: mesaj deftere düştüğü an operatör onu GÖRMELİ (birincisi), ama
      sesli mesajın transkripti ve çevirisi saniyeler sonra yazılıyor (`setTranscript`,
      `translateConversationMessageNow`) — ikinci zil olmasaydı ekran "[görsel / dosya]" ya da
      çevirisiz metinle donup kalırdı. Zil ucuz ve yükü boş; ekran her ikisinde de sunucudan
      okuyor, yani ikinci çağrının tek maliyeti bir tur.
    */
    await ringConversationBell(input.conversation.id);

    let mesaj = input.message;
    if (input.media?.mime.startsWith('audio/')) {
      const metin = await transcribeConversationAudio(input.media.key, input.media.mime, {
        conversationId: input.conversation.id,
      });
      // Çözülemese de zincir sürer: "duyamıyorum, bir arkadaşım dinleyecek" da bir cevaptır ve
      // müşteriyi sessiz bırakmaz.
      if (metin) mesaj = (await new MessageService(serviceDb()).setTranscript(mesaj.id, metin)) ?? mesaj;
    }
    await translateConversationMessageNow(serviceDb(), mesaj);
    // İkinci zil: transkript ve çeviri artık satırda — ekran zenginleşmiş hâli okusun (künye yukarıda).
    await ringConversationBell(input.conversation.id);
    triggerAutonomousReply(input.conversation.id, input.conversation.handledBy);
  })().catch((err: unknown) =>
    captureError(err, {
      source: SOURCES.webhook,
      context: { area: 'messaging/inbound-pipeline', conversationId: input.conversation.id },
    }),
  );
}

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
 * Bağlama onayı — müşterinin KENDİ dilinde (07.09).
 *
 * Gönderim kapısı artık çeviriyor (15.28) ama bu metin yine ELLE üç dilde: sistem mesajıdır, sabit
 * ve kısa — makine çevirisine vermek her seferinde bir model turu ödeyip aynı cümlenin küçük
 * varyantlarını üretmek olurdu. Dil kapıyla AYNI karardan okunuyor (`resolveOutboundLanguage`) ve
 * kapıya bildiriliyor (`language`): ikisi ayrı hesaplasaydı kapı bu hazır metni "yanlış dilde"
 * sanıp modele sokabilirdi.
 *
 * Metin KISA ve tek işi var: işlemin OLDUĞUNU söylemek. Ne yapıldığının ayrıntısı (hangi hesap,
 * hangi numara) müşteriye bir şey katmaz, kimlik bilgisini sohbete taşırdı.
 */
const LINK_CONFIRMATION: Record<PreferredLanguage, string> = {
  tr: 'Numaranız hesabınıza bağlandı — buradan siparişlerinizi sorabilirsiniz. Nasıl yardımcı olabiliriz?',
  fr: 'Votre numéro est désormais lié à votre compte — vous pouvez suivre vos commandes ici. Comment pouvons-nous vous aider ?',
  de: 'Ihre Nummer ist jetzt mit Ihrem Konto verknüpft — Sie können Ihre Bestellungen hier verfolgen. Wie können wir helfen?',
};

async function bagalamaOnayiGonder(conversation: Pick<Conversation, 'id' | 'language'>, customerId: string | null): Promise<void> {
  const db = serviceDb();
  // Bağ AZ ÖNCE kuruldu: `conversation.customerId` bayat, taze kimlik parametreden.
  const { language: dil } = await resolveOutboundLanguage(db, { language: conversation.language, customerId });
  const sonuc = await sendOutboundMessage(db, metaSenderFromEnv(), {
    conversationId: conversation.id,
    text: LINK_CONFIRMATION[dil],
    author: 'admin',
    language: dil,
  });
  // Onay gitmezse bağlama YİNE geçerlidir — yalnız müşteri bilmez. Sessiz geçilmez ki
  // "bağladım ama söyleyemedim" hâli teşhis edilebilsin (`CLAUDE §1`: sessiz catch yok).
  if (sonuc.status !== 'sent') {
    logger.warn({ context: 'messaging/link-confirm', conversationId: conversation.id, outcome: sonuc.status }, 'bağlama onayı gönderilemedi');
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
  /** `message_reactions` alanı: müşteri bir balona tepki verdi (Meta: reaction · emoji · action · mid). */
  reaction?: { reaction?: string; emoji?: string; action?: string; mid?: string; [key: string]: unknown };
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
          const { kind, text, payload } = await waBodyOf(message);

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
            // Yalnız YENİ sohbete uygulanır — RPC çakışmada dokunmaz (15.30).
            handledBy: await defaultConversationHandler(serviceDb()),
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
            await offerAnchorIfDue(serviceDb(), metaSenderFromEnv(), {
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
            await bagalamaOnayiGonder(conversation, customerId);
            return;
          }

          /*
            SIRA: (ses ise çöz → satıra yaz) → çevir → ajanı tetikle; hepsi webhook'un DIŞINDA
            (`triggerInboundPipeline` künyesi).
          */
          triggerInboundPipeline({ message: yazilan, conversation, media: medya });
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
/**
 * Messenger/IG ekinin indirilebilir ilk parçası: `{type, payload.url}`. Çoklu ekte ilki alınır —
 * defterde tek medya alanı var, ham liste `payload.attachments`ta zaten duruyor. `fallback` (bağlantı
 * önizlemesi) ve `template` dosya değildir, atlanır. Yapı savunmacı okunur: tanınmayan ek düşürülmez,
 * yalnız indirilmez.
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

/**
 * Messenger'ın beğeni çıkartmaları — üç boy, üçü de aynı "parmak" (Meta'nın sabit kimlikleri).
 * Metin karşılığı `👍`: ajan onu bir cevap olarak okur (istemin "emoji/beğeni bir CEVAPTIR" kuralı).
 */
const LIKE_STICKER_IDS = new Set(['369239263222822', '369239343222814', '369239383222810']);
/** Anlamı bilinmeyen çıkartma — ajan "bir şey gönderdi, onay olabilir" diye okur, fotoğraf sanmaz. */
const OTHER_STICKER_TEXT = '[çıkartma]';

/** Ek bir çıkartmaysa metin karşılığı; değilse `null` (gerçek fotoğraf/ses/dosya yolu). */
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

/** Boy kimliğinin biçimi — bozuk kimlikle veri okunmaz (uuid kolonuna düz metin sorgusu hata verirdi). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Düğme cevabının METNİ — `sepete_ekle:<boy>` kimliğinde ürün adı ve boy veriden çözülür (10.09 ·
 * canlı Messenger turunda ölçüldü): tek boylu ürünün kart düğmesi "Sepete ekle" yazıyor ve ajana
 * "Sepete ekle — Sepete ekle" gidiyordu; hangi ürün olduğu kimlikte vardı, metinde yoktu. Ad depo
 * ekranlarının okuduğu kapıdan (`variantNames` + `displayName`: "Ürün (boy)") — ikinci bir okuma
 * yazılmadı. Çözülemezse (silinmiş boy) düğme başlığına düşer ve iz log'da; mesaj yine kaybolmaz.
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

async function waBodyOf(message: WaMessage): Promise<{ kind: MessageKind; text: string | null; payload: Record<string, unknown> | null }> {
  if (message.type === 'text') return { kind: 'text', text: message.text?.body ?? '', payload: null };
  if (message.type === 'interactive') {
    // Ürün kartının düğmesi (08.09): kimlik `sepete_ekle:` önekliyse metin "Sepete ekle — <ürün (boy)>"
    // olur ki ajan hangi kalemi eklediğini bilsin (`buttonChoiceText`); öteki düğmeler başlığıyla düşer.
    const secim = message.interactive?.button_reply ?? message.interactive?.list_reply;
    return { kind: 'interactive', text: await buttonChoiceText(secim?.id, secim?.title), payload: { interactive: message.interactive ?? null } };
  }
  /* KARUSEL DÜĞMESİ BURADAN DÜŞER (ölçüldü 09.09 canlı): karuselin hızlı cevabı `button_reply` değil,
     şablon düğmesinin biçimiyle `type: "button"` + `button.payload` (bizim kimlik) + `button.text`
     (başlık) gelir. Yalnız başlık yazılınca ajan "Boyları gör"ü gördü, hangi ürün olduğunu göremedi. */
  if (message.type === 'button') {
    return { kind: 'interactive', text: await buttonChoiceText(message.button?.payload, message.button?.text), payload: { button: message.button ?? null } };
  }
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
    // Yalnız YENİ sohbete uygulanır — RPC çakışmada dokunmaz (15.30).
    handledBy: await defaultConversationHandler(serviceDb()),
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
          /* BEĞENİ / ÇIKARTMA METİNDİR (08.09, kullanıcı bulgusu): Messenger'ın "parmak"ı `sticker_id`li
             bir görsel eki olarak gelir; fotoğraf sanılsaydı ajan "göremiyorum" deyip devrederdi — oysa
             müşteri az önceki öneriyi ONAYLAMIŞTIR. Ham ek `payload`ta duruyor, indirilmez. */
          const sticker = messengerStickerOf(message.attachments);
          const text = typeof message.text === 'string' && message.text.trim() ? message.text : sticker;
          const kind: MessageKind = text ? 'text' : 'media';
          const payload = hasAttachments || message.quick_reply
            ? { attachments: message.attachments ?? null, quickReply: message.quick_reply ?? null }
            : null;

          if (echo) {
            // Sayfadan giden cevap (Business Suite / telefon) — defter kendiliğinden dolar; pencereye
            // dokunmaz (giden mesaj pencere açmaz) ve yazar operatördür (RPC yönden türetir).
            await recordOutboundMessage(serviceDb(), { conversationId: conversation.id, text, kind, payload, providerMessageId: message.mid });
          } else {
            // Ek varsa CDN adresinden indirilip PRIVATE kovaya yazılır (08.09); düşerse `null` döner ve
            // satır medyasız yazılır — WhatsApp'la aynı kural: indirme mesajın ön koşulu değildir.
            const ek = sticker ? null : messengerAttachmentOf(message.attachments);
            const medya = ek ? await storeConversationMediaFromUrl(conversation.id, ek, fetchImpl) : null;
            const yazilan = await recordInboundMessage(serviceDb(), {
              conversationId: conversation.id,
              text,
              kind,
              payload,
              mediaKey: medya?.key ?? null,
              mediaMime: medya?.mime ?? null,
              providerMessageId: message.mid,
              receivedAt: msTimestamp(event.timestamp),
            });
            // Çeviri + ajan tetiği WhatsApp'la AYNI zincir (15.28); ses artık burada da çözülür (08.09).
            // Ajanı olay anında tetiklemek üç kanalda ortak.
            triggerInboundPipeline({ message: yazilan, conversation, media: medya });
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
            // Ürün kartının ve karuselin düğmesi: `sepete_ekle:<boy>` "Sepete ekle — <ürün (boy)>" metnine döner (10.09).
            text: await buttonChoiceText(event.postback?.payload, event.postback?.title),
            kind: 'interactive',
            payload: { postback: event.postback ?? null },
            receivedAt: msTimestamp(event.timestamp),
          });
        },
      });
    } else if (event.reaction && event.sender?.id) {
      /*
        TEPKİ BİR CEVAPTIR (08.09, kullanıcı bulgusu): müşteri "evet" yazmak yerine balona 👍 basıyor.
        Meta bunu ayrı alanla gönderir (`message_reactions`) ve o alana abone değilken parmak bize hiç
        düşmüyordu — ajan onayı bekliyor, müşteri onayı vermiş sanıyordu. `react` deftere müşterinin
        emojisi olarak yazılır ve ajanı tetikler (istemin "emoji/beğeni bir CEVAPTIR" kuralı);
        `unreact` yok sayılır — geri alınan tepkiyi defterden silmek yerine hiç yazmamak yeter.
        Kendi mid'i yok; anahtar postback'le aynı kalıpta türetilir.
      */
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
            // Hangi balona verildiği (`mid`) ve Meta'nın adı (`like`…) ham duruyor: ekran isterse "tepki" diye çizer.
            payload: { reaction },
            receivedAt: msTimestamp(event.timestamp),
          });
          triggerInboundPipeline({ message: yazilan, conversation, media: null });
        },
      });
    } else {
      // read / delivery / optin — defter olayı değil; sayılır, tekrar döngüsüne girmez.
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
