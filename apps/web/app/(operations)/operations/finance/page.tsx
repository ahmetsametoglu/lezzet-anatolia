import { AccountService, MoneyMovementService, OrderService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, type AccountLedgerRow } from '@lezzet/types';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { matchQueue } from '@/lib/bank/reconcile';
import { detectDevice } from '@/lib/device';
import { guarded, requireFinance } from '@/lib/guard';
import { FinanceClient } from './finance-client';
import { NOTES } from './finance-labels';
import { toAccountViews, toMatchRows, toMovementRows, totalBalance } from './finance-read';
import type { FinanceData, LedgerView } from './finance-types';
import { ALL_ACCOUNTS, parseFinanceUrl, periodRange, resolveAccount } from './finance-url';

// Para (12) — **yönetici VEYA muhasebeci** (`requireFinance`). Tasarım §1: paranın tek mantıkla
// izlendiği yer — para bir hesapta durur, hareketlerle girer/çıkar.
//
// ── LİSTENİN "TÜMÜ" HÂLİ BUGÜN OKUNAMIYOR ───────────────────────────────────
// `MoneyMovementService.ledger(accountId, …)` hesap kimliğini ZORUNLU tutuyor ve alttaki sayfalama
// `protected`; yani defterin hesap-üstü hâli için bir kapı yok. Ekran bunu boş listeymiş gibi
// GÖSTERMİYOR — `LedgerView.state = 'blocked'` ayrı bir hâl ve sebebini yazıyor. Talep açık:
// `docs/talep/arka-uc-para-defteri-hesap-ustu-okuma.md`. Kapı gelince değişecek tek yer bu dosya.
// BEKLEYEN(12.8)
//
// ── SAYAÇ DA AYNI SEBEPLE YOK ───────────────────────────────────────────────
// "Eşleşmemiş satır" rozeti hesap-üstü tek bir sayı ister; sayfayı saymak listenin kuyruğunu es
// geçerdi. `null` dönüyor ve rozet hiç basılmıyor — sıfır yazmak dolu bir kuyruğu "her şey mutabık"
// diye okuturdu (CLAUDE.md §1).

interface FinancePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const access = await guarded(requireFinance);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Para"
        reason="Hesaplar, para hareketleri ve banka eşleştirmesi yönetim ve muhasebeye açıktır."
      />
    );
  }

  const raw = parseFinanceUrl(await searchParams);
  const db = serviceDb();
  const accountService = new AccountService(db);

  const [accounts, balances] = await Promise.all([accountService.list(), accountService.balances()]);
  const accountViews = toAccountViews(accounts, balances);

  // Adresteki kimlik gerçek bir hesap mı — değilse `all`. Doğrulamasaydık hiçbir çipin seçili
  // görünmediği bir hâlde boş liste çıkardı ve operatör onu "hiç hareket yok" diye okurdu.
  const urlState = { ...raw, acct: resolveAccount(raw.acct, accountViews.map((account) => account.id)) };
  const accountSelected = urlState.acct !== ALL_ACCOUNTS;
  const range = periodRange(urlState.period, new Date());

  // Defter ve kuyruk yalnız hesap seçiliyken okunur; ikisi de hesaba bağlı kapılardan geçiyor.
  const [ledgerPage, queue] = await Promise.all([
    accountSelected
      ? new MoneyMovementService(db).ledger(urlState.acct, {
          limit: DEFAULT_PAGE_SIZE,
          from: range?.from,
          to: range?.to,
          unreconciledOnly: urlState.scope === 'unmatched' || undefined,
        })
      : null,
    accountSelected ? matchQueue(urlState.acct) : [],
  ]);

  // Sipariş referansları TEK turda: defter satırlarının ve önerilerin bağlı olduğu siparişler bir
  // kümede toplanıp bir kez okunuyor. Satır başına sorgu atsaydık elli satırlık bir sayfa elli
  // sorgu ederdi — ve gösterdiği tek şey bir referans numarası olurdu.
  const orderIds = [
    ...new Set([
      ...(ledgerPage?.rows ?? []).flatMap((row: AccountLedgerRow) => (row.orderId ? [row.orderId] : [])),
      ...queue.flatMap((entry) => entry.suggestions.map((suggestion) => suggestion.orderId)),
    ]),
  ];
  const orders = orderIds.length > 0 ? await new OrderService(db).listByIds(orderIds) : [];
  const orderRefs = new Map(orders.flatMap((order) => (order.referenceNo ? [[order.id, order.referenceNo] as const] : [])));

  const accountNames = new Map(accountViews.map((account) => [account.id, account.name] as const));

  const ledger: LedgerView = ledgerPage
    ? {
        state: ledgerPage.rows.length > 0 ? 'ready' : 'empty',
        rows: toMovementRows(ledgerPage.rows, accountNames, orderRefs),
        nextCursor: ledgerPage.nextCursor ? JSON.stringify(ledgerPage.nextCursor) : null,
        note: ledgerPage.rows.length > 0 ? null : NOTES.emptyLedger,
      }
    : {
        // "Boş" DEĞİL "gösterilemiyor": kasa dolu olabilir, eksik olan okuma kapısı. İkisini aynı
        // cümleyle karşılamak, dolu bir kasayı boş göstermek olurdu.
        state: 'blocked',
        rows: [],
        nextCursor: null,
        note:
          'Bütün hesapların hareketleri tek listede henüz gösterilemiyor — defterin hesap-üstü okuması arka uçta bekliyor. Bir hesap seçerseniz o hesabın tamamı görünür.',
      };

  const data: FinanceData = {
    accounts: accountViews,
    totalCents: totalBalance(accountViews),
    ledger,
    queue: toMatchRows(queue, orderRefs),
    unmatchedCount: null,
  };

  return (
    <FinanceClient
      data={data}
      device={await detectDevice()}
      urlState={urlState}
      // Pasif hesap listede kalır (geçmişi ona bağlı) ama YENİ harekete kapanır — diyalogların
      // seçicisi bu yüzden ayrı bir küme okur, hesap şeridiyle aynı diziyi değil.
      writableAccounts={accountViews.filter((account) => account.isActive)}
    />
  );
}
