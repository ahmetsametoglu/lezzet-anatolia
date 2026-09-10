import type { AiUsageRecorder } from '@lezzet/ai';
import { AiUsageService, SettingsService, type Db } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { aiUsageRow, modelRateOf } from './usage-row';

/*
  AI KULLANIM KAYDEDİCİSİ (15.27 · kullanıcı kararı 10.09: "tek kanca") — `@lezzet/ai`nin kancasına süreç
  başında takılır (web `instrumentation-node.ts`, backend `index.ts`) ve modele giden her koşunun satırını
  yazar: görev, model, jetonlar, yaklaşık maliyet (USD), iş bağlamı.

  ── MALİYET YAZIM ANINDA DONAR ────────────────────────────────────────────────
  O anki tarifeyle hesaplanır ve satırda kalır (tablo künyesi `0056`); tarife sonradan değişse de geçen ayın
  harcaması yeniden yazılmaz. Tarife `SettingsService` önbelleğinden okunur — her koşuda bir sorgu değil.

  ── FIRLATMAZ ──────────────────────────────────────────────────────────────────
  Kayıt bir yan iştir: düşerse izi `captureError`a gider, koşu etkilenmez (kanca da beklemiyor).
*/

/** Tarife ayarının anahtarı — satır `0013_settings.sql`te. */
const PRICES_KEY = 'ai_model_prices_usd';

export function aiUsageRecorder(db: Db): AiUsageRecorder {
  const settings = new SettingsService(db);
  const defter = new AiUsageService(db);
  return async (record) => {
    try {
      const { rate, invalidTable } = modelRateOf(await settings.get<unknown>(PRICES_KEY, null), record.modelId);
      // Bozuk tarife sessizce boş maliyet yazdırmasın: satır yine yazılır (jetonlar değerli), sebep log'da.
      if (invalidTable) logger.warn({ context: 'application/ai-usage', key: PRICES_KEY }, 'AI tarife ayarı okunamadı — maliyet boş yazılıyor');
      await defter.insert(aiUsageRow(record, rate));
    } catch (err) {
      await captureError(err, { source: SOURCES.applicationAi, context: { task: record.task, modelId: record.modelId } });
    }
  };
}
