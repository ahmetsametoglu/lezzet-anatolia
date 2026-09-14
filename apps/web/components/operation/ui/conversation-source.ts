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
 * Kuyruk satırının seçili kenarı — kanal MARKA rengiyle: kuyruk üç kanalın kuyruğu ve satırın hangi
 * kanaldan geldiği ilk bakışta okunmalı.
 */
export const SOURCE_EDGE: Record<ConversationSource, string> = {
  whatsapp: 'border-l-brand-whatsapp',
  messenger: 'border-l-brand-messenger',
  instagram: 'border-l-brand-instagram',
};

/** Kanal noktası — müşterinin kanal düğmelerinde; kuyruk kenarıyla AYNI marka rengi. */
export const SOURCE_DOT: Record<ConversationSource, string> = {
  whatsapp: 'bg-brand-whatsapp',
  messenger: 'bg-brand-messenger',
  instagram: 'bg-brand-instagram',
};
