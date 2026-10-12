import 'server-only';
import { readDistanceSaleThreshold } from '@lezzet/application/accounting/distance-sale-threshold';
import { readOssSummary } from '@lezzet/application/accounting/oss-summary';
import { SettingsService, type Db } from '@lezzet/database';
import { DISTANCE_SALE_SETTINGS, type OssSummary } from '@lezzet/domain-core';
import type { DistanceSaleView } from './reports-types';
import { monthRange, quarterOf } from './reports-url';

/**
 * Eşik kartı ve OSS özeti: eşik bugünün durumudur, OSS seçili ayın çeyreğidir. Ayın OSS satırları ayrıca döner, çünkü KDV tablosu
 * oran satırının ülkesini onlardan bulur (`vatLineCountry`).
 */
export async function readDistanceSaleView(db: Db, ym: string, now: Date): Promise<{ view: DistanceSaleView; monthOss: OssSummary }> {
  const settings = new SettingsService(db);
  const percent = (name: 'firstWarningPercent' | 'secondWarningPercent') =>
    settings.getNumber(DISTANCE_SALE_SETTINGS[name].key, DISTANCE_SALE_SETTINGS[name].fallback);
  const quarter = quarterOf(ym);
  const [status, first, second, oss, monthOss] = await Promise.all([
    readDistanceSaleThreshold(db, now),
    percent('firstWarningPercent'),
    percent('secondWarningPercent'),
    readOssSummary(db, quarter),
    readOssSummary(db, monthRange(ym)),
  ]);
  return { view: { status, warningPercents: [first, second], quarter: { year: quarter.year, quarter: quarter.quarter }, oss }, monthOss };
}
