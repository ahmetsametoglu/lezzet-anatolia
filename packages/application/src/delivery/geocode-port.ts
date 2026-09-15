/*
  Adres metninden nokta: sağlayıcı paketi burada değil fabrikada (`geocode-provider`) bağlanır. Her başarısızlık adlıdır, çünkü
  `no_match` tarama sayacını tüketir, `unavailable` tüketmez; servis düştüğünde yüzlerce adres kalıcı "çözülemez" damgası yemesin.
*/

import type { AddressGeoPrecision, AddressGeoSource, Country } from '@lezzet/types';
import type { AddressCandidate } from '@lezzet/address';
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
      /** `municipality` kapıyı değil belediye merkezini gösterir. */
      precision: AddressGeoPrecision;
      /** `manual` bu yoldan gelmez: insanın koyduğu nokta servis cevabı değil. */
      source: Extract<AddressGeoSource, 'ban' | 'google'>;
      /** Servisin eşleşme güveni, 0..1. */
      score: number;
    }
  /** Servis cevapladı, eşleşme yok: sayaç artar, seyrek yeniden denenir. */
  | { status: 'no_match' }
  | { status: 'rate_limited'; retryAfterMs: number }
  /** Geçici; sayacı tüketmez. */
  | { status: 'unavailable' }
  /** Sözleşme değişmiş olabilir. */
  | { status: 'invalid_response' }
  /**
   * Sayacı tüketmez ve tarama o satırları boşuna denemez. Uydurma nokta yazılmaz: koordinatsız durak "sırasız" görünür, yanlış
   * koordinatlı durak kuryeyi başka mahalleye dizer.
   */
  | { status: 'unsupported_country' };

/**
 * `locate`ten ayrı, çünkü ikinci tur yalnız kapı istenen kodda bulunamadığında atılır. Google'da ikinci tur yoktur: yanlış kodu
 * doğrulama kendisi düzeltir ve cevap `locate`inkinin içindedir.
 */
export type GeocodeElsewhere =
  | { status: 'ok'; candidates: AddressCandidate[] }
  /** Geçici; çağıran susar. */
  | { status: 'unavailable' }
  | { status: 'unsupported_country' };

export interface Geocoder {
  locate(query: GeocodeQuery): Promise<GeocodeOutcome>;
  /**
   * Aynı adres, posta kodu pinlenmeden (BAN) ya da servisin düzelttiği hâliyle (Google): pinli sorgu adresin başka kodda olduğunu
   * göremez.
   */
  elsewhere(query: GeocodeQuery): Promise<GeocodeElsewhere>;
}
