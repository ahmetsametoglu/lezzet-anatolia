import type { Db } from '@lezzet/database';
import {
  distanceSaleDecision,
  distanceSaleOrderNetCents,
  resolveVatTreatment,
  type RateAmount,
  type VatDecision,
  type VatTreatmentInput,
} from '@lezzet/domain-core';
import { readDistanceSaleBasis } from '../accounting/distance-sale-threshold';

/** Siparişe yazılabilen KDV kararı. */
export type SaleVat = Extract<VatDecision, { ok: true }>;

/** Satıcının ülkesi dışındaki depodan satış desteklenmez; sipariş yazılmaz ve sebep çağırana tipli döner. */
export type SaleVatOutcome = { ok: true; vat: SaleVat } | { ok: false; reason: 'sale_origin_unsupported' };

export interface SaleVatInput extends Omit<VatTreatmentInput, 'destinationTaxation'> {
  /** Siparişin kalemleri satıcının oranlarıyla; eşik yalnız AB'deki tüketiciye uzaktan satışta okunur. */
  goods: readonly RateAmount[];
  pricesIncludeVat: boolean;
  now?: Date;
}

/**
 * Siparişi yazan kapıların KDV kararı; uzaktan satışta eşik, siparişin KDV hariç tutarı katılarak okunur (mandal dahil). Eşiğe aynı
 * anda düşen iki siparişin ikisi de eşik altı toplamı okuyup satıcının oranıyla yazılabilir; bilinen sınırdır.
 */
export async function decideSaleVat(db: Db, input: SaleVatInput): Promise<SaleVatOutcome> {
  const { goods, pricesIncludeVat, now, ...treatment } = input;
  let decision = resolveVatTreatment({ ...treatment, destinationTaxation: null });
  if (!decision.ok && decision.reason === 'threshold_unknown') {
    const basis = await readDistanceSaleBasis(db, now);
    const orderNetCents = distanceSaleOrderNetCents(goods, pricesIncludeVat);
    decision = resolveVatTreatment({
      ...treatment,
      destinationTaxation: distanceSaleDecision({ ...basis, orderNetCents }).destinationTaxation,
    });
  }
  return decision.ok ? { ok: true, vat: decision } : { ok: false, reason: 'sale_origin_unsupported' };
}
