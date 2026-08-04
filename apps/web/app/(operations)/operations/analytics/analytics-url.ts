import { ChannelEnum, type Channel } from '@lezzet/types';
import { oneOf, type RawParams } from '@/lib/url-params';

// Analitik ekranının URL SÖZLEŞMESİ — tek kaynak (öteki operasyon ekranlarının deseni). Üç eksen
// adreste taşınır çünkü üçü de bir GÖRÜNÜMÜ tanımlıyor: hangi soruyu soruyorum (mod), hangi
// pencerede (dönem), kimin için (kanal). Paylaşılan bir bağlantı aynı ekranı açmalı — analitikte
// bu, "şuna bak" demenin tek yolu.
//
// İmleç yok: bu ekranda sayfalanan bir liste yok. Bloklar SABİT SINIRLI kümeler gösteriyor
// (ilk N kaynak, ilk N kampanya) — sayfalama değil, "tıklatma daveti" (CLAUDE.md §1).

const ANALYTICS_PATH = '/operations/analytics';

/**
 * Tezgâhın iki modu — çizimin kendi sözleşmesi: *"Ticaret ↔ Trafik. Aynı çorbada değil, mimari
 * ayrım."*
 *
 * Ayrımın sebebi kaynak: **Ticaret** siparişten okunur (kesin sayı, kapalı dönem), **Trafik** olay
 * defterinden (olasılıklı iz). İkisini tek bir gösterge bandında toplamak, kesin bir ciroyu
 * örneklemli bir ziyaret sayısıyla aynı güvenle okutmak olurdu.
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
 * Dönemin iki penceresi — **bu** ve **önceki**, ikisi de aynı uzunlukta.
 *
 * Kıyas omurgası çizimin birinci maddesi (*"kıyassız çıplak rakam eksik sayılır"*), yani pencereyi
 * hesaplayan tek bir yer olmalı: iki blok kendi başına hesaplarsa bir gün biri günü dahil eder
 * öteki etmez ve fark hiçbir yerde hata vermez, yalnız iki blok birbirini yalanlar.
 *
 * `now` DIŞARIDAN geçilir — sunucuda tek bir an okunur ve tüm bloklar aynı ana göre hizalanır.
 */
export function periodRange(period: AnalyticsPeriod, now: Date): { from: string; to: string; prevFrom: string; prevTo: string } {
  const days = PERIOD_DAYS[period];
  const day = 86_400_000;
  const end = now.getTime();
  const start = end - days * day;
  const iso = (t: number) => new Date(t).toISOString();
  return { from: iso(start), to: iso(end), prevFrom: iso(start - days * day), prevTo: iso(start) };
}
