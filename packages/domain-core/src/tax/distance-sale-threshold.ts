import { parisDateOf } from '@lezzet/helper';
import type { Order, OrderStatus, VatTreatment } from '@lezzet/types';
import { saleNetCents, type SaleVatBasis } from '../accounting/export';
import type { AccountingLine } from '../accounting/line';
import { isFulfillmentSettled } from '../order/status-machine';

/**
 * AB'ye uzaktan satış eşiği (docs/feature/ulke-pazari.md): AB'deki tüketiciye satışların KDV hariç toplamı içinde bulunulan ya da
 * önceki takvim yılında eşiği aşınca varış ülkesinin KDV'si uygulanır. Siparişler servisten gelir; toplam, karar ve uyarı burada.
 */

/** Eşiğe giren satışlar: AB'deki tüketiciye uzaktan satışın iki türü. */
export const DISTANCE_SALE_TREATMENTS = ['intra_eu_distance_origin', 'intra_eu_distance_oss'] as const satisfies readonly VatTreatment[];

/** Satış sayılmayan durumlar: taslak henüz sipariş değildir, iptal ve bütünüyle iade edilen sipariş satış olmaktan çıkar. */
const NOT_A_SALE: ReadonlySet<OrderStatus> = new Set(['draft', 'cancelled', 'returned']);

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

/** Eşik toplamına giren siparişin okunan alanları. */
export type DistanceSaleOrder = Pick<Order, 'id' | 'referenceNo' | 'status' | 'vatTreatment' | 'createdAt'> & SaleVatBasis;

export interface DistanceSaleLedger {
  /** Sistemdeki uzaktan satış toplamı bu yıl (KDV hariç, cent). */
  currentYearCents: number;
  /** Sistemdeki uzaktan satış toplamı önceki yıl (KDV hariç, cent). */
  previousYearCents: number;
  /** Bu yıl varış ülkesinin KDV'siyle yazılan ilk sipariş, eşiği aşan; yoksa `null`. */
  firstDestinationOrder: Pick<Order, 'id' | 'referenceNo' | 'createdAt'> | null;
}

/**
 * Siparişlerden eşik toplamları: ücretlenen tutar aktarımla aynı türetimden gelir (`saleNetCents`), iade ve müşteride kalan adet düşer.
 * Yıl siparişin yazıldığı Paris günüdür, çünkü karar sipariş yazılırken verilir.
 */
export function distanceSaleLedger(
  year: number,
  entries: ReadonlyArray<{ order: DistanceSaleOrder; items: readonly AccountingLine[] }>,
): DistanceSaleLedger {
  let currentYearCents = 0;
  let previousYearCents = 0;
  let firstDestinationOrder: DistanceSaleOrder | null = null;

  for (const { order, items } of entries) {
    if (!isDistanceSale(order.vatTreatment) || NOT_A_SALE.has(order.status)) continue;
    const orderYear = Number(parisDateOf(new Date(order.createdAt)).slice(0, 4));
    if (orderYear !== year && orderYear !== year - 1) continue;
    const net = saleNetCents(order, items, isFulfillmentSettled(order.status));
    if (orderYear === year - 1) {
      previousYearCents += net;
      continue;
    }
    currentYearCents += net;
    const earlier = firstDestinationOrder === null || Date.parse(order.createdAt) < Date.parse(firstDestinationOrder.createdAt);
    if (order.vatTreatment === 'intra_eu_distance_oss' && earlier) firstDestinationOrder = order;
  }

  return {
    currentYearCents,
    previousYearCents,
    firstDestinationOrder: firstDestinationOrder && {
      id: firstDestinationOrder.id,
      referenceNo: firstDestinationOrder.referenceNo,
      createdAt: firstDestinationOrder.createdAt,
    },
  };
}

function isDistanceSale(treatment: VatTreatment): boolean {
  return (DISTANCE_SALE_TREATMENTS as readonly VatTreatment[]).includes(treatment);
}

export interface DistanceSaleThresholdInput {
  /** Kararın takvim yılı. */
  year: number;
  /** Sistemdeki uzaktan satış toplamı bu yıl, bu sipariş hariç (KDV hariç, cent). */
  currentYearCents: number;
  /** Sistemdeki uzaktan satış toplamı önceki yıl (KDV hariç, cent). */
  previousYearCents: number;
  /** Bu siparişin KDV hariç tutarı; sipariş dışındaki okuma (günlük iş) `0` verir. */
  orderNetCents: number;
  /**
   * Bu yıl varış ülkesinin KDV'siyle yazılmış sipariş var mı (`firstDestinationOrder`). Varsa karar yıl sonuna kadar varışta kalır,
   * çünkü iade toplamı eşiğin altına indirse de aşılmış eşik o yıl geri alınmaz.
   */
  latched: boolean;
  settings: DistanceSaleSettings;
}

/** Uyarı seviyesi: `first` ve `second` eşiğin ayardaki yüzdelerine varıldığında, `exceeded` varış ülkesi vergilendirmesi başladığında. */
export type DistanceSaleWarning = 'none' | 'first' | 'second' | 'exceeded';

export interface DistanceSaleThreshold {
  /** Varış ülkesinin KDV'si mi uygulanır; eşiği aşan sipariş de dahildir. */
  destinationTaxation: boolean;
  /** Önceki yılın toplamı eşiği aştı: varış ülkesinin KDV'si bu yıl yılbaşından beri uygulanır. */
  sincePreviousYear: boolean;
  /** Bu yılın toplamı: sistem + açılış + bu sipariş. */
  yearTotalCents: number;
  /** Önceki yılın toplamı: sistem + açılış. */
  previousYearTotalCents: number;
  warning: DistanceSaleWarning;
}

export function distanceSaleThreshold(input: DistanceSaleThresholdInput): DistanceSaleThreshold {
  const { settings } = input;
  const yearTotalCents = input.currentYearCents + openingOf(input.year, settings) + input.orderNetCents;
  const previousYearTotalCents = input.previousYearCents + openingOf(input.year - 1, settings);
  // Eşik geçilmedikçe satıcının KDV'si uygulanır: eşiğe eşit toplam henüz aşmış sayılmaz.
  const sincePreviousYear = previousYearTotalCents > settings.thresholdCents;
  const destinationTaxation = sincePreviousYear || input.latched || yearTotalCents > settings.thresholdCents;
  return {
    destinationTaxation,
    sincePreviousYear,
    yearTotalCents,
    previousYearTotalCents,
    warning: destinationTaxation ? 'exceeded' : warningOf(yearTotalCents, settings),
  };
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
