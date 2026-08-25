import { PostalCodePlaceService, type Db } from '@lezzet/database';
import { placeLabel } from '@lezzet/domain-core';
import { normalizePostalCode } from '@lezzet/helper';
import type { Country, PlaceOption } from '@lezzet/types';

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

/**
 * POSTA KODU ÖNERİLERİ — adres formunun kod alanı için (21.28).
 *
 * ── NEDEN BU KAPI, NEDEN UÇTA DEĞİL ──────────────────────────────────────────
 * Servisin `search`i öneriyi zaten getiriyor (önek indeksi, rota adayı önce — künyesi orada);
 * burada yapılan tek şey sözleşme şekline indirgemek. Uçta yapılsaydı aynı indirgeme iki yüzeyde
 * (mobil uç + web eylemi) ayrı ayrı yazılırdı (CLAUDE §1). Web bugün önerileri kendi server
 * action'ından ham okuyor; benimsemesi web şeridinin işi.
 *
 * ── AD ARAMASI BU KAPIDAN GEÇİYOR — künye bir tur YANLIŞ söyledi (08.41 · 25.08) ─────────────
 * Burada *"harfli girdi kod dalına düşüp boş dönüyor, davranış değişmedi"* yazıyordu. **Yanlıştı**
 * ve kimse ölçmediği için bir tur boyunca öyle kaldı: `normalizePostalCode` yalnız boşluk siler ve
 * büyütür — harfler hayatta kalır, servisin iki dallı `search`i (`OB-03`) terimi ad sayar ve ad
 * dalına gider. Ölçüldü: `'Strasbourg'` → 3 öneri · `'hoenheim'` → `67800 (Bischheim, Hœnheim)` ·
 * `'st'` → 0 (üç harf eşiği) · `'672'` → 8 (kod dalı, birebir eskisi gibi).
 *
 * Yani kapı hazırdı; eksik olan yalnız web eyleminin kendi `/\p{L}/` süzgeciydi ve o da bu turda
 * kalktı. **Künyenin dersi:** "değişmedi" cümlesi bir ÖLÇÜM değil bir varsayımdı, ve bir alt
 * katmanın davranışı hakkında yazılmıştı.
 *
 * ── DEPO TABLOSUNA BAKILMAZ (kullanıcı kararı 10.08) ─────────────────────────
 * İlk yazımda satır bir de `serviced` taşıyordu — "bu ülkeye fiilen gönderebiliyor muyuz",
 * `findShippingWarehouse` ile. GERİ ALINDI: adres defterinin hizmet alanımızla ilgisi yok. Müşteri
 * adresini dilediği yere girer; oraya gidip gidemediğimiz sipariş anının sorusudur. Depo okuması
 * buradan düştüğü için kapı da tek sorguya indi.
 */
export async function suggestPlaces(db: Db, prefix: string): Promise<PlaceOption[]> {
  const rows = await new PostalCodePlaceService(db).search(normalizePostalCode(prefix));
  return rows.map((row) => ({
    country: row.country,
    postalCode: row.postalCode,
    // Ad TÜREVDİR, alan değil (`placeLabel`: tek yerleşimse adı, çoksa `null`) — kuralı burada
    // ikinci kez yazmak 19.8'in yanlış ad üretmesinin sebebiydi.
    placeName: placeLabel(row.places),
    places: [...row.places],
    inRoute: row.inRoute,
  }));
}
