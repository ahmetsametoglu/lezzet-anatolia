import { z } from 'zod';
import { AddressSchema } from '../entities/address.schema';
import { CountryEnum } from '../primitives/enums.schema';

/**
 * `/api/v1/me/addresses` SÖZLEŞME şemaları (21.15) — mobil adres uçlarının ve hesap ekranının
 * ortak dili. Terfi gerekçesi `me-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak");
 * entity/taşıma ayrımı da oradaki künyede: `address.schema.ts` DB satırının aynasıdır, bu dosya
 * "bu yüzey tele ne verir"i söyler.
 */

/**
 * Küme EKRANIN OKUDUĞU alanlardır (v3 hesap listesi + adres çekmecesi): etiket, iki adres satırı,
 * posta kodu, şehir, ülke, varsayılan bayrağı. Bilinçli dışarıda: `customerId` (jetondan çözülür,
 * tele dönmesi gereksiz), `recipient`/`phone` (çekmece göstermiyor; checkout dilimi bu alanları
 * istediği gün küme oradan büyür — sözleşme ekranın ihtiyacını taşır), `createdAt` (sıralama
 * sunucuda). `line2` kümede: çekmece göstermese de web'den girilmiş bir "Kat 2 / Daire 5" satırını
 * listede yutmak teslimat adresini eksik gösterirdi.
 *
 * ── `country` 21.28'DE KÜMEYE GİRDİ ─────────────────────────────────────────
 * Bir süre "çekmece göstermiyor" diye dışarıdaydı ve doğruydu — gösterilecek bir şey değil.
 * DÜZENLEME onu gerekli kıldı: adres güncellenirken ülke geri gönderilmezse kapı kodu yeniden
 * çözmek zorunda kalıyor ve **610 kod iki ülkede birden geçerli** (ölçüldü 10.08), yani müşteri
 * hiçbir şeyi değiştirmeden "Kaydet"e bastığında kapı `country_required` diyebilirdi. Alan
 * ekranda ÇİZİLMEZ; taşınmasının tek sebebi seçilmiş ülkenin düzenlemede kaybolmaması.
 */
export const MeAddressSchema = AddressSchema.pick({
  id: true,
  label: true,
  line1: true,
  line2: true,
  postalCode: true,
  city: true,
  country: true,
  isDefault: true,
});

/**
 * Uçların cevabı HER ZAMAN güncel listedir — yazma uçları dahil. Varsayılan değişimi ve "varsayılan
 * silinirse en yeni devralır" kuralı TEK satırı değil komşularını da oynatır; tek kaydı dönmek
 * istemciyi ikinci bir liste çağrısına mecbur bırakırdı.
 */
export const MeAddressListSchema = z.array(MeAddressSchema);

/**
 * Yazma gövdesi (create ve update AYNI form — v3 `shAddr` çekmecesi iki hâlde de aynı dört alanı
 * gösterir). `label` boş geçilebilir (etiketsiz adreste ekran şehri başlık yapar — entity künyesi);
 * boş metnin `null`a indirgenmesi uygulama kapısının işi. `isDefault` BİLEREK YOK: varsayılan
 * seçimi kendi ucudur (`POST /:id/default`) — gövdeden sızması iki varsayılan bırakır
 * (web kapısının testle yakaladığı hata, `lib/account/addresses.ts` künyesi).
 *
 * `postalCode` beş haneli kod: teslimat bölgesi kararı bu anahtarla veriliyor (modül 07); serbest
 * metin kabul etmek bölge süzgecini sessizce boşa düşürürdü. Beş hane FR ve DE'de ortaktır — kalıp
 * ülkeyi SEÇMEZ, yalnız biçimi tutar.
 */
export const AddressWriteSchema = z.object({
  label: z.string().nullish(),
  line1: z.string().min(1),
  line2: z.string().nullish(),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().min(1),
  /**
   * SEÇİLEN yerin ülkesi — öneri listesinden gelir (`PlaceSuggestion.country`), müşterinin
   * doldurduğu bir alan DEĞİLDİR (21.28).
   *
   * ── NEDEN OPSİYONEL, VE NEDEN BİR BEYAN DEĞİL ───────────────────────────────
   * Kapı bu değeri OLDUĞU GİBİ yazmaz: `postal_code_place` (ya da kendi bölge tablomuz) o kodun o
   * ülkede gerçekten geçerli olduğunu söylemiyorsa kayıt reddedilir. Yani alan bir beyan değil,
   * ADAYLAR ARASINDAN yapılmış bir seçimdir — `0033_postal_code_place.sql` künyesinin yasağı
   * ("müşterinin doldurduğu bir alanın vergi sonucu doğurması kabul edilemez") böyle korunur.
   *
   * Verilmezse sunucu kodu kendisi çözer (`resolvePlaceForPostalCode`). Çözüm tek ülkeye düşerse
   * ülke ondan gelir; **iki ülkeye birden düşerse kapı `country_required` der** — 610 kod bu hâlde
   * ve birini tahmin etmek yanlış KDV demektir (motorun kayıtlı gerekçesi). Alanın opsiyonel
   * kalmasının tek sebebi öneri servisi düştüğünde elle yazma yolunun açık kalması
   * (kullanıcı kararı 10.08); o yolda da ülke tahmin edilmez, sorulur.
   */
  country: CountryEnum.optional(),
});
