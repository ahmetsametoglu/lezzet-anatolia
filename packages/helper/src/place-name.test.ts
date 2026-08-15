import { describe, expect, it } from 'vitest';
import { normalizePlaceName } from './place-name';

/**
 * Bu blok `domain-core/delivery/place-name.test.ts`ten TAŞINDI (`OB-03` · 15.08) — fonksiyon
 * `@lezzet/helper`a geçtiği için testi de peşinden geldi. Sınadığı kural değişmedi.
 *
 * Artık ÜÇ tüketicisi var ve üçünün de aynı cevabı vermesi şart:
 *   1. `domain-core/cityMatchesPlaces` — yazılan şehir bu koda ait mi
 *   2. `database/PostalCodePlaceService.search` — aranan TERİMİ normalleştirir
 *   3. `0033_postal_code_place.sql` → `place_search_text()` — aranan METNİ normalleştirir (SQL)
 *
 * Üçüncüsü bu dosyadan görünmez ve tam da bu yüzden aşağıdaki beklentiler sabit birer DEĞER olarak
 * yazılı, karşılaştırma olarak değil: SQL tarafının ne ürettiği migration'da ölçüldü
 * (`Hœnheim → hoenheim`, `Straßburg → strassburg`, `Sélestat → selestat`) ve buradaki değerler
 * onunla birebir aynı. İki taraftan biri kayarsa bu testler kırılır; birbirine eşitlenen iki çağrı
 * ise ikisi birden kaysa bile yeşil kalırdı.
 */
describe('yazım farkı anlam farkı değildir', () => {
  it('ligatür açılır — müşteri "Hoenheim" yazar, veri "Hœnheim" tutar', () => {
    expect(normalizePlaceName('Hœnheim')).toBe('hoenheim');
    expect(normalizePlaceName('HOENHEIM')).toBe('hoenheim');
  });

  it('diyakritik ve tire silinir', () => {
    expect(normalizePlaceName('Vitry-le-François')).toBe('vitry le francois');
    expect(normalizePlaceName('Sélestat')).toBe('selestat');
  });

  it('Alman eszett açılır', () => {
    expect(normalizePlaceName('Weißenburg')).toBe('weissenburg');
    expect(normalizePlaceName('Straßburg')).toBe('strassburg');
  });
});
