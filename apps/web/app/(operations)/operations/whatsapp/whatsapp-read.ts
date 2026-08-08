import { serviceWindowState } from '@lezzet/domain-core';
import type { ConversationInboxRow, Message } from '@lezzet/types';
import { agoShort, shortDateTime } from '@/components/operation/ui/format';
import { MESSAGE_KIND_LABELS, TEMPLATE_CATEGORY_LABELS } from './whatsapp-labels';
import type { InboxRowView, MessageView, WindowView } from './whatsapp-types';

// WhatsApp izleme ekranının OKUMA DÖNÜŞÜMLERİ (15.5) — saf fonksiyonlar, sunucu turu yok.
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
  return `${Math.floor(minutes / 60)} sa`;
}

/**
 * Servis penceresi → ekran görünümü. Kararı MOTOR verir (`serviceWindowState`), burası çevirir.
 *
 * Süre burada yeniden hesaplanmaz ve hesaplanmamalı: 24 saat kuralı motorda tek kopya durur
 * (`serviceWindowExpiry`), ekran onu ikinci kez yazsaydı bir gün ayrışırlardı ve ayrışma sessiz
 * olurdu — ekranda "açık" yazarken gönderim şablon ücretiyle geçerdi.
 */
export function toWindowView(windowExpiresAt: string | null, now: Date): WindowView {
  const state = serviceWindowState(windowExpiresAt, now);
  if (!state.everOpened) return { state: 'never', chip: '—', tone: 'idle' };
  if (!state.open) return { state: 'closed', chip: 'kapalı', tone: 'closed' };
  return {
    state: 'open',
    chip: remainingLabel(state.msRemaining),
    tone: state.msRemaining <= WINDOW_SOON_MS ? 'soon' : 'open',
  };
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
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat) return flat;
  return kind ? MESSAGE_KIND_LABELS[kind] : 'Henüz mesaj yok';
}

/**
 * Gelen kutusu satırları. `now` DIŞARIDAN gelir — sayfa onu bir kez okur ve ekrandaki bütün yaşlar
 * aynı ana göre çıkar; içeride okunsaydı listenin başı ile sonu farklı anlara göre hesaplanırdı.
 *
 * Başlık adsız konuşmada NUMARADIR: `customerName` yalnız kimlik çözülünce dolar ve boş bir başlık
 * satırı tanınmaz kılardı. Numara zaten operatörün WhatsApp'ta aradığı şey.
 */
export function toInboxRows(rows: readonly ConversationInboxRow[], now: Date): InboxRowView[] {
  const nowMs = now.getTime();
  return rows.map((row) => ({
    id: row.id,
    title: row.customerName?.trim() || row.externalRef,
    preview: previewOf(row.lastMessageText, row.lastMessageKind),
    ago: row.lastMessageAt ? agoShort(ageMinutes(row.lastMessageAt, nowMs)) : '—',
    awaitingReply: row.awaitingReply,
    unidentified: row.customerId === null,
    window: toWindowView(row.windowExpiresAt, now),
  }));
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
export function toMessageViews(messages: readonly Message[]): MessageView[] {
  return messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    kind: m.kind,
    text: m.body.text?.trim() || MESSAGE_KIND_LABELS[m.kind],
    stamp: shortDateTime(m.createdAt),
    templateLabel: m.templateName
      ? `${m.templateName}${m.templateCategory ? ` · ${TEMPLATE_CATEGORY_LABELS[m.templateCategory]}` : ''}`
      : null,
  }));
}
