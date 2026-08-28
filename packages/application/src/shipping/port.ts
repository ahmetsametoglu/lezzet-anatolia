import type { AnnouncedShipment, ParcelSpec, ParcelStatus, RemoteShipment, ShippingQuote } from '@lezzet/sendcloud';

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
  /**
   * **Gönderiyi duyur ve etiketi al — GERÇEK PARA HARCAR.**
   *
   * Port'ta ayrı bir metot çünkü çağıranın sorumluluğu bambaşka: teklif serbestçe çağrılabilir,
   * bu çağrı bir kez ve dikkatle. Yeniden deneme YOK (idempotency anahtarı yok — ikinci çağrı
   * ikinci koli açar).
   */
  announce(args: {
    externalReferenceId: string;
    orderNumber?: string;
    reference?: string;
    from: SenderAddress;
    to: RecipientAddress;
    parcels: readonly ParcelSpec[];
    shippingOptionCode: string;
    servicePointId?: string;
  }): Promise<AnnouncedShipment>;
  /** Gönderiyi iptal et — 404 başarı sayılır, yolda olan koli reddedilir. */
  cancel(providerShipmentId: string): Promise<void>;
  /**
   * **Gönderinin gerçek durumu, KOLİ KOLİ.** Webhook yalnız "değişti" tetikleyicisidir; durumu
   * bu çağrı söyler ("Option B"). Dizi dönüyor çünkü gönderi, en gerideki kolisi kadar
   * ilerlemiştir — tek koliye bakan bir okuma çok kolili siparişi erken teslim sayardı.
   */
  status(providerShipmentId: string): Promise<ParcelStatus[]>;
  /**
   * **Sağlayıcıdaki gönderiler** — öksüz nöbetinin girdisi ve portun tek "bizden bağımsız"
   * okuması. `truncated` sessiz kesme olmasın diye var: taranamayan kuyruk, "öksüz yok" diye
   * okunmamalı.
   */
  listRecent(args: { announcedAfter?: Date; pageSize?: number; maxPages?: number }): Promise<{ shipments: RemoteShipment[]; truncated: boolean }>;
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
