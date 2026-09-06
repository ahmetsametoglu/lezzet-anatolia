/**
 * Coğrafi kodlama taklidi (11.9) — testler **ağa çıkmaz**.
 *
 * Desen `packages/sendcloud/src/testing.ts` (`fakeSendcloud`) ile aynı: çağrıları kaydeder, cevabı
 * çağıran belirler. Gerçek servise vuran bir test, düştüğü gün kodun değil internetin bozulduğunu
 * söylerdi.
 */

import type { Geocoder, GeocodeElsewhere, GeocodeOutcome, GeocodeQuery } from './geocode-port';

export interface FakeGeocoder extends Geocoder {
  /** `locate` çağrıları, sırayla — "hangi adres soruldu" doğrulanabilsin. */
  readonly calls: GeocodeQuery[];
  /**
   * `elsewhere` çağrıları AYRI sayılıyor (11.11) — ikinci sorgunun **yalnız gerektiğinde** atıldığı
   * ancak böyle sınanabilir. Kapı ilk turda doğrulandıysa bu dizi BOŞ kalmalı: aksi hâlde her adres
   * için servise iki kez gidiyoruz demektir ve bunu hiçbir çıktı ele vermez.
   */
  readonly elsewhereCalls: GeocodeQuery[];
}

/**
 * @param reply `locate` cevabı. Fonksiyon verilirse sorguya göre farklı cevap üretebilir —
 *   "ikinci adres bulunamadı" gibi senaryolar için.
 * @param elsewhereReply Kısıtsız aramanın cevabı. Verilmezse boş aday listesi döner: yani
 *   varsayılan davranış "başka yerde de bulunamadı" — testin ayrıca kurmadığı bir şey karar
 *   üretmesin.
 */
export function fakeGeocoder(
  reply: GeocodeOutcome | ((query: GeocodeQuery) => GeocodeOutcome),
  elsewhereReply?: GeocodeElsewhere | ((query: GeocodeQuery) => GeocodeElsewhere),
): FakeGeocoder {
  const calls: GeocodeQuery[] = [];
  const elsewhereCalls: GeocodeQuery[] = [];
  return {
    calls,
    elsewhereCalls,
    async locate(query: GeocodeQuery): Promise<GeocodeOutcome> {
      calls.push(query);
      return typeof reply === 'function' ? reply(query) : reply;
    },
    async elsewhere(query: GeocodeQuery): Promise<GeocodeElsewhere> {
      elsewhereCalls.push(query);
      const answer = elsewhereReply ?? { status: 'ok' as const, candidates: [] };
      return typeof answer === 'function' ? answer(query) : answer;
    },
  };
}
