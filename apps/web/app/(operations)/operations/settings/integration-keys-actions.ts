'use server';

import { revalidatePath } from 'next/cache';
import { IntegrationSecretService, serviceDb } from '@lezzet/database';
import { checkIntegrationKey, checkIntegrationKeys, type IntegrationCheck } from '@lezzet/application/integration/checks';
import { forgetIntegrationSecrets, freshIntegrationSecrets, revealIntegrationSecret } from '@lezzet/application/integration/secrets';
import { logger } from '@lezzet/observability';
import { IntegrationSecretNameEnum, type IntegrationSecretName } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import type { SetKeyOutcome } from './integration-keys-read';
import { SETTINGS_PATH } from './settings-url';

/**
 * Bağlantı anahtarlarının yazma, sınama ve kopyalama yolu; kapı yöneticinin, çünkü anahtar kasaya, bankaya ve ödeme sağlayıcısına
 * yazma hakkı açar. Loga ve deftere kimlik yazılır, değer asla; değer yalnız kopyalama isteğinin cevabında, istendiği an gider.
 */

/** Sağlayıcıların anahtarları birkaç yüz karakteri geçmez; sınır yanlışlıkla yapıştırılan metni durdurur. */
const MAX_LENGTH = 512;

/**
 * Anahtar yazılmadan önce sağlayıcıda sınanır: reddedilen anahtar kaydedilmez, çünkü çalışan bağlantının yerine geçip onu
 * bozardı. Sağlayıcıya o an ulaşılamıyorsa kayıt yalnız bilerek (`force`) yapılır.
 */
export async function setIntegrationKeyAction(input: {
  name: string;
  value: string;
  force?: boolean;
}): Promise<ActionResult<SetKeyOutcome>> {
  try {
    const staff = await requireAdmin();
    const name = IntegrationSecretNameEnum.safeParse(input.name);
    if (!name.success) return { data: null, error: 'Tanınmayan anahtar.' };
    const value = input.value.trim();
    if (!value) return { data: null, error: 'Anahtar boş olamaz; kaldırmak için Kaldır düğmesini kullanın.' };
    if (value.length > MAX_LENGTH) return { data: null, error: `Anahtar ${MAX_LENGTH} karakterden uzun olamaz.` };

    const db = serviceDb();
    const current = await freshIntegrationSecrets(db);
    const check = await checkIntegrationKey(name.data, (other) => (other === name.data ? value : current(other)));
    if (check.status === 'rejected' || (check.status === 'unreachable' && !input.force))
      return { data: { saved: false, check }, error: null };

    await new IntegrationSecretService(db).set(name.data, value, staff.profileId, check.status);
    // Bu süreç yeni değeri hemen kullanır; öteki süreçler en geç bir dakikada okur.
    forgetIntegrationSecrets();
    logger.info({ name: name.data, actor: staff.profileId, check: check.status }, 'entegrasyon anahtarı yazıldı');
    revalidatePath(SETTINGS_PATH);
    return { data: { saved: true, check }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Anahtarları birlikte çalıştıkları öteki anahtarlarla, bugünkü değerleriyle tek turda sınar; hiçbir şey kaydetmez. */
export async function checkIntegrationKeysAction(input: {
  names: string[];
}): Promise<ActionResult<Partial<Record<IntegrationSecretName, IntegrationCheck>>>> {
  try {
    await requireAdmin();
    const names = IntegrationSecretNameEnum.array().safeParse(input.names);
    if (!names.success) return { data: null, error: 'Tanınmayan anahtar.' };
    return { data: await checkIntegrationKeys(names.data, await freshIntegrationSecrets(serviceDb())), error: null };
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

export async function copyIntegrationKeyAction(input: { name: string }): Promise<ActionResult<string>> {
  try {
    const staff = await requireAdmin();
    const name = IntegrationSecretNameEnum.safeParse(input.name);
    if (!name.success) return { data: null, error: 'Tanınmayan anahtar.' };
    const db = serviceDb();
    const value = await revealIntegrationSecret(db, name.data);
    if (!value) return { data: null, error: 'Bu anahtar tanımlı değil.' };
    await new IntegrationSecretService(db).recordCopy(name.data, staff.profileId);
    logger.info({ name: name.data, actor: staff.profileId }, 'entegrasyon anahtarı kopyalandı');
    return { data: value, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
