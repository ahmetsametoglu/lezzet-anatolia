import 'server-only';

import { AccountService, JobRunService, RegisterQueueService, RegisterStoreService, WarehouseService, serviceDb } from '@lezzet/database';
import { hiboutikFromEnv, REGISTER_CHECK_JOB } from '@lezzet/application';
import { registerBlockReasonLabel } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import { RegisterDayCheckSchema, SYSTEM_ACCOUNT_IDS, type JobRun, type RegisterExternalStore } from '@lezzet/types';
import { registerDifferenceText } from '@/lib/register/labels';
import { jobView, readQueueView, type SetupJobView, type SetupQueueView } from './setup-trace';

/** Tesis başına kasa eşlemesi; eşlenmemiş tesis de listede durur ki eşleme buradan açılsın. */
export interface RegisterStoreRowView {
  warehouseId: string;
  warehouseName: string;
  externalStoreId: number | null;
  /** Mağazanın Hiboutik'teki adı; liste okunamadıysa ya da numara açık bir mağazaya ait değilse `null`. */
  externalStoreName: string | null;
  cashAccountId: string | null;
  cashAccountName: string | null;
}

export interface RegisterPanelData {
  stores: RegisterStoreRowView[];
  /** Hiboutik'teki açık mağazalar; okunamazsa `null`, sebebi `externalStoresNote`ta, numara elle girilir. */
  externalStores: { value: string; label: string }[] | null;
  externalStoresNote: string | null;
  cashAccounts: { value: string; label: string }[];
  /** Eşlenmemiş tesiste çekmecenin önerisi: migration'ın açtığı sabit Kasa. */
  defaultCashAccountId: string;
  queue: SetupQueueView;
  sync: SetupJobView | null;
  dayEnd: (SetupJobView & RegisterDayEndView) | null;
  /** Gün içi karşılaştırma; `differences` farkların cümlesidir, son deneme düştüyse ya da tur atlandıysa `null`. */
  check: (SetupJobView & { differences: string[] | null }) | null;
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
  const [facilities, accounts, stores, queue, sync, dayEnd, check, external] = await Promise.all([
    new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
    new AccountService(db).list({ activeOnly: true }),
    new RegisterStoreService(db).list(),
    readQueueView(new RegisterQueueService(db), registerBlockReasonLabel),
    jobs.findByName('register_sync'),
    jobs.findByName('register_close_day'),
    jobs.findByName(REGISTER_CHECK_JOB),
    readExternalStores(),
  ]);

  const cash = accounts.filter((account) => account.type === 'cash');
  const accountName = new Map(cash.map((account) => [account.id, account.name]));
  const storeOf = new Map(stores.map((store) => [store.warehouseId, store]));
  const externalName = new Map((external.stores ?? []).map((store) => [store.externalStoreId, store.name]));
  const facilityName = new Map(facilities.map((facility) => [facility.id, facility.name]));
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
        externalStoreName: store ? (externalName.get(store.externalStoreId) ?? null) : null,
        cashAccountId: store?.cashAccountId ?? null,
        cashAccountName: store ? (accountName.get(store.cashAccountId) ?? '—') : null,
      };
    }),
    externalStores:
      external.stores?.map((store) => ({ value: String(store.externalStoreId), label: `${store.name} (${store.externalStoreId})` })) ??
      null,
    externalStoresNote: external.note,
    cashAccounts: cash.map((account) => ({ value: account.id, label: account.name })),
    defaultCashAccountId: SYSTEM_ACCOUNT_IDS.cash_drawer,
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
    check: check ? { ...jobView(check, JOB_SKIP_LABEL), differences: checkDifferences(check, facilityName) } : null,
  };
}

/** Son denemenin farkları; düşen denemenin önceki sonucu bugünün yerine geçmez. Birden çok mağaza varsa cümlenin başında tesis adı. */
function checkDifferences(run: JobRun, facilityName: ReadonlyMap<string, string>): string[] | null {
  const parsed = run.lastError ? null : RegisterDayCheckSchema.safeParse(run.lastResult);
  if (!parsed?.success) return null;
  const many = parsed.data.stores.length > 1;
  return parsed.data.stores.flatMap((store) =>
    store.differences.map((difference) =>
      many ? `${facilityName.get(store.warehouseId) ?? '—'}: ${registerDifferenceText(difference)}` : registerDifferenceText(difference),
    ),
  );
}

/** Kasa yazılımındaki mağazalar her açılışta okunur; okunamazsa eşleme numarayla sürer ve sebebi pencerede yazar. */
async function readExternalStores(): Promise<{ stores: RegisterExternalStore[] | null; note: string | null }> {
  const register = hiboutikFromEnv();
  if (!register) return { stores: null, note: 'Hiboutik anahtarları tanımlı değil; mağaza listesi okunamıyor.' };
  try {
    return { stores: await register.listStores(), note: null };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'kasa: mağaza listesi okunamadı');
    return { stores: null, note: "Hiboutik'e ulaşılamadı; mağaza listesi okunamadı." };
  }
}
