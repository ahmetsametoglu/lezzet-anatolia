import { PostalCodePlaceService, type Db } from '@lezzet/database';
import type { Country } from '@lezzet/types';

/**
 * Posta kodunun yerleşimleri — sunucu kapısı (19.17).
 *
 * **Neden ayrı bir okuma:** yer çözümü (`read-place`) "hangi depo" sorusunun peşinde ve cevabı
 * çerezdeki koda bağlı. Buradaki soru başka bir koda sorulabilir — checkout ADRESİN kodunu sorar,
 * çerezinkini değil, ve ikisi farklı olabilir (tasarımın "adres kazanır" kuralı).
 *
 * ── TERFİ (aşama 2/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/lib/delivery/places.ts`tı; web kopyası KÖPRÜ olarak duruyor. Soru da cevabı da
 * aynı; değişen yalnız kapının taşımayla bağını kesen iki şey:
 *   · `db` çağırandan gelir (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni.
 *   · **`react.cache()` DÜŞTÜ.** İstek kapsamlı önbellek bir WEB kavramıdır (Next render'ı); paket
 *     Hono ucunda da koşuyor ve orada böyle bir kapsam yok. Kayıp da yok: önbelleğin tek işi aynı
 *     render'da iki kez sorulan soruyu tek tura indirmekti ve tablo migration'la doğup yılda bir
 *     yenilendiği için bayatlama riski hiç olmadı. Web köprüsü `cache()`i kendi tarafında koruyor —
 *     sınır web'te durur, pakette değil.
 */
export async function placesForPostalCode(db: Db, country: Country, postalCode: string): Promise<string[]> {
  return new PostalCodePlaceService(db).findPlaces(country, postalCode);
}
