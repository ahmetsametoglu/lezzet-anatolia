import 'server-only';
import { readDistanceSaleThreshold } from '@lezzet/application/accounting/distance-sale-threshold';
import { readOssSummary } from '@lezzet/application/accounting/oss-summary';
import { SettingsService, type Db } from '@lezzet/database';
import { DISTANCE_SALE_SETTINGS } from '@lezzet/domain-core';
import type { DistanceSaleView } from './reports-types';
import { quarterOf } from './reports-url';

/** Eşik kartı ve OSS özeti: eşik bugünün durumudur, OSS seçili ayın çeyreğidir. */
export async function readDistanceSaleView(db: Db, ym: string, now: Date): Promise<DistanceSaleView> {
  const settings = new SettingsService(db);
  const setting = (name: 'firstWarningPercent' | 'secondWarningPercent' | 'openingYear') =>
    settings.getNumber(DISTANCE_SALE_SETTINGS[name].key, DISTANCE_SALE_SETTINGS[name].fallback);
  const quarter = quarterOf(ym);
  const [status, first, second, openingYear, oss] = await Promise.all([
    readDistanceSaleThreshold(db, now),
    setting('firstWarningPercent'),
    setting('secondWarningPercent'),
    setting('openingYear'),
    readOssSummary(db, quarter),
  ]);
  return { status, warningPercents: [first, second], openingYear, quarter: { year: quarter.year, quarter: quarter.quarter }, oss };
}
