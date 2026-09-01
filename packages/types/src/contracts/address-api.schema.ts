import { z } from 'zod';
import { AddressSchema } from '../entities/address.schema';
import { AddressGeoPrecisionEnum, CountryEnum } from '../primitives/enums.schema';

/**
 * `/api/v1/me/addresses` SÖZLEŞME şemaları (21.15) — mobil adres uçlarının ve hesap ekranının
 * ortak dili. Terfi gerekçesi `me-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak");
 * entity/taşıma ayrımı da oradaki künyede: `address.schema.ts` DB satırının aynasıdır, bu dosya
 * "bu yüzey tele ne verir"i söyler.
 */

/**
 * Küme EKRANIN OKUDUĞU alanlardır (v3 hesap listesi + adres çekmecesi): etiket, alıcı, teslimat
 * telefonu, iki adres satırı, posta kodu, şehir, ülke, varsayılan bayrağı. Bilinçli dışarıda:
 * `customerId` (jetondan çözülür, tele dönmesi gereksiz) ve `createdAt` (sıralama sunucuda).
 * `line2` kümede: çekmece göstermese de web'den girilmiş bir "Kat 2 / Daire 5" satırını listede
 * yutmak teslimat adresini eksik gösterirdi.
 *
 * ── `recipient`/`phone` 22.08'DE KÜMEYE GİRDİ (kullanıcı kararı) ────────────
 * Bu künye bir gün için söz vermişti: *"çekmece göstermiyor; checkout dilimi bu alanları istediği
 * gün küme oradan büyür"*. O gün geldi ve sebebi ölçüldü: **native'den girilen her adres alıcısız
 * ve telefonsuz doğuyordu** (form sormuyor), web ise ikisini zorunlu tutuyordu — aynı tablo, iki
 * yüzeyden iki farklı asgari. Okuyan uçlar boşluğu farklı doldurunca ayrışma ölçülebilir hâle
 * geldi (web sipariş detayı yedeğe DÜŞMÜYOR, kurye durağı hesaba DÜŞÜYOR).
 *
 * Kullanıcı kararı (22.08): *"her hâlükârda net bir teslimat kişisi ve teslimat numarasına
 * ihtiyacımız var… adres, teslim alacak kişi ve telefon numarası ile beraber kaydedilmiş olacak"*.
 * Alanlar okuma kümesinde çünkü DÜZENLEME onları gerektiriyor — `country`nin 21.28'de kümeye
 * girmesiyle birebir aynı gerekçe: geri gönderilmeyen alan, "hiçbir şeyi değiştirmeden Kaydet"
 * diyen müşteride kaybolurdu.
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
  recipient: true,
  phone: true,
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
  /**
   * ADRESTE TESLİM ALACAK KİŞİ — ZORUNLU (kullanıcı kararı 22.08).
   *
   * Nullable DEĞİL: adres kaydının kendisi *"burada kim teslim alır"* sorusunun cevabıdır ve o
   * cevap boş bırakılırsa soru okuma anına ertelenir — okuyan her uç kendi yedeğini uydurur ve
   * ayrışırlar (ölçüldü 22.08). Kolaylık formda: yeni adreste alan hesabın adıyla DOLU gelir,
   * müşteri ister değiştirir ister olduğu gibi kaydeder. Yani zorunluluk bir sürtünme değil,
   * müşterinin zaten verdiği cevabın kayda geçmesi.
   *
   * `min(1)` gövde kapısıdır; asıl değişmez VERİDE (`address.recipient not null` — 0011,
   * `db:refresh` 22.08'de kullanıcı onayıyla koşuldu ve ölçüldü).
   */
  recipient: z.string().min(1),
  /**
   * TESLİMAT TELEFONU — ZORUNLU, ve E.164'e indirgenmiş olarak beklenir.
   *
   * Hesabın numarasından AYRI bir alan olmasının gerekçesi entity künyesinde (hediye adresinde
   * aranacak numara alıcınınkidir). Zorunluluğun gerekçesi `recipient` ile aynı: kapıya teslimde
   * kurye önce arıyor ve "numara bilinmiyor" hâli kuryeyi kapıda bırakıyor.
   *
   * Biçimi İSTEMCİ indirger (`normalizePhone`, `@lezzet/helper`) — burada kalıp dayatılmıyor
   * çünkü iki ülke iki uzunluk taşıyor ve serbest yazımı reddetmek, numarası olan müşteriyi
   * adres ekleyemez hâle getirirdi (adres defteri hiçbir hâlde reddetmez — kullanıcı kararı 10.08).
   */
  phone: z.string().min(1),
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
  /**
   * SEÇİLEN önerinin KOORDİNATI (11.9) — `country`nin kardeşi ve birebir aynı kuralı izler:
   * *"alan bir beyan değil, ADAYLAR ARASINDAN yapılmış bir seçimdir."*
   *
   * ── NEDEN AYRI BİR NESNE, NEDEN DÜZ `lat`/`lng` DEĞİL ───────────────────────
   * Adres satırının kendisinde de `lat`/`lng` kolonları var (0011) ve bu alan onlar DEĞİLDİR —
   * onlara giden bir aday. Ayrımı adında taşımasaydı gövdeden gelen sayı, kapının yazdığı sayıyla
   * aynı isimde olur ve bir gün biri onu doğrudan satıra geçirirdi: makullük süzgecini
   * (`plausiblePoint`) atlayan ikinci bir yol. Web'de bu ayrım gövdede değil İMZADA duruyor
   * (`addAddress(…, point)` ayrı bir parametre) — burada gövdeden geçmek zorunda, çünkü araya HTTP
   * giriyor; o yüzden ayrımı adı yapıyor.
   *
   * ── NEDEN VAR ───────────────────────────────────────────────────────────────
   * BAN önerisi koordinatı zaten cevabında gönderiyor. 01.09'a kadar mobil yüzey onu ATIYORDU ve
   * adres noktasız doğuyordu: satır tarama kuyruğuna düşüyor, on dakika sonra AYNI soru ikinci kez
   * BAN'a soruluyordu. Arada kalan pencerede o adresin durağı posta kodu merkezine düşer — ve
   * Strasbourg'da o merkez sıfır bilgi taşıyor (ölçüldü 31.08: üç kod da aynı nokta).
   *
   * Verilmezse hiçbir şey bozulmaz: satır noktasız doğar ve tarama işi onu çözer. Yani alan bir
   * hızlandırıcıdır, bir ön koşul değil.
   */
  point: z
    .object({
      lat: z.number(),
      lng: z.number(),
      precision: AddressGeoPrecisionEnum,
    })
    .nullish(),
});
