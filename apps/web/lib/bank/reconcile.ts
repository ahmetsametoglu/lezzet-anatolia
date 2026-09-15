import {
  AccountService,
  CounterpartyService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  MovementNatureService,
  OrderSaleService,
  StockIntakeBalanceService,
  StockIntakeService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { allocateToDocument, setMovementCounterparty, type AllocationOutcome } from '@lezzet/application';
import { acceptsNature, isUnambiguous, suggestMatches, type MatchCandidate, type MatchSuggestion } from '@lezzet/domain-core';
import type {
  Account,
  Counterparty,
  MoneyAllocation,
  MoneyDocument,
  MoneyDocumentBalance,
  MoneyMovement,
  MoneyMovementUpdate,
  OrderSale,
  StockIntakeBalance,
} from '@lezzet/types';
import { syncOrderPaymentStatus } from '../money/order-payment';

/**
 * Banka satırının karşılığı — eşleştirme kuyruğu (12.4 · 12.13). DOMAIN §9: **öneri + elle onay,
 * tam otomatik değil.**
 *
 * Yanlış eşleşen bir satır parayı başka bir siparişin ödemesi yapar: o sipariş "ödendi" görünürken
 * gerçekte ödeyen müşteri hâlâ borçlu kalır ve kimse fark etmez. Bu yüzden bu dosya hiçbir şeyi
 * kendiliğinden uygulamaz; **önerir** ve insanın onayını bekler.
 *
 * ── HEDEF KÜMESİ (12.13 · kullanıcı kararı 13.09: "her banka hareketinin bir karşılığı olmalı") ──
 * · sipariş tahsilatı (giriş) · müşteri iadesi (çıkış) · açık belge — fatura/bordro (belgenin yönü)
 * · mal kabul — tedarikçi borcu (çıkış) · transferin öteki yakası (ucun tersi) · başka hesaba
 * transfer (uç yok) · o hesaba ekstreden ÖNCE elle/sistemce yazılmış hareket ("bunu zaten yazmıştım")
 * · CARİ (13.09 · ikinci karar: eşleşme kelimesiyle önerilir, varsayılan türü satıra konur).
 * Satırın ADI tür kapısından konur (`setMovementNature`, uygulama katmanı) — kuyruğun "Gider"
 * menüsü ve seçim penceresinin "adını koy" bölümü oraya gider. Hiçbir satır "atla"ya mecbur değil.
 *
 * ── BELGE BAĞI TUTARIYLA (13.09 · ikinci karar) ─────────────────────────────
 * Tedarikçinin üç faturası tek havalede ödendiyse satır üç kez bağlanır: her bağ satırın kalanıyla
 * belgenin açık kalanından küçüğüdür; kalan varsa satır kuyrukta KALANIYLA durur ve öneri o kalana
 * göre aranır. Tamamı bağlanınca satır mutabık olur.
 *
 * ── GERİ ALMA (13.09 · kullanıcı bulgusu: "eşleştirmeyle ilgili düzenleme yapamıyorum") ─────
 * Bağlanan, sınıflanan ya da atlanan satır `unmatchRow` ile ekstreden geldiği hâle döner; "zaten
 * yazmıştım" birleşmesinde elle yazılan satır künyesinden yeniden kurulur.
 */

/** Adayların arandığı pencere (gün): banka satırı satıştan sonra düşer, bazen günler sonra. */
const CANDIDATE_WINDOW_DAYS = 30;

/** Açık bakiyeli satış — giriş satırının tahsilat adayı. Formül `openAmountCents` ile aynı, tamsayı (02.9). */
export type OrderTarget = Pick<OrderSale, 'id' | 'referenceNo' | 'saleDate'> & { outstandingCents: number };
/** Net tahsilatı olan satış — çıkış satırının iade hedefi (puanlanmaz, listelenir; aşağıdaki künye). */
export type RefundTarget = Pick<OrderSale, 'id' | 'referenceNo' | 'saleDate'> & { netCollectedCents: number };
/** Açık belge — karşı tarafının ADIYLA (cari ya da tedarikçi): seçim penceresi kimlik değil ad gösterir. */
export type DocumentTarget = MoneyDocument & { balance: MoneyDocumentBalance; partyName: string | null };
export type IntakeTarget = StockIntakeBalance & { supplierName: string | null };
/** Karşı ucu bekleyen transfer ucu — hangi hesaptan geldiği adıyla. */
export type TransferLegTarget = MoneyMovement & { accountName: string };
export type ProvisionalTarget = MoneyMovement;
export type AccountTarget = Pick<Account, 'id' | 'name' | 'type'>;
/** Cari (13.09) — eşleşme kelimesi açıklamada geçerse önerilir; seçilince varsayılan türü de konur. */
export type CounterpartyTarget = Pick<Counterparty, 'id' | 'name' | 'kind' | 'defaultNature'>;

/** Seçim penceresinin listeleri — puanlı öneri bunların içinden çıkar, elle seçim hepsini görür. */
export interface MatchTargets {
  orders: OrderTarget[];
  refunds: RefundTarget[];
  documents: DocumentTarget[];
  intakes: IntakeTarget[];
  transferLegs: TransferLegTarget[];
  provisional: ProvisionalTarget[];
  /** "Şu hesaba transfer" — ucu olmayan transfer için hedef hesaplar (bu hesap hariç, aktif). */
  accounts: AccountTarget[];
  /** Aktif cariler (13.09) — tedarikçi burada değil, o mal kabul ve belge üstünden gelir. */
  counterparties: CounterpartyTarget[];
}

export interface QueueRow {
  movement: MoneyMovement;
  /**
   * Satırın BAĞLANMAMIŞ kalanı (**cent**) — belgeye kısmen bağlanan satır kuyrukta kalanıyla durur ve
   * öneri o kalana göre aranır. Bağı olmayan satırda tutarın kendisi.
   */
  remainingCents: number;
  suggestions: MatchSuggestion[];
  /** Tek güçlü aday mı — iki aday yakınsa ekran "otomatik onayla" bile teklif etmemeli. */
  unambiguous: boolean;
}

export interface MatchQueue {
  rows: QueueRow[];
  targets: MatchTargets;
}

const EMPTY_TARGETS: MatchTargets = {
  orders: [],
  refunds: [],
  documents: [],
  intakes: [],
  transferLegs: [],
  provisional: [],
  accounts: [],
  counterparties: [],
};
/** Boş kuyruk — önerisi okunacak satır yokken (boş satır, boş hedef). */
export const EMPTY_MATCH_QUEUE: MatchQueue = { rows: [], targets: EMPTY_TARGETS };

const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Eşleşme bekleyen banka satırları + önerileri + seçim listeleri.
 *
 * Adaylar **tek turda** çekilir: kuyruktaki en eski ve en yeni satırın tarihinden bir pencere
 * kurulur, o dönemin satışları ve elle yazılanları bir kez okunur; açık belgeler, ödenmemiş
 * kabuller, bekleyen transfer uçları ve cariler zaten doğal tavanlı listelerdir. Satır başına sorgu
 * atsaydık 200 satırlık bir ekstre 200 sorgu ederdi.
 */
export async function matchQueue(accountId: string, opts: { limit?: number } = {}): Promise<MatchQueue> {
  const ledgerPage = await new MoneyMovementService(serviceDb()).ledger({ accountId, unreconciledOnly: true, limit: opts.limit ?? 50 });
  return suggestionsForMovements(ledgerPage.rows.filter((r) => r.source === 'bank_import').map((r) => r.id));
}

/**
 * Verilen hareketlerin önerileri (12.19 · tek liste + tek panel): defter listesinin ikinci satırı
 * ("öneri: Fatura FA-2026-0912") sayfadaki ekstre satırları için buradan okunur. Yalnız MUTABIK
 * OLMAYAN ekstre satırı sayılır — öteki satırın izahı bağı ya da türüdür, önerisi olmaz.
 *
 * Adaylar HESAP BAŞINA tek turda (kuyrukla aynı gerekçe: satır başına sorgu 50 satırda 50 tur ederdi);
 * her hesabın penceresi o hesabın satırlarının tarihlerinden kurulur. Sıra girdinin sırasıdır.
 */
export async function suggestionsForMovements(movementIds: readonly string[]): Promise<MatchQueue> {
  if (movementIds.length === 0) return EMPTY_MATCH_QUEUE;
  const db = serviceDb();
  const movements = (await new MoneyMovementService(db).listByIds(movementIds)).filter(
    (movement) => movement.source === 'bank_import' && !movement.reconciled,
  );
  if (movements.length === 0) return EMPTY_MATCH_QUEUE;

  const allocations = await new MoneyAllocationService(db).listByMovements(movements.map((movement) => movement.id));
  const byAccount = new Map<string, MoneyMovement[]>();
  for (const movement of movements) byAccount.set(movement.accountId, [...(byAccount.get(movement.accountId) ?? []), movement]);
  const groups = await Promise.all(
    [...byAccount].map(async ([accountId, rows]) => {
      const dates = rows.map((row) => row.valueDate).sort();
      const { targets, candidates } = await loadTargets(accountId, addDays(dates[0]!, -CANDIDATE_WINDOW_DAYS), addDays(dates[dates.length - 1]!, 3));
      return { targets, rows: rows.map((movement): QueueRow => ({ movement, ...suggestionsFor(movement, candidates, allocations) })) };
    }),
  );
  const order = new Map(movementIds.map((id, index) => [id, index] as const));
  return {
    rows: groups.flatMap((group) => group.rows).sort((a, b) => (order.get(a.movement.id) ?? 0) - (order.get(b.movement.id) ?? 0)),
    targets: mergeTargets(groups.map((group) => group.targets)),
  };
}

/**
 * Hesap gruplarının hedef listeleri tek listede. Açık belgeler, kabuller ve cariler hesaptan bağımsız
 * (her grupta aynı) — ilk grubunki; satışlar pencereye, öteki hesaplar hesaba göre değişir — kimlikle
 * birleşir; transfer uçları ve elle yazılanlar hesabın kendisinindir — art arda.
 */
function mergeTargets(all: readonly MatchTargets[]): MatchTargets {
  const unique = <T extends { id: string }>(lists: readonly T[][]): T[] => [...new Map(lists.flat().map((item) => [item.id, item] as const)).values()];
  const first = all[0] ?? EMPTY_TARGETS;
  return {
    orders: unique(all.map((targets) => targets.orders)),
    refunds: unique(all.map((targets) => targets.refunds)),
    documents: first.documents,
    intakes: first.intakes,
    transferLegs: all.flatMap((targets) => targets.transferLegs),
    provisional: all.flatMap((targets) => targets.provisional),
    accounts: unique(all.map((targets) => targets.accounts)),
    counterparties: first.counterparties,
  };
}

/**
 * Satırın önerileri — KALAN tutara göre (13.09 · bağ tutarıyla): belgeye kısmen bağlanan satır kalanıyla
 * aranır. Zaten bağlı olduğu belge ikinci kez önerilmez (bağ tekildir). Kuyruk ve tek satırın seçicisi
 * (`matchOptions`) aynı hesabı yapar.
 */
function suggestionsFor(
  movement: MoneyMovement,
  candidates: readonly MatchCandidate[],
  allocations: readonly MoneyAllocation[],
): Omit<QueueRow, 'movement'> {
  const own = allocations.filter((allocation) => allocation.movementId === movement.id);
  const remainingCents = movement.amountCents - own.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const linked = new Set(own.map((allocation) => allocation.documentId));
  const open = linked.size > 0 ? candidates.filter((c) => !(c.kind === 'document' && linked.has(c.id))) : candidates;
  const suggestions = suggestMatches(
    { valueDate: movement.valueDate, amountCents: remainingCents, direction: movement.direction, label: movement.description ?? '' },
    open,
  );
  return { remainingCents, suggestions, unambiguous: isUnambiguous(suggestions) };
}

/**
 * Bir hesabın HEDEF LİSTELERİ ve motorun aday kümesi — kuyruk (`matchQueue`) ve tek satırın seçicisi
 * (`matchOptions`, 12.17) ORTAK okur; iki kopya bir gün ayrı hedef gösterirdi. `from`/`to` satış ve
 * elle yazılan hareket penceresidir. `documentsOnly`: elle yazılan satırın seçicisi — onun tek bağı
 * belgedir (sipariş, transfer ve "zaten yazmıştım" ekstre satırının işi), öteki listeler hiç okunmaz.
 */
async function loadTargets(
  accountId: string,
  from: string,
  to: string,
  opts: { documentsOnly?: boolean } = {},
): Promise<{ targets: MatchTargets; candidates: MatchCandidate[] }> {
  const db = serviceDb();
  const movements = new MoneyMovementService(db);
  const all = !opts.documentsOnly;
  const [sales, documents, intakes, legs, provisional, accounts, suppliers, counterparties, natures] = await Promise.all([
    all ? new OrderSaleService(db).listPeriod(from, to) : Promise.resolve([]),
    new MoneyDocumentService(db).listOpen(),
    all ? new StockIntakeBalanceService(db).listOpen() : Promise.resolve([]),
    all ? movements.listTransferLegsAwaiting(accountId) : Promise.resolve([]),
    all ? movements.listProvisional(accountId, from, to) : Promise.resolve([]),
    all ? new AccountService(db).list({ activeOnly: true }) : Promise.resolve([]),
    new SupplierService(db).list(),
    new CounterpartyService(db).list({ activeOnly: true }),
    new MovementNatureService(db).list(),
  ]);

  /*
    Sipariş adayı = açık bakiyesi olan satış. Tamamı tahsil edilmiş sipariş öneriye girmez: parası
    zaten yazılmış bir siparişe ikinci kez ödeme bağlamak, tahsilatı iki kez saymak olurdu.

    ── ÖLÇÜT ÖNCE `payment_status` (01.09, kullanıcı bulgusu) ────────────────────────────────────
    Süzgeç yalnız `total − net tahsilat > 0` idi ve kısmi karşılamada **kapatılamayan bir hayalet**
    üretiyordu: sipariş 46,39 €, teslim edilen 27,29 €, müşteri doğru tutarı ödüyor → ödeme durumu
    `paid` oluyor ama formül 19,10 €'yu hâlâ "açık" sayıyor. Satır kuyrukta sonsuza dek duruyor,
    çünkü kapatılacak bir borç YOK.

    Motorun cevabı `payment_status`tadır (`derivePaymentStatus`: net ≥ karşılanan → `paid`) ve
    kapanmış siparişi eleyecek tek doğru ölçüt odur. `iptal` de aynı sebeple dışarıda: iptal edilen
    siparişin borcu yoktur, tahsil edilmişse iade yoluna girer.

    Fark tutarı yine ham formülden okunuyor ve bu bilinçli: kuyruğun işi banka satırını EŞLEŞTİRMEK,
    tutarı yeniden hesaplamak değil — hangi siparişin ne kadarının açık olduğunu sipariş ekranı
    söylüyor. Burada gereken yalnız "hangi aday makul", ve onun için ham fark yeterli.
  */
  const orders: OrderTarget[] = sales
    .filter((s) => s.paymentStatus !== 'paid' && s.paymentStatus !== 'refunded' && s.status !== 'cancelled')
    .map((s) => ({
      id: s.id,
      referenceNo: s.referenceNo,
      saleDate: s.saleDate,
      outstandingCents: s.orderedTotalCents - s.amountCollectedCents + s.amountRefundedCents,
    }))
    .filter((c) => c.outstandingCents > 0);

  /*
    İADE HEDEFİ PUANLANMAZ, LİSTELENİR (12.13). İade borcu kalemlerden türer
    (`derivePaymentStatusForOrder`: karşılanan adet × birim fiyat) ve pencerede yüzlerce satışın
    kalemini okumak kuyruğu ağırlaştırırdı; "tutarı tutan her satış iade adayıdır" deseydik aynı
    tutarlı bir gider satırı yanlış onaya sürüklenirdi. Net tahsilatı olan satışlar seçim penceresinde
    durur; iadeyi operatör bilerek bağlar — bankadan iade zaten operatörün kendi yaptığı iştir.
    Sipariş akışının yazdığı iade satırı (sistem) ise "zaten yazılmış hareket" adayı olarak zaten
    puanlanır.
  */
  const refunds: RefundTarget[] = sales
    .map((s) => ({ id: s.id, referenceNo: s.referenceNo, saleDate: s.saleDate, netCollectedCents: s.amountCollectedCents - s.amountRefundedCents }))
    .filter((c) => c.netCollectedCents > 0);

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name] as const));
  const counterpartyOf = new Map(counterparties.map((c) => [c.id, c] as const));
  const natureDirection = new Map(natures.map((n) => [n.slug, n.direction] as const));
  /** Carinin eşleşme kelimeleri — belgesi ve elle yazılmış hareketi de aynı kelimeyle tanınır. */
  const keywordsOf = (counterpartyId: string | null) => (counterpartyId ? (counterpartyOf.get(counterpartyId)?.keywords ?? []) : []);

  const documentTargets: DocumentTarget[] = documents.map((d) => ({
    ...d,
    partyName: d.counterpartyId ? (counterpartyOf.get(d.counterpartyId)?.name ?? null) : d.supplierId ? (supplierName.get(d.supplierId) ?? null) : null,
  }));
  const intakeTargets: IntakeTarget[] = intakes.map((intake) => ({
    ...intake,
    supplierName: intake.supplierId ? (supplierName.get(intake.supplierId) ?? null) : null,
  }));
  const accountName = new Map(accounts.map((a) => [a.id, a.name] as const));
  const legTargets: TransferLegTarget[] = legs.map((leg) => ({ ...leg, accountName: accountName.get(leg.accountId) ?? '—' }));
  const accountTargets: AccountTarget[] = accounts.filter((a) => a.id !== accountId).map((a) => ({ id: a.id, name: a.name, type: a.type }));
  const counterpartyTargets: CounterpartyTarget[] = all
    ? counterparties.map(({ id, name, kind, defaultNature }) => ({ id, name, kind, defaultNature }))
    : [];

  const candidates: MatchCandidate[] = [
    ...orders.map((o): MatchCandidate => ({ kind: 'order', id: o.id, referenceNo: o.referenceNo, amountCents: o.outstandingCents, date: o.saleDate, direction: 'in' })),
    ...documentTargets.map(
      (d): MatchCandidate => ({
        kind: 'document',
        id: d.id,
        referenceNo: d.number,
        amountCents: d.balance.openAmountCents,
        date: d.issuedOn,
        direction: d.direction,
        nameHints: [d.partyName],
        keywords: keywordsOf(d.counterpartyId),
      }),
    ),
    ...intakeTargets.map(
      // Kabulün notu irsaliye/fatura numarasıdır (12.26): banka satırı onu anarsa referans eşleşmesi
      // kurulur — bir tur `null` veriliyordu ve fatura numarasıyla gelen ödeme yalnız tutar ve günle puanlanıyordu.
      (i): MatchCandidate => ({ kind: 'intake', id: i.stockIntakeId, referenceNo: i.note, amountCents: i.openAmountCents, date: i.date, direction: 'out', nameHints: [i.supplierName] }),
    ),
    // Ucun yönü GÖNDERENİN gözünden yazılı: uç `out` ise para bu hesaba GİRİYOR.
    ...legTargets.map(
      (leg): MatchCandidate => ({
        kind: 'transfer',
        id: leg.id,
        referenceNo: null,
        amountCents: leg.amountCents,
        date: leg.valueDate,
        direction: leg.direction === 'out' ? 'in' : 'out',
        nameHints: [leg.description, leg.accountName],
      }),
    ),
    ...provisional.map(
      (p): MatchCandidate => ({
        kind: 'provisional',
        id: p.id,
        referenceNo: null,
        amountCents: p.amountCents,
        date: p.valueDate,
        direction: p.direction,
        nameHints: [p.description],
        keywords: keywordsOf(p.counterpartyId),
      }),
    ),
    // CARİ (13.09): tutarı ve günü yok, kanıtı yalnız eşleşme kelimesi — adı ipucu olarak VERİLMEZ:
    // cari bir yedek öneridir, aynı carinin belgesi ya da elle yazılmış hareketi varsa onun önüne
    // geçmemeli. Yönü varsayılan türünden (tür yoksa iki yön).
    ...counterpartyTargets.map(
      (c): MatchCandidate => ({
        kind: 'counterparty',
        id: c.id,
        referenceNo: null,
        amountCents: 0,
        date: null,
        direction: c.defaultNature ? (natureDirection.get(c.defaultNature) ?? null) : null,
        keywords: counterpartyOf.get(c.id)?.keywords ?? [],
      }),
    ),
  ];


  return {
    targets: {
      orders,
      refunds,
      documents: documentTargets,
      intakes: intakeTargets,
      transferLegs: legTargets,
      provisional,
      accounts: accountTargets,
      counterparties: counterpartyTargets,
    },
    candidates,
  };
}

/** Onaylanan hedef — kuyruk kartından ya da seçim penceresinden gelen tek karar. */
export type MatchTarget =
  | { kind: 'order'; orderId: string }
  | { kind: 'refund'; orderId: string }
  | { kind: 'document'; documentId: string }
  | { kind: 'intake'; stockIntakeId: string }
  /** Var olan transfer ucunun karşı satırı — ayna susar, para tek kez sayılır. */
  | { kind: 'transfer'; legId: string }
  /** Ucu olmayan transfer: satırın kendisi transfer olur, karşı hesaba aynalanır. */
  | { kind: 'transfer_to'; accountId: string }
  /** "Bunu zaten yazmıştım" — ekstre satırı elle yazılanı yutar. */
  | { kind: 'provisional'; movementId: string }
  /** Cari (13.09) — satır carinin olur; varsayılan türü varsa tür de konur ve satır mutabık olur. */
  | { kind: 'counterparty'; counterpartyId: string };

export type ReconcileReason =
  | 'already_reconciled'
  | 'not_bank_row'
  | 'not_found'
  /** Hedefin yönü satırın yönüne uymuyor: giren para iade/gider, çıkan para tahsilat/sermaye olamaz. */
  | 'direction_mismatch'
  | 'target_not_found'
  /** Transfer ucunu başka bir ekstre satırı sahiplenmiş. */
  | 'target_taken'
  | 'same_account'
  /** Belgenin açık kalanı yok — bağlanacak borç kalmamış. */
  | 'document_settled'
  /** Satır bu belgeye zaten bağlı — ikinci bağ, birincinin tutarını değiştirmek olurdu. */
  | 'already_allocated';

export type ReconcileOutcome = { status: 'ok'; movementId: string } | { status: 'invalid'; reason: ReconcileReason };

const invalid = (reason: ReconcileReason): ReconcileOutcome => ({ status: 'invalid', reason });

/** Belge kapısının reddi → kuyruğun dili. Kalanı olmayan satır "zaten eşleşmiş"tir. */
const ALLOCATION_REASON: Record<Extract<AllocationOutcome, { status: 'invalid' }>['reason'], ReconcileReason> = {
  not_found: 'target_not_found',
  direction_mismatch: 'direction_mismatch',
  already_allocated: 'already_allocated',
  nothing_to_allocate: 'already_reconciled',
  document_settled: 'document_settled',
  over_movement: 'already_reconciled',
};

/** Kuyruktaki satırı bulur ve dokunulabilir olduğunu doğrular — iki kez uygulanmasın. */
async function loadQueueRow(movementId: string): Promise<MoneyMovement | ReconcileOutcome> {
  const movement = await new MoneyMovementService(serviceDb()).getById(movementId);
  if (!movement) return invalid('not_found');
  if (movement.source !== 'bank_import') return invalid('not_bank_row');
  if (movement.reconciled) return invalid('already_reconciled');
  return movement;
}

/**
 * Bağla açıklanan satırda tür ve cari anlamsız (13.09): sipariş parası, stok alımı ve transfer
 * onları bağıyla söyler. Kuyrukta seçilmiş bir cari kalmışsa bağ yazılırken temizlenir — yoksa satır
 * hem "URSSAF'ın" hem "şu siparişin tahsilatı" diye iki ayrı cevap taşırdı.
 */
const BOUND = { nature: null, counterpartyId: null } as const;

/**
 * **Onaylanan eşleşmeyi uygular** — satır hedefin parası olur.
 *
 * Satır **yerinde güncellenir**, silinip yeniden yazılmaz. Sebebi teknik değil, paranın
 * doğruluğuyla ilgili: satırın parmak izi mükerrer korumasının dayanağıdır (12.4). Silseydik izi
 * de silerdik ve aynı ekstre bir daha yüklendiğinde o satır yeniden girerdi — tahsilat bir yanda,
 * "sınıflandırılmamış" kopya öbür yanda, para İKİ KEZ sayılmış olurdu. `bank_import_id` bağı da
 * böylece korunur: satırın hangi dosyadan geldiği sorusunun cevabı kaybolmaz.
 *
 * Yeni bir hareket YAZILMADIĞI için tutar da iki kez sayılmaz; sipariş parasında `amount_*` cache'i
 * ve ödeme durumu 12.2'nin kapısından (`syncOrderPaymentStatus`) yeniden türetilir. Tek istisna
 * "zaten yazmıştım" hedefi: orada elle yazılan satır SİLİNİR (kullanıcı kararı 13.09) — bağları
 * ekstre satırına geçer, izi künyede kalır; iş tek transaction'dadır (`absorb_provisional_movement`).
 */
export async function applyMatch(movementId: string, target: MatchTarget): Promise<ReconcileOutcome> {
  const found = await loadQueueRow(movementId);
  if ('status' in found) return found;
  const db = serviceDb();
  const movements = new MoneyMovementService(db);
  const ok: ReconcileOutcome = { status: 'ok', movementId };

  switch (target.kind) {
    case 'order': {
      if (found.direction !== 'in') return invalid('direction_mismatch');
      await movements.update({ id: movementId, orderId: target.orderId, type: 'order_payment', reconciled: true, ...BOUND });
      await syncOrderPaymentStatus(target.orderId);
      return ok;
    }
    case 'refund': {
      if (found.direction !== 'out') return invalid('direction_mismatch');
      await movements.update({ id: movementId, orderId: target.orderId, type: 'order_refund', reconciled: true, ...BOUND });
      await syncOrderPaymentStatus(target.orderId);
      return ok;
    }
    case 'document':
      return applyDocument(found, target.documentId);
    case 'intake': {
      if (found.direction !== 'out') return invalid('direction_mismatch');
      const intake = await new StockIntakeService(db).getById(target.stockIntakeId);
      if (!intake) return invalid('target_not_found');
      await movements.update({ id: movementId, type: 'purchase', stockIntakeId: intake.id, supplierId: intake.supplierId, reconciled: true, ...BOUND });
      return ok;
    }
    case 'transfer': {
      const leg = await movements.getById(target.legId);
      if (!leg || leg.type !== 'transfer' || leg.counterAccountId !== found.accountId) return invalid('target_not_found');
      // Ucun yönü gönderenin gözünden: uç `out` ise para bu hesaba GİRER.
      if ((leg.direction === 'out' ? 'in' : 'out') !== found.direction) return invalid('direction_mismatch');
      if (!(await movements.listTransferLegsAwaiting(found.accountId)).some((awaiting) => awaiting.id === leg.id)) return invalid('target_taken');
      await movements.update({ id: movementId, type: 'transfer', counterAccountId: leg.accountId, counterpartMovementId: leg.id, reconciled: true, ...BOUND });
      return ok;
    }
    case 'transfer_to': {
      if (target.accountId === found.accountId) return invalid('same_account');
      const account = await new AccountService(db).getById(target.accountId);
      if (!account?.isActive) return invalid('target_not_found');
      await movements.update({ id: movementId, type: 'transfer', counterAccountId: account.id, reconciled: true, ...BOUND });
      return ok;
    }
    case 'provisional': {
      const provisional = await movements.getById(target.movementId);
      if (!provisional || provisional.source === 'bank_import' || provisional.accountId !== found.accountId) return invalid('target_not_found');
      if (provisional.direction !== found.direction) return invalid('direction_mismatch');
      await movements.absorbProvisional(movementId, provisional.id);
      // Sipariş parasıysa durum yeniden türer (cache'i RPC zaten kurdu; durumu motor söyler).
      if (provisional.orderId) await syncOrderPaymentStatus(provisional.orderId);
      return ok;
    }
    case 'counterparty': {
      // Cari kapısı varsayılan türü de koyar; türü olmayan cari satırı mutabık YAPMAZ — satır carisiyle
      // kuyrukta kalır ve türü operatör seçer ("URSSAF'a ödeme" belli, "neyin parası" henüz değil).
      const outcome = await setMovementCounterparty(db, { movementId, counterpartyId: target.counterpartyId });
      if (outcome.status === 'invalid') return invalid(outcome.reason === 'not_found' ? 'not_found' : 'target_not_found');
      return ok;
    }
  }
}

/**
 * Belgeye bağlama — TUTARIYLA (13.09 · ikinci karar). Bağ satırın kalanı ile belgenin açık kalanından
 * küçüğüdür (uygulama kapısı: `allocateToDocument`). Karşı taraf belgeden gelir: tedarikçi faturası
 * satırı tedarikçinin yapar (cari varsa silinir — veri kısıtı ikisini birden kabul etmez), cari
 * belgesi satırda karşı taraf yoksa carisini verir. Satırın TAMAMI bağlanınca satır mutabık olur ve
 * adı belgeden gelir: tedarikçi faturası → stok alımı, öteki borç → gider, bize ödenecek belge →
 * `misc`; belgenin türü satırın türü boşsa ona geçer. Kalan varsa satır kuyrukta kalır, kalanıyla.
 */
async function applyDocument(movement: MoneyMovement, documentId: string): Promise<ReconcileOutcome> {
  const db = serviceDb();
  const outcome = await allocateToDocument(db, { movementId: movement.id, documentId });
  if (outcome.status === 'invalid') return invalid(ALLOCATION_REASON[outcome.reason]);

  const [document, allocations] = await Promise.all([
    new MoneyDocumentService(db).getById(documentId),
    new MoneyAllocationService(db).listByMovements([movement.id]),
  ]);
  if (!document) return invalid('target_not_found');

  const party = document.supplierId
    ? { supplierId: document.supplierId, counterpartyId: null }
    : movement.supplierId || movement.counterpartyId
      ? {}
      : { counterpartyId: document.counterpartyId };
  const patch: MoneyMovementUpdate = { id: movement.id, ...party };
  if (allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0) >= movement.amountCents) {
    const type = document.direction === 'in' ? 'misc' : document.supplierId ? 'purchase' : 'expense';
    patch.type = type;
    patch.reconciled = true;
    patch.stockIntakeId = document.stockIntakeId;
    if (movement.nature === null && acceptsNature(type)) patch.nature = document.nature;
  }
  await new MoneyMovementService(db).update(patch);
  return { status: 'ok', movementId: movement.id };
}

/**
 * Eşleşmeyi GERİ ALIR (13.09 · kullanıcı bulgusu: "eşleştirmeyle ilgili düzenleme yapamıyorum") —
 * bağlanan, sınıflanan ya da atlanan ekstre satırı ekstreden geldiği hâle döner: belge bağları,
 * sipariş, mal kabul, transfer ve karşı taraf bağları düşer, tür kalkar, satır kuyruğa geri gelir.
 * "Zaten yazmıştım" birleşmesiyse elle yazılan satır künyesinden yeniden kurulur ve bağları ona döner.
 * Tek transaction (`unmatch_bank_movement`); sipariş parasıysa siparişin ödeme durumu yeniden türer.
 */
export async function unmatchRow(movementId: string): Promise<ReconcileOutcome> {
  const movements = new MoneyMovementService(serviceDb());
  const movement = await movements.getById(movementId);
  if (!movement) return invalid('not_found');
  if (movement.source !== 'bank_import') return invalid('not_bank_row');

  await movements.unmatchBankMovement(movementId);
  if (movement.orderId) await syncOrderPaymentStatus(movement.orderId);
  return { status: 'ok', movementId };
}

/**
 * TEK satırın seçici penceresi (12.17 · muhasebeci deseni): sağ panelin "Bağla" menüsü satırın
 * adaylarını açılışta sunucudan ister — kuyruğun hesabı seçili olmasa da ("Tümü" görünümü) aynı
 * öneriler, aynı hedef listesi. Eşleşme bekleyen ekstre satırında bütün hedefler; elle yazılan ya da
 * mutabık satırda yalnız AÇIK BELGELER — onun tek bağı belgedir. `bankRow` seçimin hangi kapıya
 * gideceğini söyler (`applyMatch` ya da `linkDocument`).
 */
export interface MatchOptions extends Omit<QueueRow, 'movement'> {
  movement: MoneyMovement;
  targets: MatchTargets;
  bankRow: boolean;
}

export async function matchOptions(movementId: string): Promise<MatchOptions | null> {
  const db = serviceDb();
  const movement = await new MoneyMovementService(db).getById(movementId);
  if (!movement) return null;
  const bankRow = movement.source === 'bank_import' && !movement.reconciled;
  const [{ targets, candidates }, allocations] = await Promise.all([
    loadTargets(movement.accountId, addDays(movement.valueDate, -CANDIDATE_WINDOW_DAYS), addDays(movement.valueDate, 3), {
      documentsOnly: !bankRow,
    }),
    new MoneyAllocationService(db).listByMovements([movement.id]),
  ]);
  return { movement, ...suggestionsFor(movement, candidates, allocations), targets, bankRow };
}

/**
 * Hareketi belgeye BAĞLAR — sağ panelin iki yanı da buraya gelir (12.17): hareketin "Bağla" menüsü ve
 * belgenin "Ödeme bağla" menüsü. Eşleşme bekleyen ekstre satırı kuyruğun kapısından geçer
 * (`applyDocument`: tamamı bağlanınca mutabık olur, adı ve karşı tarafı belgeden gelir); elle yazılan
 * ya da zaten mutabık satır yalnız tutarlı bağ alır (`allocateToDocument`).
 */
export async function linkDocument(movementId: string, documentId: string): Promise<ReconcileOutcome> {
  const db = serviceDb();
  const movement = await new MoneyMovementService(db).getById(movementId);
  if (!movement) return invalid('not_found');
  if (movement.source === 'bank_import' && !movement.reconciled) return applyDocument(movement, documentId);
  const outcome = await allocateToDocument(db, { movementId, documentId });
  return outcome.status === 'invalid' ? invalid(ALLOCATION_REASON[outcome.reason]) : { status: 'ok', movementId };
}

/** Ödeme adayının arandığı pencere — belge gününden ÖNCE (peşin ödeme) ve SONRA (vade) kaç gün. */
const PAYMENT_BEFORE_DAYS = 30;
const PAYMENT_AFTER_DAYS = 120;
/** Belgeye ödeme adayı olabilen tipler: türlü hareketler ve stok alımı; sipariş parası ve transfer olamaz. */
const payable = (movement: MoneyMovement) => acceptsNature(movement.type) || movement.type === 'purchase';

export interface PaymentCandidate {
  movement: MoneyMovement;
  /** Hareketin henüz hiçbir belgeye bağlanmamış kalanı (**cent**). */
  remainingCents: number;
  /** Motorun puanı — `0` = eşiği geçmedi (listede durur, yalnız sıralamada geride). */
  score: number;
  reasons: MatchSuggestion['reasons'];
}

export interface DocumentPaymentOptions {
  document: MoneyDocument & { balance: MoneyDocumentBalance };
  /** Belgenin bağlı ödemeleri — tutarıyla. */
  payments: Array<{ movement: MoneyMovement; amountCents: number }>;
  candidates: PaymentCandidate[];
}

/** Belge panelinin aday listesinin tavanı — seçim penceresi bir arama listesidir, arşiv değil. */
const PAYMENT_CANDIDATE_LIMIT = 40;

/**
 * Belgenin ÖDEME seçicisi (12.17 · muhasebeci deseninin fatura yanı): belgeye bağlı ödemeler ve
 * bağlanabilecek hareketler. Adaylar belgenin yönündeki, kalanı olan, pencere içindeki hareketlerdir;
 * puan motorun kendisinden gelir (`suggestMatches`: belge numarası banka açıklamasında mı, tutar
 * tutuyor mu, gün yakın mı, carinin eşleşme kelimesi geçiyor mu) — ikinci bir puan kuralı yazılmaz.
 */
export async function documentPaymentOptions(documentId: string): Promise<DocumentPaymentOptions | null> {
  const db = serviceDb();
  const documents = new MoneyDocumentService(db);
  const document = await documents.getById(documentId);
  if (!document) return null;

  const allocationService = new MoneyAllocationService(db);
  const movementService = new MoneyMovementService(db);
  const [balances, own, window, counterparties, suppliers] = await Promise.all([
    documents.balances([document.id]),
    allocationService.listByDocuments([document.id]),
    movementService.listPeriod(addDays(document.issuedOn, -PAYMENT_BEFORE_DAYS), addDays(document.issuedOn, PAYMENT_AFTER_DAYS)),
    new CounterpartyService(db).list(),
    new SupplierService(db).list(),
  ]);
  const balance = balances.get(document.id);
  if (!balance) return null;

  const linked = new Set(own.map((allocation) => allocation.movementId));
  const pool = window.filter((movement) => movement.direction === document.direction && payable(movement) && !linked.has(movement.id));
  const [paid, poolAllocations] = await Promise.all([
    movementService.listByIds(own.map((allocation) => allocation.movementId)),
    allocationService.listByMovements(pool.map((movement) => movement.id)),
  ]);

  const counterparty = document.counterpartyId ? counterparties.find((c) => c.id === document.counterpartyId) : undefined;
  const partyName = counterparty?.name ?? (document.supplierId ? (suppliers.find((s) => s.id === document.supplierId)?.name ?? null) : null);
  const target: MatchCandidate = {
    kind: 'document',
    id: document.id,
    referenceNo: document.number,
    amountCents: balance.openAmountCents,
    date: document.issuedOn,
    direction: document.direction,
    nameHints: [partyName],
    keywords: counterparty?.keywords ?? [],
  };
  const allocatedOf = new Map<string, number>();
  for (const allocation of poolAllocations) allocatedOf.set(allocation.movementId, (allocatedOf.get(allocation.movementId) ?? 0) + allocation.amountCents);
  const gap = (movement: MoneyMovement) => Math.abs(Date.parse(movement.valueDate) - Date.parse(document.issuedOn));

  const candidates = pool
    .flatMap((movement): PaymentCandidate[] => {
      const remainingCents = movement.amountCents - (allocatedOf.get(movement.id) ?? 0);
      if (remainingCents <= 0) return [];
      const [hit] = suggestMatches(
        { valueDate: movement.valueDate, amountCents: remainingCents, direction: movement.direction, label: movement.description ?? '' },
        [target],
      );
      return [{ movement, remainingCents, score: hit?.score ?? 0, reasons: hit?.reasons ?? [] }];
    })
    .sort((a, b) => b.score - a.score || gap(a.movement) - gap(b.movement))
    .slice(0, PAYMENT_CANDIDATE_LIMIT);

  const paidOf = new Map(paid.map((movement) => [movement.id, movement] as const));
  return {
    document: { ...document, balance },
    payments: own.flatMap((allocation) => {
      const movement = paidOf.get(allocation.movementId);
      return movement ? [{ movement, amountCents: allocation.amountCents }] : [];
    }),
    candidates,
  };
}
