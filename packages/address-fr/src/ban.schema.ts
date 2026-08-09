import { z } from 'zod';

/*
  BAN'IN TEL ÜSTÜNDEKİ ŞEKLİ — Fransız devletinin coğrafi kodlama servisinin CEVABI.

  NEDEN `packages/types`TE DEĞİL: `types` bizim ALAN şemalarımızın tek kaynağı; buradaki şekil
  bizim değil, dışarıdaki bir servisin sözleşmesi ve onu biz değiştiremeyiz. `packages/ai` ve
  `packages/storage` de aynı ayrımı yapıyor — dış servisin şekli, o servisi konuşan paketin içinde
  durur. Dışarı verdiğimiz şey ham cevap değil, `address.ts`teki NORMALLEŞTİRİLMİŞ öneridir.

  ŞEMA NEDEN VAR (kontrol değil, KAPI): servis GeoJSON döndürüyor ve alanların bir kısmı sonuç
  türüne göre YOK. `parse` burada bir süzgeçtir — beklemediğimiz bir şekil geldiğinde ekrana
  `undefined` sızmasın, adlı bir ret dönsün (`invalid_response`). Sessizce yarım veri göstermek,
  müşteriye var olmayan bir adresi doğruymuş gibi okutur.

  ALANLARIN ANLAMI (ölçüldü, 09.08 — canlı servisten):
  · `label`      — insanın okuduğu tam satır ("6 Rue du Marché 67000 Strasbourg")
  · `type`       — sonucun İNCELİĞİ: housenumber (kapı numarası) > street > locality > municipality
  · `housenumber`— YALNIZ `type: housenumber`ta var; sokak sonucunda alan hiç gelmez
  · `postcode`   — posta kodu · `citycode` — INSEE komün kodu (posta kodundan FARKLI ve daha kesin)
  · `score`      — 0..1 arası eşleşme güveni; servisin kendi sıralaması bununla
  · `banId`      — BAN'ın kalıcı kimliği; `id` ise komün+sokak birleşimi
  · `distance`   — YALNIZ ters sorguda (metre)
*/

/** Sonucun inceliği — kaba (komün) ile kesin (kapı numarası) arasında dört kademe. */
export const BanResultTypeSchema = z.enum(['housenumber', 'street', 'locality', 'municipality']);
export type BanResultType = z.infer<typeof BanResultTypeSchema>;

const BanPropertiesSchema = z.object({
  label: z.string(),
  score: z.number(),
  id: z.string(),
  type: BanResultTypeSchema,
  postcode: z.string(),
  citycode: z.string(),
  city: z.string(),
  /* Aşağıdakiler sonucun türüne göre YOK olabilir — `nullish` çünkü servis alanı kimi zaman hiç
     göndermiyor, kimi zaman `null` gönderiyor; ikisi de "bu sonuçta yok" demek. */
  banId: z.string().nullish(),
  name: z.string().nullish(),
  street: z.string().nullish(),
  housenumber: z.string().nullish(),
  context: z.string().nullish(),
  /** Ters sorguda noktaya uzaklık (metre). Düz aramada gelmez. */
  distance: z.number().nullish(),
});

const BanFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Point'),
    /** GeoJSON sırası [boylam, enlem] — enlem/boylam DEĞİL. Karıştırılırsa nokta Afrika'ya düşer. */
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: BanPropertiesSchema,
});

export const BanCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(BanFeatureSchema),
});

export type BanFeature = z.infer<typeof BanFeatureSchema>;
