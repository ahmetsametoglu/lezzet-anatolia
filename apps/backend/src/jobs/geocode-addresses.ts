import { serviceDb } from '@lezzet/database';
import { geocodeAddressesScan } from '@lezzet/application';
import { logger } from '@lezzet/observability';

export const GEOCODE_ADDRESSES = 'geocode_addresses';

/**
 * **Adres koordinatı taraması** (11.9) — rota sıralamasının besleyicisi.
 *
 * Kuryenin duraklarını coğrafi sıraya dizebilmek için her adresin bir noktası olmalı. Nokta iki
 * yoldan doluyor: müşteri adres önerisini SEÇTİĞİNDE (koordinat zaten cevapta, bedava) ve bu iş.
 * İkincisi kalan her yolu kapatıyor — elle yazılan adres, operasyon panelinden girilen sipariş,
 * besleme, ve önerinin makullük süzgecinden düşen satırlar.
 *
 * **On dakikada bir, ve bu bilinçli:** yeni bir adres kurye rotasına en erken ertesi gün girer, yani
 * onlarca dakikalık gecikme hiçbir yerde görünmez. Kuyruk boşken iş tek sorguyla no-op — gece
 * penceresine sıkıştırmanın gerekçesi yok, saat dilimi de gerekmiyor (gün/saat eşiği yok, sıklık
 * eşiği var).
 *
 * Gövde uygulama katmanında (`@lezzet/application`): elle tetikleyen betik (`scripts/`) aynı
 * fonksiyonu çağırabilsin ve `apps/backend`e bağımlı olmasın — sınır kuralı (`pnpm boundaries`).
 */
export async function geocodeAddressesJob(): Promise<Record<string, unknown>> {
  const result = await geocodeAddressesScan(serviceDb());

  // YALNIZ SAYAÇ loglanır. Tek tek satır yazılsaydı 20 satırlık bir tur, 20 müşterinin evini
  // stdout'a yazardı (`CLAUDE §1`: log'a kimlik yazılır, içerik yazılmaz).
  if (result.scanned > 0) logger.info({ job: GEOCODE_ADDRESSES, ...result }, 'adres koordinatı taraması');

  return { ...result };
}
