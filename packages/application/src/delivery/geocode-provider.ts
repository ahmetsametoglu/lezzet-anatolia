/*
  Portu sağlayıcıya bağlayan tek yer: Fransa BAN'a (anahtarsız, koordinat süresiz saklanır), Almanya anahtar varsa Google Address
  Validation'a gider. BAN'da posta kodu sert süzgeçtir ve yanlış kodu görünmez kılar; bu yüzden kapı bulunamazsa ikinci, kısıtsız
  bir sorgu atılır.
*/

import { searchAddresses } from '@lezzet/address';
import { validateAddress, type AddressValidation } from '@lezzet/address/google';
import type { Country } from '@lezzet/types';
import { googleMapsApiKey, traceGoogleFailure } from './google-maps';
import type { Geocoder, GeocodeElsewhere, GeocodeOutcome, GeocodeQuery } from './geocode-port';

/** 0,4'ün altındaki BAN eşleşmesi pratikte "bulamadım, en yakın satır bu" demektir. */
const MIN_SCORE = 0.4;

/** Karar yalnız en iyi kapıyı ve rakibini kullanır; uzun liste ne kararı değiştirir ne ekrana çıkar. */
const ELSEWHERE_LIMIT = 5;

/** Anahtarsız çalıştığı için her zaman vardır; yokluk yalnız ülke ekseninde. */
function banGeocoder(): Geocoder {
  return {
    async locate(query: GeocodeQuery): Promise<GeocodeOutcome> {
      if (query.country !== 'FR') return { status: 'unsupported_country' };

      // `kind` verilmez: kapı numarası bilinmeyen adres de eşleşsin, eşleşmenin kabalığını `precision` söyler.
      const lookup = await searchAddresses({
        query: `${query.line1} ${query.postalCode} ${query.city}`.trim(),
        postalCode: query.postalCode,
        limit: 1,
      });

      if (lookup.status === 'too_short') return { status: 'no_match' };
      if (lookup.status !== 'ok') return lookup;

      const best = lookup.suggestions[0];
      if (!best || best.score < MIN_SCORE) return { status: 'no_match' };

      return {
        status: 'ok',
        point: { lat: best.latitude, lng: best.longitude },
        // Kademe servisin söylediğidir: `municipality` dönerse nokta belediye merkezidir ve öyle kaydedilir.
        precision: best.kind,
        source: 'ban',
        score: best.score,
      };
    },

    /** Pinsiz ve şehirsiz: yanlış kodla gelen adresin şehri de çoğu zaman yanlıştır ve sorguya girmesi doğru cevabın skorunu düşürürdü. */
    async elsewhere(query: GeocodeQuery): Promise<GeocodeElsewhere> {
      if (query.country !== 'FR') return { status: 'unsupported_country' };

      const lookup = await searchAddresses({ query: query.line1.trim(), limit: ELSEWHERE_LIMIT });
      // `too_short` çağıran için "aday yok" demektir.
      if (lookup.status === 'too_short') return { status: 'ok', candidates: [] };
      if (lookup.status !== 'ok') return { status: 'unavailable' };

      return {
        status: 'ok',
        // Eşik ve ayıklama kararın işi; adaptör servisin dediğini yorumlamadan taşır.
        candidates: lookup.suggestions.map((suggestion) => ({
          label: suggestion.label,
          postalCode: suggestion.postalCode,
          city: suggestion.city,
          precision: suggestion.kind,
          score: suggestion.score,
        })),
      };
    },
  };
}

/**
 * Google sayı değil bayrak verir; skor BAN ölçeğine çevrilir ki düzeltme teklifinin 0,8 eşiği iki kaynakta aynı anlama gelsin.
 * Kapı düzeyi eşiğin üstünde, sokak düzeyi altında kalır.
 */
function scoreOf(validation: AddressValidation): number {
  if (validation.precision === 'housenumber') return validation.complete && !validation.unconfirmed ? 0.95 : 0.85;
  if (validation.precision === 'street') return 0.6;
  return 0.2;
}

/** Yalnız anahtar varken kurulur. */
function googleGeocoder(apiKey: string): Geocoder {
  /* Google yanlış kodu kendisi düzelttiği için `elsewhere`in cevabı `locate`inkinin içindedir. Ücretli uca ikinci kez
     çıkılmasın diye son sorgunun cevabı tutulur. */
  let last: { key: string; lookup: ReturnType<typeof validateAddress> } | null = null;
  const validate = (query: GeocodeQuery): ReturnType<typeof validateAddress> => {
    const key = [query.country, query.line1, query.postalCode, query.city].join('\n');
    if (last?.key === key) return last.lookup;
    const lookup = validateAddress({ apiKey, country: query.country, line1: query.line1, postalCode: query.postalCode, city: query.city }).then((result) =>
      traceGoogleFailure('address_validation', result),
    );
    last = { key, lookup };
    return lookup;
  };

  return {
    async locate(query: GeocodeQuery): Promise<GeocodeOutcome> {
      const lookup = await validate(query);
      if (lookup.status === 'rate_limited') return lookup;
      // `denied` ve `rejected` çağıran için aynıdır, kapı susar; iz `traceGoogleFailure`ta kaldı.
      if (lookup.status !== 'ok') return { status: lookup.status === 'invalid_response' ? 'invalid_response' : 'unavailable' };

      const v = lookup.validation;
      // Nokta yoksa cevap yok: bu kapının varlık sebebi koordinat.
      if (v.latitude === null || v.longitude === null) return { status: 'no_match' };
      // Kodu Google değiştirdiyse kapı istenen kodda yoktur; doğrusunu `elsewhere` taşır.
      if (v.replacedPostalCode) return { status: 'no_match' };
      const score = scoreOf(v);
      if (score < MIN_SCORE) return { status: 'no_match' };

      return { status: 'ok', point: { lat: v.latitude, lng: v.longitude }, precision: v.precision, source: 'google', score };
    },

    /**
     * BAN'daki gibi bağlam atılmaz: Google bileşen düzeyinde doğrular ve yanlış kodu sokak ile şehirden düzeltir, bağlamsız soruda
     * rastgele bir kapı seçer.
     */
    async elsewhere(query: GeocodeQuery): Promise<GeocodeElsewhere> {
      const lookup = await validate(query);
      if (lookup.status !== 'ok') return { status: 'unavailable' };

      const v = lookup.validation;
      // Adaylık için kod ve şehir şart: teklif yapılandırılmış alan yazar, etiket ayrıştırılamaz.
      if (v.postalCode === null || v.city === null || v.formattedAddress === null) return { status: 'ok', candidates: [] };
      return {
        status: 'ok',
        candidates: [{ label: v.formattedAddress, postalCode: v.postalCode, city: v.city, precision: v.precision, score: scoreOf(v) }],
      };
    },
  };
}

/**
 * Ülke sorgudan okunur, çünkü aynı tarama bir turda iki ülkenin satırını görebilir. Anahtarsız Almanya `unsupported_country` döner:
 * nokta `null` kalır, doğrulama susar.
 */
export function geocoder(): Geocoder {
  const ban = banGeocoder();
  const key = googleMapsApiKey();
  const google = key === null ? null : googleGeocoder(key);
  const pick = (country: Country): Geocoder | null => (country === 'FR' ? ban : google);

  return {
    locate: (query) => pick(query.country)?.locate(query) ?? Promise.resolve({ status: 'unsupported_country' }),
    elsewhere: (query) => pick(query.country)?.elsewhere(query) ?? Promise.resolve({ status: 'unsupported_country' }),
  };
}

/** Ekran "Almanya adresleri çözülemiyor" diyebilsin diye. */
export function geocoderConfigured(country: string): boolean {
  if (country === 'FR') return true;
  return country === 'DE' && googleMapsApiKey() !== null;
}

/**
 * Fransa'da evet: BAN ücretsiz ve koordinat süresiz saklanır. Almanya'da hayır: Google ücretli ve koordinat 30 günden uzun
 * saklanamaz, bu yüzden adres sipariş anında çözülür.
 */
export function geocoderScanAllowed(country: string): boolean {
  return country === 'FR';
}
