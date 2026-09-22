import type { AnnouncedShipment, ParcelSpec, ParcelStatus, RemoteShipment, ServicePoint, ShippingQuote } from '@lezzet/sendcloud';

/**
 * Kargo sağlayıcısının portu; arkasında bugün Sendcloud var. Tipler bilinçli olarak `@lezzet/sendcloud`ten gelir: ikinci bir
 * sözleşme iki tipi elle eşlemek olurdu, sağlayıcı değişirse tipler o gün porta taşınır.
 */
export interface ShippingRateProvider {
  /** Teklif — hiçbir şey yaratmaz, para harcamaz. */
  quote(args: { from: SenderAddress; to: RecipientAddress; parcels: readonly ParcelSpec[] }): Promise<ShippingQuote[]>;
  /** Gönderiyi duyurur ve etiketi alır — gerçek para harcar; yeniden deneme yok, çünkü ikinci çağrı ikinci koli açar. */
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
  /** Gönderinin koli koli durumu; tek koliye bakan okuma çok kolili siparişi erken teslim sayardı. */
  status(providerShipmentId: string): Promise<ParcelStatus[]>;
  /** Sağlayıcıdaki gönderiler, öksüz nöbetinin girdisi; `truncated` taranamayan kuyruğun "öksüz yok" diye okunmasını önler. */
  listRecent(args: { announcedAfter?: Date; pageSize?: number; maxPages?: number }): Promise<{ shipments: RemoteShipment[]; truncated: boolean }>;
  /** Bir taşıyıcının adrese yakın açık teslim noktaları. */
  servicePoints(args: { countryCode: string; postalCode: string; city?: string; carrierCode: string }): Promise<ServicePoint[]>;
  /** Tek nokta; yoksa `null`. */
  servicePoint(id: string): Promise<ServicePoint | null>;
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
