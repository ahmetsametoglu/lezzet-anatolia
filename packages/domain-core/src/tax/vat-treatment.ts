import type { Channel, Country, VatTreatment } from '@lezzet/types';

/**
 * KDV işleme tipi (03.10) — müşterinin ödediği tutarı değiştirdiği için checkout'ta doğru
 * uygulanır; beyan/OSS muhasebenindir (DOMAIN §5).
 *
 * Üç dal:
 * - **FR (her kanal)** → yurt içi Fransız KDV'si.
 * - **DE + B2B + geçerli vergi no** → **reverse charge**: %0 KDV, müşteri kendi ülkesinde beyan
 *   eder; faturaya "Autoliquidation" ibaresi girer. Vergi no VIES ile doğrulanmış olmalıdır —
 *   *doğrulanmamış* numara bu dalı AÇMAZ (yanlış %0 uygulamak bizim riskimizdir).
 * - **DE + B2C** → şimdilik Fransız KDV'si. AB kuralı: Almanya'ya tüketici satışı yıllık 10.000 €
 *   eşiğini aşınca Alman KDV'si + OSS gerekir; eşik aşılana kadar fiyatı etkilemez. Sistem DE B2C
 *   ciroyu izler ve eşiğe yaklaşınca uyarır (izleme 13-analitik'te).
 */

export interface VatTreatmentInput {
  channel: Channel;
  /** Teslimat ülkesi — kimlik değil, malın gittiği yer belirler. */
  deliveryCountry: Country;
  /** Müşterinin AB vergi numarası VIES ile doğrulanmış mı (`Customer.vat_number_valid`). */
  vatNumberValid?: boolean;
}

export interface VatDecision {
  treatment: VatTreatment;
  /** Reverse charge'da %0 uygulanır; aksi halde ürünün kendi oranı geçerlidir. */
  zeroRated: boolean;
  /** Faturaya basılacak yasal ibare (yalnız reverse charge'da). */
  invoiceNote: 'Autoliquidation' | null;
  /** DE B2C: OSS eşiği izlemine bu sipariş dahil edilmeli mi. */
  countsTowardOssThreshold: boolean;
}

export function resolveVatTreatment({ channel, deliveryCountry, vatNumberValid }: VatTreatmentInput): VatDecision {
  const reverseCharge = deliveryCountry === 'DE' && channel === 'b2b' && vatNumberValid === true;

  if (reverseCharge) {
    return {
      treatment: 'intra_eu_b2b_reverse_charge',
      zeroRated: true,
      invoiceNote: 'Autoliquidation',
      countsTowardOssThreshold: false,
    };
  }

  return {
    treatment: 'domestic',
    zeroRated: false,
    invoiceNote: null,
    // Yalnız DE'ye giden tüketici satışı eşiği besler; DE B2B (doğrulanmamış no dahil) beslemez.
    countsTowardOssThreshold: deliveryCountry === 'DE' && channel === 'b2c',
  };
}
