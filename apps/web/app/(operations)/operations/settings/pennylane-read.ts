import 'server-only';

import { AccountService, JobRunService, PennylaneBankAccountService, PennylaneQueueService, serviceDb } from '@lezzet/database';
import { BANK_FEED_QUIET_JOB, PENNYLANE_SYNC_JOB, bankFeedStatus, pennylaneConnectionOf } from '@lezzet/application';
import { pennylaneBlockReasonLabel } from '@lezzet/i18n';
import type { PennylaneBankAccountMirror } from '@lezzet/types';
import { jobView, readQueueView, type SetupJobView, type SetupQueueView } from './setup-trace';

/** Banka hesabımızın satırı; eşlenmemiş hesap da listede durur ki eşleme buradan açılsın. */
export interface PennylaneAccountRowView {
  accountId: string;
  accountName: string;
  /** Eşlenen Pennylane hesabı; `gone`: son okunan listede yok ve hesap okunmuyor. `null` = eşlenmedi. */
  pennylane: { id: number; name: string; gone: boolean } | null;
  /** Pennylane'den gelen son hareketin günü; hiç gelmediyse `null`. */
  lastDate: string | null;
  quiet: boolean;
}

export interface PennylanePanelData {
  /** Eşitlemenin son başarılı turunda okunan şirket ve kip; tur hiç başarıyla koşmadıysa `null`. */
  connection: ReturnType<typeof pennylaneConnectionOf>;
  accounts: PennylaneAccountRowView[];
  /** Eşlenebilecek Pennylane hesapları: son okunan listede görünen ve eşlenmemiş olanlar. */
  freeOptions: { value: string; label: string }[];
  quietDays: number;
  /** Alış belgelerinin yazım kuyruğu. */
  queue: SetupQueueView;
  sync: SetupJobView | null;
  quietCheck: SetupJobView | null;
}

/** Turun kendini atlama sebebi, operatörün diliyle. */
const JOB_SKIP_LABEL: Record<string, string> = {
  not_configured: 'Pennylane anahtarı tanımlı değil',
};

export async function readPennylanePanel(): Promise<PennylanePanelData> {
  const db = serviceDb();
  const jobs = new JobRunService(db);
  const [accounts, bankAccounts, status, queue, sync, quietCheck] = await Promise.all([
    new AccountService(db).list(),
    new PennylaneBankAccountService(db).list(),
    bankFeedStatus(db),
    readQueueView(new PennylaneQueueService(db), pennylaneBlockReasonLabel),
    jobs.findByName(PENNYLANE_SYNC_JOB),
    jobs.findByName(BANK_FEED_QUIET_JOB),
  ]);

  // Aynı eşitlemede görülen hesaplar aynı anı taşır; en yeni anı taşımayan hesap Pennylane'in son listesinde yoktur.
  const latestSeen = Math.max(0, ...bankAccounts.map((row) => Date.parse(row.seenAt)));
  const current = (row: PennylaneBankAccountMirror) => Date.parse(row.seenAt) === latestSeen;
  const mappingOf = new Map(bankAccounts.flatMap((row) => (row.accountId ? [[row.accountId, row] as const] : [])));
  const feedOf = new Map(status.accounts.map((row) => [row.accountId, row]));

  return {
    connection: pennylaneConnectionOf(sync?.lastResult ?? null),
    // Kapatılmış hesap eşliyse listede kalır ki eşlemesi kaldırılabilsin.
    accounts: accounts
      .filter((account) => account.type === 'bank' && (account.isActive || mappingOf.has(account.id)))
      .map((account) => {
        const mapping = mappingOf.get(account.id);
        const feed = feedOf.get(account.id);
        return {
          accountId: account.id,
          accountName: account.name,
          pennylane: mapping ? { id: mapping.pennylaneId, name: mapping.name, gone: !current(mapping) } : null,
          lastDate: feed?.lastDate ?? null,
          quiet: feed?.quiet ?? false,
        };
      }),
    freeOptions: bankAccounts
      .filter((row) => row.accountId === null && current(row))
      .map((row) => ({ value: String(row.pennylaneId), label: row.name })),
    quietDays: status.quietDays,
    queue,
    sync: sync ? jobView(sync, JOB_SKIP_LABEL) : null,
    quietCheck: quietCheck ? jobView(quietCheck, JOB_SKIP_LABEL) : null,
  };
}
