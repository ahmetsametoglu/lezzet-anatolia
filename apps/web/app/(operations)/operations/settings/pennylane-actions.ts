'use server';

import { revalidatePath } from 'next/cache';
import { AccountService, PennylaneBankAccountService, serviceDb, type Db } from '@lezzet/database';
import { mapPennylaneBankAccount, setPennylaneLiveFrom, type PennylaneSetupOutcome } from '@lezzet/application';
import { shortDate } from '@/components/operation/ui/format';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * Pennylane'in kurulumu: banka hesabımız ↔ Pennylane'deki hesabı ve canlıya geçiş günü. Eşleme yanlışsa başka hesabın hareketi bizim
 * hesaba yazılır, bu yüzden kapı yöneticinindir.
 */

export async function savePennylaneAccountAction(input: { accountId: string; pennylaneId: number }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const db = serviceDb();
    const outcome = await mapPennylaneBankAccount(db, input);
    if (outcome.status === 'invalid') return { data: null, error: await refusalOf(db, outcome) };
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

export async function removePennylaneAccountAction(input: { accountId: string }): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new PennylaneBankAccountService(serviceDb()).unmap(input.accountId);
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Gün takvim günüdür; boş değer okumayı kapatır. */
export async function setPennylaneLiveFromAction(input: { date: string | null }): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (input.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { data: null, error: 'Tarih okunamadı.' };
    const db = serviceDb();
    const outcome = await setPennylaneLiveFrom(db, input.date);
    if (outcome.status === 'invalid') return { data: null, error: await refusalOf(db, outcome) };
    revalidatePath(SETTINGS_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

async function refusalOf(db: Db, outcome: Extract<PennylaneSetupOutcome, { status: 'invalid' }>): Promise<string> {
  switch (outcome.reason) {
    case 'not_bank_account':
      return "Pennylane'e yalnız açık bir banka hesabı eşlenir.";
    case 'unknown_pennylane_account':
      return 'Bu Pennylane hesabı okunan listede yok; eşitlemenin sonraki turunu bekleyin.';
    case 'pennylane_account_taken':
      return 'Bu Pennylane hesabı başka bir hesaba eşli; önce oradaki eşlemeyi kaldırın.';
    case 'file_rows_after_live': {
      const account = await new AccountService(db).getById(outcome.accountId);
      return `${account?.name ?? 'Hesap'} hesabına ${shortDate(outcome.lastFileDate)} gününe kadar dosyadan banka satırı yüklenmiş; Pennylane aynı satırları ikinci kez yazardı. Canlıya geçiş günü bu günden sonra olmalı.`;
    }
  }
}
