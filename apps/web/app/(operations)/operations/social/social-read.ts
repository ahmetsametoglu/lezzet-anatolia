import { humanAgentWindowState, resolveUserText, serviceWindowState, stripChatFormatting, translatableTextOf } from '@lezzet/domain-core';
import type {
  ConversationInboxRow,
  ConversationNote,
  ConversationSource,
  CustomerInboxRow,
  CustomerInboxThread,
  TranslationBag,
} from '@lezzet/types';
import type { MessageWithMedia } from '@/lib/messaging/read';
import type { ConsentState } from '@/components/operation/ui/customer-context-pane';
import { agoShort, shortDateTime } from '@/components/operation/ui/format';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { MESSAGE_KIND_LABELS, TEMPLATE_CATEGORY_LABELS } from './social-labels';
import type { InboxRowView, MessageView, ThreadItemView, WindowView } from './social-types';
import type { SocialChannelKey, SocialFilterKey } from './social-url';

// Saf dönüşümler ayrı dosyada: pencerenin ne zaman "az kaldı"ya döndüğü, gövdesiz mesajın nasıl okunacağı birer
// karardır ve bileşene gömülen karar sınanamaz.

/** Üç saat: bir saat vardiyada fark edilmeden geçer, altı saat 24 saatlik pencerede sürekli amber yakar ve uyarı olmaktan çıkar. */
export const WINDOW_SOON_MS = 3 * 60 * 60 * 1000;

/** Son saatte dakikaya iner: operatörün gerçekten koşması gereken aralıkta "0 sa" hem yanlış hem işe yaramaz olurdu. */
export function remainingLabel(msRemaining: number): string {
  const minutes = Math.floor(msRemaining / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} dk`;
  // Messenger/Instagram'ın 7 günlük insan temsilci süresi saatle okunmaz.
  if (minutes > 24 * 60) return `${Math.floor(minutes / (24 * 60))} gün`;
  return `${Math.floor(minutes / 60)} sa`;
}

/**
 * Süre burada yeniden hesaplanmaz: kural motorda tek kopya durur, ikinci kopya ayrışırsa ekran "açık" derken gönderim kalıp
 * ücretiyle geçerdi. Messenger/Instagram'da 24 saatten sonra 7 güne kadar insan temsilci yazabilir (`human`), gönderim kapısıyla aynı kural.
 */
export function toWindowView(windowExpiresAt: string | null, now: Date, source: ConversationSource): WindowView {
  const state = serviceWindowState(windowExpiresAt, now);
  if (!state.everOpened) return { state: 'never', chip: '—', tone: 'idle' };
  if (state.open) {
    return {
      state: 'open',
      chip: remainingLabel(state.msRemaining),
      tone: state.msRemaining <= WINDOW_SOON_MS ? 'soon' : 'open',
    };
  }
  if (source !== 'whatsapp') {
    const human = humanAgentWindowState(windowExpiresAt, now);
    if (human.open) return { state: 'human', chip: remainingLabel(human.msRemaining), tone: 'soon' };
  }
  return { state: 'closed', chip: 'kapalı', tone: 'closed' };
}

export function humanCanReply(window: WindowView): boolean {
  return window.state === 'open' || window.state === 'human';
}

/**
 * WhatsApp'ta izin müşteri kaydında durur (kayıt yoksa sohbetinkine düşülür); Messenger/Instagram'da müşteri kaydının o kanal
 * için kutusu yok, izin sohbettedir. Sorulma damgası olmayan `opt_in = false` "sorulmadı"dır, "reddetti" değil.
 */
export function consentStateOf(input: {
  source: ConversationSource;
  customerConsent: { granted: boolean } | null;
  optIn: boolean;
  optInAskedAt: string | null;
}): ConsentState {
  if (input.source === 'whatsapp' && input.customerConsent) {
    return input.customerConsent.granted ? 'granted' : 'refused';
  }
  if (input.optIn) return 'granted';
  return input.optInAskedAt ? 'refused' : 'unasked';
}

/**
 * Satır sonu boşluğa çevrilir, yoksa dar sütun ilk satırda kesilip yarım cümleyi mesajın tamamı gibi gösterirdi. Metinsiz
 * türde türün adı yazılır: boş önizleme "mesaj yok" diye okunur.
 */
export function previewOf(text: string | null, kind: ConversationInboxRow['lastMessageKind']): string {
  // Biçim işaretleri sökülür: balon `*kalın*`ı çizer, tarama satırında ise çıplak yıldız olarak görünürdü.
  const flat = stripChatFormatting(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat) return flat;
  return kind ? MESSAGE_KIND_LABELS[kind] : 'Henüz mesaj yok';
}

/** Messenger/Instagram'da son basamak opak bir PSID/IGSID'dir; yine de boş başlıktan iyidir, "hangi satır" sorusunu cevaplar. */
export function titleOf(row: { customerName?: string | null; profileName: string | null; externalRef: string }): string {
  return row.customerName?.trim() || row.profileName?.trim() || row.externalRef;
}

/** Gösterilen metin kanaldan geçenden farklıysa künye döner: operatör makine cümlesini müşterinin cümlesi sanmamalı. */
function shownTextOf(source: {
  text: string | null;
  transcript: string | null;
  language: string | null;
  translations: TranslationBag | null;
}): { text: string | null; translation: MessageView['translation'] } {
  const original = translatableTextOf(source);
  const shown = resolveUserText({ text: original, language: source.language, translations: source.translations }, OPERATIONS_LOCALE);
  return {
    text: shown.text,
    translation: shown.isTranslated && original ? { original, language: shown.sourceLanguage } : null,
  };
}

/** `now` dışarıdan gelir: listenin başı ile sonu aynı ana göre hesaplansın. */
export function toInboxRows(rows: readonly CustomerInboxRow[], now: Date): InboxRowView[] {
  const nowMs = now.getTime();
  return rows.map((row) => ({
    id: row.id,
    channels: row.sources,
    threads: row.threads,
    title: titleOf(row),
    // Transkript ve çeviri önizlemede de: kuyruk sohbet açılmadan taranır.
    preview: previewOf(
      shownTextOf({
        text: row.lastMessageText,
        transcript: row.lastMessageTranscript,
        language: row.lastMessageLanguage,
        translations: row.lastMessageTranslations,
      }).text,
      row.lastMessageKind,
    ),
    ago: row.lastMessageAt ? agoShort(ageMinutes(row.lastMessageAt, nowMs)) : '—',
    // Baş sohbet cevaplanmış olsa da öteki kanalda top bizde olabilir.
    awaitingReply: row.awaitingAny,
    unidentified: row.customerId === null,
    handledBy: row.handledBy,
    window: toWindowView(row.windowExpiresAt, now, row.source),
  }));
}

/** Süzgeç varsa ona uyan sohbet açılır, ikisi birden tutmazsa kanal önce gelir (çip kanalı adıyla seçti); süzgeç yoksa en son yazılan. */
export function rowTarget(row: Pick<InboxRowView, 'id' | 'threads'>, filter: { f: SocialFilterKey; ch: SocialChannelKey }): string {
  const fits = (thread: CustomerInboxThread) => filter.ch === 'all' || thread.source === filter.ch;
  const waits = (thread: CustomerInboxThread) => filter.f !== 'awaiting' || thread.awaitingReply;
  const hit = row.threads.find((t) => fits(t) && waits(t)) ?? row.threads.find(fits) ?? row.threads.find(waits);
  return hit?.id ?? row.id;
}

/** Boş kanal sekmesi çizilmez; açık sohbet mesajsız da olsa sekmesini korur, yoksa operatör hangi kanalda olduğunu göremezdi. */
export function tabsOf(threads: readonly CustomerInboxThread[], current: CustomerInboxThread): CustomerInboxThread[] {
  const visible = threads.filter((thread) => thread.messageCount > 0 || thread.id === current.id);
  return visible.some((thread) => thread.id === current.id) ? visible : [current, ...visible];
}

/** Negatife düşmez: saat kayması "-3 dk" diye okunurdu. */
function ageMinutes(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, (nowMs - t) / 60_000);
}

/** Kalıp etiketi kategoriyi de yazar: kategori ücret sınıfıdır, pahalı mesaj ucuzundan ayırt edilmeli. */
export function toMessageViews(messages: readonly MessageWithMedia[]): MessageView[] {
  return messages.map((m) => {
    // Çeviri künyesi tek metne aittir: sesli mesajda transkripte, ötekilerde gövdeye.
    const shown = shownTextOf({ text: m.body.text, transcript: m.mediaTranscript, language: m.language, translations: m.translations });
    const sesli = Boolean(m.mediaTranscript?.trim());
    return {
      id: m.id,
      direction: m.direction,
      author: m.author,
      kind: m.kind,
      // Medyada yer tutucu yok: dosyanın kendisi çiziliyor, alınamadıysa sebebini balon yazıyor (`MediaBody`).
      text: sesli ? m.body.text?.trim() || '' : shown.text || (m.kind === 'media' ? '' : MESSAGE_KIND_LABELS[m.kind]),
      stamp: shortDateTime(m.createdAt),
      templateLabel: m.templateName
        ? `${m.templateName}${m.templateCategory ? ` · ${TEMPLATE_CATEGORY_LABELS[m.templateCategory]}` : ''}`
        : null,
      mediaUrl: m.mediaUrl,
      mediaMime: m.mediaMime,
      mediaTranscript: sesli ? shown.text : null,
      translation: shown.translation,
    };
  });
}

/**
 * Not balon değil, olayın olduğu yerde duran satırdır; ayrı listede operatör sebebi sohbetin neresinde olduğundan kopuk okurdu.
 * Aynı anda mesaj önce gelir: not, mesajın doğurduğu olayı anlatır.
 */
export function toThreadItems(messages: readonly MessageWithMedia[], notes: readonly ConversationNote[]): ThreadItemView[] {
  const balonlar = toMessageViews(messages);
  const akis = [
    ...messages.map((m, i) => ({ at: Date.parse(m.createdAt), sira: 0, item: { kind: 'message' as const, message: balonlar[i]! } })),
    ...notes.map((n) => ({
      at: Date.parse(n.createdAt),
      sira: 1,
      item: { kind: 'note' as const, note: { id: n.id, author: n.author, text: n.body, stamp: shortDateTime(n.createdAt) } },
    })),
  ];
  // `sort` kararlıdır: aynı andaki iki mesajın kendi sırası korunur.
  return akis.sort((a, b) => a.at - b.at || a.sira - b.sira).map((satir) => satir.item);
}
