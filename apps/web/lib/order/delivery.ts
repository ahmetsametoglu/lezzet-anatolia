import { DeliveryZoneService, SettingsService, serviceDb } from '@lezzet/database';
import { findZoneForPostalCode, upcomingDeliveryDates } from '@lezzet/domain-core';
import type { DeliveryType } from '@lezzet/types';

/**
 * Checkout teslimat çözümü (07.2) — **uygulama katmanı orkestrasyonu**. DOMAIN §6.
 *
 * Bölgeleri ve ayarları servis getirir, kararı motor verir (`domain-core/delivery`), ikisini burası
 * birleştirir (STACK §4).
 *
 * Üç şey birlikte çözülür çünkü birbirine bağlıdır:
 * - **Rota içi mi?** Posta kodu aktif bir bölgeye düşüyorsa evet → ücretsiz kapı teslimi, kapıda
 *   ödeme mümkün. Düşmüyorsa kargo.
 * - **Hangi gün?** Bölgenin günlerinden yaklaşan tarihler; kesim saati (parametrik) geçtiyse bugün
 *   atlanır. **Tek tarih varsa seçim sunulmaz, gösterilir.**
 * - **Kargoya çıkabilir mi?** Soğuk zincir nedeniyle kargolanamayan ürün (`shippable=false`)
 *   sepetteyse kargo seçeneği KAPANIR — müşteri yalnız rota-içi teslim alabilir.
 */

interface DeliveryResolution {
  deliveryType: DeliveryType;
  zoneId: string | null;
  /** Rota-içi teslimat için yaklaşan somut tarihler; kargoda boş. */
  availableDates: string[];
  /** Tek tarih varsa arayüz seçim sunmaz, onu gösterir (DOMAIN §6). */
  requiresDateChoice: boolean;
  /**
   * Kargo neden kapalı: `not_in_route` değil — bu alan yalnız rota DIŞI adreste kargonun da
   * kapandığı hâli anlatır (sepette kargolanamayan ürün var). O zaman sipariş verilemez.
   */
  shippingBlockedReason: 'cold_chain' | null;
}

interface ResolveDeliveryInput {
  postalCode: string;
  /** Sepette kargolanamayan (soğuk zincir) ürün var mı — çağıran ürün okumasından bilir. */
  hasNonShippableItem?: boolean;
  now?: Date;
  /** Kaç tarih önerilsin (varsayılan 3). */
  dateCount?: number;
}

export async function resolveDelivery(input: ResolveDeliveryInput): Promise<DeliveryResolution> {
  const db = serviceDb();
  const [zones, cutoffTime] = await Promise.all([
    new DeliveryZoneService(db).list({ activeOnly: true }),
    new SettingsService(db).get<string>('order_cutoff_time', '16:00'),
  ]);

  const zone = findZoneForPostalCode(input.postalCode, zones);

  // Rota dışı: kargo. Kargolanamayan ürün varsa bu adrese hiç gönderilemez — çağıran akışı durdurur.
  if (!zone) {
    return {
      deliveryType: 'shipping',
      zoneId: null,
      availableDates: [],
      requiresDateChoice: false,
      shippingBlockedReason: input.hasNonShippableItem ? 'cold_chain' : null,
    };
  }

  const availableDates = upcomingDeliveryDates({
    weekdays: zone.weekdays,
    now: input.now ?? new Date(),
    cutoffTime,
    count: input.dateCount ?? 3,
  });

  return {
    deliveryType: 'route',
    zoneId: zone.id,
    availableDates,
    requiresDateChoice: availableDates.length > 1,
    shippingBlockedReason: null,
  };
}
