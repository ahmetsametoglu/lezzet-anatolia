import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AiModelChoice } from '@lezzet/types';
import type { LanguageModel } from 'ai';
import type { AiFailure, AiProviderName, AiTier } from './types';

/**
 * Sağlayıcı katmanını kütüphane (Vercel AI SDK) kurar; burada yalnız katmanın hangi modelle ve hangi anahtarla koşacağı seçilir.
 * Seçimi uygulama katmanı süreç başında takar (`setAiModelChoices`), çünkü paket veritabanını bilmez.
 */

interface ProviderSpec {
  /** Sağlayıcı SDK'sının beklediği ortam adı; Bağlantılar'da yazılan anahtar süreç ortamına bu adla biner. */
  apiKeyEnv: string;
  /** Katman seçilmemişken çalışan model. */
  defaults: Record<AiTier, string>;
  create(apiKey: string, modelId: string): LanguageModel;
}

const PROVIDERS: Record<AiProviderName, ProviderSpec> = {
  anthropic: {
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaults: { cheap: 'claude-haiku-5-5', standard: 'claude-sonnet-5-5' },
    create: (apiKey, modelId) => createAnthropic({ apiKey })(modelId),
  },
  google: {
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    // Ses çözümü ucuz katmanda kalır: Flash-Lite'ta düşünme kapalıdır ve çözümleme akıl yürütme istemez.
    defaults: { cheap: 'gemini-3.5-flash-lite', standard: 'gemini-3.8-flash' },
    create: (apiKey, modelId) => createGoogleGenerativeAI({ apiKey })(modelId),
  },
};

/** Seçim yokken sıra: anahtarı tanımlı ilk sağlayıcının varsayılanı çalışır. */
const DEFAULT_ORDER: readonly AiProviderName[] = ['anthropic', 'google'];

export type AiModelChoices = Partial<Record<AiTier, AiModelChoice>>;

// Seçim `globalThis`te durur: Next sunucu kodunu birden çok modül grafiğinde derler ve modül değişkeni öteki grafikte boş kalırdı.
const SLOT = Symbol.for('lezzet.ai.model-choices');
type Slot = { [SLOT]?: () => AiModelChoices };

/** Seçimin kaynağı süreç başında takılır; `null` söker (testte önceki hâli geri koymak için). */
export function setAiModelChoices(source: (() => AiModelChoices) | null): void {
  (globalThis as Slot)[SLOT] = source ?? undefined;
}

export interface PickedModel {
  ok: true;
  provider: AiProviderName;
  modelId: string;
  /** Kurulum'da seçilmiş mi, yoksa seçim olmadığı için varsayılan mı. */
  chosen: boolean;
}

/**
 * Katmanın modeli: seçim varsa o, yoksa anahtarı tanımlı ilk sağlayıcının varsayılanı. Seçilen modelin sağlayıcısının anahtarı yoksa
 * başka sağlayıcıya düşülmez, çünkü seçilmemiş bir modelin sessizce koşması seçimi yalanlardı.
 */
export function pickModel(tier: AiTier, choices: AiModelChoices, env: Record<string, string | undefined>): PickedModel | AiFailure {
  const choice = choices[tier];
  if (choice) {
    const keyEnv = PROVIDERS[choice.provider].apiKeyEnv;
    if (!env[keyEnv]?.trim())
      return { ok: false, reason: 'not_configured', message: `${choice.model} seçili ama ${keyEnv} tanımlı değil.` };
    return { ok: true, provider: choice.provider, modelId: choice.model, chosen: true };
  }
  const provider = DEFAULT_ORDER.find((name) => env[PROVIDERS[name].apiKeyEnv]?.trim());
  if (!provider) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Yapay zekâ anahtarı tanımlı değil (ANTHROPIC_API_KEY ya da GOOGLE_GENERATIVE_AI_API_KEY).',
    };
  }
  return { ok: true, provider, modelId: PROVIDERS[provider].defaults[tier], chosen: false };
}

interface ResolvedModel {
  ok: true;
  model: LanguageModel;
  modelId: string;
  provider: AiProviderName;
}

/** Fırlatmaz: yapılandırma eksikse `not_configured` döner ve çağıran özelliği yapay zekâsız sürdürür. Ortam çağrı anında okunur. */
export function resolveModel(tier: AiTier): ResolvedModel | AiFailure {
  const picked = pickModel(tier, (globalThis as Slot)[SLOT]?.() ?? {}, process.env);
  if (!picked.ok) return picked;
  const spec = PROVIDERS[picked.provider];
  const apiKey = process.env[spec.apiKeyEnv]?.trim() ?? '';
  return { ok: true, model: spec.create(apiKey, picked.modelId), modelId: picked.modelId, provider: picked.provider };
}
