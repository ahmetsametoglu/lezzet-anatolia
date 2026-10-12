'use server';

import { revalidatePath } from 'next/cache';
import { saveAiModelChoice, saveAiModelPrice } from '@lezzet/application/ai/model-choice';
import { listAiModels, parseAiModelPrice } from '@lezzet/application/ai/models';
import { integrationSecrets } from '@lezzet/application/integration/secrets';
import { serviceDb } from '@lezzet/database';
import { AiModelChoiceSchema, AiTierEnum } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * Katmanın modelini yazar; model sağlayıcının canlı listesinde olmalıdır ki ekranda görünmeyen bir ad kaydedilmesin. Kapı yöneticinin,
 * çünkü seçim bütün yapay zekâ harcamasını belirler.
 */
export async function saveAiModelAction(input: {
  tier: string;
  provider: string;
  model: string;
  price: { input: string; output: string };
}): Promise<ActionResult> {
  try {
    const staff = await requireAdmin();
    const tier = AiTierEnum.safeParse(input.tier);
    const choice = AiModelChoiceSchema.safeParse({ provider: input.provider, model: input.model });
    if (!tier.success || !choice.success) return { data: null, error: 'Geçersiz model seçimi.' };
    const price = parseAiModelPrice(input.price.input, input.price.output);
    if (!price.ok) return { data: null, error: price.error };

    const db = serviceDb();
    const entry = (await listAiModels(await integrationSecrets(db))).find((candidate) => candidate.provider === choice.data.provider);
    if (!entry) return { data: null, error: "Bu sağlayıcının anahtarı Bağlantılar'da tanımlı değil." };
    if (entry.status !== 'ok') return { data: null, error: `Model listesi okunamadı (${entry.detail}); seçim kaydedilmedi.` };
    if (!entry.models.some((option) => option.id === choice.data.model)) {
      return { data: null, error: 'Seçilen model sağlayıcının listesinde yok; sayfayı yenileyip yeniden seçin.' };
    }

    if (price.price) await saveAiModelPrice(db, choice.data.model, price.price, staff.profileId);
    await saveAiModelChoice(db, tier.data, choice.data, staff.profileId);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Sağlayıcıların model kimliği biçimi (`claude-sonnet-5-5`, `gemini-3.8-flash`); tarife tablosuna başka bir anahtar girmesin. */
const MODEL_ID = /^[a-z0-9][a-z0-9.-]*$/;

/** Yalnız tarifeyi yazar; seçime dokunmaz ki varsayılan modelle koşan katman, tarifesi değişti diye seçilmiş sayılmasın. */
export async function saveAiModelPriceAction(input: { model: string; price: { input: string; output: string } }): Promise<ActionResult> {
  try {
    const staff = await requireAdmin();
    if (!MODEL_ID.test(input.model)) return { data: null, error: 'Geçersiz model kimliği.' };
    const price = parseAiModelPrice(input.price.input, input.price.output);
    if (!price.ok) return { data: null, error: price.error };
    if (!price.price) return { data: null, error: 'Girdi ve çıktı fiyatı girilmeli.' };
    await saveAiModelPrice(serviceDb(), input.model, price.price, staff.profileId);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Seçimi kaldırır; katman anahtarı tanımlı ilk sağlayıcının varsayılan modeline döner. */
export async function resetAiModelAction(input: { tier: string }): Promise<ActionResult> {
  try {
    const staff = await requireAdmin();
    const tier = AiTierEnum.safeParse(input.tier);
    if (!tier.success) return { data: null, error: 'Geçersiz katman.' };
    await saveAiModelChoice(serviceDb(), tier.data, null, staff.profileId);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
