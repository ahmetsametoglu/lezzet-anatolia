/**
 * Coğrafi kodlama taklidi (11.9) — testler **ağa çıkmaz**.
 *
 * Desen `packages/sendcloud/src/testing.ts` (`fakeSendcloud`) ile aynı: çağrıları kaydeder, cevabı
 * çağıran belirler. Gerçek servise vuran bir test, düştüğü gün kodun değil internetin bozulduğunu
 * söylerdi.
 */

import type { Geocoder, GeocodeOutcome, GeocodeQuery } from './geocode-port';

export interface FakeGeocoder extends Geocoder {
  /** Sırayla yapılan çağrılar — "hangi adres soruldu" doğrulanabilsin. */
  readonly calls: GeocodeQuery[];
}

/**
 * @param reply Her çağrı için cevap. Fonksiyon verilirse sorguya göre farklı cevap üretebilir —
 *   "ikinci adres bulunamadı" gibi senaryolar için.
 */
export function fakeGeocoder(reply: GeocodeOutcome | ((query: GeocodeQuery) => GeocodeOutcome)): FakeGeocoder {
  const calls: GeocodeQuery[] = [];
  return {
    calls,
    async locate(query: GeocodeQuery): Promise<GeocodeOutcome> {
      calls.push(query);
      return typeof reply === 'function' ? reply(query) : reply;
    },
  };
}
