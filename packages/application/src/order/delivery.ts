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
import type { WarehouseCandidate, ZoneWithWarehouse } from '@lezzet/domain-core';
import type { AddressDeliveryType } from '@lezzet/types';
import type { Country } from '@lezzet/types';

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
 *
 * ── TERFİ (aşama 2/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/lib/order/delivery.ts`tı; web kopyası KÖPRÜ olarak duruyor. Kural tarafında
 * hiçbir şey değişmedi — değişen yalnız kapının taşımayla bağını kesen iki şey:
 *   · `db` çağırandan gelir (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni.
 *   · Bölge + depo listeleri **çözülmüş hâliyle geçilebilir** (`inputs`). Web'de bu liste ikilisi
 *     `react.cache()`li ortak bir okumadan (`lib/delivery/inputs`) geliyordu ve amacı hız değil
 *     TUTARLILIKTI: aynı istekte sepet bir depoyu, katalog başka bir depoyu görmesin. İstek
 *     kapsamı pakette yok, ama tutarlılık ihtiyacı var — o yüzden önbellek yerine AÇIK bir girdi:
 *     iki kez çözen çağıran (checkout taslağı) listeyi bir kez okur, ikisine de aynısını verir.
 *     Verilmezse burası kendisi okur; kimse bir şeyi unutmak zorunda kalmasın.
 */

export interface DeliveryResolution {
  /**
   * `AddressDeliveryType` — bu çözüm bir ADRESTEN çıkar, `pickup` üretemez (26.08). Yerinde satışın
   * adresi yoktur; müşteri tezgâhın önündedir ve posta kodu → bölge → depo zinciri hiç çalışmaz.
   */
  deliveryType: AddressDeliveryType;
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
  /**
   * Ülkenin KARGO deposu (19.11) — `warehouseId`'den ayrı. Rota içindeki adres için de doludur:
   * sepetin kargo grubu (kendi deposunda olmayan kargolanabilir kalemler) oradan çıkacak ve
   * ikinci taslak onu isteyecek. `null` = o ülkeye kargo yapılmıyor.
   */
  shippingWarehouseId: string | null;
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

/**
 * Yer çözümünün girdileri — aktif depolar + (aktiflik süzgecisiz) bölgeler.
 *
 * Motorun sözleşmesinden TÜRER, elle yeniden tanımlanmaz: `resolveWarehouseForPostalCode` ne
 * bekliyorsa o. İkinci bir şekil yazsaydık motor bir alan eklediğinde burası sessizce eksik kalırdı.
 */
export interface DeliveryInputs {
  zones: readonly ZoneWithWarehouse[];
  warehouses: readonly WarehouseCandidate[];
}

/**
 * Girdileri okur — çağıran bir kez okuyup iki çözüme birden verebilsin diye AYRI bir kapı.
 *
 * Bölgeler AKTİFLİK SÜZGECİSİZ (19.16a): pasif bölgedeki kod da bizim kaydımızdır ve ülkesi ondan
 * türer — süzersek kapalı bölgedeki müşteri "bu kodu tanımadık" cevabı alır, oysa doğru cevap
 * "rota kapalı, kargoyla gönderiyoruz". Rotanın açık olup olmadığına MOTOR karar verir
 * (`matchZones` pasifleri zaten eliyor); okuma o kararı önden vermemeli.
 */
export async function readDeliveryInputs(db: Db): Promise<DeliveryInputs> {
  const [zones, warehouses] = await Promise.all([
    new DeliveryZoneService(db).listWithCodes(),
    new WarehouseService(db).list({ activeOnly: true }),
  ]);
  return { zones, warehouses };
}

export interface ResolveDeliveryInput {
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
  /**
   * Bölge + depo listeleri ÇOKTAN okunmuşsa (bkz. `readDeliveryInputs` künyesi). Verilmezse burası
   * okur. Aynı çözümü iki kez yapan çağıranın iki turda FARKLI liste görmemesi için var.
   */
  inputs?: DeliveryInputs;
}

export async function resolveDelivery(db: Db, input: ResolveDeliveryInput): Promise<DeliveryResolution> {
  // Bölge + depo listeleri ORTAK: aynı iki listeyi vitrinin yer bağlamı da okuyor. İki ayrı okuma
  // iki farklı ana ait olabilirdi ve o hâlde aynı istekte sepet bir depoyu, katalog başka bir
  // depoyu görürdü. Ucuz olması da checkout'ta işe yarıyor: teslimat bir kez depoyu vermek, bir kez
  // de sepet bilindikten sonra kargo kararını vermek için iki kez çözülebiliyor — çağıran listeyi
  // bir kez okuyup `inputs` ile geçtiğinde ikinci tur gerçekten bedava.
  //
  // **EŞİK SAATLERİ BURADA OKUNMUYOR, ROTA ÇÖZÜLDÜKTEN SONRA OKUNUYOR** (17.08 — ölçülmüş açık).
  // Eskiden kesim bu `Promise.all` içinde, bölge çözümünden ÖNCE ve kapsam bağlamı OLMADAN okunuyordu
  // (`get('order_cutoff_time', '16:00')`). Sonucu şuydu: eşikler rota eksenine alınmış olmasına ve
  // operatör rota rayından kesimi 10:00 yazmasına rağmen müşteri hâlâ küresel 16:00'ya göre gün
  // seçiyordu — panel bir şey, checkout başka bir şey söylüyordu. Kapsamı geçirmek için hangi rotaya
  // düşüldüğünü bilmek gerekiyor, o yüzden okuma aşağıya taşındı.
  //
  // Maliyet nötr: ayar okuması `SettingsService`in süreç içi önbelleğinden geçiyor (anahtar başına
  // tek sorgu, 30 sn) ve KARGO yolunda artık hiç okunmuyor — orada kesim kavramı yok.
  const { zones, warehouses } = input.inputs ?? (await readDeliveryInputs(db));

  const place = { country: input.country ?? 'FR', postalCode: input.postalCode };
  const resolution = resolveWarehouseForPostalCode(place, zones, warehouses);
  // Kargo deposu ÜLKEDEN türer, rotadan değil — rota içindeki müşteri de kargo dolgusu alabilir.
  const shippingWarehouseId = findShippingWarehouse(place.country, warehouses)?.id ?? null;

  // Çözümsüz: ya aynı kod iki bölgede (veri çakışması) ya da kargo deposu tanımlı değil. İkisi de
  // sipariş verilemez demektir ama SEBEPLERİ ayrıdır — biri veri hatası, öteki yapılandırma eksiği.
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
   * Eşikler **bu rotanın** kapsamıyla okunuyor (`{ zoneId }`): her rota kendi kesimini ve hazırlık
   * kapanışını taşıyor (kullanıcı kararı 17.08). Hazırlık da okunuyor çünkü kesimin hangi güne ait
   * olduğunu o belirliyor — `cutoffBelongsToPreviousDay`.
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
