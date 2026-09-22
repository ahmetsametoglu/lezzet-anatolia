import { chooseShippingOption, shippingPriceWithVat, type PlannedParcel, type VatLine } from '@lezzet/domain-core';
import type { ServicePoint, ShippingQuote } from '@lezzet/sendcloud';
import type { ParcelPlanSnapshot, ServicePointSnapshot } from '@lezzet/types';

/** Müşteriye sunulan teklif: `priceCents` müşterinin ödediği KDV dahil ücret, `costCents` taşıyıcının KDV hariç fiyatı (bizim maliyetimiz). */
export type PricedQuote = ShippingQuote & { priceCents: number; costCents: number };

/** Taşıyıcı teklifi KDV hariç gelir; müşterinin ücreti sepetin oranlarıyla KDV dahile çevrilir, maliyet olduğu gibi kalır. */
export function pricedOptions(options: readonly ShippingQuote[], lines: readonly VatLine[]): PricedQuote[] {
  return options.flatMap((o) =>
    typeof o.priceCents === 'number' ? [{ ...o, costCents: o.priceCents, priceCents: shippingPriceWithVat(o.priceCents, lines) }] : [],
  );
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
