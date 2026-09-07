import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiFailureReason, AiModel } from '@lezzet/ai';
import { ConversationService, MessageService, UserProfileService } from '@lezzet/database';
import { outboundLanguage, spokenLanguageOf, translatableTextOf, type OutboundLanguage } from '@lezzet/domain-core';
import { DEFAULT_LOCALE } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import type { Conversation, Message, PreferredLanguage, SourceLanguage, TranslationBag } from '@lezzet/types';
import { translateUserText } from '../translate/user-text';

/*
  SOHBET MESAJININ ÇEVİRİSİ (15.28) — talep kanalının deseni (`ticket/translate.ts`), sohbetin
  kendi gerçeğine uyarlanmış.

  ── ÇÖZÜLEN ARIZA ───────────────────────────────────────────────────────────
  Fransız bir müşteri WhatsApp'tan yazıyordu ve ajan ona TÜRKÇE cevap veriyordu. Ajanın kuralı
  "Türkçe yaz, çeviri sistemin işi"ydi ve talep kanalında doğruydu — orada müşteri sitede okur,
  site kendi dilini bilir, torbadan seçer. Sohbette o katman HİÇ YOKTU: gönderim kapısında çeviri
  adımı yoktu, müşteriye ne yazıldıysa o gidiyordu. Operatör de müşterinin Fransızcasını çevirisiz
  okuyordu. Kullanıcı: *"bu çok dil yapısını da şimdi yapalım. Bu kilit bir konu."*

  ── İKİ YÖN, İKİ AN ─────────────────────────────────────────────────────────
  · GELEN mesaj yazıldıktan SONRA çevrilir (webhook'un dışında, ajandan önce): operatör Türkçe
    okur. Sesli mesajda çevrilen şey TRANSKRİPTİR — ayrı bir mekanizma değil, aynı kapı
    (`translatableTextOf`, motorda).
  · GİDEN mesaj gönderimden ÖNCE çevrilir (`prepareOutboundText`, `sendOutboundMessage`in
    içinde): müşteri kendi dilinde okur. Çeviri sonucu gönderilen metinle TEK turda yazılır.

  ── `body.text` DAİMA KANALDAN GEÇEN METİNDİR ────────────────────────────────
  Giden mesajda satıra Fransızca (gönderilen) yazılır, operatörün Türkçesi torbaya (`tr`) düşer.
  Tersi — Türkçeyi satıra, Fransızcayı torbaya — ledger'ı iki anlamlı yapardı: telefondan/echo'dan
  düşen giden mesajda satır zaten kanaldan geçen metindir. Tek kural: "müşteri ne okudu" sorusu
  hep `body.text`ten cevaplanır; `resolveUserText` operatöre torbadaki Türkçeyi gösterir.

  ── HEDEF DİL BİR KARARDIR, MOTORDA DURUR ───────────────────────────────────
  `outboundLanguage` (domain-core): konuşmanın dili → profil tercihi → piyasa varsayılanı.
  Varsayılan `@lezzet/i18n`den geliyor (`DEFAULT_LOCALE`, birincil pazar Fransa) — motor o pakete
  bakamaz, değeri buradan alıyor. Konuşmanın dili gelen mesajın tespit edilen dilinden ÖĞRENİLİR
  (`saveMessageTranslation`), son gelen kazanır.

  ── ÇEVİRİ DÜŞERSE ──────────────────────────────────────────────────────────
  · Gelen: mesaj düşmez, satır çeviri kuyruğunda kalır (20.2'nin kuyruğu 4. kaynak olarak bunu da
    tarıyor). Talep kanalının aynı kuralı.
  · Giden: mesaj GİTMEZ ve `failed/translation_failed` döner. Türkçeyi Fransız müşteriye
    göndermek sessiz bir arıza olurdu; göndermemek gürültülüdür (operatör görür, ajan sonraki
    turda yeniden dener). İstisna `not_configured`: çeviri katmanı HİÇ kurulmamışsa mesaj yazıldığı
    dilde gider ve uyarı loglanır — anahtarsız bir kurulumda operatörün elini bağlamak, çeviriden
    daha pahalı olurdu.

  ── ÇAĞIRAN DİLİ BİLDİREBİLİR ───────────────────────────────────────────────
  Sistem mesajları elle üç dilde yazılı (bağlama onayı, güvenlik kodu). Çağıran `language` verir;
  hedefle aynıysa model hiç çağrılmaz — hem bedava hem deterministik, ve güvenlik kodu gibi bir
  değer gereksiz yere modelden geçmez.
*/

/**
 * Bu sohbete hangi dilde yazarız — kararı motor verir (`outboundLanguage`), profil gerekiyorsa
 * burada okunur. Konuşmanın dili biliniyorsa profile HİÇ gidilmez: bir okuma tasarrufu değil,
 * kararın kendisi (konuşma profili yener).
 */
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
 * Çeviri sonucunu satıra yazar VE gelen mesajsa konuşmanın dilini öğretir — **tek kapı:** gelişte
 * çeviren yol da kuyruk da buradan geçer, yoksa dili öğreten kural iki yerde yaşar ve biri unutur.
 *
 * `null` = satır zaten damgalıydı (yarışan ikinci tur — gelişteki çeviri ile kuyruk aynı satıra
 * denk gelebilir). İkinci sonuç birincisini EZMEZ: operatörün okuduğu metin değişmemeli.
 */
export async function saveMessageTranslation(
  db: SupabaseClient,
  messageId: string,
  patch: MessageTranslationPatch,
): Promise<Message | null> {
  const yazilan = await new MessageService(db).setTranslation(messageId, patch);
  if (!yazilan) return null;
  // Öğrenme yalnız GELEN mesajdan: giden mesajın dili bizim kararımızdır, kanıt değil.
  const ogrenilen = yazilan.direction === 'inbound' ? spokenLanguageOf(patch.language) : null;
  if (ogrenilen) await new ConversationService(db).setLanguage(yazilan.conversationId, ogrenilen);
  return yazilan;
}

/**
 * Az önce yazılmış bir sohbet mesajını **şimdi** çevirir — `translateTicketMessageNow`ın eşi.
 *
 * @returns `true` yalnız çeviri satıra yazıldıysa. `false` "olmadı" demektir: satır damgasız
 * kalır ve kuyruk telafi eder. Fırlatmaz — çağıran (webhook'un arka plan zinciri) ajanı yine
 * tetiklemeli; çeviri ajanın ön koşulu değil.
 */
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
      // Uyarı, hata değil: kuyruk telafi edecek. Kimlik yazılır, içerik yazılmaz (`CLAUDE §1`).
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

/** Giden metnin gönderime hazır hâli: ne gidecek, hangi dilde, deftere hangi torbayla. */
export type OutboundTextPlan =
  | {
      ok: true;
      /** Kanala gidecek metin — çevrildiyse çeviri, yoksa yazıldığı gibi. */
      text: string | null;
      language: SourceLanguage | null;
      translations: TranslationBag | null;
      /** `null` = çeviri DENENMEDİ (yapılandırma yok); kuyruk sonra bakar. */
      translatedAt: string | null;
    }
  | { ok: false; reason: AiFailureReason };

/**
 * Giden metni müşterinin diline hazırlar — `sendOutboundMessage`in çeviri adımı.
 *
 * Şablon (`templateName`) ve metinsiz mesaj çeviriden GEÇMEZ: şablonun gövdesi Meta'nın onayladığı
 * metindir ve dili şablonun kendi dilidir; metinsiz mesajda çevrilecek şey yok. İkisi de
 * damgalanır ki kuyruk onlara bir daha bakmasın.
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

  // Çağıran dili BİLDİRDİ ve hedefle aynı: model yok, torba yok — metin yazıldığı gibi gider.
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
      // Damga YOK: kuyruk da `not_configured` görürse damgalamaz; anahtar gelince geçmiş çevrilir.
      return { ok: true, text: orijinal, language: input.language ?? null, translations: null, translatedAt: null };
    }
    return { ok: false, reason: res.reason };
  }

  const kaynak = res.data.language;
  // Yazılan dil zaten hedef (operatör Fransız müşteriye Fransızca yazdı): metin aynen gider,
  // torba operatörün Türkçe okuyabilmesi için kalır.
  if (kaynak === hedef) {
    return { ok: true, text: orijinal, language: kaynak, translations: res.data.translations, translatedAt: now };
  }

  const yazar = spokenLanguageOf(kaynak);
  if (!yazar) {
    /* Yazılan dil torbaya SIĞMIYOR (üç dilden biri değil — İngilizce yazılmış): çevirip göndersek
       orijinal defterden kaybolurdu, çünkü torbanın o dil için yeri yok. Metin yazıldığı gibi gider;
       operatör torbadaki Türkçeyi okur. Nadir ve bilinçli; log'da iz bırakır. */
    logger.info(
      { context: 'messaging/translate', conversationId: conversation.id, source: kaynak, target: hedef },
      'giden mesajın dili konuştuğumuz üç dilden değil — çevrilmeden gönderiliyor',
    );
    return { ok: true, text: orijinal, language: kaynak, translations: res.data.translations, translatedAt: now };
  }

  const ceviri = res.data.translations?.[hedef]?.trim();
  // Model hedef dili boş döndürdü: sözleşmesine aykırı (üç dil ZORUNLU). Bozuk çıktı, gönderim yok.
  if (!ceviri) return { ok: false, reason: 'invalid_output' };

  // Torba = gönderilen dil HARİÇ her şey: öteki çeviriler + yazarın orijinali. Kaynak dil torbada
  // olmaz kuralı korunuyor — satırın kaynağı artık gönderilen metin, onun dili `hedef`.
  const torba: TranslationBag = { ...res.data.translations, [yazar]: orijinal };
  delete torba[hedef];
  return { ok: true, text: ceviri, language: hedef, translations: torba, translatedAt: now };
}
