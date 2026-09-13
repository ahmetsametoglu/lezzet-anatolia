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
/** Hesap seçili değilken kuyruk: boş satır, boş hedef — sayfa ikisini aynı biçimde okur. */
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
  const db = serviceDb();
  const movements = new MoneyMovementService(db);
  const ledgerPage = await movements.ledger({ accountId, unreconciledOnly: true, limit: opts.limit ?? 50 });
  const bankRows = ledgerPage.rows.filter((r) => r.source === 'bank_import');
  if (bankRows.length === 0) return { rows: [], targets: EMPTY_TARGETS };

  const dates = bankRows.map((r) => r.valueDate).sort();
  const from = addDays(dates[0]!, -CANDIDATE_WINDOW_DAYS);
  const to = addDays(dates[dates.length - 1]!, 3);

  const [sales, documents, intakes, legs, provisional, accounts, suppliers, counterparties, natures, allocations] = await Promise.all([
    new OrderSaleService(db).listPeriod(from, to),
    new MoneyDocumentService(db).listOpen(),
    new StockIntakeBalanceService(db).listOpen(),
    movements.listTransferLegsAwaiting(accountId),
    movements.listProvisional(accountId, from, to),
    new AccountService(db).list({ activeOnly: true }),
    new SupplierService(db).list(),
    new CounterpartyService(db).list({ activeOnly: true }),
    new MovementNatureService(db).list(),
    new MoneyAllocationService(db).listByMovements(bankRows.map((row) => row.id)),
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
  const counterpartyTargets: CounterpartyTarget[] = counterparties.map(({ id, name, kind, defaultNature }) => ({ id, name, kind, defaultNature }));

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
      (i): MatchCandidate => ({ kind: 'intake', id: i.stockIntakeId, referenceNo: null, amountCents: i.openAmountCents, date: i.date, direction: 'out', nameHints: [i.supplierName] }),
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
    ...counterparties.map(
      (c): MatchCandidate => ({
        kind: 'counterparty',
        id: c.id,
        referenceNo: null,
        amountCents: 0,
        date: null,
        direction: c.defaultNature ? (natureDirection.get(c.defaultNature) ?? null) : null,
        keywords: c.keywords,
      }),
    ),
  ];

  const allocatedOf = new Map<string, { totalCents: number; documentIds: Set<string> }>();
  for (const allocation of allocations) {
    const entry = allocatedOf.get(allocation.movementId) ?? { totalCents: 0, documentIds: new Set<string>() };
    entry.totalCents += allocation.amountCents;
    entry.documentIds.add(allocation.documentId);
    allocatedOf.set(allocation.movementId, entry);
  }

  const rows = bankRows.map((movement): QueueRow => {
    const allocated = allocatedOf.get(movement.id);
    const remainingCents = movement.amountCents - (allocated?.totalCents ?? 0);
    // Zaten bağlı olduğu belge ikinci kez önerilmez (bağ tekildir); öneri KALAN tutara göre aranır.
    const own = allocated ? candidates.filter((c) => !(c.kind === 'document' && allocated.documentIds.has(c.id))) : candidates;
    const suggestions = suggestMatches(
      { valueDate: movement.valueDate, amountCents: remainingCents, direction: movement.direction, label: movement.description ?? '' },
      own,
    );
    return { movement, remainingCents, suggestions, unambiguous: isUnambiguous(suggestions) };
  });

  return {
    rows,
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
 * "Bu satır bir şeye bağlanmıyor" — kuyruktan düşer ama hareket kalır: bakiyede duran parayı kuyruğu
 * temizlemek için silmek, kasayı kaydırmak olurdu. İzah kuyruğunda durmaya devam eder (türü yok).
 */
export async function dismissRow(movementId: string): Promise<ReconcileOutcome> {
  const found = await loadQueueRow(movementId);
  if ('status' in found) return found;

  await new MoneyMovementService(serviceDb()).markReconciled(movementId);
  return { status: 'ok', movementId };
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
