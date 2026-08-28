import type { ShippingRateProvider } from './port';

/**
 * **Sahte kargo sağlayıcısı — testin AĞA ÇIKMAMASI için** (`packages/sendcloud/testing` deseninin
 * port düzeyindeki karşılığı).
 *
 * Taban HİÇBİR ucu desteklemez: her metot *"bu testte çağrılmamalı"* diye reddeder ve test yalnız
 * konusunu ilgilendireni doldurur. Bu bir kolaylık değil, bir **denetim**: teklif testinde duyuru
 * çağrılırsa test sessizce geçmez, yüksek sesle düşer.
 *
 * Dosya 28.08'de doğdu — port `status` ve `listRecent` ile büyüyünce dört ayrı test dosyasındaki
 * dört sahte de büyümek zorunda kaldı. Beşinci ucu eklerken aynı düzenlemeyi dördüncü kez yapmak,
 * `CLAUDE §1`in duplication kuralının tam olarak yasakladığı şey.
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
    ...over,
  };
}
