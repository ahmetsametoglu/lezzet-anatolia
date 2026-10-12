import 'server-only';

import { pickModel, type AiTier } from '@lezzet/ai';
import { readAiModelChoices, readAiModelPrices } from '@lezzet/application/ai/model-choice';
import { listAiModels, type AiModelCatalogEntry } from '@lezzet/application/ai/models';
import { integrationSecrets } from '@lezzet/application/integration/secrets';
import { serviceDb } from '@lezzet/database';
import type { AiModelPrices, AiProvider } from '@lezzet/types';

/** Katmanda bugün koşan model; seçim yoksa anahtarı tanımlı ilk sağlayıcının varsayılanıdır. */
export interface AiModelTierView {
  tier: AiTier;
  current: { provider: AiProvider; model: string; name: string; chosen: boolean } | null;
  /** Katman koşamıyorsa sebebi (anahtar yok ya da seçilen modelin sağlayıcısının anahtarı yok). */
  problem: string | null;
}

export interface AiModelPanelData {
  tiers: AiModelTierView[];
  catalog: AiModelCatalogEntry[];
  /** Tarife tablosu; okunamıyorsa `null` ve tarife yazılmaz. */
  prices: AiModelPrices | null;
}

/** Ekrandaki sıra tasarımdakidir: önce müşteriye ve yöneticiye yazan katman. */
const TIER_ORDER: readonly AiTier[] = ['standard', 'cheap'];

export async function readAiModelPanel(): Promise<AiModelPanelData> {
  const db = serviceDb();
  const [choices, prices, lookup] = await Promise.all([readAiModelChoices(db), readAiModelPrices(db), integrationSecrets(db)]);
  const catalog = await listAiModels(lookup);
  const nameOf = (model: string) =>
    catalog.flatMap((entry) => (entry.status === 'ok' ? entry.models : [])).find((option) => option.id === model)?.name ?? model;

  return {
    tiers: TIER_ORDER.map((tier) => {
      const picked = pickModel(tier, choices, process.env);
      return picked.ok
        ? {
            tier,
            current: { provider: picked.provider, model: picked.modelId, name: nameOf(picked.modelId), chosen: picked.chosen },
            problem: null,
          }
        : { tier, current: null, problem: picked.message };
    }),
    catalog,
    prices,
  };
}
