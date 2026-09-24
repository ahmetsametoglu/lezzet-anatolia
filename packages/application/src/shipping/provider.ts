import {
  announceShipment,
  cancelShipment,
  fetchServicePoint,
  fetchShipmentParcels,
  fetchShippingQuotes,
  listShipments,
  searchServicePoints,
  type SendcloudConfig,
} from '@lezzet/sendcloud';
import type { ShippingRateProvider } from './port';

/** Portun Sendcloud uygulaması. Anahtarlar burada okunur: her yüzey kendisi okusaydı yanlış yazılmış bir env adı tek yüzeyde teklifi sessizce kapatırdı. */
export function sendcloudProvider(overrides: Partial<SendcloudConfig> = {}): ShippingRateProvider {
  const config: SendcloudConfig = {
    publicKey: overrides.publicKey ?? process.env.SENDCLOUD_PUBLIC_KEY ?? '',
    secretKey: overrides.secretKey ?? process.env.SENDCLOUD_SECRET_KEY ?? '',
    baseUrl: overrides.baseUrl ?? process.env.SENDCLOUD_API_BASE_URL,
    fetchImpl: overrides.fetchImpl,
  };
  return {
    quote: (args) => fetchShippingQuotes(config, args),
    announce: (args) => announceShipment(config, args),
    cancel: (providerShipmentId) => cancelShipment(config, providerShipmentId),
    status: (providerShipmentId) => fetchShipmentParcels(config, providerShipmentId),
    listRecent: (args) => listShipments(config, args),
    servicePoints: (args) => searchServicePoints(config, args),
    servicePoint: (id) => fetchServicePoint(config, id),
  };
}

/** Sağlayıcı yapılandırılmış mı — ekran "canlı teklif kapalı" diyebilsin diye. */
export function shippingProviderConfigured(): boolean {
  return Boolean(process.env.SENDCLOUD_PUBLIC_KEY && process.env.SENDCLOUD_SECRET_KEY);
}
