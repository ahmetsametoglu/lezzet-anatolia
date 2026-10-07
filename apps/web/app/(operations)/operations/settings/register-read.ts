import 'server-only';

import { AccountService, JobRunService, RegisterQueueService, RegisterStoreService, WarehouseService, serviceDb } from '@lezzet/database';
import { registerBlockReasonLabel } from '@lezzet/i18n';
import { jobView, readQueueView, type SetupJobView, type SetupQueueView } from './setup-trace';

/** Tesis başına kasa eşlemesi; eşlenmemiş tesis de listede durur ki eşleme buradan açılsın. */
export interface RegisterStoreRowView {
  warehouseId: string;
  warehouseName: string;
  externalStoreId: number | null;
  cashAccountId: string | null;
  cashAccountName: string | null;
}

export interface RegisterPanelData {
  stores: RegisterStoreRowView[];
  cashAccounts: { value: string; label: string }[];
  queue: SetupQueueView;
  sync: SetupJobView | null;
  dayEnd: (SetupJobView & RegisterDayEndView) | null;
}

/** Son gece işinin sonucu, bütün mağazalar için: gün kapandı mı, kaç fark ve kaç bekleyen kayıt vardı. */
export interface RegisterDayEndView {
  date: string | null;
  closed: boolean;
  differences: number;
  waiting: number;
  /** Arama sınırının gerisinde kapanmamış gün var; elle bakılana kadar kapanış durur. */
  olderUnclosed: boolean;
  /** Canlı kipte değilse gün tutsa da kapatılmaz. */
  live: boolean;
}

/** Turun kendini atlama sebebi, operatörün diliyle. */
const JOB_SKIP_LABEL: Record<string, string> = {
  not_configured: 'Hiboutik anahtarları tanımlı değil',
};

export async function readRegisterPanel(): Promise<RegisterPanelData> {
  const db = serviceDb();
  const jobs = new JobRunService(db);
  const [facilities, accounts, stores, queue, sync, dayEnd] = await Promise.all([
    new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
    new AccountService(db).list({ activeOnly: true }),
    new RegisterStoreService(db).list(),
    readQueueView(new RegisterQueueService(db), registerBlockReasonLabel),
    jobs.findByName('register_sync'),
    jobs.findByName('register_close_day'),
  ]);

  const cash = accounts.filter((account) => account.type === 'cash');
  const accountName = new Map(cash.map((account) => [account.id, account.name]));
  const storeOf = new Map(stores.map((store) => [store.warehouseId, store]));
  const dayStores = Array.isArray(dayEnd?.lastResult?.['stores'])
    ? (dayEnd.lastResult['stores'] as Array<{ closed?: boolean; differences?: number; waiting?: number; olderUnclosed?: boolean }>)
    : [];

  return {
    stores: facilities.map((facility) => {
      const store = storeOf.get(facility.id);
      return {
        warehouseId: facility.id,
        warehouseName: facility.name,
        externalStoreId: store?.externalStoreId ?? null,
        cashAccountId: store?.cashAccountId ?? null,
        cashAccountName: store ? (accountName.get(store.cashAccountId) ?? '—') : null,
      };
    }),
    cashAccounts: cash.map((account) => ({ value: account.id, label: account.name })),
    queue,
    sync: sync ? jobView(sync, JOB_SKIP_LABEL) : null,
    dayEnd: dayEnd
      ? {
          ...jobView(dayEnd, JOB_SKIP_LABEL),
          date: typeof dayEnd.lastResult?.['date'] === 'string' ? (dayEnd.lastResult['date'] as string) : null,
          closed: dayStores.length > 0 && dayStores.every((store) => store.closed === true),
          differences: dayStores.reduce((sum, store) => sum + (store.differences ?? 0), 0),
          waiting: dayStores.reduce((sum, store) => sum + (store.waiting ?? 0), 0),
          olderUnclosed: dayStores.some((store) => store.olderUnclosed === true),
          live: dayEnd.lastResult?.['live'] === true,
        }
      : null,
  };
}
