import { announceShipment, cancelShipment, fetchShippingQuotes, type SendcloudConfig } from '@lezzet/sendcloud';
import type { ShippingRateProvider } from './port';

/**
 * Sendcloud uygulaması — portu gerçek sağlayıcıya bağlar.
 *
 * **Anahtarlar ENV'den ve burada okunuyor**, çağıranlarda değil: üç yüzey (sepet, checkout,
 * hazırlık) aynı anahtarı okusaydı biri env adını yanlış yazdığı gün yalnız o yüzey sessizce
 * sabit tarifeye düşerdi — ve o düşüş hiçbir yerde görünmezdi.
 */
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
  };
}

/** Sağlayıcı yapılandırılmış mı — ekran "canlı teklif kapalı" diyebilsin diye. */
export function shippingProviderConfigured(): boolean {
  return Boolean(process.env.SENDCLOUD_PUBLIC_KEY && process.env.SENDCLOUD_SECRET_KEY);
}
