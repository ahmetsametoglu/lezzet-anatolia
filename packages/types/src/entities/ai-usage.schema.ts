import { z } from 'zod';

// AI KULLANIM DEFTERİ (15.27 · kullanıcı kararı 10.09) — modele giden her koşunun jetonu ve yaklaşık
// maliyeti, DOLAR cinsinden (sağlayıcının faturası dolar; kur çevirisi ayrı bir tahmin katmanı olurdu).
// Migration 0056; yazan tek kapı koşucunun kancası (`@lezzet/ai` → `usage-recorder.ts`).

/**
 * Koşunun kayda GİREN başarısızlık sebepleri. Üçüncü hâl (`not_configured`) kayda girmez: modele hiç
 * gidilmedi. `@lezzet/ai`nin `AiFailureReason`ı bundan türer — liste tek yerde.
 */
export const AiRunFailureEnum = z.enum(['provider_error', 'invalid_output']);
export type AiRunFailure = z.infer<typeof AiRunFailureEnum>;

/**
 * Tek koşunun satırı — defter: yazılır, güncellenmez.
 *
 * Jeton alanları `null` olabilir ve `0` DEĞİLDİR: sağlayıcı ölçüm vermediyse "sıfır jeton" yazmak bozuk
 * ölçümü bedava gibi okuturdu (`CLAUDE §1`). `costUsd` de öyle: tarifesi ayarda olmayan modelin maliyeti
 * bilinmiyor — sıfır değil.
 */
export const AiUsageEntrySchema = z.object({
  id: z.string().uuid(),
  /** Görev adı (`AiTask.id`) — "hangi özellik harcıyor" sorusunun ekseni. */
  task: z.string().min(1),
  /** Çağrının GERÇEKTEN gittiği model (env ile değişir) — tarife bununla eşleşir. */
  modelId: z.string().min(1),
  ok: z.boolean(),
  failureReason: AiRunFailureEnum.nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  /** Girdinin önbellekten okunan alt kümesi — sağlayıcı bildirirse. Maliyet hesabına bugün girmiyor. */
  cachedInputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  /**
   * Yazım anındaki tarifeyle hesaplanan yaklaşık maliyet (USD). Tarife sonradan değişse de geçmiş satır
   * DEĞİŞMEZ — geçen ayın harcaması bugünün fiyatıyla yeniden yazılmaz.
   */
  costUsd: z.number().nonnegative().nullable(),
  conversationId: z.string().uuid().nullable(),
  ticketId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type AiUsageEntry = z.infer<typeof AiUsageEntrySchema>;

export const AiUsageEntryInsertSchema = AiUsageEntrySchema.omit({ id: true, createdAt: true });
export type AiUsageEntryInsert = z.infer<typeof AiUsageEntryInsertSchema>;

/** `ai_usage_daily` görünümü — Paris günü × görev × model özeti. Okuyan satır saymaz, bunu okur. */
export const AiUsageDailyRowSchema = z.object({
  day: z.string(),
  task: z.string(),
  modelId: z.string(),
  calls: z.number().int(),
  failedCalls: z.number().int(),
  /** Toplamlar ölçülmüş satırlardan; hiç ölçüm yoksa `null` (sıfır değil). */
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  /** Maliyeti BİLİNMEYEN koşu sayısı (tarifesiz model ya da ölçümsüz koşu) — `costUsd` bunları içermez. */
  unpricedCalls: z.number().int(),
});
export type AiUsageDailyRow = z.infer<typeof AiUsageDailyRowSchema>;

/**
 * Model tarifesi ayarı (`settings.ai_model_prices_usd`) — model kimliği → milyon jeton başına USD.
 * Satır jsonb; okuyan bu şemadan geçirir, bozuk satır "tarife yok" sayılır (maliyet `null`).
 */
export const AiModelPricesSchema = z.record(
  z.string(),
  z.object({ inputPerMillion: z.number().nonnegative(), outputPerMillion: z.number().nonnegative() }),
);
export type AiModelPrices = z.infer<typeof AiModelPricesSchema>;
