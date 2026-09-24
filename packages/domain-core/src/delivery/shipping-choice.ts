import type { AddressDeliveryType } from '@lezzet/types';

/**
 * Kargo servisinin seçimi, saf karar. Kargoyu müşteri ödüyorsa seçim onundur ve teslim noktası da bir seçenektir;
 * eşik geçilip kargo ücretsizse parayı biz ödüyoruz, koli eve gider ve müşteriye bir şey sorulmaz.
 */

/** Sağlayıcıların "son adım" değeri; eve teslim bu. Dize olarak taşınıyor — `domain-core` sağlayıcı paketini bilmez. */
export const HOME_DELIVERY = 'home_delivery';

/** Son adımı bir noktada biten servisler: sipariş bir teslim noktası seçilmeden verilemez. */
const POINT_LAST_MILES: readonly string[] = ['service_point', 'locker', 'locker_or_service_point'];

/** Bu servis teslim noktası ister mi. */
export function needsServicePoint(lastMile: string | null): boolean {
  return lastMile !== null && POINT_LAST_MILES.includes(lastMile);
}

/**
 * Servisin son adımı bu türdeki noktaya teslim ediyor mu: dolap servisi yalnız dolaba, nokta servisi dükkâna ve postaneye gider,
 * "dolap ya da nokta" servisi türe bakmaz. Tür uymazsa etiket, noktanın ağında olmayan bir servisle kesilirdi.
 */
export function servicePointAccepts(lastMile: string | null, kind: string | null): boolean {
  if (lastMile === 'locker_or_service_point') return true;
  if (lastMile === 'locker') return kind === 'locker';
  if (lastMile === 'service_point') return kind === 'servicepoint' || kind === 'post_office';
  return false;
}

/**
 * Etiketli ikizi olan etiketsiz (QR) servis düşer; ikiz, aynı taşıyıcının aynı son adımlı etiketli servisidir. Etiketi depo bastığı
 * için etiketsiz servis ancak ikizi yoksa kalır.
 */
export function preferLabelled<T extends { carrierCode: string; lastMile: string | null; labelless: boolean }>(options: readonly T[]): T[] {
  return options.filter(
    (o) => !o.labelless || !options.some((twin) => !twin.labelless && twin.carrierCode === o.carrierCode && twin.lastMile === o.lastMile),
  );
}

/**
 * Haritanın listesi: her nokta, türünü kabul eden en ucuz servisiyle; en ucuz başta, aynı fiyatta yakın önce. Taşıyıcının en ucuz
 * servisi noktanın servisi olmayabilir (dolap servisi dükkâna gitmez); kabul eden servisi olmayan nokta listeye girmez.
 */
export function orderServicePoints<
  P extends { carrierCode: string; kind: string | null; distanceM: number | null },
  O extends { carrierCode: string; lastMile: string | null; priceCents: number },
>(points: readonly P[], options: readonly O[]): { point: P; option: O }[] {
  return points
    .flatMap((point) => {
      const option = options
        .filter((o) => o.carrierCode === point.carrierCode && servicePointAccepts(o.lastMile, point.kind))
        .sort((a, b) => a.priceCents - b.priceCents)[0];
      return option ? [{ point, option }] : [];
    })
    .sort((a, b) => a.option.priceCents - b.option.priceCents || (a.point.distanceM ?? Infinity) - (b.point.distanceM ?? Infinity));
}

/**
 * Bu siparişin taşıması EVE mi gitmek zorunda? Ölçüt eşik değil ücretin sıfır olması, çünkü kampanyayla sıfırlanan
 * kargoyu da biz ödüyoruzdur; rota ve gel-al siparişinde kargo yoktur.
 */
export function requiresHomeDelivery(order: { deliveryType: AddressDeliveryType | 'pickup'; shippingFeeCents: number }): boolean {
  return order.deliveryType === 'shipping' && order.shippingFeeCents === 0;
}

/** Eve teslim edenleri süz. Son adımı bilinmeyen (`null`) seçenek elenir: "bilmiyorum" ile "eve gidiyor" aynı şey değil. */
export function homeDeliveryOnly<T extends { lastMile: string | null }>(options: readonly T[]): T[] {
  return options.filter((o) => o.lastMile === HOME_DELIVERY);
}

/**
 * Müşteriye gösterilen eve teslim servisleri: en ucuz ve en hızlı (süresi bilinenler içinde, eşitse ucuz olan); ikisi aynıysa tek.
 * Aynı taşıyıcının saat, cumartesi ve imza kademeleri müşteriye ayrı bir karar sunmuyor, listeyi yalnız uzatıyordu.
 */
export function homeShortlist<T extends { code: string; lastMile: string | null; priceCents: number; leadTimeHours: number | null }>(
  options: readonly T[],
): T[] {
  const home = [...homeDeliveryOnly(options)].sort((a, b) => a.priceCents - b.priceCents);
  const cheapest = home[0];
  if (!cheapest) return [];
  const fastest = home
    .filter((o) => o.leadTimeHours !== null)
    .sort((a, b) => a.leadTimeHours! - b.leadTimeHours! || a.priceCents - b.priceCents)[0];
  return fastest && fastest.code !== cheapest.code ? [cheapest, fastest] : [cheapest];
}

export type ShippingChoice<T> =
  | { ok: true; option: T }
  /** İstenen servis bu sepette yok (liste değişti ya da çok kutu onu düşürdü). */
  | { ok: false; reason: 'unavailable' }
  /** Seçim bize kalmış ama eve teslim eden hiçbir servis yok. */
  | { ok: false; reason: 'no_home_option' };

/**
 * Siparişin servisi. Ücretsiz kargoda istenen koda bakılmaz ve eve giden en ucuz alınır; müşteri ödüyorsa istediği
 * servis, istemediyse yine eve giden en ucuz — seçmeyen müşterinin kolisi bir noktaya gitmez.
 */
export function chooseShippingOption<T extends { code: string; lastMile: string | null; priceCents: number }>(
  options: readonly T[],
  input: { free: boolean; requestedCode: string | null },
): ShippingChoice<T> {
  if (!input.free && input.requestedCode !== null) {
    const requested = options.find((o) => o.code === input.requestedCode);
    return requested ? { ok: true, option: requested } : { ok: false, reason: 'unavailable' };
  }
  const cheapestHome = [...homeDeliveryOnly(options)].sort((a, b) => a.priceCents - b.priceCents)[0];
  return cheapestHome ? { ok: true, option: cheapestHome } : { ok: false, reason: 'no_home_option' };
}
