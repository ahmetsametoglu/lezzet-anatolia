import {
  AccountService,
  MoneyMovementService,
  PennylaneBankAccountService,
  PennylaneCursorService,
  PennylaneTransactionService,
  SettingsService,
  type Db,
} from '@lezzet/database';
import { BANK_FEED_QUIET_DAYS_DEFAULT, BANK_FEED_QUIET_DAYS_KEY, bankFeedQuiet, planBankFeed } from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import {
  PennylaneModeEnum,
  type MoneyMovement,
  type PennylaneMappedAccount,
  type PennylaneMode,
  type PennylaneTransaction,
  type PennylaneTransactionMirror,
  type PennylaneTransactionMirrorInsert,
} from '@lezzet/types';
import { notifyBankFeedChanged, notifyBankFeedQuiet } from '../../notification/staff-events';
import { readChanges, STREAM_RETENTION_MS } from './changes';
import { PennylaneError } from './errors';
import { readMovementMatches } from './matches';
import type { PennylanePort } from './port';

/**
 * Banka hareketinin Pennylane'den okunması (docs/feature/kasa-muhasebe.md §8, akış 1): eşlenen hesabın hareketleri eşlendiği günden
 * itibaren bir kez listeden, sonra değişiklik akışından okunur; her hareketin bizdeki etkisi motordan çıkar.
 */

/** Eşitleme ve sessizlik turlarının `job_run` adı; backend bu adla yazar, kurulum kartı aynı adla okur. */
export const PENNYLANE_SYNC_JOB = 'pennylane_sync';
export const BANK_FEED_QUIET_JOB = 'bank_feed_quiet';

const STREAM = 'transactions';

/** Eşitlemenin son başarılı turunda okunan şirket ve kip; düşen tur sonucu silmez, tur hiç bağlanamadıysa `null`. */
export function pennylaneConnectionOf(result: Record<string, unknown> | null): { company: string; mode: PennylaneMode } | null {
  const company = result?.['company'];
  const mode = PennylaneModeEnum.safeParse(result?.['mode']);
  return typeof company === 'string' && mode.success ? { company, mode: mode.data } : null;
}

/** Hesabın Pennylane'den okunduğu ilk gün, eşlendiği gün (Paris); öncesi Excel ekstresiyle girilir. */
const feedStartOf = (mappedAt: string): string => parisDateOf(new Date(mappedAt));

/** Hesabın Pennylane'den okunduğu ilk gün; hesap eşlenmemişse `null`. */
export async function pennylaneFeedFrom(db: Db, accountId: string): Promise<string | null> {
  const mapping = await new PennylaneBankAccountService(db).findByAccount(accountId);
  return mapping?.mappedAt ? feedStartOf(mapping.mappedAt) : null;
}

export type PennylaneSetupOutcome =
  | { status: 'ok' }
  | { status: 'invalid'; reason: 'not_bank_account' | 'unknown_pennylane_account' | 'pennylane_account_taken' }
  | { status: 'invalid'; reason: 'file_rows_in_feed'; accountId: string; lastFileDate: string };

/**
 * Banka hesabımızı Pennylane'deki hesaba eşler. Eşleme başka Pennylane hesabından taşınırsa okumanın ilk günü korunur: önceki hesaptan
 * gelen satırlar yeni hesabın listesiyle o günden karşılaştırılır. Pennylane hesabı başka hesabımıza eşliyse reddedilir, yoksa o
 * hesabın okuması sessizce dururdu.
 */
export async function mapPennylaneBankAccount(
  db: Db,
  input: { accountId: string; pennylaneId: number },
  opts: { now?: Date } = {},
): Promise<PennylaneSetupOutcome> {
  const bankAccounts = new PennylaneBankAccountService(db);
  const [account, target, previous] = await Promise.all([
    new AccountService(db).getById(input.accountId),
    bankAccounts.findByPennylaneId(input.pennylaneId),
    bankAccounts.findByAccount(input.accountId),
  ]);
  if (!account || account.type !== 'bank' || !account.isActive) return { status: 'invalid', reason: 'not_bank_account' };
  if (!target) return { status: 'invalid', reason: 'unknown_pennylane_account' };
  if (target.accountId === input.accountId) return { status: 'ok' };
  if (target.accountId !== null) return { status: 'invalid', reason: 'pennylane_account_taken' };
  const mappedAt = previous?.mappedAt ?? (opts.now ?? new Date()).toISOString();
  const overlap = await fileRowsFrom(db, input.accountId, feedStartOf(mappedAt));
  if (overlap) return overlap;

  await bankAccounts.unmap(input.accountId);
  await bankAccounts.map(input.pennylaneId, input.accountId, mappedAt);
  return { status: 'ok' };
}

/** Hesaba dosyadan yüklenmiş satır okumanın ilk gününe ya da sonrasına düşüyorsa ret: Pennylane aynı banka satırını ikinci kez yazardı. */
async function fileRowsFrom(db: Db, accountId: string, feedFrom: string): Promise<PennylaneSetupOutcome | null> {
  const lastFileDate = await new MoneyMovementService(db).lastFileRowDate(accountId);
  return lastFileDate !== null && lastFileDate >= feedFrom
    ? { status: 'invalid', reason: 'file_rows_in_feed', accountId, lastFileDate }
    : null;
}

interface FeedCounts {
  inserted: number;
  updated: number;
  removed: number;
  alerted: number;
}

/** Eşitlemenin turu: listesi okunmamış hesaplar listeden, gerisi değişiklik akışından; sonuç `job_run`a yazılır ve kartta okunur. */
export async function syncBankFeed(db: Db, pennylane: PennylanePort, opts: { now?: Date } = {}): Promise<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  // Şirket ve hesap listesi eşli hesap yokken de okunur: kip denetimi anahtar değişince ilk turda tutar, kart eşlemeyi bu listeden kurar.
  const company = await pennylane.company();
  const accountService = new PennylaneBankAccountService(db);
  const bankAccounts = await pennylane.listBankAccounts();
  await accountService.saveSeen(bankAccounts, now.toISOString());
  const connection = { company: company.name, mode: company.mode };
  // Listeden düşen eşli hesap okunmaz: boş gelen hareket listesi hesabın bütün satırlarını Pennylane'de silinmiş sayardı.
  const current = new Set(bankAccounts.map((account) => account.id));
  const mappedNow = async () => (await accountService.listMapped()).filter((account) => current.has(account.pennylaneId));
  let accounts = await mappedNow();
  if (accounts.length === 0) return { ...connection, accounts: 0 };

  const cursors = new PennylaneCursorService(db);
  let since = (await cursors.find(STREAM))?.processedAt ?? null;
  // Akışın kapsamadığı boşlukta (ilk tur ya da uzun kesinti) liste baştan okunur; akış listeden önceki andan sorulur ki liste
  // okunurken gelen değişiklik kaçmasın.
  if (!since || now.getTime() - Date.parse(since) > STREAM_RETENTION_MS) {
    await accountService.markListed(
      accounts.map((account) => account.accountId),
      null,
    );
    since = now.toISOString();
    await cursors.save(STREAM, since);
    accounts = await mappedNow();
  }

  const counts: FeedCounts = { inserted: 0, updated: 0, removed: 0, alerted: 0 };
  const apply = applier(db, pennylane, counts);
  let listed = 0;
  for (const account of accounts.filter((row) => row.listedAt === null)) {
    await listAccount(db, pennylane, account, apply);
    listed += 1;
  }

  let changes: Awaited<ReturnType<typeof readChanges>>;
  try {
    changes = await readChanges((input) => pennylane.transactionChanges(input), since);
  } catch (err) {
    // Akış, kapsamadığı anla sorulunca 422 döner: liste sonraki turda baştan okunur, akış o andan sorulur.
    if (!(err instanceof PennylaneError) || err.code !== 'validation') throw err;
    await accountService.markListed(
      accounts.map((account) => account.accountId),
      null,
    );
    await cursors.save(STREAM, now.toISOString());
    return { ...connection, listed, relist: true, ...counts };
  }
  const byPennylaneAccount = new Map(accounts.map((account) => [account.pennylaneId, account]));
  const byAccountId = new Map(accounts.map((account) => [account.accountId, account]));
  const mirrors = new PennylaneTransactionService(db);
  for (const [id, operation] of changes.ids) {
    const transaction = operation === 'delete' ? null : await pennylane.getTransaction(id);
    // Silinen hareketin hesabı aynadan okunur; eşlenmemiş hesabın hareketi hiç yazılmaz.
    const account = transaction
      ? byPennylaneAccount.get(transaction.bankAccountId)
      : byAccountId.get((await mirrors.findByPennylaneId(id))?.accountId ?? '');
    if (account) await apply(account, id, transaction);
  }
  await cursors.save(STREAM, changes.last ?? since);

  return { ...connection, listed, changes: changes.ids.size, ...counts };
}

/** Eşlenen hesabın Pennylane'den gelen son hareketi ve sessizliği; günlük uyarı ile kurulum kartı bunu okur. */
export async function bankFeedStatus(
  db: Db,
  opts: { now?: Date } = {},
): Promise<{ quietDays: number; accounts: Array<{ accountId: string; lastDate: string | null; quiet: boolean }> }> {
  const quietDays = await quietDaysOf(db);
  const today = parisDateOf(opts.now ?? new Date());
  const mirrors = new PennylaneTransactionService(db);
  const accounts = await Promise.all(
    (await new PennylaneBankAccountService(db).listMapped()).map(async (account) => {
      const lastDate = await mirrors.latestValueDate(account.accountId);
      const watchedFrom = feedStartOf(account.mappedAt);
      return { accountId: account.accountId, lastDate, quiet: bankFeedQuiet({ lastDate, watchedFrom, today, quietDays }) };
    }),
  );
  return { quietDays, accounts };
}

/**
 * Günlük "hareket gelmiyor" denetimi (akış 6): eşlenen hesabın Pennylane'den gelen son hareketi eşikten eskiyse muhasebe ve yönetim
 * uyarılır. Ayna okunur, Pennylane'e sorulmaz; eşitleme durduysa da sessizlik görünür.
 */
export async function checkBankFeedQuiet(db: Db, opts: { now?: Date } = {}): Promise<Record<string, unknown>> {
  const status = await bankFeedStatus(db, opts);
  const today = parisDateOf(opts.now ?? new Date());
  const quiet = status.accounts.filter((account) => account.quiet);
  for (const account of quiet) {
    await notifyBankFeedQuiet(db, {
      accountId: account.accountId,
      lastDate: account.lastDate,
      quietDays: status.quietDays,
      dedupeKey: `bank-feed-quiet:${account.accountId}:${today}`,
    });
  }
  return { accounts: status.accounts.length, quiet: quiet.length, quietDays: status.quietDays };
}

/** Eşik ayarı; okunamayan değer varsayılana düşer ve bunu söyler, uyarı sessizce kapanmasın. */
async function quietDaysOf(db: Db): Promise<number> {
  const value = await new SettingsService(db).get<unknown>(BANK_FEED_QUIET_DAYS_KEY, BANK_FEED_QUIET_DAYS_DEFAULT);
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  logger.warn({ setting: BANK_FEED_QUIET_DAYS_KEY }, 'pennylane: hareket gelmiyor eşiği okunamadı, varsayılan kullanılıyor');
  return BANK_FEED_QUIET_DAYS_DEFAULT;
}

type Apply = (account: PennylaneMappedAccount, pennylaneId: number, transaction: PennylaneTransaction | null) => Promise<void>;

/** Hesabın okunduğu ilk günden itibaren listesi; listede olmayan ama aynada duran hareket Pennylane'de silinmiştir. */
async function listAccount(db: Db, pennylane: PennylanePort, account: PennylaneMappedAccount, apply: Apply): Promise<void> {
  const feedFrom = feedStartOf(account.mappedAt);
  const seen = new Set<number>();
  let cursor: string | null = null;
  do {
    const page = await pennylane.listTransactions({ bankAccountId: account.pennylaneId, fromDate: feedFrom, cursor });
    for (const transaction of page.items) {
      seen.add(transaction.id);
      await apply(account, transaction.id, transaction);
    }
    cursor = page.nextCursor;
  } while (cursor);
  for (const row of await new PennylaneTransactionService(db).listPresent(account.accountId)) {
    if (!seen.has(row.pennylaneId) && row.valueDate >= feedFrom) await apply(account, row.pennylaneId, null);
  }
  await new PennylaneBankAccountService(db).markListed([account.accountId], new Date().toISOString());
}

/**
 * Hareketin planını uygular; banka satırı yazıldıktan sonra ayna yazılır, yarıda kalan yazım satırı kimliğinden bulur. Satırı duran
 * hareketin eşleşmesi de okunur, çünkü eşleşme hareketin tutarını değiştirmeden akışa düşer.
 */
function applier(db: Db, pennylane: PennylanePort, counts: FeedCounts): Apply {
  const plan = planApplier(db, counts);
  return async (account, pennylaneId, transaction) => {
    const movementId = await plan(account, pennylaneId, transaction);
    if (movementId && transaction && !transaction.archived) {
      await readMovementMatches(db, pennylane, { movementId, transactionId: pennylaneId, accountId: account.accountId });
    }
  };
}

/** Planın yazımı; banka satırı kalırsa kimliğini döner. */
function planApplier(
  db: Db,
  counts: FeedCounts,
): (account: PennylaneMappedAccount, pennylaneId: number, transaction: PennylaneTransaction | null) => Promise<string | null> {
  const movements = new MoneyMovementService(db);
  const mirrors = new PennylaneTransactionService(db);
  return async (account, pennylaneId, transaction) => {
    const current = await mirrors.findByPennylaneId(pennylaneId);
    const movement = current?.movementId ? await movements.getById(current.movementId) : null;
    const action = planBankFeed({
      transaction,
      mirror: current ? { ...current, movement: movement ? { explained: movement.explained } : null } : null,
      feedFrom: feedStartOf(account.mappedAt),
    });
    const gone = transaction === null || transaction.archived;
    const mirrorOf = (movementId: string | null): PennylaneTransactionMirrorInsert =>
      transaction && !gone
        ? {
            pennylaneId,
            accountId: account.accountId,
            movementId,
            valueDate: transaction.date,
            direction: transaction.direction,
            amountCents: transaction.amountCents,
            label: transaction.label,
            removed: false,
          }
        : { ...(current as PennylaneTransactionMirror), movementId, removed: true };

    switch (action.kind) {
      case 'skip':
        return movement?.id ?? null;
      case 'insert': {
        const written = await writeMovement(movements, account, transaction as PennylaneTransaction);
        await mirrors.save(mirrorOf(written.id));
        counts.inserted += 1;
        return written.id;
      }
      case 'update': {
        const row = transaction as PennylaneTransaction;
        await movements.update({
          id: (movement as MoneyMovement).id,
          direction: row.direction,
          amountCents: row.amountCents,
          valueDate: row.date,
          description: row.label,
        });
        await mirrors.save(mirrorOf((movement as MoneyMovement).id));
        counts.updated += 1;
        return (movement as MoneyMovement).id;
      }
      case 'remove':
        if (movement) await movements.delete(movement.id);
        await mirrors.save(mirrorOf(null));
        counts.removed += 1;
        return null;
      case 'alert':
        await notifyBankFeedChanged(db, {
          accountId: account.accountId,
          movementId: (movement as MoneyMovement).id,
          valueDate: (movement as MoneyMovement).valueDate,
          change: action.change,
          dedupeKey: `bank-feed:${pennylaneId}:${action.change}:${transaction?.updatedAt ?? 'silindi'}`,
        });
        await mirrors.save(mirrorOf((movement as MoneyMovement).id));
        counts.alerted += 1;
        return (movement as MoneyMovement).id;
      case 'mirror':
        await mirrors.save(mirrorOf(movement?.id ?? null));
        return movement?.id ?? null;
    }
  };
}

/** Pennylane hareketi eşleşmemiş banka satırı olarak yazılır; kimliği satırın kimliğidir ve aynı hareket ikinci kez yazılmaz. */
async function writeMovement(
  movements: MoneyMovementService,
  account: PennylaneMappedAccount,
  transaction: PennylaneTransaction,
): Promise<MoneyMovement> {
  const fingerprint = `pennylane:${transaction.id}`;
  const [inserted] = await movements.insertImported([
    {
      accountId: account.accountId,
      direction: transaction.direction,
      amountCents: transaction.amountCents,
      type: 'misc',
      description: transaction.label,
      valueDate: transaction.date,
      source: 'bank_import',
      reconciled: false,
      importFingerprint: fingerprint,
    },
  ]);
  if (inserted) return inserted;
  const existing = await movements.findImported(account.accountId, fingerprint);
  if (!existing) throw new Error(`Pennylane hareketi ${transaction.id} banka satırı olarak yazılamadı ve var olanı bulunamadı`);
  return existing;
}
