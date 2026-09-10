import { estimateCost, type AiUsageRecord, type ModelRate } from '@lezzet/ai';
import { AiModelPricesSchema, type AiUsageEntryInsert } from '@lezzet/types';

/*
  AI KULLANIM SATIRI (15.27) — SAF: kaydın satıra dönüşümü ve modelin tarifesinin ayardan seçilmesi.
  Yazımı `usage-recorder.ts` yapar; burası DB'siz sınanır (`usage-row.test.ts`).
*/

/** Tarife tablosundan modelin satırı. Tablo bozuksa bunu AYRICA söyler — boş maliyetin sebebi okunabilsin. */
export function modelRateOf(table: unknown, modelId: string): { rate: ModelRate | null; invalidTable: boolean } {
  // Ayar satırı hiç yoksa bozuk değil, tarife yok.
  const parsed = AiModelPricesSchema.safeParse(table ?? {});
  return parsed.success ? { rate: parsed.data[modelId] ?? null, invalidTable: false } : { rate: null, invalidTable: true };
}

/**
 * Kaydın satırı. Maliyet `estimateCost`tan: tarife bilinmiyorsa ya da jeton ölçümü eksikse `null` —
 * bilinmiyor, sıfır değil (`CLAUDE §1`). Bağlam verilmediyse kolonları boş.
 */
export function aiUsageRow(record: AiUsageRecord, rate: ModelRate | null): AiUsageEntryInsert {
  return {
    task: record.task,
    modelId: record.modelId,
    ok: record.ok,
    failureReason: record.failureReason,
    inputTokens: record.usage.inputTokens,
    outputTokens: record.usage.outputTokens,
    cachedInputTokens: record.usage.cachedInputTokens,
    totalTokens: record.usage.totalTokens,
    costUsd: estimateCost(record.usage, rate),
    conversationId: record.context.conversationId ?? null,
    ticketId: record.context.ticketId ?? null,
  };
}
