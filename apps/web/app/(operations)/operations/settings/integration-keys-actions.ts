'use server';

import { revalidatePath } from 'next/cache';
import { IntegrationSecretService, serviceDb } from '@lezzet/database';
import { forgetIntegrationSecrets } from '@lezzet/application';
import { logger } from '@lezzet/observability';
import { IntegrationSecretNameEnum } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * Bağlantı anahtarlarının yazma yolu. Kapı yöneticinin: anahtar kasaya, bankaya ve ödeme sağlayıcısına yazma hakkı açar.
 * Değer yalnız Vault'a gider; loga, cevaba ve deftere kimlik yazılır, değer asla.
 */

/** Sağlayıcıların anahtarları birkaç yüz karakteri geçmez; sınır yanlışlıkla yapıştırılan metni durdurur. */
const MAX_LENGTH = 512;

export async function setIntegrationKeyAction(input: { name: string; value: string }): Promise<ActionResult> {
  try {
    const staff = await requireAdmin();
    const name = IntegrationSecretNameEnum.safeParse(input.name);
    if (!name.success) return { data: null, error: 'Tanınmayan anahtar.' };
    const value = input.value.trim();
    if (!value) return { data: null, error: 'Anahtar boş olamaz; kaldırmak için Kaldır düğmesini kullanın.' };
    if (value.length > MAX_LENGTH) return { data: null, error: `Anahtar ${MAX_LENGTH} karakterden uzun olamaz.` };

    await new IntegrationSecretService(serviceDb()).set(name.data, value, staff.profileId);
    // Bu süreç yeni değeri hemen kullanır; öteki süreçler önbellek ömrü dolunca okur.
    forgetIntegrationSecrets();
    logger.info({ name: name.data, actor: staff.profileId }, 'entegrasyon anahtarı yazıldı');
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

export async function clearIntegrationKeyAction(input: { name: string }): Promise<ActionResult> {
  try {
    const staff = await requireAdmin();
    const name = IntegrationSecretNameEnum.safeParse(input.name);
    if (!name.success) return { data: null, error: 'Tanınmayan anahtar.' };

    await new IntegrationSecretService(serviceDb()).clear(name.data, staff.profileId);
    forgetIntegrationSecrets();
    logger.info({ name: name.data, actor: staff.profileId }, 'entegrasyon anahtarı kaldırıldı');
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
