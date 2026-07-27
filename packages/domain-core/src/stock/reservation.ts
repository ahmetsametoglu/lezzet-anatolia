/**
 * Rezervasyon kararları (03.5) — DOMAIN §4. Saf: stok yazımı BURADA YAPILMAZ; atomiklik gereği
 * asıl düşme/ayırma bir DB fonksiyonunda (RPC) yürür. Burası "ayrılabilir mi, ne yapılmalı"
 * sorusunun cevabıdır.
 *
 * Temel denklem: **kullanılabilir = fiili − aktif rezervasyon**. Ayrılmış toplam saklanmaz,
 * `Reservation` satırlarından türetilir (DATA_MODEL Kalıcı kararlar).
 */

/** Aktif bir rezervasyon satırı — `stockId` doluysa partiye çıpalı (near-expiry teklif satırı). */
export interface ReservationLine {
  qty: number;
  /** Dolu → batch-pinned: o partiden söz verilmiş demektir. */
  stockId?: string | null;
  /** TTL'li rezervasyonlarda son geçerlilik anı; kapıda/vadeli ödemede yok. */
  expiresAt?: string | null;
}

/** Kullanılabilir stok — süresi dolmuş rezervasyonlar sayılmaz (cron onları zaten geri bırakır). */
export function availableQty(physicalQty: number, reservations: readonly ReservationLine[], now: Date = new Date()): number {
  const reserved = reservations.reduce((sum, r) => {
    const expired = r.expiresAt != null && new Date(r.expiresAt) <= now;
    return expired ? sum : sum + r.qty;
  }, 0);
  return Math.max(0, physicalQty - reserved);
}

/**
 * Bir partinin FEFO hazırlığında kullanılabilir miktarı: **o partiye çıpalı** rezervasyonlar
 * düşülür. Normal hazırlık, teklife söz verilmiş stoğu yiyemez (DOMAIN §4).
 */
export function availableInBatch(
  stockId: string,
  batchPhysicalQty: number,
  reservations: readonly ReservationLine[],
  now: Date = new Date(),
): number {
  const pinned = reservations.filter((r) => r.stockId === stockId);
  return availableQty(batchPhysicalQty, pinned, now);
}

export type ReserveDecision =
  | { ok: true; qty: number; expiresAt: string | null; stockId: string | null }
  | { ok: false; reason: 'insufficient_stock'; available: number };

export interface ReserveInput {
  requestedQty: number;
  physicalQty: number;
  reservations: readonly ReservationLine[];
  /** Online ödemede TTL uygulanır (varsayılan 30 dk, `Setting`'ten parametrik). */
  ttlMinutes?: number | null;
  /** Near-expiry teklif satırıysa hangi partiden — rezervasyon o partiye çıpalanır. */
  pinToStockId?: string | null;
  now?: Date;
}

/**
 * "Şu kadarını ayırabilir miyim?" Yetmezse **reddedilir ve müşteriye o an bildirilir** — kısmi
 * ayırma yapılmaz (yarım sipariş sürprizi yaratmaz).
 *
 * Teklif satırında miktar tavanı zaten fiyat çözümünde uygulanır; burada ek olarak partinin
 * kendi kullanılabiliri kontrol edilir.
 */
export function decideReservation(input: ReserveInput): ReserveDecision {
  const now = input.now ?? new Date();
  const available = input.pinToStockId
    ? availableInBatch(input.pinToStockId, input.physicalQty, input.reservations, now)
    : availableQty(input.physicalQty, input.reservations, now);

  if (input.requestedQty > available) return { ok: false, reason: 'insufficient_stock', available };

  const expiresAt = input.ttlMinutes ? new Date(now.getTime() + input.ttlMinutes * 60_000).toISOString() : null;
  return { ok: true, qty: input.requestedQty, expiresAt, stockId: input.pinToStockId ?? null };
}

export type LatePaymentDecision =
  /** Rezervasyon duruyor — sipariş normal devam eder. */
  | { action: 'proceed' }
  /** Rezervasyon düşmüştü ama stok var — yeniden ayrıldı, sipariş devam eder. */
  | { action: 'reserve_again'; qty: number }
  /** Stok da yok — para otomatik iade edilir, müşteriye bilgi mesajı gider. Elle karar gerekmez. */
  | { action: 'refund'; reason: 'stock_gone' };

/**
 * **Geç ödeme emniyet kuralı** (DOMAIN §4): webhook gecikirse ya da tekrarlanırsa, rezervasyonu
 * düşmüş bir sipariş için ödeme onayı gelebilir. Sistem önce yeniden ayırmayı dener; olmazsa
 * otomatik iade eder. Dallanma burada tanımlıdır, uygulama katmanında değil.
 */
export function decideLatePayment(input: {
  reservationStillActive: boolean;
  requestedQty: number;
  physicalQty: number;
  reservations: readonly ReservationLine[];
  now?: Date;
}): LatePaymentDecision {
  if (input.reservationStillActive) return { action: 'proceed' };

  const available = availableQty(input.physicalQty, input.reservations, input.now ?? new Date());
  if (input.requestedQty <= available) return { action: 'reserve_again', qty: input.requestedQty };

  return { action: 'refund', reason: 'stock_gone' };
}

/**
 * FEFO önerisi: **önce süresi dolan çıkar**. Partiye çıpalı rezervasyonlar o partinin
 * kullanılabilirinden düşülür; DLC'si geçmiş parti hiç önerilmez (satılamaz — DOMAIN §4).
 * Bir kalem birden çok partiden karşılanabilir (`OrderItemBatch`).
 */
export interface BatchCandidate {
  stockId: string;
  physicalQty: number;
  /** Partinin son tarihi (DLC/DDM). */
  expiryDate: string;
  /** DLC tipinde ve tarihi geçmişse satılamaz. */
  sellable?: boolean;
}

export function suggestFefoPicks(
  requestedQty: number,
  batches: readonly BatchCandidate[],
  reservations: readonly ReservationLine[],
  now: Date = new Date(),
): { picks: { stockId: string; qty: number }[]; shortfall: number } {
  const usable = batches
    .filter((b) => b.sellable !== false)
    .slice()
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const picks: { stockId: string; qty: number }[] = [];
  let remaining = requestedQty;

  for (const batch of usable) {
    if (remaining <= 0) break;
    const free = availableInBatch(batch.stockId, batch.physicalQty, reservations, now);
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    picks.push({ stockId: batch.stockId, qty: take });
    remaining -= take;
  }

  return { picks, shortfall: remaining };
}
