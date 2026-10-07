'use server';

import { revalidatePath } from 'next/cache';
import { AccountService, JobRunService, RegisterStoreService, WarehouseService, serviceDb } from '@lezzet/database';
import { checkRegisterDay, ensureShippingCategory, hiboutikFromEnv, REGISTER_CHECK_JOB, requeueRegisterStore } from '@lezzet/application';
import { logger } from '@lezzet/observability';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * Sertifikalı kasanın kurulumu: tesis ↔ kasa mağazası ↔ çekmecenin nakit hesabı. Mağaza kasa yazılımında elle açılır, numarası buraya
 * yazılır; eşleme yanlışsa satış başka mağazanın Z'sine düşer, bu yüzden kapı yöneticinindir.
 */

export async function saveRegisterStoreAction(input: {
  warehouseId: string;
  externalStoreId: number;
  cashAccountId: string;
}): Promise<ActionResult<{ warehouseId: string }>> {
  try {
    await requireAdmin();
    if (!Number.isInteger(input.externalStoreId) || input.externalStoreId <= 0) {
      return { data: null, error: 'Mağaza numarası kasa yazılımındaki pozitif tam sayıdır.' };
    }
    const db = serviceDb();
    const [warehouse, account] = await Promise.all([
      new WarehouseService(db).getById(input.warehouseId),
      new AccountService(db).getById(input.cashAccountId),
    ]);
    if (!warehouse || warehouse.kind !== 'facility')
      return { data: null, error: 'Kasa yalnız bir tesise eşlenir; araç satışı tesisinin kasasına yazılır.' };
    if (!account || account.type !== 'cash' || !account.isActive)
      return { data: null, error: 'Çekmecenin hesabı açık bir nakit hesabı olmalı.' };
    const refusal = await registerSetupRefusal(input.externalStoreId);
    if (refusal) return { data: null, error: refusal };

    const store = await new RegisterStoreService(db).save(input);
    await requeueRegisterStore(db, store);
    revalidatePath(SETTINGS_PATH);
    return { data: { warehouseId: input.warehouseId }, error: null };
  } catch (error) {
    return { data: null, error: uniqueMessage(error) ?? getErrorMessage(error) };
  }
}

export async function removeRegisterStoreAction(input: { warehouseId: string }): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new RegisterStoreService(serviceDb()).remove(input.warehouseId);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Bugünün kasa karşılaştırması, gün kapatılmadan; sonuç gün içi turun izine yazılır, düşen deneme de, ki Pano eski sonucu göstermesin. */
export async function checkRegisterDayAction(): Promise<ActionResult> {
  try {
    await requireAdmin();
    const register = hiboutikFromEnv();
    if (!register) return { data: null, error: 'Hiboutik anahtarları tanımlı değil; karşılaştırma yapılamaz.' };
    const db = serviceDb();
    const jobs = new JobRunService(db);
    try {
      await jobs.recordSuccess(REGISTER_CHECK_JOB, await checkRegisterDay(db, register, { now: new Date() }));
    } catch (error) {
      await jobs.recordFailure(REGISTER_CHECK_JOB, getErrorMessage(error));
      throw error;
    }
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Numara kasa yazılımında açık bir mağazaya ait olmalı, yoksa satış başka mağazanın Z'sine yazılırdı. Kargo kategorisi de burada açılır ki
 * Pennylane bağlantısında ilk kargolu satıştan önce eşlenebilsin; anahtarsız ortamda kasaya hiçbir şey yazılmadığı için ikisi de atlanır.
 */
async function registerSetupRefusal(externalStoreId: number): Promise<string | null> {
  const register = hiboutikFromEnv();
  if (!register) return null;
  try {
    const stores = await register.listStores();
    if (!stores.some((store) => store.externalStoreId === externalStoreId)) return 'Bu numarada açık bir Hiboutik mağazası yok.';
    await ensureShippingCategory(register);
    return null;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'kasa: Hiboutik okunamadı, eşleme kaydedilmedi');
    return "Hiboutik'e ulaşılamadı; mağaza doğrulanamadığı için eşleme kaydedilmedi. Biraz sonra yeniden deneyin.";
  }
}

/** Mağaza numarası ve nakit hesabı birer mağazaya aittir; tekillik reddi okunur cümleye çevrilir. */
function uniqueMessage(error: unknown): string | null {
  const message = getErrorMessage(error);
  if (message.includes('register_store_external_store_id_key')) return 'Bu mağaza numarası başka bir tesise eşlenmiş.';
  if (message.includes('register_store_cash_account_id_key')) return 'Bu nakit hesabı başka bir tesisin çekmecesi.';
  return null;
}
