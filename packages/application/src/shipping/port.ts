import type { ParcelSpec, ShippingQuote } from '@lezzet/sendcloud';

/**
 * **KARGO TARİFESİ PORTU** — sağlayıcı bir UYGULAMADIR, sözleşme değil (`packages/ai` deseni).
 *
 * Uygulama katmanı bu arayüzü çağırır; arkasında bugün Sendcloud var, yarın başkası olabilir ve
 * iş kodu değişmez (`INTEGRATIONS.md`: *"her dış servis agnostik bir arayüzün arkasında yaşar"*).
 *
 * **Tipler `@lezzet/sendcloud`ten ithal ediliyor ve bu bilinçli bir ödün:** ikinci bir dar
 * sözleşme yazmak, iki tipi elle eşlemek ve bir gün ayrışmalarını izlemek demekti (`CLAUDE §1`
 * duplication). Sağlayıcı değiştiği gün bu iki tip pakete taşınır — o gün gelene kadar
 * tek kaynak Sendcloud paketinin kendi yüzeyidir. Ayrışma riski bugün SIFIR, ve gerçek olmayan
 * bir riske karşı yazılan soyutlama ölü koddur.
 */
export interface ShippingRateProvider {
  /** Teklif — hiçbir şey yaratmaz, para harcamaz. */
  quote(args: { from: SenderAddress; to: RecipientAddress; parcels: readonly ParcelSpec[] }): Promise<ShippingQuote[]>;
}

export interface SenderAddress {
  countryCode: string;
  postalCode: string;
  city?: string;
  name?: string;
  addressLine1?: string;
}

export interface RecipientAddress {
  countryCode: string;
  postalCode: string;
  city?: string;
}
