import { AppNotificationService, OrderItemService, SettingsService, TreatmentOrderService, type Db } from '@lezzet/database';
import {
  DISTANCE_SALE_LEVELS,
  DISTANCE_SALE_SETTINGS,
  DISTANCE_SALE_TREATMENTS,
  distanceSaleDecision,
  distanceSaleLedger,
  type DistanceSaleLedger,
  type DistanceSaleLevel,
  type DistanceSaleSettings,
  type DistanceSaleWarning,
} from '@lezzet/domain-core';
import { groupBy, parisDateOf, parisDayRange } from '@lezzet/helper';
import { distanceSaleThresholdKey } from '../notification/staff-events';

/** Eşik kartının ve Pano satırının okuduğu durum; tutarlar KDV hariç, cent. */
export interface DistanceSaleThresholdStatus {
  year: number;
  thresholdCents: number;
  /** Bu yılın toplamı: sistem ve açılış ayarı. */
  yearTotalCents: number;
  /** Geçen yılın toplamı: sistem ve açılış ayarı. */
  previousYearTotalCents: number;
  warning: DistanceSaleWarning;
  destinationTaxation: boolean;
  /** Geçen yıl aşıldı: varış ülkesinin KDV'si bu yıl yılbaşından beri uygulanır. */
  sincePreviousYear: boolean;
  /** Bu yıl eşiği aşan, varış ülkesinin KDV'siyle yazılan ilk sipariş; vergilendirme geçen yıldan geliyorsa ya da başlamadıysa `null`. */
  crossingOrder: { id: string; referenceNo: string | null; day: string } | null;
}

/** Eşik kartının ayrıntısı, durumun yanında okunur. */
export interface DistanceSaleThresholdDetail {
  /** Toplamların iki kaynağı ayrı: sistemdeki siparişler ve sistem dışı açılış tutarı (ayar). */
  yearSystemCents: number;
  yearOpeningCents: number;
  previousYearSystemCents: number;
  previousYearOpeningCents: number;
  /** Seviyenin bu yıl ilk haber olduğu gün (Paris); haber gitmemişse `null`. */
  notifiedOn: Record<DistanceSaleLevel, string | null>;
}

/** Eşik kararının siparişten bağımsız girdileri: yıl, iki yılın sistem toplamları ve ayarlar. */
export interface DistanceSaleBasis {
  year: number;
  ledger: DistanceSaleLedger;
  settings: DistanceSaleSettings;
}

/** Eşik ayarları; satırı olmayan ayar fabrika değerini alır. */
async function readDistanceSaleSettings(db: Db): Promise<DistanceSaleSettings> {
  const settings = new SettingsService(db);
  const read = (name: keyof DistanceSaleSettings) =>
    settings.getNumber(DISTANCE_SALE_SETTINGS[name].key, DISTANCE_SALE_SETTINGS[name].fallback);
  const [thresholdCents, firstWarningPercent, secondWarningPercent, openingYear, openingCents, openingPreviousCents] = await Promise.all([
    read('thresholdCents'),
    read('firstWarningPercent'),
    read('secondWarningPercent'),
    read('openingYear'),
    read('openingCents'),
    read('openingPreviousCents'),
  ]);
  return { thresholdCents, firstWarningPercent, secondWarningPercent, openingYear, openingCents, openingPreviousCents };
}

/** Eşiğin yılı Paris takvimindedir, çünkü sipariş günü işletmenin günüdür. */
const yearOf = (now: Date): number => Number(parisDateOf(now).slice(0, 4));

/** İki yılın uzaktan satış siparişleri tek taramada okunur, toplam motordadır. */
export async function readDistanceSaleBasis(db: Db, now: Date = new Date()): Promise<DistanceSaleBasis> {
  const year = yearOf(now);
  const range = { from: parisDayRange(`${year - 1}-01-01`).from, to: parisDayRange(`${year + 1}-01-01`).from };
  const [orders, settings] = await Promise.all([
    new TreatmentOrderService(db).listCreated(DISTANCE_SALE_TREATMENTS, range),
    readDistanceSaleSettings(db),
  ]);
  const itemsByOrder = groupBy(await new OrderItemService(db).listByOrders(orders.map((order) => order.id)), (item) => item.orderId);
  const ledger = distanceSaleLedger(
    year,
    orders.map((order) => ({ order, items: itemsByOrder.get(order.id) ?? [] })),
  );
  return { year, ledger, settings };
}

/** Uzaktan satış eşiğinin bugünkü durumu, eşik kartının ve Pano satırının okuması. */
export async function readDistanceSaleThreshold(
  db: Db,
  now: Date = new Date(),
): Promise<DistanceSaleThresholdStatus & DistanceSaleThresholdDetail> {
  const keys = DISTANCE_SALE_LEVELS.map((level) => distanceSaleThresholdKey(yearOf(now), level));
  const [{ year, ledger, settings }, sentAt] = await Promise.all([
    readDistanceSaleBasis(db, now),
    new AppNotificationService(db).firstSentAtByDedupeKey('distance_sale_threshold', keys),
  ]);
  const decision = distanceSaleDecision({ year, ledger, orderNetCents: 0, settings });
  const crossing = decision.sincePreviousYear ? null : ledger.firstDestinationOrder;
  const notifiedOn = (level: DistanceSaleLevel): string | null => {
    const at = sentAt.get(distanceSaleThresholdKey(year, level));
    return at ? parisDateOf(new Date(at)) : null;
  };

  return {
    year,
    thresholdCents: settings.thresholdCents,
    yearTotalCents: decision.yearTotalCents,
    previousYearTotalCents: decision.previousYearTotalCents,
    yearSystemCents: decision.yearSystemCents,
    yearOpeningCents: decision.yearOpeningCents,
    previousYearSystemCents: decision.previousYearSystemCents,
    previousYearOpeningCents: decision.previousYearOpeningCents,
    warning: decision.warning,
    destinationTaxation: decision.destinationTaxation,
    sincePreviousYear: decision.sincePreviousYear,
    crossingOrder: crossing && { id: crossing.id, referenceNo: crossing.referenceNo, day: parisDateOf(new Date(crossing.createdAt)) },
    notifiedOn: { first: notifiedOn('first'), second: notifiedOn('second'), exceeded: notifiedOn('exceeded') },
  };
}
