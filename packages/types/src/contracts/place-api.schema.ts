import { z } from 'zod';
import { CountryEnum } from '../primitives/enums.schema';

/**
 * Yer çözüm sözleşmesi: `GET /api/v1/places/by-postal-code` ve onboarding'in posta kodu adımının ortak dili. Zarfta depo kimliği
 * bilerek yok, cihaz yalnız `country` + `postalCode` cevabını saklar ve yer her istekte sunucuda yeniden çözülür, çünkü istemcinin
 * yazabildiği bir değer hangi deponun stoğunun gösterileceğini belirleyemez.
 */

/**
 * `ambiguous` hâlinde sunulan seçenek: ülke değil tanınabilir bir yer, çünkü "Fransa mı Almanya mı" müşteriye bir şey ifade etmez.
 * Her seçenek `country` + `postalCode` taşır, yani seçildiği gibi saklanabilir bir yer anahtarıdır.
 */
export const PlaceOptionSchema = z.object({
  country: CountryEnum,
  /** Normalize (boşluksuz, büyük harf) — saklanacak anahtarın kendisi. */
  postalCode: z.string(),
  /** Kodun tartışmasız adı; çok yerleşimliyse `null`, çünkü yanlış ad eksik addan kötüdür. */
  placeName: z.string().nullable(),
  /** Kodun o ülkedeki tüm yerleşimleri — kaç ad yazılıp nerede "+X"e geçileceği ekranın kararı. */
  places: z.array(z.string()),
  /** Rota bölgemize düşüyor mu — liste bunu ÖNCE gösterir (daha olası cevap); seçimi belirlemez. */
  inRoute: z.boolean(),
});
export type PlaceOption = z.infer<typeof PlaceOptionSchema>;

/**
 * Posta kodu önerisi (`GET /places/suggest?prefix=672`): elle yazılan kod ülkesini söylemez ve bazı kodlar iki ülkede birden
 * geçerlidir, listeden seçilen satır ise `(country, postalCode)` ikilisini birlikte taşır. Şekil `PlaceOptionSchema`nın listesidir
 * ve teslimat durumu bilerek yok, çünkü oraya gidip gidemediğimiz adres defterinin değil sipariş anının sorusudur.
 */
export const PlaceOptionListSchema = z.array(PlaceOptionSchema);

/**
 * `GET /places/by-postal-code` cevabı: dört hâl ayrık taşınır ve hepsi 200'dür, çünkü tek bir hata dizesine indirilseler ekran
 * belirsizlik seçicisini çizemezdi. `inRoute` onboarding'in ana sorusudur; rota günleri bilerek yok, kesim saatiyle bayatlar.
 */
export const PlaceResolutionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('resolved'),
    place: z.object({
      country: CountryEnum,
      /** Normalize — cihazın saklayacağı yer anahtarının yarısı (öteki yarısı `country`). */
      postalCode: z.string(),
      placeName: z.string().nullable(),
      places: z.array(z.string()),
      inRoute: z.boolean(),
    }),
  }),
  /** Kod birden çok hizmet ülkemizde geçerli: kararı müşteri verir, çünkü rota adayını otomatik seçmek yanlış ülke ve yanlış KDV
      demektir. */
  z.object({ kind: z.literal('ambiguous'), options: z.array(PlaceOptionSchema).min(2) }),
  /** Hiçbir ülkede geçerli değil: büyük olasılıkla yazım hatası. Bir kapı değil, bir uyarıdır. */
  z.object({ kind: z.literal('unknown') }),
  /**
   * Zincir koptu: `no_shipping_warehouse` bizim eksiğimizdir (müşteriye "bölge dışısınız" dedirtilmemeli), `ambiguous_zone` veri
   * çakışmasıdır (aynı kod iki bölgede). Değerler motorun `PlaceResolution` birliğinin aynısı ve bağ derlemede kilitli.
   */
  z.object({ kind: z.literal('unresolved'), reason: z.enum(['no_shipping_warehouse', 'ambiguous_zone']) }),
]);
export type PlaceResolution = z.infer<typeof PlaceResolutionSchema>;

/**
 * Bölge dışı müşterinin "buraya da gelin" kaydı: uç tek istekte anonim sayaca (`postal_code_demand`, ilgi yoğunluğu) ve kuvvetli
 * sinyale (`zone_notice`, e-posta + ülke + kod, aynı kişi aynı yer için bir kez sayılır) yazar. Hesap zorunlu değil, çünkü giriş
 * duvarı vazgeçmeye en yakın anda ikinci engel olurdu; girişli müşteride e-posta sunucuda çözülür.
 */
export const PlaceNoticeBodySchema = z.object({
  postalCode: z.string().trim().min(1).max(16),
  country: CountryEnum,
  /**
   * Ziyaretçinin adresi; girişli müşteride gövdeden alınmaz, çünkü kimlik sunucunun bildiği şeydir. Misafirde zorunlu: nereye
   * haber vereceğimizi bilmeden söz veremeyiz.
   */
  email: z.string().email().nullable().default(null),
  /**
   * Kaydın hangi EKRANDAN geldiği (`app-catalog` · `app-onboarding` · `app-account`). Enum DEĞİL:
   * bir karar girdisi değil, denetim izi — yeni ekran migration yazdırmasın (tablonun kendi kararı).
   */
  source: z.string().trim().min(1).max(32),
});

/**
 * Kaydın sonucu; `ok` "haber göndereceğiz" demek değildir, bu bir söz değil kayıttır ve ekran "not aldık" der. `already` ayrı bir
 * hâl, çünkü "kaydınız zaten var" demek sessiz kalmaktan da "yeni kayıt aldık" demekten de dürüsttür.
 */
export const PlaceNoticeResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({ status: z.literal('already') }),
  /** Yer çözülemedi: nereye haber vereceğimizi bilmiyoruz, kayıt ALINMAZ (webin aynı hükmü). */
  z.object({ status: z.literal('place_unknown') }),
  /** Misafir e-posta vermedi — giriş duvarı değil, adres sorusu. */
  z.object({ status: z.literal('email_required') }),
]);
export type PlaceNoticeResult = z.infer<typeof PlaceNoticeResultSchema>;

/**
 * "Gelince haber ver" kaydı: bölge kaydının kardeşi ama ayrı soru, "bölgenize geliyoruz ama bu boy şu an yok" hâli. Uç Bearer'ın
 * arkasında olduğu için e-posta gövdede yok, profilden çözülür; cevap `PlaceNoticeResultSchema`dır, çünkü dört hâl birebir aynı.
 */
export const StockNoticeBodySchema = PlaceNoticeBodySchema.pick({ postalCode: true, country: true }).extend({
  variantId: z.string().uuid(),
});

/**
 * Tek yer satırı: bir komün ve o komüne düşen kodlar ("Strasbourg · 67000 67100 67200"). Ad `postal_code_place`tan gelir; `null`
 * o kodun yer kaydı yok demektir ve kod yine listelenir, çünkü adı uydurmak da kodu gizlemek de yalan olurdu.
 */
export const DeliveryPlaceSchema = z.object({
  name: z.string().nullable(),
  codes: z.array(z.string()).min(1),
});

/**
 * Ülkeye göre öbek. Ülke bir GRUP EKSENİDİR, süs değil: bir bölge sınır ötesi olabiliyor (ADR-002)
 * ve `67540` ile `77694` yan yana dururken müşteri hangisinin nerede olduğunu anlayamaz.
 */
export const DeliveryAreaSchema = z.object({
  country: CountryEnum,
  places: z.array(DeliveryPlaceSchema).min(1),
});

/**
 * Teslimat bölgeleri listesi (`GET /api/v1/places/zones`): bölge adı değil posta kodu taşır, çünkü bölge adı operasyonun rota
 * etiketidir ve müşterinin elindeki tek ölçü kendi kodudur; yalnız aktif bölgeler listelenir. Kodlar sunucuda ülke → komün diye
 * öbeklenir ki yüzlerce kod okunur kalsın ve iki yüzey aynı öbeği göstersin; "benim kodum var mı" sorusunun asıl cevabı
 * `GET /places/by-postal-code`tur.
 */
export const DeliveryAreaListSchema = z.object({ areas: z.array(DeliveryAreaSchema) });
export type DeliveryAreaList = z.infer<typeof DeliveryAreaListSchema>;
