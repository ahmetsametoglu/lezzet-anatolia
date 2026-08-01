import type { ErrorLogLevel, HealthStatus } from '@lezzet/types';
import type { HealthSignalCode } from '@lezzet/domain-core';
import type { SystemUrlState, TrendWindow } from './system-url';

// Sistem ekranının görünüm tipleri (18.5) — tasarım `design/pages/admin-sistem.md`,
// görsel karar `design/project/Operasyon - Sistem.dc.html`, komponentler O20–O25.
//
// **Görünüm şemadan TÜRETİLİR, elle yeniden yazılmaz** (CLAUDE.md §1): hata satırı `ErrorLog`'un
// kendisini taşır, üstüne yalnız ekranın hesapladığı iki şey biner (kim çözdü, geri mi geldi).
// Alanları tek tek kopyalayan bir "ErrorRow" tipi, şema değişince sessizce eskirdi.

/** Hüküm şeridinin ses seviyesi. `stale` ayrı bir hâl: hüküm `crit` ama SÖYLEDİĞİ şey başka. */
export type VerdictTone = 'ok' | 'warn' | 'crit' | 'stale';

/**
 * Tek gerekçe satırı. `tone` RENGİ değil AĞIRLIĞI söyler: `unknown` "ölçemedim"dir ve nötr çizilir —
 * amber boyanırsa okuyan onu bir arıza sanır, oysa haber tam olarak arıza OLMADIĞIDIR.
 */
export interface HealthReasonView {
  code: HealthSignalCode;
  tone: 'crit' | 'warn' | 'unknown';
  /** Kısa etiket ("disk", "süreç", "ölçülemedi") — cümleyi taramadan hangi alan olduğu anlaşılsın. */
  tag: string;
  text: string;
}

/** Ölçüm çubuğunun tonu — eşiğe göre. `null` ölçüm çubuk çizdirmez (bkz. `MetricRowView.unknown`). */
export type MetricTone = 'ok' | 'warn' | 'crit';

/** O21 · ölçüm satırı. */
export interface MetricRowView {
  key: string;
  label: string;
  value: string;
  tone: MetricTone;
  /** Yüzde (0–100). `null` ise çubuk çizilmez. */
  barPct: number | null;
  /** "eşik: %80" — sabit ve kodda testli olduğunun ekrandaki karşılığı. */
  threshold: string | null;
  /** Tek satır oran notu: "4 çekirdeğe oranla %14". */
  note: string | null;
  /** Sağdaki küçük rozet ("ölçülemedi", "swap'ta", "yeniden başladı"). */
  tag: string | null;
  /** Ölçüm ALINAMADI: kesikli boş çubuk + "bilinmiyor" değeri. Sıfır ÇİZİLMEZ. */
  unknown: boolean;
  /** Satır kendi zeminini alır (dikkat çeken ölçüm). */
  highlight: boolean;
}

export interface ProcessRowView {
  name: string;
  status: string;
  down: boolean;
  restarts: number;
  /** Yeniden başlama sayısı eşiği aştı — süreç ayakta ama sessizce düşüp kalkıyor. */
  restartsNotable: boolean;
  memory: string;
  cpu: string;
}

export interface ServiceCardView {
  key: string;
  label: string;
  value: string;
  sub: string;
  tone: 'ok' | 'warn' | 'crit' | 'neutral';
}

export interface AppCounterView {
  key: string;
  label: string;
  value: number;
  tone: MetricTone;
}

/**
 * O22 · tek trend eğrisi. Nokta dizisi DEĞİL hazır SVG yolu taşınır: eğri sunucuda kuruluyor
 * (kovalama orada) ve istemciye yüz sayı yerine iki metin geçiyor.
 */
export interface TrendChartView {
  key: string;
  title: string;
  /** Şimdiki değer, biçimlenmiş ("%84,1"). Ölçüm yoksa "bilinmiyor". */
  now: string;
  /** `polyline points` — boş dize: çizilecek veri yok. */
  line: string;
  /** Dolgu alanı `path d`. */
  area: string;
  /** Eşik çizgisinin Y'si (viewBox birimiyle); `null` ise çizilmez. */
  thresholdY: number | null;
  thresholdLabel: string | null;
  /** "24 saat: %79,6 → %84,1 · yükseliyor (+4,5 puan)". */
  caption: string;
  /** Şimdiki değer eşiğin üstünde — eğri kırmızıya döner. */
  hot: boolean;
}

/**
 * Hata satırı: kaydın KENDİSİ + ekranın türettiği iki alan.
 *
 * `resolvedByName` uygulama katmanında birleşiyor (`resolved_by` uuid'dir, ekran isim ister) ve
 * `regression` ikinci bir okumadan geliyor (aynı parmak izinin kapalı ikizi). İkisi de `error_log`'da
 * durmuyor ve DURMAMALI: biri başka bir tablonun malı, öteki bir sorgunun cevabı — satıra kopyalansa
 * personel adı değişince geçmiş yalan söylerdi.
 */
export interface ErrorRowView {
  id: string;
  level: ErrorLogLevel;
  source: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
  path: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  /**
   * Bu satır geri gelmiş bir hata: aynı parmak izinin daha önce ÇÖZÜLMÜŞ bir satırı var. Regresyon,
   * hiç çözülmemiş bir hatadan farklı bir haberdir (`OBSERVABILITY §2`) — ekran ikisini aynı
   * göstermemeli.
   */
  regression: { resolvedAt: string; byName: string | null } | null;
}

export interface HealthView {
  status: HealthStatus;
  tone: VerdictTone;
  title: string;
  /** Ölçümün yaşı (dakika) — istemci bunu saniyede ilerletir. */
  ageMinutes: number;
  /** Ölçüm bekleneni aştı: aşağıdaki her değer geçmişe ait. */
  stale: boolean;
  reasons: HealthReasonView[];
  /** Gerekçe yoksa yazılan sakin özet — "her şey iyi" hâli de bir cümle hak eder. */
  summary: string;
  serverRows: MetricRowView[];
  /**
   * Telefonun dört satırlık sunucu özeti — eşikli çubuk, oran notu ve eşik metni YOK.
   *
   * `serverRows`'un kırpılmışı değil, AYRI bir seçki: telefonda sorulan soru "bir şey mi oldu",
   * masaüstünde "ne oldu". Yolda bakan kişiye beş çubuk göstermek, cevabı geciktirir.
   */
  mobileRows: { key: string; label: string; value: string; tone: MetricTone }[];
  processes: ProcessRowView[] | null;
  services: ServiceCardView[];
  appCounters: AppCounterView[];
}

export interface SystemData {
  /** `null` = HİÇ görüntü alınmamış. "Sağlıklı" değil, "kayıt yeni başladı". */
  health: HealthView | null;
  charts: TrendChartView[];
  /** Pencere dolmamış (kayıt bu kadar geriye gitmiyor) — boş grafik "sıfır" demek değil. */
  trendEmpty: boolean;
  errors: ErrorRowView[];
  errorTotal: number;
  counts: { open: number; resolved: number };
  /** İlk hata kaydının damgası — "kayıt ne zamandan beri tutuluyor" boş hâlde bunu yazar. */
  loggingSince: string | null;
}

export interface SystemViewProps {
  data: SystemData;
  urlState: SystemUrlState;
  search: string;
  onSearch: (q: string) => void;
  onTab: (tab: SystemUrlState['tab']) => void;
  onWindow: (win: TrendWindow) => void;
  onPage: (page: number) => void;
  navPending: boolean;
  /** Otomatik tazeleme açık mı + bir sonraki tazelemeye kalan saniye. */
  live: { active: boolean; secondsLeft: number; onToggle: () => void; onRefreshNow: () => void };
  /** Ölçüm yaşı istemcide ilerler — sunucudan gelen değer donmuş bir sayıdır. */
  ageMinutes: number | null;
  /** Seçili hata (O25 inceleme sütunu) ve diyalog (O9). */
  selectedId: string | null;
  onSelect: (id: string) => void;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onResolve: (id: string) => void;
  resolving: string | null;
  resolveError: string | null;
}
