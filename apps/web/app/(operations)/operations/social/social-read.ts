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

// Sosyal gelen kutusunun OKUMA DÖNÜŞÜMLERİ (15.5 · üç kanal 15.15) — saf fonksiyonlar, sunucu turu yok.
//
// Ayrı dosya olmalarının sebebi sınanabilirlik: pencerenin ne zaman "az kaldı"ya döndüğü, gövdesiz
// bir mesajın nasıl okunacağı ve adsız bir konuşmanın satırda ne göstereceği birer KARARDIR — ve
// karar bileşenin içine gömülürse sınanamaz.

/**
 * Pencere "az kaldı"ya kaç saat kala döner — PARAMETRİK, çizimin amber rozetinin karşılığı.
 *
 * Üç saat, çünkü eşiğin işi operatöre **bugün içinde davranma** demektir: bir saat çoğu vardiyada
 * fark etmeden geçer, altı saat ise 24 saatlik pencerenin dörtte biri ve sürekli amber gösterirdi —
 * her zaman yanan uyarı, uyarı olmaktan çıkar.
 */
export const WINDOW_SOON_MS = 3 * 60 * 60 * 1000;

/**
 * Kalan sürenin dar rozetteki hâli: `18 sa` · `45 dk`.
 *
 * Dakikaya İNER (yalnız saat gösterip "0 sa" dememek için): son yarım saat, operatörün gerçekten
 * koşması gereken tek aralık ve orada "0 sa" hem yanlış hem işe yaramaz olurdu.
 */
export function remainingLabel(msRemaining: number): string {
  const minutes = Math.floor(msRemaining / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} dk`;
  // Bir günü aşan süre (Messenger/Instagram'ın 7 günlük insan temsilci süresi, 15.37) gün cinsinden.
  if (minutes > 24 * 60) return `${Math.floor(minutes / (24 * 60))} gün`;
  return `${Math.floor(minutes / 60)} sa`;
}

/**
 * Servis penceresi → ekran görünümü. Kararı MOTOR verir (`serviceWindowState`), burası çevirir.
 *
 * Süre burada yeniden hesaplanmaz ve hesaplanmamalı: 24 saat kuralı motorda tek kopya durur
 * (`serviceWindowExpiry`), ekran onu ikinci kez yazsaydı bir gün ayrışırlardı ve ayrışma sessiz
 * olurdu — ekranda "açık" yazarken gönderim şablon ücretiyle geçerdi. Standart pencere üç kanalda
 * aynı (24 saat); ANLAMI kanala göre sözlükte ayrışır (`WINDOW_NOTE[source]`).
 *
 * **Messenger/Instagram'da 24 saat son değil (15.37 · kullanıcı kararı 15.09):** insan temsilci olarak
 * müşterinin son mesajından 7 güne kadar yazılabilir (`humanAgentWindowState` — gönderim kapısının aynı
 * kuralı). Bu aralık ayrı bir hâldir (`human`): kutu açık, yapay zekâ yazamaz. Ekran bir tur bunu 24 saatte
 * "kapalı" diye kesiyordu — kapı gönderirken kutu yoktu.
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

/** İnsan operatör bu sohbete şimdi serbest metin yazabilir mi — 24 saatlik pencere ya da insan temsilci süresi (15.37). */
export function humanCanReply(window: WindowView): boolean {
  return window.state === 'open' || window.state === 'human';
}

/**
 * **Kampanya izninin panodaki hâli** (15.12 · 14.09) — üç hâlli ve KAYNAĞI kanala göre ayrı.
 *
 * WhatsApp'ta müşteri kaydının izni konuşur: sohbette verilen izin oraya da yazılıyor, hesap
 * sayfasından verilen de orada. Kayıt boşsa (bağ sonradan kurulmuş) sohbetin kaydına düşülür.
 * Messenger/Instagram'da müşteri kaydının o kanal için kutusu yok — izin sohbetin kendisinde
 * (`opt_in` + sorulma damgası).
 *
 * **"Sorulmadı" ile "reddetti" ayrı.** 14.09'a kadar pano izni "Sorulmadı" gösterirken aynı sohbette
 * "Müşteri reddetti" düğmesini SEÇİLİ çiziyordu: kayıt yalnız `opt_in`in evet/hayırını okuyordu ve
 * sorulmamış bir izin, verilmiş bir ret gibi görünüyordu.
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
 * Son mesajın tek satırlık önizlemesi.
 *
 * Satır sonu BOŞLUĞA çevrilir: çok satırlı bir mesaj dar sütunda ilk satırından sonra kesilirdi ve
 * önizleme, mesajın tamamı sanılan bir yarım cümle gösterirdi.
 *
 * Metinsiz tür sessizce boş bırakılmaz (`MESSAGE_KIND_LABELS`) — boş önizleme "mesaj yok" diye
 * okunur, oysa mesaj var ve türü metin değil.
 */
export function previewOf(text: string | null, kind: ConversationInboxRow['lastMessageKind']): string {
  /*
    ── ÖNİZLEME İŞARETLERİ SÖKER, BALON ÇİZER — DAVRANIŞ ZITTIR (07.09) ──────────────────────
    Ajan cevaplarını biçimli üretiyor (`*kalın*`, `•` madde) ve WhatsApp onu çiziyor; aynı metin
    sosyal deftere düşünce kuyruk satırında ÇIPLAK YILDIZ olarak görünüyordu. Sohbet balonu
    çiziyor (`ChatText`), liste satırı sökmeli: orası okunacak bir metin değil, tek satırlık bir
    TARAMA dizesi — operatör "kim ne demiş" diye göz gezdiriyor.

    Kayıplı olması sorun değil, çünkü önizleme zaten türetilmiş ve kırpılmış bir kopya: kaynak
    sohbette duruyor ve orada tam hâliyle çiziliyor.

    Sıra ÖNEMLİ — önce sök, sonra düzleştir: sökme madde işaretini bırakıyor (`•` düz metinde de
    okunur) ve satır sonları burada zaten boşluğa çevriliyor.
  */
  const flat = stripChatFormatting(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat) return flat;
  return kind ? MESSAGE_KIND_LABELS[kind] : 'Henüz mesaj yok';
}

/**
 * Satırın/sohbetin başlığı — üç basamaklı düşüş, kanala duyarlı (15.15): müşteri adı → sağlayıcı
 * profil adı → dış anahtar. Son basamak WhatsApp'ta okunaklıdır (telefon — operatörün WhatsApp'ta
 * aradığı şey); Messenger/IG'de opak PSID/IGSID'dir ve ancak hiçbir ad yoksa görünür — boş bir
 * başlık satırı tanınmaz kılardı, opak da olsa bir anahtar "hangi satır" sorusunu cevaplar.
 */
export function titleOf(row: { customerName?: string | null; profileName: string | null; externalRef: string }): string {
  return row.customerName?.trim() || row.profileName?.trim() || row.externalRef;
}

/**
 * Kanaldan geçen metnin operatöre GÖSTERİLECEK hâli + künyesi (15.28).
 *
 * Kararı motor verir (`resolveUserText`: operatörün dili → orijinal), hangi metnin çevrildiğini de
 * motor söyler (`translatableTextOf`: transkript alt yazıyı yener). Burası yalnız ikisini bağlar ve
 * "gösterilen ≠ kanaldan geçen" hâlini künyeye çevirir — orijinal bir tık uzakta durmalı.
 */
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

/**
 * Gelen kutusu satırları — KİŞİ başına (15.38 · `customer_inbox`). `now` DIŞARIDAN gelir — sayfa onu bir kez
 * okur ve ekrandaki bütün yaşlar aynı ana göre çıkar; içeride okunsaydı listenin başı ile sonu farklı anlara
 * göre hesaplanırdı.
 */
export function toInboxRows(rows: readonly CustomerInboxRow[], now: Date): InboxRowView[] {
  const nowMs = now.getTime();
  return rows.map((row) => ({
    id: row.id,
    channels: row.sources,
    threads: row.threads,
    title: titleOf(row),
    // Önizleme operatörün dilinde ve sesli mesajda transkript (15.28): kuyruk açılmadan taranır.
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
    // KİŞİNİN hâli (15.38): baş sohbet cevaplanmış olsa da öteki kanalda top bizde olabilir.
    awaitingReply: row.awaitingAny,
    unidentified: row.customerId === null,
    handledBy: row.handledBy,
    window: toWindowView(row.windowExpiresAt, now, row.source),
  }));
}

/**
 * Kuyruk satırına basınca AÇILACAK sohbet (15.38) — kişinin satırı birden çok sohbet taşır. Süzgeç varsa ona
 * uyan sohbet: "Messenger" çipinde Messenger'ı, "Cevap bekliyor"da topun bizde olduğunu açar; ikisi birden
 * tutmazsa kanal önce gelir (çip kanalı ADIYLA seçti). Süzgeç yoksa baş sohbet — en son yazdığı. Sıra
 * görünümden gelir (en son yazdığı önce).
 */
export function rowTarget(row: Pick<InboxRowView, 'id' | 'threads'>, filter: { f: SocialFilterKey; ch: SocialChannelKey }): string {
  const fits = (thread: CustomerInboxThread) => filter.ch === 'all' || thread.source === filter.ch;
  const waits = (thread: CustomerInboxThread) => filter.f !== 'awaiting' || thread.awaitingReply;
  const hit = row.threads.find((t) => fits(t) && waits(t)) ?? row.threads.find(fits) ?? row.threads.find(waits);
  return hit?.id ?? row.id;
}

/**
 * Sohbet başlığının kanal SEKMELERİ (15.38) — çizimin kuralı: sekme yalnız mesajı olan kanalda görünür, boş
 * kanal sekmesi çıkmaz. İstisna açık sohbetin kendisi: "WhatsApp'tan yaz" ile açılmış mesajsız sohbet de ekrandaysa
 * sekmesi durur — yoksa operatör hangi kanalda olduğunu göremezdi. Kişinin satırı okunamadıysa sekme açık sohbettir.
 */
export function tabsOf(threads: readonly CustomerInboxThread[], current: CustomerInboxThread): CustomerInboxThread[] {
  const visible = threads.filter((thread) => thread.messageCount > 0 || thread.id === current.id);
  return visible.some((thread) => thread.id === current.id) ? visible : [current, ...visible];
}

/** Bir damganın dakika cinsinden yaşı. Negatife DÜŞMEZ: saat kayması "-3 dk" diye okunurdu. */
function ageMinutes(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, (nowMs - t) / 60_000);
}

/**
 * Mesaj defteri → balonlar. Sıra DEĞİŞTİRİLMEZ (eskiden yeniye): okunan şey bir sohbet.
 *
 * Şablon etiketi adla birlikte KATEGORİYİ de yazar, çünkü kategori ücret sınıfıdır ve "bu ay
 * WhatsApp bize ne yazdı" sorusunun cevabı orada. Adı tek başına göstermek, pahalı bir mesajı ucuz
 * bir mesajdan ayırt edilemez kılardı.
 */
export function toMessageViews(messages: readonly MessageWithMedia[]): MessageView[] {
  return messages.map((m) => {
    // Çeviri künyesi tek metne aittir: sesli mesajda transkripte, ötekilerde gövdeye (15.28).
    const shown = shownTextOf({ text: m.body.text, transcript: m.mediaTranscript, language: m.language, translations: m.translations });
    const sesli = Boolean(m.mediaTranscript?.trim());
    return {
      id: m.id,
      direction: m.direction,
      author: m.author,
      kind: m.kind,
      /*
        MEDYADA YER TUTUCU YOK ARTIK: dosyanın kendisi çiziliyor, "[medya]" yazısı onun altında
        ikinci kez aynı şeyi söylerdi. Alt yazı varsa o gösteriliyor, yoksa metin satırı hiç
        çizilmiyor. Dosya alınamadıysa sebebini balonun kendisi yazıyor (`MediaBody`) — burada
        bir yer tutucuya düşmek, "alınamadı" ile "yazısız fotoğraf"ı aynı görünüme sokardı.
      */
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
 * Mesajlar + iç notlar → TEK akış, zaman sırasıyla (15.29). Not balon değil, olayın olduğu yerde duran
 * satırdır: "AI devretti" notu devrin anına — müşterinin son mesajıyla devir haberinin yanına — düşer.
 * Ayrı bir liste olarak çizilseydi operatör sebebi, sohbetin neresinde olduğundan kopuk okurdu.
 *
 * Aynı anda yazılmış mesaj ile not arasında mesaj ÖNCE gelir: not, mesajın doğurduğu olayı anlatır.
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
  // `sort` kararlıdır (ES2019): aynı andaki iki mesajın kendi sırası da korunur.
  return akis.sort((a, b) => a.at - b.at || a.sira - b.sira).map((satir) => satir.item);
}
