import { z } from 'zod';

/*
  BAN'ın cevap şekli; bizim değil dış servisin sözleşmesi olduğu için `packages/types`te değil burada durur.
  Şema bir kapıdır: beklenmeyen şekil ekrana `undefined` sızdırmaz, `invalid_response` olarak döner.
*/

/** Sonucun inceliği: kapı numarası, sokak, mevki, komün. */
export const BanResultTypeSchema = z.enum(['housenumber', 'street', 'locality', 'municipality']);

const BanPropertiesSchema = z.object({
  label: z.string(),
  score: z.number(),
  id: z.string(),
  type: BanResultTypeSchema,
  postcode: z.string(),
  citycode: z.string(),
  city: z.string(),
  // Sonucun türüne göre servis bu alanları hiç göndermeyebilir ya da `null` gönderebilir.
  banId: z.string().nullish(),
  name: z.string().nullish(),
  street: z.string().nullish(),
  housenumber: z.string().nullish(),
  context: z.string().nullish(),
});

const BanFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Point'),
    /** GeoJSON sırası [boylam, enlem]; karıştırılırsa nokta başka kıtaya düşer. */
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: BanPropertiesSchema,
});

export const BanCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(BanFeatureSchema),
});

export type BanFeature = z.infer<typeof BanFeatureSchema>;
