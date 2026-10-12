import type { AiUsageRecorder } from '@lezzet/ai';
import { AiUsageService, SettingsService, type Db } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { aiUsageRow, modelRateOf } from './usage-row';

/** Tarife ayarının anahtarı; satır `0013_settings.sql`te, model tarifesi Kurulum'dan da yazılır. */
export const AI_PRICES_KEY = 'ai_model_prices_usd';

/**
 * Modele giden her koşunun satırını yazar; maliyet o anki tarifeyle hesaplanır ve satırda donar, tarife değişse de geçmiş yeniden
 * yazılmaz. Fırlatmaz: kayıt yan iştir, düşerse izi `captureError`a gider ve koşu etkilenmez.
 */
export function aiUsageRecorder(db: Db): AiUsageRecorder {
  const settings = new SettingsService(db);
  const defter = new AiUsageService(db);
  return async (record) => {
    try {
      const { rate, invalidTable } = modelRateOf(await settings.get<unknown>(AI_PRICES_KEY, null), record.modelId);
      // Bozuk tarife sessizce boş maliyet yazdırmasın: satır yine yazılır (jetonlar değerli), sebep log'da.
      if (invalidTable)
        logger.warn({ context: 'application/ai-usage', key: AI_PRICES_KEY }, 'AI tarife ayarı okunamadı — maliyet boş yazılıyor');
      await defter.insert(aiUsageRow(record, rate));
    } catch (err) {
      await captureError(err, { source: SOURCES.applicationAi, context: { task: record.task, modelId: record.modelId } });
    }
  };
}
