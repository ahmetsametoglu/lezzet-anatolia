'use server';

import { revalidatePath } from 'next/cache';
import { AccountService, PennylaneBankAccountService, serviceDb, type Db } from '@lezzet/database';
import { mapPennylaneBankAccount, openMappedBankAccount, type PennylaneSetupOutcome } from '@lezzet/application';
import { addDays } from '@lezzet/helper';
import { shortDate } from '@/components/operation/ui/format';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * Pennylane'in kurulumu: banka hesabımız ↔ Pennylane'deki hesabı. Eşleme yanlışsa başka hesabın hareketi bizim hesaba yazılır, bu
 * yüzden kapı yöneticinindir.
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

/** Pennylane'de görünen ve bizde eşi olmayan banka hesabı tek adımda bizde açılır ve eşlenir. */
export async function openPennylaneAccountAction(input: { pennylaneId: number }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const db = serviceDb();
    const outcome = await openMappedBankAccount(db, input);
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

async function refusalOf(db: Db, outcome: Extract<PennylaneSetupOutcome, { status: 'invalid' }>): Promise<string> {
  switch (outcome.reason) {
    case 'not_bank_account':
      return "Pennylane'e yalnız açık bir banka hesabı eşlenir.";
    case 'unknown_pennylane_account':
      return 'Bu Pennylane hesabı okunan listede yok; eşitlemenin sonraki turunu bekleyin.';
    case 'pennylane_account_taken':
      return 'Bu Pennylane hesabı başka bir hesaba eşli; önce oradaki eşlemeyi kaldırın.';
    case 'file_rows_in_feed': {
      const account = await new AccountService(db).getById(outcome.accountId);
      return `${account?.name ?? 'Hesap'} hesabına ${shortDate(outcome.lastFileDate)} gününe kadar dosyadan banka satırı yüklenmiş; hareketler eşleme gününden okunduğu için Pennylane aynı satırları ikinci kez yazardı. Eşleme ${shortDate(addDays(outcome.lastFileDate, 1))} gününden itibaren yapılabilir.`;
    }
  }
}
