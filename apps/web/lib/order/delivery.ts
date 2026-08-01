import { SettingsService, serviceDb } from '@lezzet/database';
import { resolveWarehouseForPostalCode, upcomingDeliveryDates } from '@lezzet/domain-core';
import type { DeliveryType } from '@lezzet/types';
import type { Country } from '@lezzet/types';
import { readDeliveryInputs } from '@/lib/delivery/inputs';

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
  /**
   * Siparişin çıkacağı depo (DOMAIN §17) — teslimat kararıyla AYNI turda çözülür çünkü ikisi tek
   * zincirdir: posta kodu → bölge → depo. Ayrı bir okumaya alınsaydı iki cevap ayrışabilirdi
   * (bölge şurada, depo burada) ve sipariş kendi bölgesinin deposundan çıkmayabilirdi.
   *
   * `null` yalnız çözümsüz hâlde: aynı kod iki bölgede (veri çakışması) ya da kargo deposu hiç
   * tanımlı değil. İkisi de sipariş verilemez demektir ve `unresolvedReason` sebebini söyler —
   * müşteriye "bölge dışısınız" dedirtmemek için ikisi ayrı tutuluyor.
   */
  warehouseId: string | null;
  unresolvedReason: 'ambiguous_zone' | 'no_shipping_warehouse' | null;
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
  /**
   * Adresin ülkesi (DOMAIN §17) — `67000` hem Fransa'da hem Almanya'da geçerlidir, ülkesiz bir
   * posta kodu eksik bir sorudur. Varsayılan `FR` yalnız TESTLER için kaldı: gerçek çağıranların
   * ikisi de ülkeyi doldurur — checkout adresten okur, yer çözümü `postal_code_place`'ten türetir
   * (19.8). İkinci ülke açıldığında varsayılan kalkar.
   */
  country?: Country;
  /** Sepette kargolanamayan (soğuk zincir) ürün var mı — çağıran ürün okumasından bilir. */
  hasNonShippableItem?: boolean;
  now?: Date;
  /** Kaç tarih önerilsin (varsayılan 3). */
  dateCount?: number;
}

export async function resolveDelivery(input: ResolveDeliveryInput): Promise<DeliveryResolution> {
  // Bölge + depo listeleri ORTAK ve önbellekli (`lib/delivery/inputs`): aynı iki listeyi vitrinin
  // yer bağlamı da okuyor. İki ayrı okuma iki farklı ana ait olabilirdi ve o hâlde aynı istekte
  // sepet bir depoyu, katalog başka bir depoyu görürdü. Ucuz olması da checkout'ta işe yarıyor:
  // teslimat bir kez depoyu vermek, bir kez de sepet bilindikten sonra kargo kararını vermek için
  // iki kez çözülebiliyor.
  const [{ zones, warehouses }, cutoffTime] = await Promise.all([
    readDeliveryInputs(),
    new SettingsService(serviceDb()).get<string>('order_cutoff_time', '16:00'),
  ]);

  const place = { country: input.country ?? 'FR', postalCode: input.postalCode };
  const resolution = resolveWarehouseForPostalCode(place, zones, warehouses);

  // Çözümsüz: ya aynı kod iki bölgede (veri çakışması) ya da kargo deposu tanımlı değil. İkisi de
  // sipariş verilemez demektir ama SEBEPLERİ ayrıdır — biri veri hatası, öteki yapılandırma eksiği.
  if (resolution.kind === 'unresolved') {
    return {
      deliveryType: 'shipping',
      zoneId: null,
      warehouseId: null,
      unresolvedReason: resolution.reason,
      availableDates: [],
      requiresDateChoice: false,
      shippingBlockedReason: input.hasNonShippableItem ? 'cold_chain' : null,
    };
  }

  // Rota dışı: kargo deposundan. Kargolanamayan ürün varsa bu adrese hiç gönderilemez.
  if (resolution.kind === 'shipping') {
    return {
      deliveryType: 'shipping',
      zoneId: null,
      warehouseId: resolution.warehouseId,
      unresolvedReason: null,
      availableDates: [],
      requiresDateChoice: false,
      shippingBlockedReason: input.hasNonShippableItem ? 'cold_chain' : null,
    };
  }

  const availableDates = upcomingDeliveryDates({
    weekdays: resolution.weekdays,
    now: input.now ?? new Date(),
    cutoffTime,
    count: input.dateCount ?? 3,
  });

  return {
    deliveryType: 'route',
    zoneId: resolution.zoneId,
    warehouseId: resolution.warehouseId,
    unresolvedReason: null,
    availableDates,
    requiresDateChoice: availableDates.length > 1,
    shippingBlockedReason: null,
  };
}
