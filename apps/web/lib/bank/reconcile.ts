import { MoneyMovementService, OrderSaleService, serviceDb } from '@lezzet/database';
import { isUnambiguous, suggestOrderMatches, type MatchCandidate, type MatchSuggestion } from '@lezzet/domain-core';
import type { MoneyMovement } from '@lezzet/types';
import { syncOrderPaymentStatus } from '../money/order-payment';

/**
 * Banka satırı ↔ sipariş eşleştirme kuyruğu (12.4) — DOMAIN §9: **öneri + elle onay, tam otomatik
 * değil.**
 *
 * Yanlış eşleşen bir satır parayı başka bir siparişin ödemesi yapar: o sipariş "ödendi" görünürken
 * gerçekte ödeyen müşteri hâlâ borçlu kalır ve kimse fark etmez. Bu yüzden bu dosya hiçbir şeyi
 * kendiliğinden uygulamaz; **önerir** ve insanın onayını bekler.
 */

/** Adayların arandığı pencere (gün): banka satırı satıştan sonra düşer, bazen günler sonra. */
const CANDIDATE_WINDOW_DAYS = 30;

interface QueueRow {
  movement: MoneyMovement;
  suggestions: MatchSuggestion[];
  /** Tek güçlü aday mı — iki aday yakınsa ekran "otomatik onayla" bile teklif etmemeli. */
  unambiguous: boolean;
}

const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Eşleşme bekleyen banka satırları + sipariş önerileri.
 *
 * Adaylar **tek turda** çekilir: kuyruktaki en eski ve en yeni satırın tarihinden bir pencere
 * kurulur, o dönemin satışları bir kez okunur. Satır başına sorgu atsaydık 200 satırlık bir ekstre
 * 200 sorgu ederdi.
 */
export async function matchQueue(accountId: string, opts: { limit?: number } = {}): Promise<QueueRow[]> {
  const db = serviceDb();
  const ledgerPage = await new MoneyMovementService(db).ledger(accountId, { unreconciledOnly: true, limit: opts.limit ?? 50 });
  const bankRows = ledgerPage.rows.filter((r) => r.source === 'bank_import');
  if (bankRows.length === 0) return [];

  const dates = bankRows.map((r) => r.valueDate).sort();
  const sales = await new OrderSaleService(db).listPeriod(
    addDays(dates[0]!, -CANDIDATE_WINDOW_DAYS),
    addDays(dates[dates.length - 1]!, 3),
  );

  // Aday = açık bakiyesi olan satış. Tamamı tahsil edilmiş sipariş öneriye girmez: parası zaten
  // yazılmış bir siparişe ikinci kez ödeme bağlamak, tahsilatı iki kez saymak olurdu.
  const candidates: MatchCandidate[] = sales
    .map((s) => ({
      orderId: s.id,
      referenceNo: s.referenceNo,
      // Formül `openAmountCents` ile AYNI olmalı; artık tek satır ve tamsayı (02.9): eskiden burada
      // euro çıkarılıp `* 100 / 100` ile yuvarlanıyordu — kayan noktada çıkarma, kuruş kaçıran yer.
      outstandingCents: s.totalCents - s.amountCollectedCents + s.amountRefundedCents,
      saleDate: s.saleDate,
    }))
    .filter((c) => c.outstandingCents > 0);

  return bankRows.map((movement) => {
    const suggestions = suggestOrderMatches(
      { valueDate: movement.valueDate, amountCents: movement.amountCents, direction: movement.direction, label: movement.description ?? '' },
      candidates,
    );
    return { movement, suggestions, unambiguous: isUnambiguous(suggestions) };
  });
}

type ReconcileOutcome =
  | { status: 'ok'; movementId: string }
  | { status: 'invalid'; reason: 'already_reconciled' | 'not_bank_row' | 'not_found' };

/** Kuyruktaki satırı bulur ve dokunulabilir olduğunu doğrular — iki kez uygulanmasın. */
async function loadQueueRow(movementId: string): Promise<MoneyMovement | ReconcileOutcome> {
  const movement = await new MoneyMovementService(serviceDb()).getById(movementId);
  if (!movement) return { status: 'invalid', reason: 'not_found' };
  if (movement.source !== 'bank_import') return { status: 'invalid', reason: 'not_bank_row' };
  if (movement.reconciled) return { status: 'invalid', reason: 'already_reconciled' };
  return movement;
}

/**
 * **Onaylanan eşleşmeyi uygular:** banka satırı siparişin tahsilatı olur.
 *
 * Satır **yerinde güncellenir**, silinip yeniden yazılmaz. Sebebi teknik değil, paranın
 * doğruluğuyla ilgili: satırın parmak izi mükerrer korumasının dayanağıdır (12.4). Silseydik izi
 * de silerdik ve aynı ekstre bir daha yüklendiğinde o satır yeniden girerdi — sipariş tahsilatı
 * bir yanda, "sınıflandırılmamış" kopya öbür yanda, para İKİ KEZ sayılmış olurdu. `bank_import_id`
 * bağı da böylece korunur: satırın hangi dosyadan geldiği sorusunun cevabı kaybolmaz.
 *
 * Yeni bir hareket YAZILMADIĞI için tutar da iki kez sayılmaz; siparişin `amount_*` cache'i ve
 * ödeme durumu 12.2'nin kapısından (`syncOrderPaymentStatus`) yeniden türetilir.
 */
export async function applyOrderMatch(movementId: string, orderId: string): Promise<ReconcileOutcome> {
  const found = await loadQueueRow(movementId);
  if ('status' in found) return found;

  await new MoneyMovementService(serviceDb()).update({
    id: movementId,
    orderId,
    // Yön zaten `in`: kuyruğa yalnız para girişi için sipariş önerisi çıkıyor (motorun kuralı).
    type: 'order_payment',
    reconciled: true,
  });
  await syncOrderPaymentStatus(orderId);

  return { status: 'ok', movementId };
}

/**
 * Satır bir giderdir (kira, akaryakıt…) — sipariş değil. Tipi ve kategorisi yazılır, kuyruktan
 * düşer. Hareket SİLİNMEZ: para zaten hesaptan çıkmıştır, yalnız adı konur.
 */
export async function classifyAsExpense(movementId: string, category: string): Promise<ReconcileOutcome> {
  const found = await loadQueueRow(movementId);
  if ('status' in found) return found;
  if (found.direction !== 'out') return { status: 'invalid', reason: 'not_bank_row' };

  await new MoneyMovementService(serviceDb()).update({ id: movementId, type: 'expense', category, reconciled: true });
  return { status: 'ok', movementId };
}

/**
 * "Bu satır bir şeye bağlanmıyor" — sermaye girişi, banka masrafı, karışık. Kuyruktan düşer ama
 * hareket kalır: bakiyede duran parayı kuyruğu temizlemek için silmek, kasayı kaydırmak olurdu.
 */
export async function dismissRow(movementId: string): Promise<ReconcileOutcome> {
  const found = await loadQueueRow(movementId);
  if ('status' in found) return found;

  await new MoneyMovementService(serviceDb()).markReconciled(movementId);
  return { status: 'ok', movementId };
}
