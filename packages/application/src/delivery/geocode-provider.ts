/**
 * Coğrafi kodlama fabrikası (11.9) — portu gerçek sağlayıcıya bağlayan tek yer.
 *
 * ── FR: MEVCUT İSTEMCİ, YENİ BAĞIMLILIK YOK ─────────────────────────────────
 * `packages/address-fr` zaten yazılı, anahtarsız ve ücretsiz (BAN / Géoplateforme, Etalab 2.0) —
 * müşterinin adres önerisi kutusu onu kullanıyor. Yeni npm paketi girmediği için `STACK §2` beyanı
 * gerekmedi.
 *
 * **`postcode` burada SERT SÜZGEÇ olarak veriliyor ve bu doğru.** Otomatik tamamlamada bilerek
 * verilmiyor (müşteri hediye/iş adresi ararken başka şehri yazıyor olabilir — `ban-client` künyesi);
 * burada durum tersi: posta kodunu ZATEN BİLİYORUZ, başka kodda çıkan sonuç yanlış cevaptır.
 *
 * **`kind` süzgeci verilmiyor:** `housenumber` dayatmak, kapı numarası bilinmeyen adreste "eşleşme
 * yok" derdi. Kaba eşleşme atılmıyor — kaba OLDUĞU söyleniyor (`precision`).
 */

import { searchAddresses } from '@lezzet/address-fr';
import type { Geocoder, GeocodeOutcome, GeocodeQuery } from './geocode-port';

/**
 * Bu skorun altındaki eşleşme `no_match` sayılır. Parametrik ve makul seçildi: BAN'ın kendi skoru
 * 0..1 ve 0,4'ün altı pratikte "adresi bulamadım ama elimdeki en yakın satır bu" demek.
 */
const MIN_SCORE = 0.4;

/** BAN'a bakan kodlayıcı. Anahtarsız çalıştığı için her zaman var — yokluk yalnız ülke ekseninde. */
function banGeocoder(): Geocoder {
  return {
    async locate(query: GeocodeQuery): Promise<GeocodeOutcome> {
      if (query.country !== 'FR') return { status: 'unsupported_country' };

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
        // Kademe servisin söylediğidir, bizim varsayımımız değil: `municipality` dönerse nokta
        // belediye merkezidir ve öyle kaydedilir.
        precision: best.kind,
        source: 'ban',
        score: best.score,
      };
    },
  };
}

/**
 * Ülkeye bakan kodlayıcı — bugün yalnız FR.
 *
 * Almanya için sağlayıcı **yok ve uydurulmuyor** (ADR-002 sınır ötesi rotaya izin veriyor, yani bu
 * gerçek bir boşluk): `unsupported_country` döner, nokta `null` kalır, tarama o satırları kuyrukta
 * tüketmez. İkinci kaynak takıldığı gün yalnız BU dosya değişir — çağıran hiç değişmez.
 */
export function geocoder(): Geocoder {
  return banGeocoder();
}

/** O ülke için koordinat çözümü açık mı — ekran "Almanya adresleri çözülemiyor" diyebilsin. */
export function geocoderConfigured(country: string): boolean {
  return country === 'FR';
}
