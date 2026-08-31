/**
 * Coğrafi kodlama portu (11.9) — adres metni → nokta. **Arayüz; sağlayıcı sonradan takılır.**
 *
 * Desen `shipping/port.ts` + `shipping/provider.ts` ile birebir aynı (`INTEGRATIONS.md`: *"her dış
 * servis bir agnostik arayüzün arkasında yaşar"*): bu dosya hiçbir sağlayıcı paketini ithal etmez,
 * fabrika (`geocode-provider.ts`) env'i tek yerden okur.
 *
 * ── HİÇBİR YOL FIRLATMAZ, HER BAŞARISIZLIK ADLI ─────────────────────────────
 * `packages/address-fr/src/ban-client.ts`in disiplini aynen: çağıran (tarama işi) her hâl için ayrı
 * davranıyor ve ayrım kritik — **`no_match` sayacı tüketir, `unavailable` tüketmez.** Servisin
 * düştüğü bir öğleden sonra sayaç tüketilseydi yüzlerce adres kalıcı olarak "çözülemez" damgası
 * yerdi ve kimse bir daha denemezdi.
 */

import type { AddressGeoPrecision, AddressGeoSource, Country } from '@lezzet/types';
import type { GeoPoint } from '@lezzet/domain-core';

export interface GeocodeQuery {
  line1: string;
  postalCode: string;
  city: string;
  country: Country;
}

export type GeocodeOutcome =
  | {
      status: 'ok';
      point: GeoPoint;
      /** Ölçümün inceliği — `municipality` bir kapıyı değil belediye merkezini gösterir. */
      precision: AddressGeoPrecision;
      source: AddressGeoSource;
      /** Servisin eşleşme güveni (0..1) — eşiğin altındaysa çağıran `no_match` sayar. */
      score: number;
    }
  /** Servis CEVAPLADI, eşleşme yok → adres muhtemelen hatalı; sayaç artar, seyrek yeniden denenir. */
  | { status: 'no_match' }
  | { status: 'rate_limited'; retryAfterMs: number }
  /** Geçici: ağ düştü, zaman aşımı, 5xx. **Sayacı TÜKETMEZ.** */
  | { status: 'unavailable' }
  /** Cevap geldi ama beklenen şekilde değil — sözleşme değişmiş olabilir. */
  | { status: 'invalid_response' }
  /**
   * O ülkeye bakan sağlayıcı yok ya da yapılandırılmamış. **Sayacı tüketmez ve tarama o satırları
   * sonsuza dek denemez** — bugün Almanya bu hâlde (BAN yalnız Fransa). Uydurma bir nokta yazmak
   * yerine "bilinmiyor" demek doğrudur: koordinatsız durak "sırasız" görünür, yanlış koordinatlı
   * durak kuryeyi sessizce başka mahalleye dizer.
   */
  | { status: 'unsupported_country' };

export interface Geocoder {
  locate(query: GeocodeQuery): Promise<GeocodeOutcome>;
}
