import { one, oneOf, type RawParams } from '@/lib/url-params';
import { ConversationSourceEnum, type ConversationSource } from '@lezzet/types';

// Sosyal gelen kutusunun URL SÖZLEŞMESİ (15.5 · üç kanal 15.15) — üç soru taşır: **hangi kuyruğa
// bakıyorum**, **hangi kanala daraldım** ve **hangi konuşma açık**.
//
// Seçili konuşma adreste durur, çünkü bu ekranın en sık paylaşılan şeyi bir SOHBETTİR ("şuna bir
// bak") ve talep ekranı da buraya konuşma kimliğiyle bağlanıyor (`socialLink`). Ayrıca detayı
// sunucunun okumasını sağlar: seçim istemcide tutulsaydı her tıklama bir istemci turuna, mesaj
// geçmişi de ikinci bir çağrıya kalırdı.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan bağlantı kuyruğun ortasından başlamamalı.

export const SOCIAL_PATH = '/operations/social';

/**
 * Durum çipleri — İKİ çip, çünkü arka uçta süzülebilen tek durum ekseni `awaitingReply` ve çizimin
 * başlığı da o sayıyı öne çıkarıyor (*"3 cevap bekliyor"*).
 */
export const SOCIAL_FILTERS = ['all', 'awaiting'] as const;
export type SocialFilterKey = (typeof SOCIAL_FILTERS)[number];

export const SOCIAL_FILTER_LABELS: Record<SocialFilterKey, string> = {
  all: 'Tümü',
  awaiting: 'Cevap bekliyor',
};

/**
 * Kanal çipleri (15.15) — durum ekseninden AYRI bir eksen: "cevap bekleyen Messenger sohbetleri"
 * meşru bir sorudur ve iki eksen tek çip şeridine sıkıştırılsaydı ya soru sorulamaz ya şerit
 * kombinasyon patlaması olurdu. `all` + üç kanal; kanal adları `ConversationSource` ile birebir.
 */
export const SOCIAL_CHANNELS = ['all', ...ConversationSourceEnum.options] as const;
export type SocialChannelKey = (typeof SOCIAL_CHANNELS)[number];

export interface SocialUrlState {
  /** Durum çipi. */
  f: SocialFilterKey;
  /** Kanal çipi — `all` = üç kanal birden. */
  ch: SocialChannelKey;
  /** Açık konuşmanın kimliği; boş = seçim adreste taşınmıyor. */
  c: string;
}

/** Kanal çipinin arka uca giden hâli: `all` süzgeçsizdir. */
export function channelSource(ch: SocialChannelKey): ConversationSource | undefined {
  return ch === 'all' ? undefined : ch;
}

/**
 * Varsayılan çip **"Tümü"**, "cevap bekliyor" DEĞİL — ve bu Talepler'den bilinçli bir ayrım.
 *
 * Talep kuyruğunda açık talep bir iş kalemidir, kapanmışı görmek istisnadır. Konuşmada öyle değil:
 * ekranın adı "izleme" ve operatör buraya çoğu zaman **belirli bir sohbeti okumaya** gelir (talep
 * ekranından, müşteri kartından). Varsayılan süzgeç "cevap bekliyor" olsaydı, cevaplanmış bir
 * konuşmanın bağlantısı boş bir kuyrukla açılırdı. Kanal varsayılanı da aynı gerekçeyle "tümü".
 */
const DEFAULTS: SocialUrlState = { f: 'all', ch: 'all', c: '' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL → ekran durumu. Tanınmayan çip sessizce varsayılana düşer (bozuk bağlantı ekranı kırmaz).
 *
 * Kimlik BİÇİMİ burada elenir, VARLIĞI değil: uydurma bir dizgeyle okuma turuna çıkmanın karşılığı
 * yok. Var olmayan ama biçimi doğru bir kimlik okuma katmanında `null` döner ve orta pano "konuşma
 * bulunamadı" der.
 */
export function parseSocialUrl(params: RawParams): SocialUrlState {
  const c = one(params.c).trim();
  return {
    f: oneOf(params.f, SOCIAL_FILTERS, DEFAULTS.f),
    ch: oneOf(params.ch, SOCIAL_CHANNELS, DEFAULTS.ch),
    c: UUID.test(c) ? c : DEFAULTS.c,
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function socialUrl(state: SocialUrlState): string {
  const p = new URLSearchParams();
  if (state.f !== DEFAULTS.f) p.set('f', state.f);
  if (state.ch !== DEFAULTS.ch) p.set('ch', state.ch);
  if (state.c) p.set('c', state.c);
  const qs = p.toString();
  return qs ? `${SOCIAL_PATH}?${qs}` : SOCIAL_PATH;
}

/**
 * BAŞKA ekranlardan buraya köprü — bugün Talepler kullanıyor (`ticket.conversationId`).
 *
 * Bağlantı kuyruk süzgeci TAŞIMAZ: dışarıdan gelen operatör belirli bir sohbeti okumaya geliyor ve
 * "cevap bekliyor" süzgecine düşseydi, cevaplanmış bir konuşmanın bağlantısı boş kuyruk açardı.
 */
export function socialLink(conversationId: string): string {
  return socialUrl({ ...DEFAULTS, c: conversationId });
}
