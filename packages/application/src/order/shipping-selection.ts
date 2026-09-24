import { chooseShippingOption, preferLabelled, shippingPriceWithVat, type PlannedParcel, type VatLine } from '@lezzet/domain-core';
import type { ServicePoint, ShippingQuote } from '@lezzet/sendcloud';
import type { ParcelPlanSnapshot, ServicePointSnapshot } from '@lezzet/types';
import type { CartLine } from '../cart/cart-types';

/** Müşteriye sunulan teklif: `priceCents` müşterinin ödediği KDV dahil ücret, `costCents` taşıyıcının KDV hariç fiyatı (bizim maliyetimiz). */
export type PricedQuote = ShippingQuote & { priceCents: number; costCents: number };

/**
 * Taşıyıcı teklifi KDV hariç gelir; müşterinin ücreti sepetin oranlarıyla KDV dahile çevrilir, maliyet olduğu gibi kalır. Etiketli ikizi
 * olan etiketsiz servis listeye girmez; ekran ile taslak aynı listeden seçtiği için istemci onu isteyemez de.
 */
export function pricedOptions(options: readonly ShippingQuote[], lines: readonly VatLine[]): PricedQuote[] {
  return preferLabelled(options).flatMap((o) =>
    typeof o.priceCents === 'number' ? [{ ...o, costCents: o.priceCents, priceCents: shippingPriceWithVat(o.priceCents, lines) }] : [],
  );
}

/**
 * Kargo ücretine KDV ekleyen satırlar; ekran ve taslak bu tek kaynaktan okur ki gösterilen ücret alınanla aynı olsun. Ücret herkes
 * için aynı kuralla bulunur: ters vergilendirme yalnız kalemlerin KDV'sini sıfırlar, paket satırı kalemlerinin en yüksek oranını taşır.
 */
export function shippingVatLines(lines: readonly Pick<CartLine, 'lineTotalCents' | 'vatRate'>[]): VatLine[] {
  return lines.map((l) => ({ totalCents: l.lineTotalCents ?? 0, vatRate: l.vatRate }));
}

/**
 * Ücret hesabının fiyatını veren servis: istenen listede varsa o, yoksa eve giden en ucuz. Eşik kararı fiyata bakmadığı
 * için servisin son hâli ücret çözüldükten sonra `chooseShippingOption` ile verilir.
 */
export function optionForPricing(options: readonly PricedQuote[], requestedCode: string | null): PricedQuote | null {
  const requested = chooseShippingOption(options, { free: false, requestedCode });
  if (requested.ok) return requested.option;
  const fallback = chooseShippingOption(options, { free: false, requestedCode: null });
  return fallback.ok ? fallback.option : null;
}

export function parcelPlanSnapshot(plan: readonly PlannedParcel[]): ParcelPlanSnapshot {
  return plan.map((p) => ({ shippingBoxId: p.box.id, boxName: p.box.name, weightG: p.weightG, contents: [...p.contents] }));
}

export function servicePointSnapshot(point: ServicePoint): ServicePointSnapshot {
  return {
    id: point.id,
    carrierCode: point.carrierCode,
    name: point.name,
    street: point.street,
    houseNumber: point.houseNumber,
    postalCode: point.postalCode,
    city: point.city,
    country: point.country,
  };
}
