import { ChannelEnum, type Channel } from '@lezzet/types';
import { oneOf, type RawParams } from '@/lib/url-params';

// Analitik ekranının URL sözleşmesi: mod, dönem ve kanal adreste taşınır, çünkü paylaşılan bağlantı aynı görünümü açmalı. İmleç yoktur,
// bloklar sabit sınırlı kümeler gösterir.

const ANALYTICS_PATH = '/operations/analytics';

/**
 * Ekranın iki modu ayrı kaynaktan okur: Ticaret siparişten (kesin sayı, kapalı dönem), Trafik olay defterinden (olasılıklı iz). İkisi tek
 * gösterge bandında toplansaydı kesin ciro örneklemli ziyaret sayısıyla aynı güvenle okunurdu.
 */
export const ANALYTICS_MODES = ['ticaret', 'trafik'] as const;
export type AnalyticsMode = (typeof ANALYTICS_MODES)[number];

/**
 * Dönem penceresi. Değerler PARAMETRİK bir merdiven değil, kapalı bir liste: analitikte "serbest
 * tarih aralığı" bir sonraki adımdır ve kıyas omurgasını (önceki eş pencere) karmaşıklaştırır —
 * 30 günün öncesi bellidir, "17 Mart–2 Nisan"ın öncesi bir karardır.
 */
export const ANALYTICS_PERIODS = ['d7', 'd30', 'd90'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

/** Gün sayısı — kıyas penceresi de bu uzunlukta ve hemen öncesindedir (çizim: "önceki döneme göre"). */
export const PERIOD_DAYS: Record<AnalyticsPeriod, number> = { d7: 7, d30: 30, d90: 90 };

export const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  d7: 'Son 7 gün',
  d30: 'Son 30 gün',
  d90: 'Son 90 gün',
};

/** Kanal kırılımı — `all` süzgeç yok demek. */
export type AnalyticsChannel = Channel | 'all';

export interface AnalyticsUrlState {
  mode: AnalyticsMode;
  period: AnalyticsPeriod;
  channel: AnalyticsChannel;
}

const DEFAULTS: AnalyticsUrlState = { mode: 'ticaret', period: 'd30', channel: 'all' };

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseAnalyticsUrl(params: RawParams): AnalyticsUrlState {
  return {
    mode: oneOf(params.mode, ANALYTICS_MODES, DEFAULTS.mode),
    period: oneOf(params.period, ANALYTICS_PERIODS, DEFAULTS.period),
    channel: oneOf(params.ch, [...ChannelEnum.options, 'all'] as const, DEFAULTS.channel),
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function analyticsUrl(state: AnalyticsUrlState): string {
  const p = new URLSearchParams();
  if (state.mode !== DEFAULTS.mode) p.set('mode', state.mode);
  if (state.period !== DEFAULTS.period) p.set('period', state.period);
  if (state.channel !== DEFAULTS.channel) p.set('ch', state.channel);
  const qs = p.toString();
  return qs ? `${ANALYTICS_PATH}?${qs}` : ANALYTICS_PATH;
}

/**
 * Dönemin iki penceresi, bu ve önceki, aynı uzunlukta; pencereyi tek yer hesaplar ki iki blok birbirini yalanlamasın. `now` dışarıdan
 * geçilir, bütün bloklar aynı ana hizalanır.
 */
export function periodRange(period: AnalyticsPeriod, now: Date): { from: string; to: string; prevFrom: string; prevTo: string } {
  const days = PERIOD_DAYS[period];
  const day = 86_400_000;
  const end = now.getTime();
  const start = end - days * day;
  const iso = (t: number) => new Date(t).toISOString();
  return { from: iso(start), to: iso(end), prevFrom: iso(start - days * day), prevTo: iso(start) };
}
