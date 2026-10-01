import 'server-only';

import { AccountService, JobRunService, RegisterQueueService, RegisterStoreService, WarehouseService, serviceDb } from '@lezzet/database';
import { registerLiveFrom } from '@lezzet/application';
import { parisDateOf } from '@lezzet/helper';
import { blockReasonOf } from '@/lib/register/labels';

/** Tesis başına kasa eşlemesi; eşlenmemiş tesis de listede durur ki eşleme buradan açılsın. */
export interface RegisterStoreRowView {
  warehouseId: string;
  warehouseName: string;
  externalStoreId: number | null;
  cashAccountId: string | null;
  cashAccountName: string | null;
}

/** Bir backend turunun izi: ne zaman koştu, atladıysa neden, düştüyse hatası. */
export interface RegisterJobView {
  at: string;
  skipped: string | null;
  error: string | null;
}

export interface RegisterPanelData {
  /** Canlıya geçiş günü (Paris); `null` = kasaya hiçbir şey yazılmıyor. */
  liveFrom: string | null;
  stores: RegisterStoreRowView[];
  cashAccounts: { value: string; label: string }[];
  waiting: number;
  blocked: { reason: string; count: number }[];
  failing: number;
  sync: RegisterJobView | null;
  dayEnd: (RegisterJobView & { date: string | null; differences: number }) | null;
}

/** Turun kendini atlama sebebi, operatörün diliyle; tanınmayan kod olduğu gibi gösterilir. */
const JOB_SKIP_LABEL: Record<string, string> = {
  not_live: 'kasa kapalı',
  not_configured: 'Hiboutik anahtarları tanımlı değil',
};

/** Atlanan turda `skipped` sebep kodudur; normal turda aynı alan atlanan satır sayısıdır ve gösterilmez. */
const jobView = (row: { lastRunAt: string; lastResult: Record<string, unknown> | null; lastError: string | null }): RegisterJobView => {
  const skipped = row.lastResult?.['skipped'];
  return {
    at: row.lastRunAt,
    skipped: typeof skipped === 'string' ? (JOB_SKIP_LABEL[skipped] ?? skipped) : null,
    error: row.lastError,
  };
};

export async function readRegisterPanel(): Promise<RegisterPanelData> {
  const db = serviceDb();
  const queue = new RegisterQueueService(db);
  const jobs = new JobRunService(db);
  const [liveFrom, facilities, accounts, stores, waiting, blockedRows, failing, sync, dayEnd] = await Promise.all([
    registerLiveFrom(db),
    new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
    new AccountService(db).list({ activeOnly: true }),
    new RegisterStoreService(db).list(),
    queue.countWaiting(),
    queue.listBlocked(),
    queue.countFailing(),
    jobs.findByName('register_sync'),
    jobs.findByName('register_close_day'),
  ]);

  const cash = accounts.filter((account) => account.type === 'cash');
  const accountName = new Map(cash.map((account) => [account.id, account.name]));
  const storeOf = new Map(stores.map((store) => [store.warehouseId, store]));
  const reasons = new Map<string, number>();
  for (const row of blockedRows) {
    const reason = blockReasonOf(row.lastError) ?? '—';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const dayStores = Array.isArray(dayEnd?.lastResult?.['stores']) ? (dayEnd.lastResult['stores'] as Array<{ differences?: number }>) : [];

  return {
    liveFrom: liveFrom ? parisDateOf(new Date(liveFrom)) : null,
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
    waiting,
    blocked: [...reasons].map(([reason, count]) => ({ reason, count })),
    failing,
    sync: sync ? jobView(sync) : null,
    dayEnd: dayEnd
      ? {
          ...jobView(dayEnd),
          date: typeof dayEnd.lastResult?.['date'] === 'string' ? (dayEnd.lastResult['date'] as string) : null,
          differences: dayStores.reduce((sum, store) => sum + (store.differences ?? 0), 0),
        }
      : null,
  };
}
