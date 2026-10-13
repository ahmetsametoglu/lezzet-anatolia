import { describe, expect, it } from 'vitest';
import {
  isZeroRated,
  resolveVatTreatment,
  REVERSE_CHARGE_INVOICE_NOTE,
  reverseChargeApplies,
  type VatTreatmentInput,
} from './vat-treatment';

const satis = (over: Partial<VatTreatmentInput> = {}): VatTreatmentInput => ({
  channel: 'b2c',
  originCountry: 'FR',
  deliveryCountry: 'FR',
  destinationTaxation: null,
  ...over,
});

describe('KDV işleme — Fransa içi', () => {
  it('her kanalda yurt içi; oran satıcının ülkesinden okunur ve eşik sorulmaz', () => {
    for (const channel of ['b2c', 'b2b'] as const) {
      expect(resolveVatTreatment(satis({ channel, vatNumberValid: true }))).toEqual({
        ok: true,
        treatment: 'domestic',
        rateCountry: 'FR',
        zeroRated: false,
        invoiceNote: null,
      });
    }
  });
});

describe("KDV işleme — Fransa'dan Almanya'daki tüketiciye uzaktan satış", () => {
  const almanyaTuketici = (destinationTaxation: boolean | null) => satis({ deliveryCountry: 'DE', destinationTaxation });

  it('eşik altında satıcının oranıyla yazılır', () => {
    expect(resolveVatTreatment(almanyaTuketici(false))).toMatchObject({
      ok: true,
      treatment: 'intra_eu_distance_origin',
      rateCountry: 'FR',
      zeroRated: false,
    });
  });

  it('eşik aşılınca varış ülkesinin oranıyla yazılır', () => {
    expect(resolveVatTreatment(almanyaTuketici(true))).toMatchObject({
      ok: true,
      treatment: 'intra_eu_distance_oss',
      rateCountry: 'DE',
      zeroRated: false,
      invoiceNote: null,
    });
  });

  it('eşik durumu verilmezse karar verilmez — oran tahmin edilmez', () => {
    expect(resolveVatTreatment(almanyaTuketici(null))).toEqual({ ok: false, reason: 'threshold_unknown' });
  });
});

describe("KDV işleme — Almanya'daki işletmeye satış", () => {
  it('doğrulanmış vergi numarasında ters yükleme: %0, oran ülkesi yok, faturada ibare', () => {
    expect(resolveVatTreatment(satis({ channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: true }))).toEqual({
      ok: true,
      treatment: 'intra_eu_b2b_reverse_charge',
      rateCountry: null,
      zeroRated: true,
      invoiceNote: REVERSE_CHARGE_INVOICE_NOTE,
    });
  });

  it("doğrulanmamış numara %0 açmaz — satıcının KDV'si, eşik durumu sorulmadan", () => {
    for (const vatNumberValid of [false, undefined]) {
      expect(resolveVatTreatment(satis({ channel: 'b2b', deliveryCountry: 'DE', vatNumberValid }))).toMatchObject({
        ok: true,
        treatment: 'domestic',
        rateCountry: 'FR',
        zeroRated: false,
      });
    }
  });
});

describe('KDV işleme — satıcının ülkesi dışındaki depo', () => {
  it('Almanya deposundan satış reddedilir — yerel satış desteklenmiyor', () => {
    for (const over of [
      { originCountry: 'DE', deliveryCountry: 'DE' },
      { originCountry: 'DE', deliveryCountry: 'FR' },
      { originCountry: 'DE', deliveryCountry: 'DE', channel: 'b2b', vatNumberValid: true },
    ] as const) {
      expect(resolveVatTreatment(satis({ ...over, destinationTaxation: false }))).toEqual({ ok: false, reason: 'origin_not_seller' });
    }
  });
});

describe('isZeroRated — siparişe yazılmış işlemeden okunur', () => {
  it("yalnız ters yükleme KDV'siz sayılır; uzaktan satışın iki türü de KDV'lidir", () => {
    expect(isZeroRated('intra_eu_b2b_reverse_charge')).toBe(true);
    expect(isZeroRated('domestic')).toBe(false);
    expect(isZeroRated('intra_eu_distance_origin')).toBe(false);
    expect(isZeroRated('intra_eu_distance_oss')).toBe(false);
  });

  it('karar anındaki `zeroRated` ve sepetin ters yükleme sorusu aynı cevabı verir', () => {
    for (const over of [
      { channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: true },
      { channel: 'b2b', deliveryCountry: 'DE', vatNumberValid: false },
      { channel: 'b2c', deliveryCountry: 'DE', destinationTaxation: true },
      { channel: 'b2c', deliveryCountry: 'DE', destinationTaxation: false },
      { channel: 'b2c', deliveryCountry: 'FR' },
      { channel: 'b2b', deliveryCountry: 'FR', vatNumberValid: true },
    ] as const) {
      const karar = resolveVatTreatment(satis(over));
      if (!karar.ok) throw new Error('karar bekleniyordu');
      expect(isZeroRated(karar.treatment)).toBe(karar.zeroRated);
      expect(reverseChargeApplies(satis(over))).toBe(karar.zeroRated);
    }
  });
});
