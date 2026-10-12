import type { AiProviderName } from '@lezzet/ai';
import {
  AiProviderEnum,
  AnthropicModelListSchema,
  GoogleModelListSchema,
  type AiModelPrices,
  type IntegrationSecretName,
} from '@lezzet/types';
import { reasonOf } from '../integration/checks';

interface AiModelOption {
  id: string;
  name: string;
}

/** Sağlayıcının listesi ya da okunamama sebebi; "reddetti" anahtarın yanlış, "ulaşılamadı" yalnız şu an okunamadığı demektir. */
export type AiModelCatalogEntry =
  | { provider: AiProviderName; status: 'ok'; models: AiModelOption[] }
  | { provider: AiProviderName; status: 'rejected' | 'unreachable'; detail: string };

/** Sağlayıcının Bağlantılar'daki anahtarı; listeyi okuyan çağrı aynı anahtarla gider. */
const AI_PROVIDER_KEY: Record<AiProviderName, IntegrationSecretName> = {
  anthropic: 'anthropic_api_key',
  google: 'google_ai_api_key',
};

const TIMEOUT_MS = 10_000;

/**
 * Yalnız sürüm numaralı kararlı metin modelleri seçilir: Google görsel, robotik ve önizleme modellerini de `generateContent` ile
 * listeler, `-latest` takma adı ise modeli haber vermeden değiştirir ve tarifesi tutulamaz.
 */
const STABLE_TEXT = /^gemini-\d+(?:\.\d+)?-(?:flash|pro)(?:-lite)?$/;

/** Anahtarı tanımlı her sağlayıcının metin modelleri, canlı; anahtarı olmayan sağlayıcı listeye girmez. */
export async function listAiModels(
  lookup: (name: IntegrationSecretName) => string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<AiModelCatalogEntry[]> {
  const providers = AiProviderEnum.options.flatMap((provider) => {
    const key = lookup(AI_PROVIDER_KEY[provider]);
    return key ? [{ provider, key }] : [];
  });
  return Promise.all(providers.map(({ provider, key }) => listOf(provider, key, fetchImpl)));
}

async function listOf(provider: AiProviderName, key: string, fetchImpl: typeof fetch): Promise<AiModelCatalogEntry> {
  try {
    const res =
      provider === 'anthropic'
        ? await fetchImpl('https://api.anthropic.com/v1/models?limit=100', {
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          })
        : await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
            headers: { 'x-goog-api-key': key },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
    if (!res.ok) {
      const reason = await reasonOf(res);
      const rejected = res.status === 400 || res.status === 401 || res.status === 403;
      return { provider, status: rejected ? 'rejected' : 'unreachable', detail: reason };
    }
    const body: unknown = await res.json();
    const models = provider === 'anthropic' ? anthropicModels(body) : googleModels(body);
    return models
      ? { provider, status: 'ok', models }
      : { provider, status: 'unreachable', detail: 'Model listesi beklenen biçimde değil' };
  } catch (err) {
    return { provider, status: 'unreachable', detail: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}

function anthropicModels(body: unknown): AiModelOption[] | null {
  const parsed = AnthropicModelListSchema.safeParse(body);
  return parsed.success ? parsed.data.data.map((model) => ({ id: model.id, name: model.display_name ?? model.id })) : null;
}

/** Google listeyi sürüm sırasıyla vermez; en yeni üstte dursun diye sürüm sayısına göre tersten dizilir. */
function googleModels(body: unknown): AiModelOption[] | null {
  const parsed = GoogleModelListSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data.models
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => ({ id: model.name.replace(/^models\//, ''), name: model.displayName ?? model.name.replace(/^models\//, '') }))
    .filter((model) => STABLE_TEXT.test(model.id))
    .sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
}

/** Ekrandan gelen tarife: iki fiyat birlikte girilir, ondalık virgül okunur; iki alan da boşsa tarife girilmemiştir. */
export function parseAiModelPrice(
  input: string,
  output: string,
): { ok: true; price: AiModelPrices[string] | null } | { ok: false; error: string } {
  const typed = [input.trim(), output.trim()];
  if (typed.every((value) => value === '')) return { ok: true, price: null };
  if (typed.some((value) => value === '')) return { ok: false, error: 'Girdi ve çıktı fiyatı birlikte girilir.' };
  const inputPerMillion = Number(input.trim().replace(',', '.'));
  const outputPerMillion = Number(output.trim().replace(',', '.'));
  if (![inputPerMillion, outputPerMillion].every((value) => Number.isFinite(value) && value >= 0)) {
    return { ok: false, error: 'Fiyat sıfır ya da pozitif bir sayı olmalı (ör. 0,75).' };
  }
  return { ok: true, price: { inputPerMillion, outputPerMillion } };
}
