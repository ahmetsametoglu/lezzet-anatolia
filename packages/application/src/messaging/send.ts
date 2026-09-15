import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiModel } from '@lezzet/ai';
import { ConversationService } from '@lezzet/database';
import { humanAgentWindowState, serviceWindowState } from '@lezzet/domain-core';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type { ConversationSource, Message, MessageKind, PreferredLanguage, TemplateCategory, TicketSender } from '@lezzet/types';
import { cartLinkButton, LINK_BUTTON_TEXT, linkTail, splitCartLink } from '../cart/link-text';
import { recordOutboundMessage } from './record';
import { prepareOutboundText, resolveOutboundLanguage, type MessageTranslationPatch } from './translate';

// Gönderim ve defter yazımı tek kapıda: ayrı iki çağrı gönderilmemiş mesajı deftere yazdırır ya da gönderilmişi yazmaz, ikisi de
// sessizdir. Önce gönderilir sonra yazılır, çünkü gönderim geri alınamaz, defter yazımı telafi edilebilir.

// Çeviri de burada, çağıranlarda değil: dört çağırandan birinin unutması müşteriye sessizce Türkçe okuturdu. Çeviri düşerse mesaj
// gitmez: Türkçeyi Fransız müşteriye göndermek sessiz, göndermemek gürültülü arızadır.

/** Konuşmadan türer, çağıran uydurmaz. */
export interface SendTarget {
  source: ConversationSource;
  externalRef: string;
  /** Yoksa gönderim yönlendirilemez. */
  accountRef: string | null;
  /** Yalnız Messenger/Instagram, 24 saatten sonraki 7 gün. Kararı bu kapı verir, sürücü yalnız uygular. */
  humanAgent?: boolean;
}

export interface SendMessageInput {
  conversationId: string;
  text: string | null;
  kind?: MessageKind;
  payload?: Record<string, unknown> | null;
  /** Boşsa defter gideni personel sayar. */
  author?: TicketSender | null;
  /** Yalnız WhatsApp; pencere kapalıyken gidebilen tek tür. */
  templateName?: string | null;
  templateCategory?: TemplateCategory | null;
  /** Meta kalıbı ad ve dil çiftiyle arar; sabit dilde, başka dilde onaylı kalıp `132001` "bulunamadı" ile düşerdi. */
  templateLanguage?: string | null;
  /** Hedef dille aynıysa çeviri modeli çağrılmaz: elle yazılmış sistem mesajları ve güvenlik kodu modelden geçmez. */
  language?: PreferredLanguage | null;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; reason: string; retryable: boolean };

/** Uygulama katmanı HTTP bilmez: sürücü bu arayüzü uygular, testler kendi sahtesini verir. */
export interface MessageSender {
  /** Hangi sürücünün gönderdiği sonradan da sorulabilmeli. */
  readonly name: string;
  send(target: SendTarget, input: SendMessageInput): Promise<SendResult>;
}

/** Varsayılan sürücü her çağrıyı reddeder: başarı taklidi yapan sahte gönderilmemiş mesajı deftere yazdırırdı. */
export const unconfiguredSender: MessageSender = {
  name: 'unconfigured',
  send: async () => ({ ok: false, reason: 'not_configured', retryable: false }),
};

export type SendOutcome =
  /** `message` null olabilir: mesaj gitti ama defter yazımı düştü; tip bunu söylemeli. */
  | { status: 'sent'; message: Message | null; providerMessageId: string }
  | { status: 'refused'; reason: string }
  | { status: 'failed'; reason: string; retryable: boolean };

/** Çeviri modeli verilirse env ve ağ atlanır (testler). */
export interface SendOptions {
  model?: AiModel;
}

/** `refused` bizim kuralımızdır ve tekrar denemek anlamsız; `failed` sağlayıcınındır ve `retryable` olabilir. */
export async function sendOutboundMessage(
  db: SupabaseClient,
  sender: MessageSender,
  input: SendMessageInput,
  opts: SendOptions = {},
): Promise<SendOutcome> {
  const conversation = await new ConversationService(db).getById(input.conversationId);
  if (!conversation) return { status: 'refused', reason: 'conversation_not_found' };

  // Defter kapısı da reddeder ama fırlatarak; burada gönderimden önce: sağlayıcıya boşuna gitmek tur ve para demek.
  if (input.templateName && conversation.source !== 'whatsapp') {
    return { status: 'refused', reason: 'template_wrong_channel' };
  }

  // Pencere kapalıyken WhatsApp'ta yalnız ücretli kalıp, Messenger/Instagram'da 7 güne kadar insan temsilci etiketi gider. Etiket
  // özerk ajana kapalı: Meta'nın tanımı insanın elle cevabıdır ve yanlış beyanın yaptırımı hesap düzeyindedir.
  const pencere = serviceWindowState(conversation.windowExpiresAt);
  const insanTemsilci =
    !input.templateName &&
    !pencere.open &&
    conversation.source !== 'whatsapp' &&
    input.author !== 'ai' &&
    humanAgentWindowState(conversation.windowExpiresAt).open;

  if (!input.templateName && !pencere.open && !insanTemsilci) {
    return { status: 'refused', reason: pencere.everOpened ? 'window_closed' : 'window_never_opened' };
  }

  if (!conversation.providerAccountRef) {
    return { status: 'refused', reason: 'account_ref_missing' };
  }

  const target: SendTarget = {
    source: conversation.source,
    externalRef: conversation.externalRef,
    accountRef: conversation.providerAccountRef,
    humanAgent: insanTemsilci,
  };

  if (insanTemsilci) {
    // Etiketli gönderim istisnadır ve izi kalmalı: Meta kötüye kullanımını denetler. Log'a kimlik yazılır, içerik değil.
    logger.info(
      { context: 'messaging/send', conversationId: conversation.id, source: conversation.source },
      'pencere kapalı — insan-temsilci etiketiyle gönderiliyor',
    );
  }

  // Bağlantı gövdeden ayrılıp ikinci mesajda düğmeyle gider; kural burada, çünkü ajan, operatör ve taslak aynı metni üretir.
  // Ayırma çeviriden önce (sonra sabit satır tanınmazdı), defterde iki satır: Messenger echo'su iki mesajı ayrı düşürür.
  const ayrik = !input.templateName && input.text ? splitCartLink(input.text) : null;
  const baglanti = ayrik?.link ?? null;
  const govdeGirdisi: SendMessageInput = baglanti ? { ...input, text: ayrik!.body } : input;

  let govde: SendOutcome | null = null;
  if (!baglanti || govdeGirdisi.text) {
    // Çeviri düşerse sağlayıcıya hiç gidilmez ve deftere yazılmaz; `retryable`, çünkü sebep bizde ve geçici.
    const hazir = await prepareOutboundText(db, conversation, govdeGirdisi, opts);
    if (!hazir.ok) {
      logger.warn(
        { context: 'messaging/send', conversationId: conversation.id, reason: hazir.reason },
        'giden mesaj ÇEVRİLEMEDİ — gönderilmedi, deftere yazılmadı',
      );
      return { status: 'failed', reason: 'translation_failed', retryable: true };
    }
    govde = await teslimEtVeYaz(db, sender, conversation.id, target, { ...govdeGirdisi, text: hazir.text }, hazir);
    if (!baglanti || govde.status !== 'sent') return govde;
  }

  const { language: dil } = await resolveOutboundLanguage(db, conversation);
  const dugmeMetni = `${LINK_BUTTON_TEXT[baglanti.purpose][dil]}\n${baglanti.url}`;
  const dugme = await teslimEtVeYaz(
    db,
    sender,
    conversation.id,
    target,
    {
      conversationId: input.conversationId,
      text: dugmeMetni,
      kind: 'interactive',
      payload: { ...(input.payload ?? {}), interactive: cartLinkButton(baglanti, dil, conversation.source), cartLink: baglanti.url },
      author: input.author,
      language: dil,
    },
    {
      language: dil,
      // Müşteriye giden dil Türkçe değilse operatör için torbaya Türkçesi düşer.
      translations: dil === 'tr' ? null : { tr: linkTail(baglanti) },
      translatedAt: new Date().toISOString(),
    },
  );
  if (!govde) return dugme;
  if (dugme.status !== 'sent') {
    // Gövde gitti, düğme gitmedi: gövdeyi "gönderilemedi" diye çevirmek yalan olurdu (ajan devreder, operatör yeniden yazar).
    // Düşüş `error_log`a kimlikle yazılır, dönüş `sent` kalır.
    await captureError(new Error(`bağlantı düğmesi gönderilemedi (${baglanti.purpose}): ${dugme.reason}`), {
      source: SOURCES.webServer,
      context: { area: 'messaging/send', conversationId: conversation.id, providerMessageId: govde.providerMessageId },
    });
  }
  return govde;
}

/** Gövde ve düğme aynı kapıdan geçer: sıra ve telafi tek yerde. */
async function teslimEtVeYaz(
  db: SupabaseClient,
  sender: MessageSender,
  conversationId: string,
  target: SendTarget,
  giden: SendMessageInput,
  hazir: Pick<MessageTranslationPatch, 'language' | 'translations'> & { translatedAt: string | null },
): Promise<SendOutcome> {
  const result = await sender.send(target, giden);
  if (!result.ok) {
    logger.warn(
      { context: 'messaging/send', conversationId, driver: sender.name, reason: result.reason },
      'giden mesaj gönderilemedi — deftere YAZILMADI',
    );
    return { status: 'failed', reason: result.reason, retryable: result.retryable };
  }

  try {
    // Gönderilen metin ve çeviri üçlüsü tek turda: satır "müşteri ne okudu" der.
    const message = await recordOutboundMessage(db, {
      ...giden,
      language: hazir.language,
      translations: hazir.translations,
      translatedAt: hazir.translatedAt,
      providerMessageId: result.providerMessageId,
    });
    return { status: 'sent', message, providerMessageId: result.providerMessageId };
  } catch (err) {
    // Mesaj gitti ama kaydı düştü: sessiz kalmak aynı cevabın ikinci kez yazılmasına yol açardı. `captureError` fırlatmaz ve
    // çağıran "gitti" bilgisini kaybetmemeli.
    await captureError(err, {
      source: SOURCES.webServer,
      context: {
        area: 'messaging/send',
        conversationId,
        providerMessageId: result.providerMessageId,
        note: 'mesaj gönderildi ama deftere yazılamadı',
      },
    });
    // `message: null` eksiği söyler; telafi yeniden yazmak değil, iz bırakmaktır.
    return { status: 'sent', message: null, providerMessageId: result.providerMessageId };
  }
}
