/**
 * AB'ye uzaktan satış eşiği (docs/feature/ulke-pazari.md): AB'deki tüketiciye satışların KDV hariç toplamı içinde bulunulan ya da
 * önceki takvim yılında eşiği aşınca varış ülkesinin KDV'si uygulanır. Toplamın kaynağı servistedir; burada yalnız karar ve uyarı.
 */

/** Eşik ayarları; açılış tutarları sistem dışında yapılmış satışlardır ve `openingYear` ile bir önceki yıla aittir. */
export interface DistanceSaleSettings {
  thresholdCents: number;
  firstWarningPercent: number;
  secondWarningPercent: number;
  openingYear: number;
  openingCents: number;
  openingPreviousCents: number;
}

/** Ayar anahtarları ve fabrika değerleri; ayar sözlüğü ve migration aynı satırı okur. */
export const DISTANCE_SALE_SETTINGS: { readonly [K in keyof DistanceSaleSettings]: { readonly key: string; readonly fallback: number } } = {
  thresholdCents: { key: 'eu_distance_sales_threshold_cents', fallback: 1_000_000 },
  firstWarningPercent: { key: 'eu_distance_sales_first_warning_percent', fallback: 80 },
  secondWarningPercent: { key: 'eu_distance_sales_second_warning_percent', fallback: 95 },
  openingYear: { key: 'eu_distance_sales_opening_year', fallback: 2026 },
  openingCents: { key: 'eu_distance_sales_opening_cents', fallback: 0 },
  openingPreviousCents: { key: 'eu_distance_sales_opening_previous_cents', fallback: 0 },
};

export interface DistanceSaleThresholdInput {
  /** Kararın takvim yılı. */
  year: number;
  /** Sistemdeki uzaktan satış toplamı bu yıl, bu sipariş hariç (KDV hariç, cent). */
  currentYearCents: number;
  /** Sistemdeki uzaktan satış toplamı önceki yıl (KDV hariç, cent). */
  previousYearCents: number;
  /** Bu siparişin KDV hariç tutarı; sipariş dışındaki okuma (günlük iş) `0` verir. */
  orderNetCents: number;
  settings: DistanceSaleSettings;
}

/** Uyarı seviyesi: `first` ve `second` eşiğin ayardaki yüzdelerine varıldığında, `exceeded` varış ülkesi vergilendirmesi başladığında. */
export type DistanceSaleWarning = 'none' | 'first' | 'second' | 'exceeded';

export interface DistanceSaleThreshold {
  /** Varış ülkesinin KDV'si mi uygulanır; eşiği aşan sipariş de dahildir. */
  destinationTaxation: boolean;
  /** Bu yılın toplamı: sistem + açılış + bu sipariş. */
  yearTotalCents: number;
  warning: DistanceSaleWarning;
}

export function distanceSaleThreshold(input: DistanceSaleThresholdInput): DistanceSaleThreshold {
  const { settings } = input;
  const yearTotalCents = input.currentYearCents + openingOf(input.year, settings) + input.orderNetCents;
  const previousTotalCents = input.previousYearCents + openingOf(input.year - 1, settings);
  // Eşik geçilmedikçe satıcının KDV'si uygulanır: eşiğe eşit toplam henüz aşmış sayılmaz.
  const destinationTaxation = previousTotalCents > settings.thresholdCents || yearTotalCents > settings.thresholdCents;
  return { destinationTaxation, yearTotalCents, warning: destinationTaxation ? 'exceeded' : warningOf(yearTotalCents, settings) };
}

/** Açılış tutarı yalnız kendi yılına aittir; yıl dönünce önceki yılın tutarı olur, ondan sonra hiç sayılmaz. */
function openingOf(year: number, settings: DistanceSaleSettings): number {
  if (year === settings.openingYear) return settings.openingCents;
  if (year === settings.openingYear - 1) return settings.openingPreviousCents;
  return 0;
}

function warningOf(totalCents: number, settings: DistanceSaleSettings): DistanceSaleWarning {
  const reached = (percent: number) => totalCents * 100 >= settings.thresholdCents * percent;
  if (reached(settings.secondWarningPercent)) return 'second';
  if (reached(settings.firstWarningPercent)) return 'first';
  return 'none';
}
