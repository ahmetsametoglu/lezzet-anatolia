import { DeliveryZoneService, SettingsService, WarehouseService, type Db } from '@lezzet/database';
import {
  findShippingWarehouse,
  ORDER_CUTOFF_DEFAULT,
  ORDER_CUTOFF_KEY,
  PREP_CUTOFF_DEFAULT,
  PREP_CUTOFF_KEY,
  resolveWarehouseForPostalCode,
  upcomingDeliveryDates,
} from '@lezzet/domain-core';
import type { PlaceResolution, WarehouseCandidate, ZoneWithWarehouse } from '@lezzet/domain-core';
import type { AddressDeliveryType } from '@lezzet/types';
import type { Business, Country } from '@lezzet/types';

/**
 * Checkout teslimat çözümü (DOMAIN §6): bölgeleri ve ayarları servis getirir, rota içi mi, hangi gün ve kargoya çıkabilir mi
 * kararını motor verir. Bölge ve depo listeleri çözülmüş hâliyle geçilebilir (`inputs`), çünkü iki kez çözen çağıranın iki
 * turda farklı liste görmemesi gerekir.
 */

export interface DeliveryResolution {
  /** Bu çözüm bir adresten çıkar ve `pickup` üretemez: yerinde satışın adresi yoktur. */
  deliveryType: AddressDeliveryType;
  zoneId: string | null;
  /**
   * Siparişin çıkacağı depo, teslimat kararıyla aynı turda çözülür, çünkü posta kodu → bölge → depo tek zincirdir. `null` yalnız
   * çözümsüz hâlde olur ve `unresolvedReason` sebebini söyler.
   */
  warehouseId: string | null;
  /**
   * Ülkenin kargo deposu; rota içindeki adreste de doludur, çünkü sepetin kargo grubu oradan çıkar. `null` o ülkeye kargo
   * yapılmıyor demektir.
   */
  shippingWarehouseId: string | null;
  unresolvedReason: Extract<PlaceResolution, { kind: 'unresolved' }>['reason'] | null;
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

/** Yer çözümünün girdileri; şekil motorun sözleşmesinden türer ki motor alan ekleyince burası sessizce eksik kalmasın. */
export interface DeliveryInputs {
  zones: readonly ZoneWithWarehouse[];
  warehouses: readonly WarehouseCandidate[];
}

/**
 * Girdileri okur; çağıran bir kez okuyup iki çözüme birden verebilsin diye ayrıdır. Bölgeler aktiflik süzgecisiz okunur, çünkü
 * pasif bölgedeki kodun da ülkesi bizden türer ve rotanın açık olup olmadığına motor karar verir.
 */
export async function readDeliveryInputs(db: Db): Promise<DeliveryInputs> {
  const [zones, warehouses] = await Promise.all([
    new DeliveryZoneService(db).listWithCodes(),
    // Yalnız tesisler: araç bölgeye bağlanamaz ve kargo deposu olamaz, ama `activeCountries` aracın ülkesini de hizmet
    // ülkesi sayardı.
    new WarehouseService(db).list({ activeOnly: true, kind: 'facility' }),
  ]);
  return { zones, warehouses };
}

export interface ResolveDeliveryInput {
  postalCode: string;
  /**
   * Adresin ülkesi, çünkü `67000` hem Fransa'da hem Almanya'da geçerlidir. Varsayılan `FR` yalnız testler içindir; gerçek
   * çağıranlar ülkeyi doldurur.
   */
  country?: Country;
  /** Müşterinin işi; zincir yalnız o işin bölgelerine ve kargo deposuna çözülür (`customerBusinessOf`). */
  business: Business;
  /** Sepette kargolanamayan (soğuk zincir) ürün var mı — çağıran ürün okumasından bilir. */
  hasNonShippableItem?: boolean;
  now?: Date;
  /** Kaç tarih önerilsin (varsayılan 3). */
  dateCount?: number;
  /** Çoktan okunmuş bölge ve depo listeleri; aynı çözümü iki kez yapan çağıran iki turda farklı liste görmesin diye. */
  inputs?: DeliveryInputs;
}

export async function resolveDelivery(db: Db, input: ResolveDeliveryInput): Promise<DeliveryResolution> {
  // Eşik saatleri burada değil rota çözüldükten sonra okunur, çünkü kesim ve hazırlık kapanışı rotanın kapsamına bağlıdır; kargo
  // yolunda hiç okunmaz.
  const { zones, warehouses } = input.inputs ?? (await readDeliveryInputs(db));

  const place = { country: input.country ?? 'FR', postalCode: input.postalCode };
  const resolution = resolveWarehouseForPostalCode(place, zones, warehouses, input.business);
  // Kargo deposu ÜLKEDEN türer, rotadan değil — rota içindeki müşteri de kargo dolgusu alabilir.
  const shippingWarehouseId = findShippingWarehouse(place.country, warehouses, input.business)?.id ?? null;

  // Çözümsüz: aynı kod iki bölgede, kargo deposu tanımlı değil ya da adres kargo göndermeyen işin bölgesi dışında; üçü de sipariş
  // verilemez demektir ama sebepleri ayrıdır.
  if (resolution.kind === 'unresolved') {
    return {
      deliveryType: 'shipping',
      zoneId: null,
      warehouseId: null,
      shippingWarehouseId,
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
      shippingWarehouseId,
      unresolvedReason: null,
      availableDates: [],
      requiresDateChoice: false,
      shippingBlockedReason: input.hasNonShippableItem ? 'cold_chain' : null,
    };
  }

  /**
   * Eşikler bu rotanın kapsamıyla okunur (`{ zoneId }`); hazırlık kapanışı da okunur, çünkü kesimin hangi güne ait olduğunu o
   * belirler (`cutoffBelongsToPreviousDay`).
   */
  const settings = new SettingsService(db);
  const scope = { zoneId: resolution.zoneId };
  const [cutoffTime, prepCutoffTime] = await Promise.all([
    settings.get<string>(ORDER_CUTOFF_KEY, ORDER_CUTOFF_DEFAULT, scope),
    settings.get<string>(PREP_CUTOFF_KEY, PREP_CUTOFF_DEFAULT, scope),
  ]);

  const availableDates = upcomingDeliveryDates({
    weekdays: resolution.weekdays,
    now: input.now ?? new Date(),
    cutoffTime,
    prepCutoffTime,
    count: input.dateCount ?? 3,
  });

  return {
    deliveryType: 'route',
    zoneId: resolution.zoneId,
    warehouseId: resolution.warehouseId,
    shippingWarehouseId,
    unresolvedReason: null,
    availableDates,
    requiresDateChoice: availableDates.length > 1,
    shippingBlockedReason: null,
  };
}
