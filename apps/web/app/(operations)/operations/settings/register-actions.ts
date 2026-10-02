'use server';

import { revalidatePath } from 'next/cache';
import { AccountService, RegisterStoreService, WarehouseService, serviceDb } from '@lezzet/database';
import { registerLiveFrom, requeueRegisterStore, setRegisterLiveFrom } from '@lezzet/application';
import { parisDayRange } from '@lezzet/helper';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * Sertifikalı kasanın kurulumu: tesis ↔ kasa mağazası ↔ çekmecenin nakit hesabı ve canlıya geçiş günü. Mağaza kasa yazılımında elle
 * açılır, numarası buraya yazılır; eşleme yanlışsa satış başka mağazanın Z'sine düşer, bu yüzden kapı yöneticinindir.
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

    const store = await new RegisterStoreService(db).save(input);
    await requeueRegisterStore(db, store, await registerLiveFrom(db));
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

/** Gün Paris'in gece yarısından başlar; boş değer kasayı kapatır ve hiçbir şey yazılmaz. */
export async function setRegisterLiveFromAction(input: { date: string | null }): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (input.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { data: null, error: 'Tarih okunamadı.' };
    await setRegisterLiveFrom(serviceDb(), input.date ? parisDayRange(input.date).from : null);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Mağaza numarası ve nakit hesabı birer mağazaya aittir; tekillik reddi okunur cümleye çevrilir. */
function uniqueMessage(error: unknown): string | null {
  const message = getErrorMessage(error);
  if (message.includes('register_store_external_store_id_key')) return 'Bu mağaza numarası başka bir tesise eşlenmiş.';
  if (message.includes('register_store_cash_account_id_key')) return 'Bu nakit hesabı başka bir tesisin çekmecesi.';
  return null;
}
