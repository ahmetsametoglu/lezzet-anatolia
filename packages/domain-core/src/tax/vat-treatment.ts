import { SELLER_COUNTRY, type Channel, type Country, type VatTreatment } from '@lezzet/types';

/**
 * KDV işleme tipi — müşterinin ödediği tutarı ve uygulanan oranı belirlediği için sipariş anında verilir; beyan/OSS muhasebenindir
 * (DOMAIN §5, docs/feature/ulke-pazari.md). Satış yalnız satıcının ülkesindeki depodan çıkar: başka ülkedeki depodan satış o ülkede
 * yerel satıştır ve desteklenmez.
 */

/**
 * **Siparişe YAZILMIŞ işlemeden KDV'siz mi** — `resolveVatTreatment`in `zeroRated`ının kalıcı hâli. Sonradan okuyan her yüzey
 * (dışa aktarım, kârlılık, sipariş detayı) soruyu kolondan sorar, çünkü kararın girdileri sonradan değişebilir.
 */
export function isZeroRated(treatment: VatTreatment): boolean {
  return treatment === 'intra_eu_b2b_reverse_charge';
}

/** Siparişe yazılmış işlemenin oran ülkesi, `resolveVatTreatment`in `rateCountry`sinin kalıcı hâli; ters yüklemede `null`. */
export function rateCountryOf(treatment: VatTreatment, deliveryCountry: Country): Country | null {
  if (isZeroRated(treatment)) return null;
  return treatment === 'intra_eu_distance_oss' ? deliveryCountry : SELLER_COUNTRY;
}

export interface VatTreatmentInput {
  channel: Channel;
  /** Malın çıktığı deponun fiziksel ülkesi. */
  originCountry: Country;
  /** Teslimat ülkesi — kimlik değil, malın gittiği yer belirler. */
  deliveryCountry: Country;
  /** Müşterinin AB vergi numarası VIES ile doğrulanmış mı (`Customer.vat_number_valid`). */
  vatNumberValid?: boolean;
  /**
   * Eşik durumu (`distanceSaleThreshold`): `true` varış ülkesinin, `false` satıcının oranı, `null` bilinmiyor. Yalnız AB'deki
   * tüketiciye satışta okunur; öteki satışlar `null` geçebilir.
   */
  destinationTaxation: boolean | null;
}

export type VatDecision =
  | {
      ok: true;
      treatment: VatTreatment;
      /** Oranın okunacağı ülke (`applicableVatRate`); ters yüklemede `null`, oran sıfırdır. */
      rateCountry: Country | null;
      zeroRated: boolean;
      /** Faturaya basılacak yasal ibare (yalnız ters yüklemede). */
      invoiceNote: 'Autoliquidation' | null;
    }
  | {
      ok: false;
      /** `origin_not_seller`: depo satıcının ülkesinde değil; `threshold_unknown`: tüketiciye AB satışında eşik durumu verilmedi. */
      reason: 'origin_not_seller' | 'threshold_unknown';
    };

/**
 * Ters yükleme: AB içi işletme satışı ve VIES'te doğrulanmış numara; doğrulanmamış numara %0 açmaz, çünkü yanlış %0'ın bedelini biz
 * öderiz. Çıkış her zaman satıcının ülkesi olduğu için yalnız varış ülkesine bakar; ödeme ve sepet ekranı oranı sormadan bunu sorar.
 */
export function reverseChargeApplies(input: Pick<VatTreatmentInput, 'channel' | 'deliveryCountry' | 'vatNumberValid'>): boolean {
  return input.deliveryCountry !== SELLER_COUNTRY && input.channel === 'b2b' && input.vatNumberValid === true;
}

export function resolveVatTreatment(input: VatTreatmentInput): VatDecision {
  if (input.originCountry !== SELLER_COUNTRY) return { ok: false, reason: 'origin_not_seller' };
  if (input.deliveryCountry === SELLER_COUNTRY) return taxed('domestic', SELLER_COUNTRY);
  if (reverseChargeApplies(input)) {
    return { ok: true, treatment: 'intra_eu_b2b_reverse_charge', rateCountry: null, zeroRated: true, invoiceNote: 'Autoliquidation' };
  }
  // Numarası doğrulanmamış işletme satıcının KDV'sini öder ve eşiğe girmez: eşik yalnız tüketiciye uzaktan satışındır.
  if (input.channel === 'b2b') return taxed('domestic', SELLER_COUNTRY);
  if (input.destinationTaxation === null) return { ok: false, reason: 'threshold_unknown' };
  return input.destinationTaxation
    ? taxed('intra_eu_distance_oss', input.deliveryCountry)
    : taxed('intra_eu_distance_origin', SELLER_COUNTRY);
}

function taxed(treatment: VatTreatment, rateCountry: Country): VatDecision {
  return { ok: true, treatment, rateCountry, zeroRated: false, invoiceNote: null };
}
