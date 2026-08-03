import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { AiFailure, AiProviderName, AiTier } from './types';

/**
 * Sağlayıcı çözümü — **kod değil env karar verir** (`docs/build/20-yapay-zeka.md`).
 *
 * Referans projede (petitcigogne) bu katman ELLE yazılmıştı: nötr mesaj/araç tipleri + döngü +
 * sağlayıcı adaptörü, ~350 satır. Üç sağlayıcı için tasarlanmış, biri yazılmış; nötr tip
 * `meta?: Record<string, unknown>` diye bir kaçış deliği açmak zorunda kalmış (Gemini'nin
 * `thoughtSignature`'ı aynen geri gitmezse 400) ve turlar arası araç geçmişi tamamen ATILMIŞ
 * (sağlayıcı doğrulaması bozuluyordu). Biz o katmanı yazmıyoruz: Vercel AI SDK (`ai`) aynı işi
 * bakımı sürdürülen bir kütüphaneyle yapıyor, sağlayıcı tek satırda değişiyor.
 *
 * **İki sağlayıcı var ve ikisinin de gerçek bir işi var** — "ileride lazım olur" değil: toplu
 * çeviri hacimli ve ucuz katman ister, metin taslağı marka sesi ister. Biri kotaya takılırsa
 * öteki env değişikliğiyle devralır.
 */

interface ProviderSpec {
  /** Anahtarın okunduğu env değişkeni — sağlayıcının SDK'sının beklediği ad. */
  apiKeyEnv: string;
  /** Katman varsayılanları. `AI_MODEL_CHEAP`/`AI_MODEL_STANDARD` ezer. */
  defaults: Record<AiTier, string>;
  create(apiKey: string, modelId: string): LanguageModel;
}

const PROVIDERS: Record<AiProviderName, ProviderSpec> = {
  anthropic: {
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaults: { cheap: 'claude-haiku-4-5-20251001', standard: 'claude-sonnet-5' },
    create: (apiKey, modelId) => createAnthropic({ apiKey })(modelId),
  },
  google: {
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    defaults: { cheap: 'gemini-2.5-flash-lite', standard: 'gemini-2.5-flash' },
    create: (apiKey, modelId) => createGoogleGenerativeAI({ apiKey })(modelId),
  },
};

export const DEFAULT_PROVIDER: AiProviderName = 'anthropic';

function readProviderName(): AiProviderName | null {
  const raw = process.env.AI_PROVIDER?.trim();
  if (!raw) return DEFAULT_PROVIDER;
  return raw in PROVIDERS ? (raw as AiProviderName) : null;
}

interface ResolvedModel {
  ok: true;
  model: LanguageModel;
  modelId: string;
  provider: AiProviderName;
}

/**
 * Katman → çalıştırılabilir model. **Fırlatmaz**: yapılandırma eksikse `not_configured` döner ve
 * çağıran özelliği AI'sız sürdürür. Modül YÜKLENİRKEN env okunmaz — anahtarsız bir ortamda
 * `import` etmek bile patlamamalı, yoksa AI paketine dokunan her test ortam kurulumu ister.
 */
export function resolveModel(tier: AiTier): ResolvedModel | AiFailure {
  const provider = readProviderName();
  if (!provider) {
    return { ok: false, reason: 'not_configured', message: `AI_PROVIDER geçersiz: '${process.env.AI_PROVIDER}' (anthropic|google)` };
  }
  const spec = PROVIDERS[provider];
  const apiKey = process.env[spec.apiKeyEnv]?.trim();
  if (!apiKey) {
    return { ok: false, reason: 'not_configured', message: `${spec.apiKeyEnv} tanımlı değil — '${provider}' sağlayıcısı kullanılamıyor.` };
  }
  const envKey = tier === 'cheap' ? 'AI_MODEL_CHEAP' : 'AI_MODEL_STANDARD';
  const modelId = process.env[envKey]?.trim() || spec.defaults[tier];
  return { ok: true, model: spec.create(apiKey, modelId), modelId, provider };
}
