import { z } from 'zod';
import { AddressSchema } from '../entities/address.schema';
import { AddressGeoPrecisionEnum, AddressGeoSourceEnum, CountryEnum } from '../primitives/enums.schema';

/**
 * `/api/v1/me/addresses` sözleşmesi: mobil adres uçlarının ve hesap ekranının ortak dili. `address.schema.ts` veritabanı satırının
 * aynasıdır, bu dosya yüzeyin tele ne verdiğini söyler.
 */

/**
 * Küme ekranın okuduğu alanlardır; `customerId` jetondan çözüldüğü, `createdAt` sıralama sunucuda olduğu için dışarıda. `line2`,
 * `recipient`, `phone` ve `country` kümede, çünkü düzenleme onları geri gönderir ve gönderilmeyen alan "hiçbir şeyi değiştirmeden
 * Kaydet" diyen müşteride kaybolurdu (`country` kaybolursa iki ülkede geçerli kodda kapı `country_required` der).
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
  /* Fatura adresi işareti tele konur, çünkü müşteri hangi adrese fatura kesileceğini kartın üstünde görmeden bilemez. */
  isBilling: true,
});

/**
 * Uçların cevabı HER ZAMAN güncel listedir — yazma uçları dahil. Varsayılan değişimi ve "varsayılan
 * silinirse en yeni devralır" kuralı TEK satırı değil komşularını da oynatır; tek kaydı dönmek
 * istemciyi ikinci bir liste çağrısına mecbur bırakırdı.
 */
export const MeAddressListSchema = z.array(MeAddressSchema);

/**
 * Adres doğrulamasının sonucu (`POST /me/addresses/:id/check`): satırın niteliği değil sipariş anının cevabı, bu yüzden
 * `MeAddressSchema`ya alan olarak girmez, yoksa istemci bayat cevabı taze sanardı. `confirmed` ve `unknown` istemcide elenir,
 * çünkü hiçbir şey söylemeyen bir satır müşteriyi gerçek uyarıyı da okumamaya alıştırırdı.
 */
export const AddressCheckResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('confirmed') }),
  z.object({
    status: z.literal('wrong_postal_code'),
    /** Ekrana yazılan metin — SERVİSİN kendi etiketi, biz cümle kurmayız. */
    label: z.string(),
    /* Teklifi UYGULAMAK için: etiketi ayrıştırmak kırılgan olurdu (yazım, aksan, sıralama).
       Değişen tam olarak bu ikili — sokak ve numara aynı, kapı başka kodda. */
    postalCode: z.string(),
    city: z.string(),
  }),
  z.object({ status: z.literal('street_only') }),
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('unknown') }),
]);
export type AddressCheckResult = z.infer<typeof AddressCheckResultSchema>;

/**
 * Yazma gövdesi, create ve update için aynı form. `isDefault` bilerek yok, çünkü varsayılan seçimi kendi ucudur ve gövdeden sızması
 * iki varsayılan bırakır; `postalCode` beş rakamdır, çünkü teslimat bölgesi kararı bu anahtarla verilir.
 */
export const AddressWriteSchema = z.object({
  label: z.string().nullish(),
  /**
   * Teslim alacak kişi, zorunlu: boş bırakılırsa soru okuma anına ertelenir ve okuyan uçlar ayrışır. Yeni adreste alan hesabın
   * adıyla dolu gelir; asıl değişmez veride (`address.recipient not null`).
   */
  recipient: z.string().min(1),
  /**
   * Teslimat telefonu, zorunlu ve E.164'e indirgenmiş beklenir: kapıya teslimde kurye önce arar. Kalıp dayatılmaz, çünkü iki ülke
   * iki uzunluk taşır ve serbest yazımı reddetmek numarası olan müşteriyi adres ekleyemez hâle getirirdi.
   */
  phone: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullish(),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().min(1),
  /**
   * Seçilen yerin ülkesi, öneri listesinden gelir: kapı bu değeri kodun o ülkede geçerli olup olmadığına bakmadan yazmaz, yani alan
   * bir beyan değil adaylar arasından seçimdir. Verilmezse sunucu kodu çözer ve iki ülkeye düşerse `country_required` der, çünkü
   * birini tahmin etmek yanlış KDV demektir.
   */
  country: CountryEnum.optional(),
  /**
   * Seçilen önerinin koordinatı, `country` gibi bir aday: adı satırın `lat`/`lng`inden ayrı, çünkü aynı adı taşısaydı bir gün
   * makullük süzgecini (`plausiblePoint`) atlayıp doğrudan satıra yazılırdı. Verilmezse satır noktasız doğar ve tarama işi çözer;
   * alan bir hızlandırıcıdır, ön koşul değil.
   */
  point: z
    .object({
      lat: z.number(),
      lng: z.number(),
      precision: AddressGeoPrecisionEnum,
      /**
       * Noktayı kim verdi: Fransa önerisi BAN, Almanya önerisi ve elle girilenin doğrulaması Google. Kaynak yaşlanma kuralını
       * belirler (Google noktası 30 günden uzun saklanamaz); verilmezse kapı `ban` sayar.
       */
      source: AddressGeoSourceEnum.exclude(['manual']).optional(),
    })
    .nullish(),
});

/*
  Adres arama kapıları: öneri, seçilen önerinin açılışı ve elle girilen adresin doğrulanması. Tek kapı, ülkeye göre sağlayıcı
  (Fransa BAN, Almanya Google); kural `@lezzet/application`da.
*/

/** Doğrulanmış nokta — kaynağıyla; kayda ADAY olarak gider (`AddressWriteSchema.point`). */
export const AddressLookupPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  precision: AddressGeoPrecisionEnum,
  source: AddressGeoSourceEnum.exclude(['manual']),
});

/**
 * Açılmış adres — sokak satırı, kod, şehir ve noktası. Google bazı sonuçlarda kodu ya da şehri
 * vermiyor: alan `null` gelir ve çekmece elle giriş kartını bilinenle açar.
 */
export const AddressLookupAddressSchema = z.object({
  line1: z.string(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  point: AddressLookupPointSchema,
});

/**
 * Öneri satırı — `GET /me/addresses/lookup/suggest?country=`. `address` sağlayıcı öneride tam adresi
 * veriyorsa (BAN) dolu; vermiyorsa (Google) `null` ve seçim `…/lookup/resolve` ister.
 */
export const AddressLookupOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  address: AddressLookupAddressSchema.nullable(),
});

/** Öneri cevabı. `busy`: sağlayıcının kotası doldu — ekran "biraz sonra" der, elle giriş açık kalır. */
export const AddressLookupSuggestResultSchema = z.object({
  options: z.array(AddressLookupOptionSchema),
  busy: z.boolean(),
});

/** `GET /me/addresses/lookup/resolve?country=&id=` — seçilen önerinin tam adresi; bulunamazsa `null`. */
export const AddressLookupResolvedSchema = AddressLookupAddressSchema.nullable();

/** Elle girilen adresin doğrulama gövdesi — `POST /me/addresses/lookup/check`. Ülke SEÇİLİR (önce ülke). */
export const AddressLookupCheckBodySchema = z.object({
  line1: z.string().min(1),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().min(1),
  country: CountryEnum,
});

/** Doğrulamanın cevabı, nokta ya da `null`; bulunamazsa adres yine kaydedilir ve noktasını tarama arar. */
export const AddressLookupCheckResultSchema = AddressLookupPointSchema.nullable();
