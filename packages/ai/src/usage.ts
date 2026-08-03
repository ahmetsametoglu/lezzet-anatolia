import type { LanguageModelUsage } from 'ai';
import type { AiUsage } from './types';

/** Sağlayıcının ölçümü → nötr ölçüm. Bildirilmeyen alan `null` kalır (bkz. `AiUsage` künyesi). */
export function toAiUsage(usage: LanguageModelUsage | undefined): AiUsage {
  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
  };
}

export const EMPTY_USAGE: AiUsage = { inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null };

/** İki ölçümü toplar. Toplanan tarafların ikisi de bilinmiyorsa sonuç da `null` kalır. */
export function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  const topla = (x: number | null, y: number | null): number | null => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  return {
    inputTokens: topla(a.inputTokens, b.inputTokens),
    outputTokens: topla(a.outputTokens, b.outputTokens),
    totalTokens: topla(a.totalTokens, b.totalTokens),
    cachedInputTokens: topla(a.cachedInputTokens, b.cachedInputTokens),
  };
}

/** Milyon token başına birim fiyat. Para birimi çağıranın seçimidir (bizde EUR — `settings`). */
export interface ModelRate {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Yaklaşık maliyet. **Fiyat tablosu bu pakette YOK ve bu bilinçli** — tarife çağırandan gelir
 * (`settings`), çünkü fiyat sağlayıcının kararıdır ve değişir.
 *
 * Referans projede tarife kodda gömülüydü ve tam da beklendiği gibi çürüdü: bilinmeyen model
 * yedeği tabloda OLMAYAN bir anahtara bakıyor (`pricing.ts:66`) — yaklaşık maliyet yerine
 * `TypeError`. Burada bilinmeyen tarife `null` döner: **bilinmiyorsa bilinmiyor** (`CLAUDE §1`);
 * sıfır göstermek, harcamayı bedava gibi okutur.
 */
export function estimateCost(usage: AiUsage, rate: ModelRate | null): number | null {
  if (!rate) return null;
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  return (usage.inputTokens * rate.inputPerMillion + usage.outputTokens * rate.outputPerMillion) / 1_000_000;
}
