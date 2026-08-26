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

/**
 * **Siparişe YAZILMIŞ işlemeden KDV'siz mi** — `resolveVatTreatment`in `zeroRated`ının kalıcı hâli.
 *
 * Motor sipariş açılırken kararı verip `order.vat_treatment` kolonuna yazıyor; sonradan okuyan
 * her yüzey (muhasebe dışa aktarımı, kârlılık, sipariş detayı) aynı soruyu KOLONDAN sormak
 * zorunda — girdiler (ülke, kanal, vergi no doğrulaması) o an değişmiş olabilir, sipariş anındaki
 * karar ise değişmez.
 *
 * ── NEDEN AYRI BİR FONKSİYON (denetim 26.08) ─────────────────────────────────
 * Bu karşılaştırma depoda ÜÇ yerde elle yazılıydı (`accounting/export` iki kez, `lib/accounting/profit`)
 * ve dördüncü okuyan onu hiç sormamıştı: operasyon sipariş detayı "İçindeki KDV" satırını kendi
 * hesaplıyor, `zeroRated` dalını atlıyordu. Sonucu, KDV'si yasal olarak SIFIR olan bir reverse
 * charge siparişinde ekranda duran hayalet bir vergi tutarıydı.
 *
 * Elle yazılan bir karşılaştırma "unutulabilir" bir karşılaştırmadır; sorulacak bir fonksiyon
 * unutulduğunda en azından aranabilir olur.
 */
export function isZeroRated(treatment: VatTreatment): boolean {
  return treatment === 'intra_eu_b2b_reverse_charge';
}

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
