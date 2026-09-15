import { z } from 'zod';
import { AddressGeoPrecisionEnum, AddressGeoSourceEnum, CountryEnum } from '../primitives/enums.schema';
import { dbNumericNullable } from '../primitives/db-numeric';
import { PostalCodeSchema } from '../primitives/postal-code.schema';

// Müşteri adresi; `customerId` müşteri rolüyle davranan profildir (`user_profiles.id`), ayrı müşteri tablosu yoktur. `inRoute`
// saklanmaz, posta kodunun aktif bir bölgeye düşmesinden türetilir.

export const AddressSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  /**
   * Müşterinin verdiği ad ("Ev", "İş") ve adres kartının başlığı, çünkü müşteri iki adresi sokak adıyla değil adıyla ayırt eder.
   * Boşsa ekran şehri başlık yapar.
   */
  label: z.string().nullable(),
  /**
   * Adrese giden kişi; hesap sahibi olmak zorunda değil (hediye, iş adresi) ve kurye kapıda kimi soracağını buradan bilir. Zorunlu,
   * çünkü boş bırakılırsa okuyan her uç kendi yedeğini uydurur ve yüzeyler ayrışır; yeni adres hesabın künyesiyle dolu açılır.
   */
  recipient: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  /**
   * Teslimat telefonu adrese aittir, hesaba değil: hediye adresinde aranacak numara alıcınınkidir. Zorunlu (gerekçesi `recipient`
   * ile aynı); biçim istemcide E.164'e indirgenir, şema yalnız varlığını zorlar.
   */
  phone: z.string(),
  country: CountryEnum,
  /** Checkout'un önceden seçtiği adres — tekildir (yenisi seçilince eskisi düşer). */
  isDefault: z.boolean(),
  /**
   * Fatura adresi: faturaya çıkan, siparişten siparişe değişmeyen işletme adresi; tekildir, kısmi indeksle zorlanır. `isDefault` ile
   * ayrı iki rol olduğu için ikisi aynı satırda olabilir ve teslimat seçimini kısıtlamaz, çünkü çoğu küçük işletmede iş yeri teslimat
   * yeridir.
   */
  isBilling: z.boolean(),
  createdAt: z.string(),

  /**
   * Adresin coğrafi noktası, rota sıralamasının girdisi; `null` ölçülemedi demektir, sıfır değil, çünkü (0, 0) Gine Körfezi'dir.
   * İkisi birlikte var ya da birlikte yok (`address_geo_point` kısıtı).
   */
  lat: dbNumericNullable,
  lng: dbNumericNullable,
  /** Ölçümün inceliği — `municipality` bir kapıyı değil belediye merkezini gösterir. */
  geoPrecision: AddressGeoPrecisionEnum.nullable(),
  geoSource: AddressGeoSourceEnum.nullable(),
  /** Noktanın YAZILDIĞI an. */
  geoAt: z.string().nullable(),
  /** Son DENEME anı (başarısız da olsa) — taramanın freni; `geoAt` ile ayrı sorulardır. */
  geoCheckedAt: z.string().nullable(),
  /**
   * Servisin kaç kez "eşleşme yok" dediği; yalnız cevaplı ret sayılır, yoksa servisin düştüğü bir öğleden sonra yüzlerce adres
   * kalıcı "çözülemez" damgası yerdi. Sayacın kendisi durumdur, ayrı bir `geoStatus` gerekmez.
   */
  geoAttempts: z.number().int(),
  /**
   * "Bunu mu demek istediniz": kapı istenen kodda yok ama başka bir kodda varsa servisin kendi etiketi, çünkü bizim kuracağımız
   * cümle servisin yazımından sapardı. Aynı zamanda "uyarıldı ama düzeltmedi" kaydıdır: teklif kabul edilirse adres değişir ve
   * etiket temizlenir, reddedilirse kalır.
   */
  geoAltLabel: z.string().nullable(),
});
export type Address = z.infer<typeof AddressSchema>;

/**
 * Yazılabilir koordinat künyesi: beş alan tek parça taşınır, çünkü bölünemezler (nokta olmadan kademe yazmak `address_geo_meta`
 * kısıtını ihlal eder). Tek kapı `resolveAddressPoint`; her yazma yolunun kendi kuralını yazmasının önü böyle kapanır.
 */
export const AddressGeoWriteSchema = z.object({
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  geoPrecision: AddressGeoPrecisionEnum.nullable(),
  geoSource: AddressGeoSourceEnum.nullable(),
  geoAt: z.string().nullable(),
  geoCheckedAt: z.string().nullable(),
  geoAttempts: z.number().int(),
  /** Düzeltme önerisi — adres değişince ötekilerle BİRLİKTE düşer; o yüzden bu parçanın içinde. */
  geoAltLabel: z.string().nullable(),
});
export type AddressGeoWrite = z.infer<typeof AddressGeoWriteSchema>;

export const AddressInsertSchema = z.object({
  customerId: z.string().uuid(),
  label: z.string().nullish(),
  /** Kolon `not null`: yazan hiçbir yol (form, besleme, içe aktarma) bunu atlayamaz. */
  recipient: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullish(),
  postalCode: PostalCodeSchema,
  city: z.string().min(1),
  /** Kolon `not null`; biçim E.164'e istemcide indirgenir (`normalizePhone`). */
  phone: z.string().min(1),
  country: CountryEnum.optional(),
  isDefault: z.boolean().optional(),
  /** Fatura adresi işareti — kurumsal başvuru akışı kendi kaydettiği iş adresini böyle işaretler. */
  isBilling: z.boolean().optional(),
  /**
   * Koordinat künyesi — kapıdan (`resolveAddressPoint`) gelir, formdan DEĞİL. Beş alanın beşi de
   * opsiyonel: nokta çözülemeyen adres yine kaydedilir ve tarama kuyruğuna düşer.
   */
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  geoPrecision: AddressGeoPrecisionEnum.nullish(),
  geoSource: AddressGeoSourceEnum.nullish(),
  geoAt: z.string().nullish(),
  geoCheckedAt: z.string().nullish(),
  geoAttempts: z.number().int().optional(),
  geoAltLabel: z.string().nullish(),
});
export type AddressInsert = z.infer<typeof AddressInsertSchema>;

/** Okuma şeklinden türer ama posta kodunda yazma kuralını taşır: kural okumaya konsaydı eski bir satır listeyi kırardı. */
export const AddressUpdateSchema = AddressSchema.partial().required({ id: true }).extend({ postalCode: PostalCodeSchema.optional() });
export type AddressUpdate = z.infer<typeof AddressUpdateSchema>;
