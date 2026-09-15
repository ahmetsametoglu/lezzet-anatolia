import type { ConversationSource } from '@lezzet/types';

// Sohbet KANALININ adı ve marka rengi (15.15 · ortak kite 15.32). Sosyal Mesajlar ekranı ve müşterinin
// kanal düğmeleri (sipariş · müşteri kartı · talep) aynı adı ve aynı rengi okur. Sosyal ekranın
// sözlüğündeydi; ikinci tüketici doğunca buraya taşındı — `social-labels` künyesinin öngördüğü taşıma.
// Renkler token'dan (CLAUDE §3), ham hex yok.

/** Kanal adı — rozet, süzgeç çipi ve kanal düğmesinin metni. Marka adları çevrilmez. */
export const SOURCE_LABELS: Record<ConversationSource, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

/**
 * Kanal işaretinin AÇIK hâli — marka rengi yazı/çizgi, markanın açık zemini (15.38): kuyruk satırının kanal
 * noktası ve seçili olmayan sohbet sekmesi. Kuyruk satırı artık bir KİŞİ (birden çok kanal); seçili kenarı
 * tek kanalın rengiyle boyamak yanlış okuturdu — kenar olive'e döndü (çizim), kanal noktada okunur.
 */
export const SOURCE_TINT: Record<ConversationSource, string> = {
  whatsapp: 'border-brand-whatsapp/25 bg-brand-whatsapp/10 text-brand-whatsapp',
  messenger: 'border-brand-messenger/25 bg-brand-messenger/10 text-brand-messenger',
  instagram: 'border-brand-instagram/25 bg-brand-instagram/10 text-brand-instagram',
};

/** Seçili sohbet sekmesi — marka zemini, üstünde kart rengi (15.38; yüzen düğmenin zemin/kart deseni). */
export const SOURCE_SOLID: Record<ConversationSource, string> = {
  whatsapp: 'border-brand-whatsapp bg-brand-whatsapp text-ops-card',
  messenger: 'border-brand-messenger bg-brand-messenger text-ops-card',
  instagram: 'border-brand-instagram bg-brand-instagram text-ops-card',
};

/** Kanal noktası — müşterinin kanal düğmelerinde; kuyruk kenarıyla AYNI marka rengi. */
export const SOURCE_DOT: Record<ConversationSource, string> = {
  whatsapp: 'bg-brand-whatsapp',
  messenger: 'bg-brand-messenger',
  instagram: 'bg-brand-instagram',
};
