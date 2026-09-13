import {
  AccountService,
  CounterpartyService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  MovementNatureService,
  MovementTagService,
  OrderService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { listOpenDocuments } from '@lezzet/application';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { EMPTY_MATCH_QUEUE, matchQueue } from '@/lib/bank/reconcile';
import { guarded, requireFinance } from '@/lib/guard';
import { FinanceClient } from './finance-client';
import { NOTES } from './finance-labels';
import {
  documentHead,
  toAccountViews,
  toMatchRows,
  toMatchTargets,
  toMovementRows,
  toOpenDocumentViews,
  totalBalance,
} from './finance-read';
import type { FinanceData, LedgerView } from './finance-types';
import { ALL_ACCOUNTS, parseFinanceUrl, periodRange, resolveAccount } from './finance-url';

// Para (12) — **yönetici VEYA muhasebeci** (`requireFinance`). Tasarım §1: paranın tek mantıkla
// izlendiği yer — para bir hesapta durur, hareketlerle girer/çıkar.
//
// ── DEFTER HESAP-ÜSTÜ OKUNUR ────────────────────────────────────────────────
// `ledger({ accountId? })` — hesap verilmezse defterin tamamı sayfalanır. **Transferin İKİ satırı da
// gelir** ve bu doğru: hareket iki hesabı birden etkiliyor, birini seçip ötekini gizlemek keyfî
// olurdu. İkisi birbirini götürdüğü için "Tümü"nün toplamı da doğru çıkıyor — para işletmeden çıkmadı.
//
// ── SAYAÇ SÜZGEÇTEN BAĞIMSIZ ────────────────────────────────────────────────
// `unexplainedCount()` ham `money_movement`tan sayar, defter görünümünden değil: görünüm transferi
// iki satır üretiyor ve bir hareket iki kez sayılırdı. Sayılan şey İZAH (13.09): bağı, belge bağı,
// türü ya da karşı hesabı olmayan hareket.
//
// ── SÖZLÜKLER TEK TURDA (13.09 · ikinci karar) ──────────────────────────────
// Tür, cari, etiket ve tedarikçi listeleri doğal tavanlı (operatörün kurduğu kümeler); satırların
// adları ve seçicilerin seçenekleri aynı okumadan kurulur. Defter sayfasının belge bağları ve o
// bağların belgeleri de kimlik listesiyle TEK turda okunur — satır başına sorgu atılmaz.

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

  const params = await searchParams;
  const raw = parseFinanceUrl(params);
  const db = serviceDb();
  const accountService = new AccountService(db);

  const [accounts, balances] = await Promise.all([accountService.list(), accountService.balances()]);
  const accountViews = toAccountViews(accounts, balances);

  // Adresteki kimlik gerçek bir hesap mı — değilse `all`. Doğrulamasaydık hiçbir çipin seçili
  // görünmediği bir hâlde boş liste çıkardı ve operatör onu "hiç hareket yok" diye okurdu.
  const urlState = { ...raw, acct: resolveAccount(raw.acct, accountViews.map((account) => account.id)) };
  const accountSelected = urlState.acct !== ALL_ACCOUNTS;
  const range = periodRange(urlState.period, new Date());

  // Defter HER HÂLDE okunur — `accountId` verilmezse defterin tamamı sayfalanır. Kuyruk ise hesaba
  // bağlı kalır ve bu doğal: banka dosyası bir hesaba yüklenir.
  const movements = new MoneyMovementService(db);
  const [ledgerPage, queue, unexplainedCount, natures, tags, counterparties, openDocuments, suppliers] = await Promise.all([
    movements.ledger({
      // Hesap bir DARALTMA: `all` iken alan hiç geçilmez, süzgeç de kurulmaz.
      accountId: accountSelected ? urlState.acct : undefined,
      type: urlState.type === 'all' ? undefined : urlState.type,
      limit: DEFAULT_PAGE_SIZE,
      from: range?.from,
      to: range?.to,
      // Adresteki `scope=unmatched` İZAH kuyruğudur (13.09): parametre adı değişmedi, paylaşılmış
      // bağlantılar kırılmasın diye; anlamı sayaçla aynı.
      unexplainedOnly: urlState.scope === 'unmatched' || undefined,
    }),
    accountSelected ? matchQueue(urlState.acct) : EMPTY_MATCH_QUEUE,
    // Sayaç SÜZGEÇTEN BAĞIMSIZ ve hesap-üstü: rozet "toplam ne kadar iş bekliyor" diyor.
    movements.unexplainedCount(),
    // Sözlükler TAM (pasifler dâhil): pasif türün ya da carinin adı eski satırlarda yine okunmalı;
    // seçicilere yalnız aktifler gider.
    new MovementNatureService(db).list(),
    new MovementTagService(db).list(),
    new CounterpartyService(db).list(),
    // Açık belgeler (12.12) — doğal tavanlı: kapanan belge listeden düşer, tek turda.
    listOpenDocuments(db),
    new SupplierService(db).list(),
  ]);

  // Defter sayfasının belge bağları ve siparişleri — kimlik listesiyle, tek turda.
  const rowIds = [...new Set(ledgerPage.rows.map((row) => row.id))];
  const orderIds = [...new Set(ledgerPage.rows.flatMap((row) => (row.orderId ? [row.orderId] : [])))];
  const allocations = rowIds.length > 0 ? await new MoneyAllocationService(db).listByMovements(rowIds) : [];
  const documentIds = [...new Set(allocations.map((allocation) => allocation.documentId))];
  const [orders, allocatedDocuments] = await Promise.all([
    orderIds.length > 0 ? new OrderService(db).listByIds(orderIds) : Promise.resolve([]),
    documentIds.length > 0 ? new MoneyDocumentService(db).listByIds(documentIds) : Promise.resolve([]),
  ]);

  const orderRefs = new Map(orders.flatMap((order) => (order.referenceNo ? [[order.id, order.referenceNo] as const] : [])));
  const accountNames = new Map(accountViews.map((account) => [account.id, account.name] as const));
  const natureLabels = new Map(natures.map((nature) => [nature.slug, nature.label] as const));
  // Cari ve tedarikçi kimlikleri ayrı tablolarda üretilmiş uuid'ler — tek haritada çakışmaz.
  const partyNames = new Map([
    ...counterparties.map((counterparty) => [counterparty.id, counterparty.name] as const),
    ...suppliers.map((supplier) => [supplier.id, supplier.name] as const),
  ]);
  const documentLabel = new Map(allocatedDocuments.map((document) => [document.id, documentHead(document)] as const));
  const documentsOf = new Map<string, Array<{ id: string; label: string }>>();
  for (const allocation of allocations) {
    const list = documentsOf.get(allocation.movementId) ?? [];
    list.push({ id: allocation.documentId, label: documentLabel.get(allocation.documentId) ?? 'belge' });
    documentsOf.set(allocation.movementId, list);
  }

  const ledger: LedgerView = {
    state: ledgerPage.rows.length > 0 ? 'ready' : 'empty',
    rows: toMovementRows(ledgerPage.rows, { accountNames, orderRefs, partyNames, natureLabels, documentsOf }),
    nextCursor: ledgerPage.nextCursor ? JSON.stringify(ledgerPage.nextCursor) : null,
    note: ledgerPage.rows.length > 0 ? null : NOTES.emptyLedger,
  };

  // Hedef listesi önce, kuyruk sonra: öneri adını hedeften alır (aynı `kind:id` anahtarı).
  const matchTargets = toMatchTargets(queue.targets, natureLabels);
  const data: FinanceData = {
    accounts: accountViews,
    totalCents: totalBalance(accountViews),
    ledger,
    queue: toMatchRows(queue.rows, matchTargets),
    matchTargets,
    unexplainedCount,
    natureOptions: natures.filter((nature) => nature.isActive).map((nature) => ({ value: nature.slug, label: nature.label, direction: nature.direction })),
    tagOptions: tags.filter((tag) => tag.isActive).map((tag) => ({ value: tag.slug, label: tag.label })),
    counterpartyOptions: counterparties
      .filter((counterparty) => counterparty.isActive)
      .map((counterparty) => ({ value: counterparty.id, label: counterparty.name, defaultNature: counterparty.defaultNature })),
    supplierOptions: suppliers.filter((supplier) => supplier.isActive).map((supplier) => ({ value: supplier.id, label: supplier.name })),
    openDocuments: toOpenDocumentViews(openDocuments, partyNames),
    dictionary: {
      natures: natures.map(({ slug, label, direction, accountCode, isActive }) => ({ slug, label, direction, accountCode, isActive })),
      counterparties: counterparties.map(({ id, name, kind, keywords, defaultNature, isActive }) => ({ id, name, kind, keywords, defaultNature, isActive })),
      tags: tags.map(({ slug, label, isActive }) => ({ slug, label, isActive })),
    },
  };

  return (
    <FinanceClient
      data={data}
      urlState={urlState}
      // Pasif hesap listede kalır (geçmişi ona bağlı) ama YENİ harekete kapanır — diyalogların
      // seçicisi bu yüzden ayrı bir küme okur, hesap şeridiyle aynı diziyi değil.
      writableAccounts={accountViews.filter((account) => account.isActive)}
    />
  );
}
