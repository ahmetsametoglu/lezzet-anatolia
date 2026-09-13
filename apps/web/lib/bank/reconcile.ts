import {
  AccountService,
  MoneyDocumentService,
  MoneyMovementService,
  OrderSaleService,
  StockIntakeBalanceService,
  StockIntakeService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { expectedDirection, isUnambiguous, suggestMatches, type MatchCandidate, type MatchSuggestion } from '@lezzet/domain-core';
import type { Account, MoneyDocument, MoneyDocumentBalance, MoneyMovement, OrderSale, StockIntakeBalance } from '@lezzet/types';
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
 * · sınıflandırma: gider (çıkış) / sermaye (giriş) / sınıflandırılmamış.
 * Hiçbir satır "atla"ya mecbur değil; "atla" yalnız gerçekten bağlanmayan satır içindir.
 */

/** Adayların arandığı pencere (gün): banka satırı satıştan sonra düşer, bazen günler sonra. */
const CANDIDATE_WINDOW_DAYS = 30;

/** Açık bakiyeli satış — giriş satırının tahsilat adayı. Formül `openAmountCents` ile aynı, tamsayı (02.9). */
export type OrderTarget = Pick<OrderSale, 'id' | 'referenceNo' | 'saleDate'> & { outstandingCents: number };
/** Net tahsilatı olan satış — çıkış satırının iade hedefi (puanlanmaz, listelenir; aşağıdaki künye). */
export type RefundTarget = Pick<OrderSale, 'id' | 'referenceNo' | 'saleDate'> & { netCollectedCents: number };
export type DocumentTarget = MoneyDocument & { balance: MoneyDocumentBalance };
export type IntakeTarget = StockIntakeBalance & { supplierName: string | null };
/** Karşı ucu bekleyen transfer ucu — hangi hesaptan geldiği adıyla. */
export type TransferLegTarget = MoneyMovement & { accountName: string };
export type ProvisionalTarget = MoneyMovement;
export type AccountTarget = Pick<Account, 'id' | 'name' | 'type'>;

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
}

export interface QueueRow {
  movement: MoneyMovement;
  suggestions: MatchSuggestion[];
  /** Tek güçlü aday mı — iki aday yakınsa ekran "otomatik onayla" bile teklif etmemeli. */
  unambiguous: boolean;
}

export interface MatchQueue {
  rows: QueueRow[];
  targets: MatchTargets;
}

const EMPTY_TARGETS: MatchTargets = { orders: [], refunds: [], documents: [], intakes: [], transferLegs: [], provisional: [], accounts: [] };
/** Hesap seçili değilken kuyruk: boş satır, boş hedef — sayfa ikisini aynı biçimde okur. */
export const EMPTY_MATCH_QUEUE: MatchQueue = { rows: [], targets: EMPTY_TARGETS };

const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Eşleşme bekleyen banka satırları + önerileri + seçim listeleri.
 *
 * Adaylar **tek turda** çekilir: kuyruktaki en eski ve en yeni satırın tarihinden bir pencere
 * kurulur, o dönemin satışları ve elle yazılanları bir kez okunur; açık belgeler, ödenmemiş
 * kabuller ve bekleyen transfer uçları zaten doğal tavanlı listelerdir. Satır başına sorgu atsaydık
 * 200 satırlık bir ekstre 200 sorgu ederdi.
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

  const [sales, documents, intakes, legs, provisional, accounts, suppliers] = await Promise.all([
    new OrderSaleService(db).listPeriod(from, to),
    new MoneyDocumentService(db).listOpen(),
    new StockIntakeBalanceService(db).listOpen(),
    movements.listTransferLegsAwaiting(accountId),
    movements.listProvisional(accountId, from, to),
    new AccountService(db).list({ activeOnly: true }),
    new SupplierService(db).list(),
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
  const intakeTargets: IntakeTarget[] = intakes.map((intake) => ({
    ...intake,
    supplierName: intake.supplierId ? (supplierName.get(intake.supplierId) ?? null) : null,
  }));
  const accountName = new Map(accounts.map((a) => [a.id, a.name] as const));
  const legTargets: TransferLegTarget[] = legs.map((leg) => ({ ...leg, accountName: accountName.get(leg.accountId) ?? '—' }));
  const accountTargets: AccountTarget[] = accounts.filter((a) => a.id !== accountId).map((a) => ({ id: a.id, name: a.name, type: a.type }));

  const candidates: MatchCandidate[] = [
    ...orders.map((o): MatchCandidate => ({ kind: 'order', id: o.id, referenceNo: o.referenceNo, amountCents: o.outstandingCents, date: o.saleDate, direction: 'in' })),
    ...documents.map(
      (d): MatchCandidate => ({
        kind: 'document',
        id: d.id,
        referenceNo: d.number,
        amountCents: d.balance.openAmountCents,
        date: d.issuedOn,
        direction: d.direction,
        nameHints: [d.counterparty, d.supplierId ? supplierName.get(d.supplierId) : null],
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
      (p): MatchCandidate => ({ kind: 'provisional', id: p.id, referenceNo: null, amountCents: p.amountCents, date: p.valueDate, direction: p.direction, nameHints: [p.description] }),
    ),
  ];

  const rows = bankRows.map((movement) => {
    const suggestions = suggestMatches(
      { valueDate: movement.valueDate, amountCents: movement.amountCents, direction: movement.direction, label: movement.description ?? '' },
      candidates,
    );
    return { movement, suggestions, unambiguous: isUnambiguous(suggestions) };
  });

  return {
    rows,
    targets: { orders, refunds, documents, intakes: intakeTargets, transferLegs: legTargets, provisional, accounts: accountTargets },
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
  | { kind: 'provisional'; movementId: string };

export type ReconcileReason =
  | 'already_reconciled'
  | 'not_bank_row'
  | 'not_found'
  /** Hedefin yönü satırın yönüne uymuyor: giren para iade/gider, çıkan para tahsilat/sermaye olamaz. */
  | 'direction_mismatch'
  | 'target_not_found'
  /** Transfer ucunu başka bir ekstre satırı sahiplenmiş. */
  | 'target_taken'
  | 'same_account';

export type ReconcileOutcome = { status: 'ok'; movementId: string } | { status: 'invalid'; reason: ReconcileReason };

const invalid = (reason: ReconcileReason): ReconcileOutcome => ({ status: 'invalid', reason });

/** Kuyruktaki satırı bulur ve dokunulabilir olduğunu doğrular — iki kez uygulanmasın. */
async function loadQueueRow(movementId: string): Promise<MoneyMovement | ReconcileOutcome> {
  const movement = await new MoneyMovementService(serviceDb()).getById(movementId);
  if (!movement) return invalid('not_found');
  if (movement.source !== 'bank_import') return invalid('not_bank_row');
  if (movement.reconciled) return invalid('already_reconciled');
  return movement;
}

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
      await movements.update({ id: movementId, orderId: target.orderId, type: 'order_payment', reconciled: true });
      await syncOrderPaymentStatus(target.orderId);
      return ok;
    }
    case 'refund': {
      if (found.direction !== 'out') return invalid('direction_mismatch');
      await movements.update({ id: movementId, orderId: target.orderId, type: 'order_refund', reconciled: true });
      await syncOrderPaymentStatus(target.orderId);
      return ok;
    }
    case 'document': {
      const document = await new MoneyDocumentService(db).getById(target.documentId);
      if (!document) return invalid('target_not_found');
      if (document.direction !== found.direction) return invalid('direction_mismatch');
      await movements.update({
        id: movementId,
        documentId: document.id,
        // Alım faturası → stok alımı (tedarikçi + kabul bağı geçer); öteki borç → gider; bize
        // ödenecek belgenin karşılığı `misc` — sebebi belgenin kendisi (elle giriş kuralıyla aynı).
        type: document.direction === 'in' ? 'misc' : document.supplierId ? 'purchase' : 'expense',
        supplierId: document.supplierId,
        stockIntakeId: document.stockIntakeId,
        // Belgenin etiketi ödemesine geçer: aynı şeyi iki kez seçtirmemek için (belge penceresinin kararı).
        tags: document.tags,
        reconciled: true,
      });
      return ok;
    }
    case 'intake': {
      if (found.direction !== 'out') return invalid('direction_mismatch');
      const intake = await new StockIntakeService(db).getById(target.stockIntakeId);
      if (!intake) return invalid('target_not_found');
      await movements.update({ id: movementId, type: 'purchase', stockIntakeId: intake.id, supplierId: intake.supplierId, reconciled: true });
      return ok;
    }
    case 'transfer': {
      const leg = await movements.getById(target.legId);
      if (!leg || leg.type !== 'transfer' || leg.counterAccountId !== found.accountId) return invalid('target_not_found');
      // Ucun yönü gönderenin gözünden: uç `out` ise para bu hesaba GİRER.
      if ((leg.direction === 'out' ? 'in' : 'out') !== found.direction) return invalid('direction_mismatch');
      if (!(await movements.listTransferLegsAwaiting(found.accountId)).some((awaiting) => awaiting.id === leg.id)) return invalid('target_taken');
      await movements.update({ id: movementId, type: 'transfer', counterAccountId: leg.accountId, counterpartMovementId: leg.id, reconciled: true });
      return ok;
    }
    case 'transfer_to': {
      if (target.accountId === found.accountId) return invalid('same_account');
      const account = await new AccountService(db).getById(target.accountId);
      if (!account?.isActive) return invalid('target_not_found');
      await movements.update({ id: movementId, type: 'transfer', counterAccountId: account.id, reconciled: true });
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
  }
}

/** Sınıflandırma hedefleri — bir kayda bağlanmayan satırın adı: gider, sermaye ya da sınıflandırılmamış. */
export type ClassifyType = 'expense' | 'capital' | 'misc';

/**
 * Satır bir giderdir (kira, akaryakıt…) ya da sermaye girişi — bir kayda bağlanmıyor, ADI KONUR.
 * Tipi ve ETİKETLERİ yazılır (13.09), kuyruktan düşer. Hareket SİLİNMEZ: para zaten hesaptan
 * geçmiştir. Yön motorun kuralıdır (`expectedDirection`: gider çıkış, sermaye giriş); etiketi
 * sözlükte olmayan yazımı veritabanı reddeder (`check_tags_known`).
 */
export async function classifyRow(movementId: string, input: { type: ClassifyType; tags: readonly string[] }): Promise<ReconcileOutcome> {
  const found = await loadQueueRow(movementId);
  if ('status' in found) return found;
  const expected = expectedDirection(input.type);
  if (expected && expected !== found.direction) return invalid('direction_mismatch');

  await new MoneyMovementService(serviceDb()).update({ id: movementId, type: input.type, tags: [...input.tags], reconciled: true });
  return { status: 'ok', movementId };
}

/**
 * "Bu satır bir şeye bağlanmıyor" — kuyruktan düşer ama hareket kalır: bakiyede duran parayı kuyruğu
 * temizlemek için silmek, kasayı kaydırmak olurdu. İzah kuyruğunda durmaya devam eder (etiketi yok).
 */
export async function dismissRow(movementId: string): Promise<ReconcileOutcome> {
  const found = await loadQueueRow(movementId);
  if ('status' in found) return found;

  await new MoneyMovementService(serviceDb()).markReconciled(movementId);
  return { status: 'ok', movementId };
}
