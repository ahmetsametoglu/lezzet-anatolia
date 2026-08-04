import type { AnalyticsSearchSignal, StoredAnalyticsInsight } from '@lezzet/types';
import type { CampaignRoiRow, CustomerSegmentRow, ProductInterestRow, TrafficSourceRow } from '@/lib/analytics/read';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { AnalyticsUrlState } from './analytics-url';

// Analitik ekranının görünüm sözleşmesi. Tipler EKRANIN dilinde: `AnalyticsDaily` satırları burada
// bloklara indirgenmiş hâlde durur — çünkü aynı özet satırı üç bloğa üç farklı toplamayla giriyor
// ve toplamayı istemcide tekrarlamak, aynı sayının üç yerde ayrışması demekti.

/**
 * Bir ölçünün ÖLÇÜLEMEDİĞİ hâli tipte taşınır: `value === null` "sıfır" değil "bilinmiyor" demek
 * (CLAUDE.md §1). Ekran ikisini AYRI çizer — sıfır bir sonuçtur, boşluk bir eksikliktir.
 */
export interface MetricView {
  label: string;
  /** `null` → ölçüm yok; ekran `—` çizer ve gerekçeyi `reason` ile söyler. */
  value: string | null;
  /** Önceki döneme göre değişim (çizim: kıyas omurgası). Ölçüm yoksa `null`. */
  delta: { text: string; tone: OpsTone } | null;
  /** Ölçüm yoksa NEDEN yok — "veri birikiyor" ile "bu sayı hiç hesaplanmıyor" aynı şey değil. */
  reason?: string;
}

/** Huninin bir adımı. `count` null ise adım hiç ölçülmüyor demektir. */
export interface FunnelStepView {
  label: string;
  count: number;
  /** İlk adıma göre oran (0–1) — çubuk genişliği. */
  share: number;
  /** Bir önceki adıma göre kayıp (0–1); ilk adımda `null`. */
  drop: number | null;
  /** En büyük sızıntı bu adımda mı — çizim onu ayrı renkle işaretliyor. */
  worst: boolean;
}

/** Isı haritasının bir satırı (haftanın günü) — 24 saatlik yoğunluk. */
export interface HeatRowView {
  day: string;
  /** Saat başına olay sayısı (24 öğe). */
  hours: number[];
}

/** Zaman serisinin bir noktası. */
export interface SeriesPointView {
  day: string;
  value: number;
  /** Önceki dönemin aynı sırasındaki değeri — hayalet çizgi. */
  prev: number | null;
}

/** Kampanya getirisi satırı — kapıdan olduğu gibi gelir (`readCampaignRoi`). */
export type CampaignRowView = CampaignRoiRow;

/** Pazarlama izni sayacı — analitik "kaç" der, Müşteriler "kim" der (`ANALYTICS §6`). */
export interface ConsentCountView {
  channel: 'any' | 'email' | 'whatsapp';
  label: string;
  count: number;
  /** Müşteriler ekranına köprü (aynı ölçütle süzülmüş liste). */
  href: string;
}

/**
 * Bir bloğun VERİ HÂLİ. Üç değer, üç ayrı cümle:
 *  · `ready`   → sayı var, çizilir
 *  · `warming` → kapı var, veri henüz birikmedi ("ilk gün" hâli — çizimin birinci sınıf durumu)
 *  · `absent`  → bu sayı bugün HİÇ hesaplanmıyor (kapı yok ya da özet bu boyutu taşımıyor)
 *
 * `warming` ile `absent` ayrımı bu ekranın en önemli dürüstlüğü: ikisi de boş görünür ama biri
 * "bekle", öteki "bekleme, gelmeyecek" der. Tek bir "veri yok" hâline indirilseydi yönetici
 * hiç dolmayacak bir bloğun dolmasını beklerdi.
 */
export type BlockState = 'ready' | 'warming' | 'absent';

export interface BlockView<T> {
  state: BlockState;
  data: T;
  /** `warming`/`absent` hâlinde ekrana yazılacak gerekçe. */
  note: string;
}

export interface AnalyticsData {
  /** Dönemin başlangıç/bitişi — alt başlıkta ve kıyas cümlesinde kullanılır. */
  period: { from: string; to: string; days: number };
  /** AI içgörü (13.7) — haftalık iş üretir, ekran okur; `null` = ilk tur henüz koşmadı. */
  insight: BlockView<StoredAnalyticsInsight | null>;
  /** Hero bandı: ilk ölçü büyük, kalan üçü yanında (çizim). */
  hero: { main: MetricView; rest: MetricView[]; split: { b2cCents: number; b2bCents: number } | null };
  series: BlockView<SeriesPointView[]>;
  funnel: BlockView<FunnelStepView[]>;
  sources: BlockView<TrafficSourceRow[]>;
  heat: BlockView<HeatRowView[]>;
  campaigns: BlockView<CampaignRowView[]>;
  /**
   * Kaynağa göre tekrar sipariş — çizimde AYRI bir blok ama verisi kampanya tablosuyla AYNI
   * kapıdan geliyor (`readCampaignRoi`: `newCustomerCount` ↔ `orderCount`). İki kapı açmak, aynı
   * atfı iki yerde hesaplamak olurdu.
   */
  cohort: BlockView<CampaignRowView[]>;
  /** Çizimin "Müşteri grupları" bloğu (RFM · uyuyanlar · yeniler) — siparişten türetilir. */
  segments: BlockView<CustomerSegmentRow[]>;
  /**
   * Pazarlama izni sayaçları — çizimde YOK, `ANALYTICS §6` kararıyla eklendi. Segment bloğunun
   * YERİNE değil YANINA: biri "kim iyi müşteri" (davranış), öteki "kim izin verdi" (beyan) diyor
   * ve ikisi karışırsa izinsiz kişiye kampanya listesi hazırlanır.
   */
  consent: BlockView<ConsentCountView[]>;
  zeroSearch: BlockView<AnalyticsSearchSignal[]>;
  interest: BlockView<ProductInterestRow[]>;
}

/** İki cihaz görünümünün paylaştığı sözleşme (Sapma 3: tek durum ağacı client kökünde). */
export interface AnalyticsViewProps {
  data: AnalyticsData;
  urlState: AnalyticsUrlState;
  onMode: (mode: AnalyticsUrlState['mode']) => void;
  onPeriod: (period: AnalyticsUrlState['period']) => void;
  onChannel: (channel: AnalyticsUrlState['channel']) => void;
  /** Süzgeç turu sürüyor — bloklar soluklaşır. */
  navPending: boolean;
}
