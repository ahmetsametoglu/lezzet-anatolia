import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiFailureReason, AiModel } from '@lezzet/ai';
import { ConversationService, MessageService, UserProfileService } from '@lezzet/database';
import { outboundLanguage, spokenLanguageOf, translatableTextOf, type OutboundLanguage } from '@lezzet/domain-core';
import { DEFAULT_LOCALE } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import type { Conversation, Message, PreferredLanguage, SourceLanguage, TranslationBag } from '@lezzet/types';
import { translateUserText } from '../translate/user-text';

// `body.text` daima kanaldan geçen metindir: giden mesajda satıra gönderilen yazılır, operatörün Türkçesi torbaya düşer ve "müşteri
// ne okudu" hep aynı yerden cevaplanır.

// Gelen mesaj yazımdan sonra çevrilir, düşerse kuyruk telafi eder; giden mesaj gönderimden önce çevrilir, düşerse gitmez. İstisna
// `not_configured`: çeviri hiç kurulmamışsa mesaj yazıldığı dilde gider, anahtarsız kurulumda operatörün elini bağlamak daha pahalıdır.

/** Varsayılan `@lezzet/i18n`den gelir, motor o pakete bakamaz. Konuşmanın dili biliniyorsa profile gidilmez: konuşma profili yener. */
export async function resolveOutboundLanguage(
  db: SupabaseClient,
  conversation: Pick<Conversation, 'language' | 'customerId'>,
): Promise<OutboundLanguage> {
  if (conversation.language) return outboundLanguage(conversation, null, DEFAULT_LOCALE);
  const profile = conversation.customerId ? await new UserProfileService(db).getById(conversation.customerId) : null;
  return outboundLanguage(conversation, profile, DEFAULT_LOCALE);
}

export interface MessageTranslationPatch {
  language: SourceLanguage | null;
  translations: TranslationBag | null;
  translatedAt: string;
}

/**
 * Tek kapı: gelişte çeviren yol da kuyruk da buradan geçer, yoksa dili öğreten kural iki yerde yaşardı. `null` = satır zaten
 * damgalıydı; ikinci sonuç birincisini ezmez.
 */
export async function saveMessageTranslation(
  db: SupabaseClient,
  messageId: string,
  patch: MessageTranslationPatch,
): Promise<Message | null> {
  const yazilan = await new MessageService(db).setTranslation(messageId, patch);
  if (!yazilan) return null;
  // Öğrenme yalnız gelen mesajdan: giden mesajın dili bizim kararımızdır, kanıt değil.
  const ogrenilen = yazilan.direction === 'inbound' ? spokenLanguageOf(patch.language) : null;
  if (ogrenilen) await new ConversationService(db).setLanguage(yazilan.conversationId, ogrenilen);
  return yazilan;
}

/** `false` = satır damgasız kalır ve kuyruk telafi eder. Fırlatmaz: çeviri ajanın ön koşulu değil. */
export async function translateConversationMessageNow(
  db: SupabaseClient,
  message: Pick<Message, 'id' | 'body' | 'mediaTranscript'>,
  opts: { model?: AiModel } = {},
): Promise<boolean> {
  const text = translatableTextOf({ text: message.body.text, transcript: message.mediaTranscript });
  if (!text) return false;

  try {
    const res = await translateUserText(text, 'sohbet_mesaji', opts);
    if (!res.ok) {
      // Uyarı, hata değil: kuyruk telafi edecek; kimlik yazılır, içerik yazılmaz.
      logger.warn(
        { context: 'messaging/translate', messageId: message.id, reason: res.reason },
        'sohbet mesajı gelişinde çevrilemedi — kuyruğa bırakıldı',
      );
      return false;
    }
    await saveMessageTranslation(db, message.id, {
      language: res.data.language,
      translations: res.data.translations,
      translatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    logger.warn(
      { context: 'messaging/translate', messageId: message.id, err: (err as Error).message },
      'sohbet mesajının çevirisi yazılamadı — kuyruğa bırakıldı',
    );
    return false;
  }
}

export type OutboundTextPlan =
  | {
      ok: true;
      text: string | null;
      language: SourceLanguage | null;
      translations: TranslationBag | null;
      /** `null` = çeviri denenmedi (yapılandırma yok); kuyruk sonra bakar. */
      translatedAt: string | null;
    }
  | { ok: false; reason: AiFailureReason };

/**
 * Kalıp ve metinsiz mesaj çeviriden geçmez: kalıbın gövdesi Meta'nın onayladığı metindir. İkisi de damgalanır ki kuyruk onlara bir
 * daha bakmasın.
 */
export async function prepareOutboundText(
  db: SupabaseClient,
  conversation: Pick<Conversation, 'id' | 'language' | 'customerId'>,
  input: { text: string | null; templateName?: string | null; language?: PreferredLanguage | null },
  opts: { model?: AiModel } = {},
): Promise<OutboundTextPlan> {
  const now = new Date().toISOString();
  if (!input.text?.trim() || input.templateName) {
    return { ok: true, text: input.text, language: null, translations: null, translatedAt: now };
  }
  const orijinal = input.text;

  const hedef = (await resolveOutboundLanguage(db, conversation)).language;

  // Çağıran dili bildirdi ve hedefle aynı: model yok, torba yok.
  if (input.language && input.language === hedef) {
    return { ok: true, text: orijinal, language: hedef, translations: null, translatedAt: now };
  }

  const res = await translateUserText(orijinal.trim(), 'sohbet_mesaji', opts);
  if (!res.ok) {
    if (res.reason === 'not_configured') {
      logger.warn(
        { context: 'messaging/translate', conversationId: conversation.id, target: hedef },
        'çeviri yapılandırılmamış — giden mesaj yazıldığı dilde gidiyor',
      );
      // Damga yok: anahtar gelince kuyruk geçmişi çevirir.
      return { ok: true, text: orijinal, language: input.language ?? null, translations: null, translatedAt: null };
    }
    return { ok: false, reason: res.reason };
  }

  const kaynak = res.data.language;
  // Operatör hedef dilde yazdıysa metin aynen gider; torba operatörün Türkçe okuyabilmesi için kalır.
  if (kaynak === hedef) {
    return { ok: true, text: orijinal, language: kaynak, translations: res.data.translations, translatedAt: now };
  }

  const yazar = spokenLanguageOf(kaynak);
  if (!yazar) {
    // Yazılan dil üç dilden biri değilse çevrilmeden gider: torbada o dilin yeri yok ve orijinal defterden kaybolurdu.
    logger.info(
      { context: 'messaging/translate', conversationId: conversation.id, source: kaynak, target: hedef },
      'giden mesajın dili konuştuğumuz üç dilden değil — çevrilmeden gönderiliyor',
    );
    return { ok: true, text: orijinal, language: kaynak, translations: res.data.translations, translatedAt: now };
  }

  const ceviri = res.data.translations?.[hedef]?.trim();
  // Model hedef dili boş döndürdü: sözleşmesine aykırı, gönderim yok.
  if (!ceviri) return { ok: false, reason: 'invalid_output' };

  // Torba gönderilen dil hariç her şeydir: satırın kaynağı artık gönderilen metin.
  const torba: TranslationBag = { ...res.data.translations, [yazar]: orijinal };
  delete torba[hedef];
  return { ok: true, text: ceviri, language: hedef, translations: torba, translatedAt: now };
}
