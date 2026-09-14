import { z } from 'zod';

/*
  GOOGLE MAPS PLATFORM'UN TEL ÜSTÜNDEKİ ŞEKLİ — üç uç, üç cevap.

  NEDEN `packages/types`TE DEĞİL: `types` bizim ALAN şemalarımızın tek kaynağı; buradaki şekil
  dışarıdaki bir servisin sözleşmesi (`@lezzet/address-fr`in `ban.schema.ts`iyle aynı ayrım).
  Dışarı verdiğimiz şey ham cevap değil, `address.ts`teki NORMALLEŞTİRİLMİŞ öneri/adres/hükümdür.

  ŞEMA NEDEN VAR (kontrol değil, KAPI): Google cevapları yüzlerce alan taşıyabiliyor ve alan
  maskesine göre bir kısmı hiç gelmiyor. `parse` bir süzgeç — beklemediğimiz şekil geldiğinde
  ekrana `undefined` sızmasın, adlı bir ret dönsün (`invalid_response`). Yalnız okuduğumuz alanlar
  yazılı; gerisi zod'un varsayılanıyla düşer.

  KAYNAK (okundu 13.09): Places API (New) `places:autocomplete` · `places/{id}` (alan maskesi
  `addressComponents,formattedAddress,location`) · Address Validation `v1:validateAddress`.
*/

/** Otomatik tamamlama — yalnız yer tahminleri; sorgu tahminleri (`queryPrediction`) istenmiyor. */
export const PlacePredictionSchema = z.object({
  placeId: z.string(),
  text: z.object({ text: z.string() }),
  structuredFormat: z
    .object({
      mainText: z.object({ text: z.string() }),
      secondaryText: z.object({ text: z.string() }).nullish(),
    })
    .nullish(),
  types: z.array(z.string()).nullish(),
});

export const AutocompleteResponseSchema = z.object({
  /* Boş sonuçta Google alanı HİÇ göndermiyor — `suggestions` yok. `nullish` bunu "sıfır öneri"
     olarak okur; şema olmadan boş cevap `invalid_response` sayılırdı. */
  suggestions: z
    .array(
      z.object({
        placePrediction: PlacePredictionSchema.nullish(),
      }),
    )
    .nullish(),
});

/** Yer detayı — adres bileşenleri + nokta + biçimli adres (Essentials kademesi). */
export const AddressComponentSchema = z.object({
  longText: z.string(),
  shortText: z.string().nullish(),
  types: z.array(z.string()),
});

export const PlaceDetailsResponseSchema = z.object({
  formattedAddress: z.string().nullish(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
  addressComponents: z.array(AddressComponentSchema).nullish(),
});

/**
 * Adres doğrulama — hüküm + düzeltilmiş adres + nokta.
 *
 * `validationGranularity` servisin kendi sözlüğü; bizim dört kademeye çevirisi `address.ts`te.
 * Bilinmeyen bir değer gelirse (sözlük büyürse) `catch`le tanınmayan sayılır, şema düşmez.
 */
export const GranularitySchema = z
  .enum(['GRANULARITY_UNSPECIFIED', 'SUB_PREMISE', 'PREMISE', 'PREMISE_PROXIMITY', 'BLOCK', 'ROUTE', 'OTHER'])
  .catch('GRANULARITY_UNSPECIFIED');

export const ValidationComponentSchema = z.object({
  componentName: z.object({ text: z.string() }).nullish(),
  componentType: z.string().nullish(),
  confirmationLevel: z.string().nullish(),
  inferred: z.boolean().nullish(),
  replaced: z.boolean().nullish(),
  spellCorrected: z.boolean().nullish(),
  unexpected: z.boolean().nullish(),
});

export const ValidateAddressResponseSchema = z.object({
  result: z.object({
    verdict: z
      .object({
        validationGranularity: GranularitySchema.nullish(),
        geocodeGranularity: GranularitySchema.nullish(),
        addressComplete: z.boolean().nullish(),
        hasReplacedComponents: z.boolean().nullish(),
        hasUnconfirmedComponents: z.boolean().nullish(),
        hasInferredComponents: z.boolean().nullish(),
      })
      .nullish(),
    address: z
      .object({
        formattedAddress: z.string().nullish(),
        postalAddress: z
          .object({
            regionCode: z.string().nullish(),
            postalCode: z.string().nullish(),
            locality: z.string().nullish(),
            addressLines: z.array(z.string()).nullish(),
          })
          .nullish(),
        addressComponents: z.array(ValidationComponentSchema).nullish(),
      })
      .nullish(),
    geocode: z
      .object({
        location: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
        placeId: z.string().nullish(),
      })
      .nullish(),
  }),
});

export type PlacePrediction = z.infer<typeof PlacePredictionSchema>;
export type PlaceDetailsResponse = z.infer<typeof PlaceDetailsResponseSchema>;
export type ValidateAddressResponse = z.infer<typeof ValidateAddressResponseSchema>;
export type Granularity = z.infer<typeof GranularitySchema>;
