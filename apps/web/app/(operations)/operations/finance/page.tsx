import { AccountService, MoneyMovementService, MovementTagService, OrderService, SupplierService, serviceDb } from '@lezzet/database';
import { listOpenDocuments } from '@lezzet/application';
import { DEFAULT_PAGE_SIZE, type AccountLedgerRow } from '@lezzet/types';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { EMPTY_MATCH_QUEUE, matchQueue } from '@/lib/bank/reconcile';
import { guarded, requireFinance } from '@/lib/guard';
import { FinanceClient } from './finance-client';
import { NOTES } from './finance-labels';
import { toAccountViews, toMatchRows, toMatchTargets, toMovementRows, toOpenDocumentViews, totalBalance } from './finance-read';
import type { FinanceData, LedgerView } from './finance-types';
import { ALL_ACCOUNTS, parseFinanceUrl, periodRange, resolveAccount } from './finance-url';

// Para (12) — **yönetici VEYA muhasebeci** (`requireFinance`). Tasarım §1: paranın tek mantıkla
// izlendiği yer — para bir hesapta durur, hareketlerle girer/çıkar.
//
// ── DEFTER HESAP-ÜSTÜ OKUNUR ────────────────────────────────────────────────
// `ledger({ accountId? })` — hesap verilmezse defterin tamamı sayfalanır. Bir tur bu kapı yoktu ve
// ekran "Tümü" hâlini boş listeymiş gibi göstermeyip ayrı bir durum (`blocked`) taşıyordu; kapı
// gelince o hâl kendiliğinden ölü kaldı ve silindi.
//
// **Transferin İKİ satırı da gelir** ve bu doğru: hareket iki hesabı birden etkiliyor, birini
// seçip ötekini gizlemek keyfî olurdu. İkisi birbirini götürdüğü için "Tümü"nün toplamı da doğru
// çıkıyor — para işletmeden çıkmadı.
//
// ── SAYAÇ SÜZGEÇTEN BAĞIMSIZ ────────────────────────────────────────────────
// `unexplainedCount()` ham `money_movement`tan sayar, defter görünümünden değil: görünüm transferi
// iki satır üretiyor ve bir hareket iki kez sayılırdı. Rozet "toplam ne kadar iş bekliyor" diyor;
// süzgece bağlansaydı bir hesabı seçen operatör kuyruğun küçüldüğünü sanardı.
//
// Sayılan şey İZAH (13.09): bağı, belgesi, etiketi ya da karşı hesabı olmayan hareket. Eskiden banka
// mutabakat bayrağı sayılıyordu ve sistemin kendi yazdığı her tahsilat "eşleşmemiş" görünüyordu.

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
  const [ledgerPage, queue, unexplainedCount, tags, openDocuments, suppliers] = await Promise.all([
    movements.ledger({
      // Hesap bir DARALTMA: `all` iken alan hiç geçilmez, süzgeç de kurulmaz.
      accountId: accountSelected ? urlState.acct : undefined,
      type: urlState.type === 'all' ? undefined : urlState.type,
      limit: DEFAULT_PAGE_SIZE,
      from: range?.from,
      to: range?.to,
      // Adresteki `scope=unmatched` artık İZAH kuyruğudur (13.09): parametre adı değişmedi,
      // paylaşılmış bağlantılar kırılmasın diye; anlamı sayaçla aynı.
      unexplainedOnly: urlState.scope === 'unmatched' || undefined,
    }),
    accountSelected ? matchQueue(urlState.acct) : EMPTY_MATCH_QUEUE,
    // Sayaç SÜZGEÇTEN BAĞIMSIZ ve hesap-üstü: rozet "toplam ne kadar iş bekliyor" diyor. Süzgece
    // bağlansaydı bir hesabı seçen operatör kuyruğun küçüldüğünü sanardı.
    movements.unexplainedCount(),
    // Etiket sözlüğü — çipler ve satır etiketleri buradan; yalnız aktifler yeni harekete sunulur,
    // pasif etiketin adı yine okunabilsin diye adlar tam listeden kurulur.
    new MovementTagService(db).list(),
    // Açık belgeler (12.12) — doğal tavanlı: kapanan belge listeden düşer, tek turda.
    listOpenDocuments(db),
    // Belge formunun tedarikçi seçeneği; pasif tedarikçi yeni belgeye kapalı.
    new SupplierService(db).list({ activeOnly: true }),
  ]);
  const tagLabels = new Map(tags.map((tag) => [tag.slug, tag.label] as const));
  const tagOptions = tags.filter((tag) => tag.isActive).map((tag) => ({ value: tag.slug, label: tag.label }));

  // Sipariş referansları TEK turda: defter satırlarının bağlı olduğu siparişler bir kümede toplanıp
  // bir kez okunuyor. Satır başına sorgu atsaydık elli satırlık bir sayfa elli sorgu ederdi — ve
  // gösterdiği tek şey bir referans numarası olurdu. (Kuyruğun hedefleri referansı zaten taşıyor:
  // satış görünümünden geliyorlar.)
  const orderIds = [...new Set((ledgerPage?.rows ?? []).flatMap((row: AccountLedgerRow) => (row.orderId ? [row.orderId] : [])))];
  const orders = orderIds.length > 0 ? await new OrderService(db).listByIds(orderIds) : [];
  const orderRefs = new Map(orders.flatMap((order) => (order.referenceNo ? [[order.id, order.referenceNo] as const] : [])));

  const accountNames = new Map(accountViews.map((account) => [account.id, account.name] as const));

  const ledger: LedgerView = {
    state: ledgerPage.rows.length > 0 ? 'ready' : 'empty',
    rows: toMovementRows(ledgerPage.rows, accountNames, orderRefs, tagLabels),
    nextCursor: ledgerPage.nextCursor ? JSON.stringify(ledgerPage.nextCursor) : null,
    note: ledgerPage.rows.length > 0 ? null : NOTES.emptyLedger,
  };

  // Hedef listesi önce, kuyruk sonra: öneri adını hedeften alır (aynı `kind:id` anahtarı).
  const matchTargets = toMatchTargets(queue.targets, tagLabels);
  const data: FinanceData = {
    accounts: accountViews,
    totalCents: totalBalance(accountViews),
    ledger,
    queue: toMatchRows(queue.rows, matchTargets),
    matchTargets,
    unexplainedCount,
    tagOptions,
    openDocuments: toOpenDocumentViews(openDocuments),
    supplierOptions: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
    tagList: tags.map((tag) => ({ slug: tag.slug, label: tag.label, isActive: tag.isActive })),
  };

  /**
   * ── DEVİR YOLU SÖKÜLDÜ (22.24 · 26.08) ──────────────────────────────────
   * Burada `?proposal=<id>` okunup elle hareket penceresi ön dolu açılırdı (22.5). Para önerisi
   * 22.18'de kuyruğun İÇİNE taşındı; okuma o günden beri ölüydü (mod kontrolü her çağrıda `null`
   * döndürüyordu) ama ekranın prop'ları duruyordu.
   */
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
