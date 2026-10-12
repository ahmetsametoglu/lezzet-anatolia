import type { Db } from '@lezzet/database';
import { notifyDistanceSaleThreshold } from '../notification/staff-events';
import { repriceAllAuto } from '../pricing/auto-price';
import { readDistanceSaleThreshold } from './distance-sale-threshold';

export interface DistanceSaleWatchInput {
  /** Önceki turun sonucu (`job_run`); `null` = önceki tur yok. */
  previous: Record<string, unknown> | null;
  now?: Date;
  /** Katalog geneli hizalama; test paylaşılan veritabanındaki bütün otomatik fiyatları yazmasın diye yerine sayaç verir. */
  reprice?: (db: Db) => Promise<{ changes: readonly unknown[]; truncated: boolean }>;
}

/**
 * Günlük eşik turu: bugünkü uyarı seviyesi yönetime ve muhasebeye seviye başına yılda bir kez haber olur; varış ülkesi vergilendirmesi
 * önceki turdan bu yana değiştiyse otomatik ülke fiyatları yeni orana çekilir. Önceki tur yoksa da hizalanır, hizalama değişmeyeni yazmaz.
 */
export async function watchDistanceSaleThreshold(db: Db, input: DistanceSaleWatchInput): Promise<Record<string, unknown>> {
  const status = await readDistanceSaleThreshold(db, input.now);
  if (status.warning !== 'none') {
    await notifyDistanceSaleThreshold(db, {
      year: status.year,
      warning: status.warning,
      yearTotalCents: status.yearTotalCents,
      thresholdCents: status.thresholdCents,
      sincePreviousYear: status.sincePreviousYear,
    });
  }

  const summary = { warning: status.warning, destinationTaxation: status.destinationTaxation };
  if (input.previous?.['destinationTaxation'] === status.destinationTaxation) return { ...summary, repriced: 0 };

  const { changes, truncated } = await (input.reprice ?? repriceAllAuto)(db);
  return { ...summary, repriced: changes.length, truncated };
}
