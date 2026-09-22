import type { ShippingRateProvider } from './port';

/**
 * Sahte kargo sağlayıcısı: her uç "bu testte çağrılmamalı" diye reddeder, test yalnız konusunu doldurur.
 * Böylece teklif testinde duyuru çağrılırsa test sessizce geçmez, düşer.
 */
export function providerStub(over: Partial<ShippingRateProvider> = {}): ShippingRateProvider {
  const red =
    (ad: string) =>
    (): Promise<never> =>
      Promise.reject(new Error(`bu testte ${ad} çağrılmamalı`));
  return {
    quote: red('teklif'),
    announce: red('duyuru'),
    cancel: red('iptal'),
    status: red('durum sorgusu'),
    listRecent: red('gönderi listesi'),
    servicePoints: red('nokta araması'),
    servicePoint: red('nokta okuması'),
    ...over,
  };
}
