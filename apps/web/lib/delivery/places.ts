import 'server-only';
import { cache } from 'react';
import { placesForPostalCode as resolvePlaces } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Country } from '@lezzet/types';

/**
 * Posta kodunun yerleşimleri — sunucu kapısı (19.17).
 *
 * **Geçiş köprüsü** (sipariş zinciri terfisi, aşama 2/3): gövde
 * `@lezzet/application`'ın `delivery/places`ine taşındı — kural artık ORADA yaşıyor, çünkü aynı
 * soruyu mobil "Siparişi tamamla" ekranı da soracak ve adres–posta kodu tutarlılığı iki yüzeyde
 * iki kez tanımlanamaz (`address_city_mismatch`in Lingolsheim vakası, `checkout-draft` künyesi).
 *
 * **Neden ayrı bir okuma:** yer çözümü (`read-place`) "hangi depo" sorusunun peşinde ve cevabı
 * çerezdeki koda bağlı. Buradaki soru başka bir koda sorulabilir — checkout ADRESİN kodunu sorar,
 * çerezinkini değil, ve ikisi farklı olabilir (tasarımın "adres kazanır" kuralı).
 *
 * `cache()` istek kapsamlı: aynı render'da hem form uyarısı hem checkout kapısı sorarsa tek tur
 * çalışır. Tablo migration'la doğduğu ve yılda bir yenilendiği için bayatlama riski yok; burada
 * istenen tek şey aynı istekte iki kez sorgu atmamak. **Önbellek WEB tarafında kalıyor** — istek
 * kapsamı Next'in kavramı, pakette karşılığı yok.
 */
export const placesForPostalCode = cache(async (country: Country, postalCode: string): Promise<string[]> =>
  resolvePlaces(serviceDb(), country, postalCode),
);
