import { one, oneOf, type RawParams } from '@/lib/url-params';
import { ConversationSourceEnum, type ConversationSource } from '@lezzet/types';

// Seçili konuşma adreste durur: en sık paylaşılan şey bir sohbettir ve detay sunucuda okunur. İmleç adrese yazılmaz, paylaşılan
// bağlantı kuyruğun ortasından başlamamalı.

export const SOCIAL_PATH = '/operations/social';

/** Arka uçta süzülebilen tek durum ekseni `awaitingReply`. */
export const SOCIAL_FILTERS = ['all', 'awaiting'] as const;
export type SocialFilterKey = (typeof SOCIAL_FILTERS)[number];

export const SOCIAL_FILTER_LABELS: Record<SocialFilterKey, string> = {
  all: 'Tümü',
  awaiting: 'Cevap bekliyor',
};

/** Kanal durum ekseninden ayrı: iki eksen tek çip şeridine sıkışsaydı ya soru sorulamaz ya kombinasyon patlardı. */
export const SOCIAL_CHANNELS = ['all', ...ConversationSourceEnum.options] as const;
export type SocialChannelKey = (typeof SOCIAL_CHANNELS)[number];

export interface SocialUrlState {
  f: SocialFilterKey;
  ch: SocialChannelKey;
  c: string;
}

export function channelSource(ch: SocialChannelKey): ConversationSource | undefined {
  return ch === 'all' ? undefined : ch;
}

/**
 * Varsayılan "Tümü", Talepler'den bilinçli ayrım: operatör buraya çoğu zaman belirli bir sohbeti okumaya gelir. "Cevap
 * bekliyor" varsayılan olsaydı cevaplanmış konuşmanın bağlantısı boş kuyrukla açılırdı.
 */
const DEFAULTS: SocialUrlState = { f: 'all', ch: 'all', c: '' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kimliğin biçimi burada elenir, varlığı değil: uydurma dizgeyle okuma turuna çıkmanın karşılığı yok. */
export function parseSocialUrl(params: RawParams): SocialUrlState {
  const c = one(params.c).trim();
  return {
    f: oneOf(params.f, SOCIAL_FILTERS, DEFAULTS.f),
    ch: oneOf(params.ch, SOCIAL_CHANNELS, DEFAULTS.ch),
    c: UUID.test(c) ? c : DEFAULTS.c,
  };
}

/** Varsayılanlar yazılmaz ve sıra sabittir: aynı görünüm aynı adres. */
export function socialUrl(state: SocialUrlState): string {
  const p = new URLSearchParams();
  if (state.f !== DEFAULTS.f) p.set('f', state.f);
  if (state.ch !== DEFAULTS.ch) p.set('ch', state.ch);
  if (state.c) p.set('c', state.c);
  const qs = p.toString();
  return qs ? `${SOCIAL_PATH}?${qs}` : SOCIAL_PATH;
}

/** Kuyruk süzgeci taşımaz: dışarıdan gelen operatör belirli bir sohbeti okumaya gelir. */
export function socialLink(conversationId: string): string {
  return socialUrl({ ...DEFAULTS, c: conversationId });
}
