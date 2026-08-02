import 'server-only';
import { cache } from 'react';
import { PostalCodePlaceService, serviceDb } from '@lezzet/database';
import type { Country } from '@lezzet/types';

/**
 * Posta kodunun yerleşimleri — sunucu kapısı (19.17).
 *
 * **Neden ayrı bir okuma:** yer çözümü (`read-place`) "hangi depo" sorusunun peşinde ve cevabı
 * çerezdeki koda bağlı. Buradaki soru başka bir koda sorulabilir — checkout ADRESİN kodunu sorar,
 * çerezinkini değil, ve ikisi farklı olabilir (tasarımın "adres kazanır" kuralı).
 *
 * `cache()` istek kapsamlı: aynı render'da hem form uyarısı hem checkout kapısı sorarsa tek tur
 * çalışır. Tablo migration'la doğduğu ve yılda bir yenilendiği için bayatlama riski yok; burada
 * istenen tek şey aynı istekte iki kez sorgu atmamak.
 */
export const placesForPostalCode = cache(async (country: Country, postalCode: string): Promise<string[]> =>
  new PostalCodePlaceService(serviceDb()).findPlaces(country, postalCode),
);
