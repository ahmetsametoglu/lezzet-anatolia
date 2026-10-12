import { resolveVatTreatment, type VatDecision, type VatTreatmentInput } from '@lezzet/domain-core';

/** Siparişe yazılabilen KDV kararı. */
export type SaleVat = Extract<VatDecision, { ok: true }>;

/**
 * Siparişi yazan kapıların KDV kararı. Ret bir yapılandırma hatasıdır (satıcının ülkesi dışındaki depodan satış ya da eksik eşik
 * durumu) ve sipariş yazılmaz; hata çağıranın kaydına düşer.
 */
export function saleVatOf(input: VatTreatmentInput): SaleVat {
  const decision = resolveVatTreatment(input);
  if (!decision.ok) {
    throw new Error(`KDV kararı verilemedi (${decision.reason}): ${input.originCountry} çıkışlı, ${input.deliveryCountry} teslimli satış`);
  }
  return decision;
}
