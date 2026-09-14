import 'server-only';
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
} from '@lezzet/database';
import {
  DEFAULT_PAGE_SIZE,
  type Account,
  type AccountBalance,
  type Counterparty,
  type KeysetCursor,
  type MovementNature,
  type MovementTag,
  type Supplier,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NOTES } from './finance-labels';
import { documentHead, toDocumentRows, toMovementRows, type MovementReadContext } from './finance-read';
import type { AccountLedgerRow } from '@lezzet/types';
import type { DocumentListView, DocumentRowView, LedgerView, MovementRowView } from './finance-types';
import { ALL_ACCOUNTS, resolveAccount, type FinanceUrlState } from './finance-url';

/*
  PARA EKRANININ OKUMALARI (12.17) — sayfa (`page.tsx`) ile "devamını yükle" action'ları AYNI
  fonksiyonları çağırır: ilk sayfa ile ikinci sayfa ayrı yerde kurulsaydı bir gün farklı süzer, farklı
  adlandırırdı (müşteri ekranının dersi). Saf indirgemeler `finance-read.ts`te; burası okur ve onlara
  verir.

  ── DEFTER HESAP-ÜSTÜ OKUNUR ────────────────────────────────────────────────
  `ledger({ accountId? })` — hesap verilmezse defterin tamamı sayfalanır. **Transferin İKİ satırı da
  gelir** ve bu doğru: hareket iki hesabı birden etkiliyor, birini seçip ötekini gizlemek keyfî
  olurdu. İkisi birbirini götürdüğü için "Tümü"nün toplamı da doğru çıkıyor.

  ── BELGE BAĞLARI TEK TURDA ─────────────────────────────────────────────────
  Sayfanın belge bağları ve o bağların belgeleri kimlik listesiyle tek turda okunur — satır başına
  sorgu atılmaz.
*/

/** Ekranın sözlükleri — doğal tavanlı, operatörün kurduğu kümeler; tek turda (CLAUDE §1). */
export interface FinanceDictionaries {
  accounts: Account[];
  balances: Map<string, AccountBalance>;
  /** Tam liste (pasifler dâhil): pasif türün ya da carinin adı eski satırlarda yine okunmalı. */
  natures: MovementNature[];
  tags: MovementTag[];
  counterparties: Counterparty[];
  suppliers: Supplier[];
}

export async function readDictionaries(db: SupabaseClient): Promise<FinanceDictionaries> {
  const accountService = new AccountService(db);
  const [accounts, balances, natures, tags, counterparties, suppliers] = await Promise.all([
    accountService.list(),
    accountService.balances(),
    new MovementNatureService(db).list(),
    new MovementTagService(db).list(),
    new CounterpartyService(db).list(),
    new SupplierService(db).list(),
  ]);
  return { accounts, balances, natures, tags, counterparties, suppliers };
}

/** Kimlik → ad haritaları — satırlar kimlik taşır, ekran ad gösterir. */
export type FinanceNames = Pick<MovementReadContext, 'accountNames' | 'partyNames' | 'natureLabels'>;

export function namesOf(dictionaries: FinanceDictionaries): FinanceNames {
  return {
    accountNames: new Map(dictionaries.accounts.map((account) => [account.id, account.name] as const)),
    // Cari ve tedarikçi kimlikleri ayrı tablolarda üretilmiş uuid'ler — tek haritada çakışmaz.
    partyNames: new Map([
      ...dictionaries.counterparties.map((counterparty) => [counterparty.id, counterparty.name] as const),
      ...dictionaries.suppliers.map((supplier) => [supplier.id, supplier.name] as const),
    ]),
    natureLabels: new Map(dictionaries.natures.map((nature) => [nature.slug, nature.label] as const)),
  };
}

/**
 * Adresteki hesap kimliği GERÇEK bir hesap mı — değilse `all` (`resolveAccount`). Doğrulanmasaydı
 * hiçbir kartın seçili görünmediği bir hâlde boş liste çıkardı ve operatör onu "hiç hareket yok"
 * diye okurdu.
 */
export function withResolvedAccount(urlState: FinanceUrlState, accounts: readonly Account[]): FinanceUrlState {
  return { ...urlState, acct: resolveAccount(urlState.acct, accounts.map((account) => account.id)) };
}

/** Süzgeç açık mı — boş listenin cümlesi buna göre ("hiç yok" ≠ "bu süzgeçte yok"). */
const filtered = (urlState: FinanceUrlState) =>
  urlState.acct !== ALL_ACCOUNTS || urlState.type !== 'all' || Boolean(urlState.from || urlState.to) || urlState.scope !== ALL_ACCOUNTS;

/** Hareketler sekmesinin bir sayfası — süzgeç adresten, satırlar adlarıyla ve belge bağlarıyla. */
export async function readLedgerPage(
  db: SupabaseClient,
  urlState: FinanceUrlState,
  names: FinanceNames,
  cursor?: KeysetCursor,
): Promise<LedgerView> {
  const page = await new MoneyMovementService(db).ledger({
    // Hesap bir DARALTMA: `all` iken alan hiç geçilmez, süzgeç de kurulmaz.
    accountId: urlState.acct !== ALL_ACCOUNTS ? urlState.acct : undefined,
    type: urlState.type === 'all' ? undefined : urlState.type,
    from: urlState.from || undefined,
    to: urlState.to || undefined,
    // Adresteki `scope=unmatched` İZAH kuyruğudur (13.09): parametre adı paylaşılmış bağlantılar
    // kırılmasın diye kaldı; anlamı sayaçla aynı.
    unexplainedOnly: urlState.scope === 'unmatched' || undefined,
    cursor,
    limit: DEFAULT_PAGE_SIZE,
  });

  const rows = await toRowViews(db, page.rows, names);
  return {
    state: rows.length > 0 ? 'ready' : 'empty',
    rows,
    nextCursor: page.nextCursor ? JSON.stringify(page.nextCursor) : null,
    note: rows.length > 0 ? null : filtered(urlState) ? NOTES.noLedgerMatch : NOTES.emptyLedger,
  };
}

/**
 * Tek hareketin defter satırları (12.17) — "devamını yükle" ile gelmiş satır yazımdan sonra kendisi
 * yeniden okunur: liste başa dönmez, satır tazelenir. Transferde iki satır (iki hesabın defteri).
 */
export async function readLedgerRows(db: SupabaseClient, movementId: string, names: FinanceNames): Promise<MovementRowView[]> {
  return toRowViews(db, await new MoneyMovementService(db).ledgerRows(movementId), names);
}

/**
 * Defter satırlarının GÖRÜNÜMÜ — sipariş künyeleri ve belge bağları kimlik listesiyle tek turda
 * okunur (satır başına sorgu yok). Sayfa ve tek satır aynı yoldan geçer.
 */
async function toRowViews(db: SupabaseClient, ledgerRows: readonly AccountLedgerRow[], names: FinanceNames): Promise<MovementRowView[]> {
  const rowIds = [...new Set(ledgerRows.map((row) => row.id))];
  const orderIds = [...new Set(ledgerRows.flatMap((row) => (row.orderId ? [row.orderId] : [])))];
  const allocations = rowIds.length > 0 ? await new MoneyAllocationService(db).listByMovements(rowIds) : [];
  const documentIds = [...new Set(allocations.map((allocation) => allocation.documentId))];
  const [orders, documents] = await Promise.all([
    orderIds.length > 0 ? new OrderService(db).listByIds(orderIds) : Promise.resolve([]),
    documentIds.length > 0 ? new MoneyDocumentService(db).listByIds(documentIds) : Promise.resolve([]),
  ]);

  const orderRefs = new Map(orders.flatMap((order) => (order.referenceNo ? [[order.id, order.referenceNo] as const] : [])));
  const documentLabel = new Map(documents.map((document) => [document.id, documentHead(document)] as const));
  const documentsOf = new Map<string, Array<{ id: string; label: string; amountCents: number }>>();
  for (const allocation of allocations) {
    const list = documentsOf.get(allocation.movementId) ?? [];
    list.push({ id: allocation.documentId, label: documentLabel.get(allocation.documentId) ?? 'belge', amountCents: allocation.amountCents });
    documentsOf.set(allocation.movementId, list);
  }
  return toMovementRows(ledgerRows, { ...names, orderRefs, documentsOf });
}

/** Tek belgenin satırı (12.17) — "devamını yükle" ile gelmiş belge bağ yazımından sonra tazelenir. */
export async function readDocumentRow(db: SupabaseClient, documentId: string, names: FinanceNames): Promise<DocumentRowView | null> {
  const service = new MoneyDocumentService(db);
  const document = await service.getById(documentId);
  if (!document) return null;
  const balance = (await service.balances([document.id])).get(document.id);
  return balance ? (toDocumentRows([{ ...document, balance }], names)[0] ?? null) : null;
}

/**
 * Belgeler sekmesinin bir sayfası (12.17) — belge gününe göre en yeni önce. Hesap süzgeci belgeye
 * UYGULANMAZ: belge bir hesabın değil bir borcun kaydıdır, hangi hesaptan ödeneceği ödemesinde belli
 * olur. "Yalnız açık" kümesi doğal tavanlıdır (kapanan düşer) — tek turda, imleçsiz.
 */
export async function readDocumentsPage(
  db: SupabaseClient,
  urlState: FinanceUrlState,
  names: FinanceNames,
  cursor?: KeysetCursor,
): Promise<DocumentListView> {
  const service = new MoneyDocumentService(db);
  if (urlState.open) {
    const inRange = (day: string) => (!urlState.from || day >= urlState.from) && (!urlState.to || day <= urlState.to);
    const open = (await service.listOpen()).filter((doc) => inRange(doc.issuedOn)).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn));
    const rows = toDocumentRows(open, names);
    return { rows, nextCursor: null, note: rows.length > 0 ? null : NOTES.noOpenDocuments };
  }

  const page = await service.page({ from: urlState.from || undefined, to: urlState.to || undefined, cursor, limit: DEFAULT_PAGE_SIZE });
  const balances = await service.balances(page.rows.map((doc) => doc.id));
  const rows = toDocumentRows(
    page.rows.flatMap((doc) => {
      const balance = balances.get(doc.id);
      return balance ? [{ ...doc, balance }] : [];
    }),
    names,
  );
  return {
    rows,
    nextCursor: page.nextCursor ? JSON.stringify(page.nextCursor) : null,
    note: rows.length > 0 ? null : urlState.from || urlState.to ? NOTES.noDocumentMatch : NOTES.noDocuments,
  };
}
