import { ReservationService, serviceDb } from '@lezzet/database';

export const SWEEP_RESERVATIONS = 'sweep_reservations';

/**
 * TTL süpürücüsü (06.4) — DOMAIN §4 "rezervasyon penceresi".
 *
 * Online checkout'ta stok ayrılır ama müşteri ödemeyi bitirmeyebilir. Süresi geçen rezervasyon
 * satırları burada geri bırakılır; stok başkasına açılır.
 *
 * **Taramalı:** "şu dakikanın satırları" değil, "süresi geçmiş TÜM satırlar" silinir → kaçan tik
 * sonraki taramada telafi olur, ikinci tarama no-op'tur. Zamanlamaya güvenmeyen tek doğru desen.
 *
 * Not: okuma tarafı süpürücüyü BEKLEMEZ — `available_stock` görünümü süresi geçmiş satırı zaten
 * saymaz. Bu iş satırları temizler (tablo şişmesin, "aktif rezervasyon" listesi dürüst kalsın).
 */
export async function sweepReservations(): Promise<Record<string, unknown>> {
  const released = await new ReservationService(serviceDb()).sweepExpired();
  return { released };
}
