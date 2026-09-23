import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { POSTAL_CODE_PATTERN } from '@lezzet/address';
import { readPickupOffer } from '@lezzet/application';
import { AddressService, PostalCodePlaceService, serviceDb } from '@lezzet/database';
import { findShippingWarehouse, resolvePlaceByPostalCode, type PostalCodeResolution } from '@lezzet/domain-core';
import type { Address, CheckoutPickup, Warehouse } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { describePlace } from './describe-place';
import { readDeliveryInputs } from './inputs';
import { readPickupCookie } from './pickup-cookie';
import { toPlaceAddress, type PlaceAnswer, type PlaceSnapshot } from './place-types';

/*
  Render anında hangi deponun stoğunun okunacağı buradan çözülür. `cache()` istek başına tek çözüm verir; bu hız değil tutarlılık
  aracıdır, aynı sayfada iki farklı depo cevabı çıkmasın.
*/

interface PlaceContext {
  answer: PlaceAnswer | null;
  resolution: PostalCodeResolution | null;
  /** Girişli ve adresli müşterinin varsayılan adresi; ziyaretçide ve adressiz müşteride `null`, o hâlde `answer` çerezden gelir. */
  address: Address | null;
  /** Gel-al teklifi (izinli müşteride) ve çerezdeki seçimin kapıdan geçmiş hâli; seçim yoksa `pickupWarehouse` null. */
  pickup: CheckoutPickup | null;
  pickupWarehouse: Warehouse | null;
  /** `null`: yer bilinmiyor; okuma depo-üstüne düşer ve orada "var" bir vaat değildir. */
  warehouseId: string | null;
  /**
   * Rota içindeki müşteride de dolu: "deponda yok ama kargoyla gönderebiliriz" cevabı kargo deposunun stoğunu bilmeyi gerektirir ve
   * yer çözümü rota bulunca kargo deposunu hiç aramaz.
   */
  shippingWarehouseId: string | null;
}

const EMPTY: PlaceContext = { answer: null, resolution: null, warehouseId: null, shippingWarehouseId: null, address: null, pickup: null, pickupWarehouse: null };

/** Aynı kod birden çok bileşenden sorulabilir; tablo yılda bir yenilendiği için bayatlamaz. */
const getPostalMatches = cache(async (postalCode: string) =>
  new PostalCodePlaceService(serviceDb()).findByPostalCode(postalCode),
);

/** Kayıtlı adresi olan müşteride çerez değil adres konuşur; yoksa sepet ve ödeme aynı müşteriye farklı teslimat yolu gösterirdi. */
const readDefaultAddress = cache(async (): Promise<Address | null> => {
  const customerId = await currentCustomerId();
  if (!customerId) return null;
  const rows = await new AddressService(serviceDb()).listByCustomer(customerId);
  return rows.find((row) => row.isDefault) ?? null;
});

/** Kod çözülemezse yer bilinmiyor sayılır ve hata fırlatılmaz: cevaplanmamış soru arıza değildir. */
/** Çerezdeki gel-al seçimi teklif kapısından geçer (izin × gel-al deposu); misafirde teklif yoktur. */
const readPickupSelection = cache(async (): Promise<{ offer: CheckoutPickup | null; warehouse: Warehouse | null }> => {
  const customerId = await currentCustomerId();
  if (!customerId) return { offer: null, warehouse: null };
  return readPickupOffer(serviceDb(), customerId, await readPickupCookie());
});

const readPlaceContext = cache(async (): Promise<PlaceContext> => {
  const address = await readDefaultAddress();
  const pickup = await readPickupSelection();
  const answer = address ? { country: address.country, postalCode: address.postalCode } : await readPlaceAnswerFromCookie();
  // Adres yokken de gel-al seçilebilir: sepet o zaman deponun stoğuyla okunur, adres yalnız faturadır.
  if (!answer) return { ...EMPTY, pickup: pickup.offer, pickupWarehouse: pickup.warehouse };

  const [{ zones, warehouses }, matches] = await Promise.all([readDeliveryInputs(), getPostalMatches(answer.postalCode)]);

  // Cevaptaki ülke süzgeçtir: belirsizlik bir kez çözülüp saklandı; kod o ülkede yoksa çözüm `unknown`a düşer.
  const scoped = matches.filter((m) => m.country === answer.country);
  const resolution = resolvePlaceByPostalCode(answer.postalCode, scoped, zones, warehouses);

  const resolved = resolution.kind === 'route' || resolution.kind === 'shipping';
  return {
    answer,
    resolution,
    address,
    pickup: pickup.offer,
    pickupWarehouse: pickup.warehouse,
    /**
     * Yalnız rota deposu: çözüm kargo hâlinde bu alana kargo deposunu koyar ve olduğu gibi yayılsaydı rota dışındaki müşteri rota
     * deposundaymış gibi stok görürdü.
     */
    warehouseId: resolution.kind === 'route' ? resolution.warehouseId : null,
    // Kargo deposu ülkeden türer, rotadan değil: rota içindeki müşteri de kargo dolgusu alabilir.
    shippingWarehouseId: resolved ? (findShippingWarehouse(resolution.country, warehouses)?.id ?? null) : null,
  };
});

/** İki depo birlikte döner: "yerelde yok" tek başına "tükendi" değildir, kargo deposunda varsa ürün satılabilir. */
export async function readPlaceWarehouses(): Promise<{ warehouseId: string | null; shippingWarehouseId: string | null }> {
  const { warehouseId, shippingWarehouseId, pickupWarehouse } = await readPlaceContext();
  // Gel-al'da okumalar SEÇİLEN DEPONUN stoğuyla yapılır; kargo dolgusu yoktur (depoda olmayan kalem "burada yok").
  if (pickupWarehouse) return { warehouseId: pickupWarehouse.id, shippingWarehouseId: null };
  return { warehouseId, shippingWarehouseId };
}

/** Depoyu değil yalnız yeri isteyen çağıran için: "gelince haber ver" kaydı müşterinin yeri hakkındadır, iç coğrafyamız hakkında değil. */
export const readPlaceAnswer = cache(async (): Promise<PlaceAnswer | null> => (await readPlaceContext()).answer);

/** Layout'un ilk karesi, istemci yeri ikinci bir turla çözmesin diye. Tarif sayımsızdır, çünkü sayfa açılışı bir niyet değildir. */
export const readPlaceSnapshot = cache(async (): Promise<PlaceSnapshot> => {
  const { answer, resolution, address, pickup } = await readPlaceContext();
  const placeAddress = address ? toPlaceAddress(address) : null;
  if (!answer || !resolution || (resolution.kind !== 'route' && resolution.kind !== 'shipping')) {
    // Karşılanamayan yerin sebebi taşınır ki sepet "buraya gönderemiyoruz" diyebilsin.
    return { place: null, address: placeAddress, unresolved: resolution?.kind === 'unresolved' ? resolution.reason : null, pickup };
  }
  const [{ zones }, matches] = await Promise.all([readDeliveryInputs(), getPostalMatches(answer.postalCode)]);
  const place = await describePlace(
    answer.postalCode,
    { country: resolution.country, placeName: resolution.placeName, places: resolution.places },
    zones,
    matches,
  );
  return { place, address: placeAddress, unresolved: null, pickup };
});

/**
 * Kapsamlı ayarın yer eksenleri: bölge kimliği çerezden değil çözümden gelir, çünkü uydurulmuş çerez hangi asgari sepetin
 * uygulanacağını belirlememeli. Sepet ve ödeme aynı kaynağı okur ki sepette yazan eşik ödemede başka çıkmasın.
 */
export async function readPlaceScope(): Promise<{
  country: string | null;
  zoneId: string | null;
  warehouseId: string | null;
  shippingWarehouseId: string | null;
  /** Gel-al seçili: sepet eşiği gel-al kuralından okunur (`getCartView`). */
  pickup: boolean;
}> {
  const { answer, resolution, warehouseId, shippingWarehouseId, pickupWarehouse } = await readPlaceContext();
  // Gel-al: kapsam deponun ülkesi ve kendisidir; bölge yok, kargo deposu yok.
  if (pickupWarehouse) {
    return { country: pickupWarehouse.countryCode, zoneId: null, warehouseId: pickupWarehouse.id, shippingWarehouseId: null, pickup: true };
  }
  return {
    pickup: false,
    country: answer?.country ?? null,
    zoneId: resolution?.kind === 'route' ? resolution.zoneId : null,
    // Kargo deposu da buradan çıkar: `warehouseId` yalnız rota deposu olduğundan, onsuz rota dışı müşteri kargo havuzunu kaybederdi.
    warehouseId,
    shippingWarehouseId,
  };
}

/**
 * Ekran kipi depo kimliklerinden türetemez, çünkü kargo çözümü de depo verir; türetme her sayfada ayrı yapılsaydı bir gün ayrışırdı.
 * Kip çerezden değil çözümden okunur.
 */
export type PlaceMode = 'unknown' | 'route' | 'shipping' | 'pickup';

export async function readPlaceMode(): Promise<PlaceMode> {
  const { resolution, pickupWarehouse } = await readPlaceContext();
  if (pickupWarehouse) return 'pickup';
  if (resolution?.kind === 'route') return 'route';
  if (resolution?.kind === 'shipping') return 'shipping';
  return 'unknown';
}

async function readPlaceAnswerFromCookie(): Promise<PlaceAnswer | null> {
  const raw = (await cookies()).get('lezzet.place.v2')?.value;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const row = parsed as Record<string, unknown>;
    // İstemciden gelen her şey şüphelidir; uymayan çerez yok sayılır, bozuk çerez yüzünden sayfa çökmez.
    if (typeof row.postalCode !== 'string' || !POSTAL_CODE_PATTERN.test(row.postalCode)) return null;
    if (row.country !== 'FR' && row.country !== 'DE') return null;
    return { country: row.country, postalCode: row.postalCode };
  } catch {
    return null;
  }
}

/** Checkout'un gel-al girdisi: seçim ekrandan değil yerden gelir — tek kaynak çerez + teklif kapısı. */
export async function readSelectedPickupWarehouseId(): Promise<string | null> {
  return (await readPlaceContext()).pickupWarehouse?.id ?? null;
}
