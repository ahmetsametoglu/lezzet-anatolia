import { setAiModelChoices, type AiModelChoices, type AiTier } from '@lezzet/ai';
import { SettingsService, type Db } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { AiModelChoiceSchema, AiModelPricesSchema, AiTierEnum, type AiModelChoice, type AiModelPrices } from '@lezzet/types';
import { AI_PRICES_KEY } from './usage-recorder';

/** Katman başına seçimin ayar anahtarı; satır yoksa katman varsayılan modelle koşar. */
const AI_MODEL_SETTING_KEYS: Record<AiTier, string> = { standard: 'ai_model_standard', cheap: 'ai_model_cheap' };

const REFRESH_MS = 60_000;

/** Kayıtlı seçimler, önbelleksiz: Kurulum az önce yazılanı görmeli. Bozuk satır seçim sayılmaz ve iz bırakır. */
export async function readAiModelChoices(db: Db): Promise<AiModelChoices> {
  const settings = new SettingsService(db);
  const entries = await Promise.all(
    AiTierEnum.options.map(async (tier) => {
      const row = (await settings.listByKey(AI_MODEL_SETTING_KEYS[tier])).find((setting) => setting.scopeType === 'global');
      if (!row) return null;
      const parsed = AiModelChoiceSchema.safeParse(row.value);
      if (parsed.success) return [tier, parsed.data] as const;
      logger.warn(
        { context: 'application/ai-model', key: AI_MODEL_SETTING_KEYS[tier] },
        'Model seçimi okunamadı — katman varsayılanla koşuyor',
      );
      return null;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

/** Tarife tablosu, önbelleksiz; satır bozuksa `null` döner ki üzerine yazılıp öteki modellerin tarifesi silinmesin. */
export async function readAiModelPrices(db: Db): Promise<AiModelPrices | null> {
  const row = (await new SettingsService(db).listByKey(AI_PRICES_KEY)).find((setting) => setting.scopeType === 'global');
  const parsed = AiModelPricesSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : null;
}

let snapshot: AiModelChoices = {};
let reload: (() => Promise<void>) | null = null;

/** Seçimleri süreç belleğine yükler ve dakikada bir tazeler; yapay zekâ paketi her çağrıda bu anlık görüntüyü okur. */
export async function loadAiModelChoices(db: Db): Promise<void> {
  const refresh = () =>
    readAiModelChoices(db)
      .then((next) => {
        snapshot = next;
      })
      .catch((err: unknown) => captureError(err, { source: SOURCES.applicationAi, context: { flow: 'ai/model-choices' } }));
  if (!reload) {
    setAiModelChoices(() => snapshot);
    setInterval(() => void refresh(), REFRESH_MS).unref();
  }
  reload = refresh;
  await refresh();
}

/** Seçimi yazar ya da (`null`) kaldırır; yazan süreç kendi belleğini hemen tazeler, öteki süreçler en geç bir dakikada görür. */
export async function saveAiModelChoice(db: Db, tier: AiTier, choice: AiModelChoice | null, actorId: string | null): Promise<void> {
  const settings = new SettingsService(db);
  if (choice) {
    await settings.set(AI_MODEL_SETTING_KEYS[tier], choice, { description: 'Yapay zekâ modeli — Ayarlar › Kurulum', actorId });
  } else {
    await settings.remove(AI_MODEL_SETTING_KEYS[tier]);
  }
  await reload?.();
}

/** Modelin tarifesini tabloya ekler ya da günceller; tablo okunamıyorsa yazmaz. */
export async function saveAiModelPrice(db: Db, model: string, price: AiModelPrices[string], actorId: string | null): Promise<void> {
  const prices = await readAiModelPrices(db);
  if (!prices) throw new Error('Model tarifesi tablosu okunamadı; tarife yazılmadı.');
  await new SettingsService(db).set(AI_PRICES_KEY, { ...prices, [model]: price }, { actorId });
}
