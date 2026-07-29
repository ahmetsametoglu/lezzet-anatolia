import { z } from 'zod';
import { dbNumeric, dbNumericNullable } from './db-numeric';
import { DiscountScopeEnum, DiscountTriggerEnum, DiscountTypeEnum, PreferredLanguageEnum } from './enums.schema';
import { LocalizedTextDraftSchema } from './localized-text.schema';

// Discount — kupon ve otomatik kampanya TEK varlıkta (0031). Ayrımları yalnız TETİK: kupon kodla
// çalışır, kampanya kendiliğinden. DATA_MODEL: data-model/katalog.md.
//
// Alanlar motorun `DiscountRule` sözleşmesiyle BİREBİR (`domain-core/pricing.applyBestDiscount`).
// Kural burada YAŞAMAZ: hangi indirimin kazandığı (tek-en-büyük), kimin matraha girdiği (pakete ve
// teklife indirim binmez) ve tutarın nasıl dağıtıldığı motorun işidir.
//
// DEĞERİN TABANI: `percent` → yüzde (15 = %15); `fixed` → EURO. Motor sabit tutarı KURUŞ bekler
// (STACK §8) — çeviri uygulama katmanındadır, saklanan değer eurodur.

export const DiscountSchema = z.object({
  id: z.string().uuid(),
  /** Operatörün listede tanıyacağı ad — kod değil ("Bayram indirimi"). Kampanyanın kodu yoktur. */
  name: z.string(),
  /**
   * Müşteriye görünen ad, üç dilde. `name`'den ayrıdır: o operasyonun iç etiketi (Türkçe), bu
   * vitrinin ve mailin cümlesi. Boşsa yüzey genel "İndirim/Remise/Rabatt"a düşer — 0031.
   */
  publicLabel: LocalizedTextDraftSchema.nullable(),
  trigger: DiscountTriggerEnum,
  // Kupon KODLARI ayrı varlıktır (`DiscountCode`): bir kuponun birden çok kodu olur ve hepsi aynı
  // kotayı paylaşır. Kural satırında kod kolonu YOK — olsaydı "asıl kod" diye ikinci bir kavram
  // doğar ve kotanın hangi koda ait olduğu tartışılırdı.
  type: DiscountTypeEnum,
  value: dbNumeric,
  scope: DiscountScopeEnum,
  categoryId: z.string().uuid().nullable(),
  collectionId: z.string().uuid().nullable(),
  /**
   * Asgari sepet (euro). `null` = koşul YOK — 0 ile aynı şey değil: sıfır da bir eşiktir ve
   * "koşulsuz" demek istemeyen bir operatörün yazdığı sayı olabilir.
   */
  minBasket: dbNumericNullable,
  firstOrderOnly: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  /** Kişisel kupon — yalnız bu müşteri kullanır. Boşsa herkese açık. */
  customerId: z.string().uuid().nullable(),
  maxUses: z.number().int().nullable(),
  perCustomerLimit: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Discount = z.infer<typeof DiscountSchema>;

// Zorunlular: ad, tetik, tip, değer, kapsam. Kalanı DB default'lu ya da nullable → opsiyonel.
// Tutarlılık kısıtları (kodsuz kupon, hedefsiz kapsam, ters tarih) DB'de — son emniyet oradadır;
// form da aynı kuralı gösterir ama gerçeğin sahibi tek yerdir.
export const DiscountInsertSchema = z.object({
  name: z.string().min(1),
  publicLabel: LocalizedTextDraftSchema.nullish(),
  trigger: DiscountTriggerEnum,
  type: DiscountTypeEnum,
  value: z.number().positive(),
  scope: DiscountScopeEnum,
  categoryId: z.string().uuid().nullish(),
  collectionId: z.string().uuid().nullish(),
  minBasket: z.number().nonnegative().nullish(),
  firstOrderOnly: z.boolean().optional(),
  validFrom: z.string().nullish(),
  validTo: z.string().nullish(),
  customerId: z.string().uuid().nullish(),
  maxUses: z.number().int().positive().nullish(),
  perCustomerLimit: z.number().int().positive().nullish(),
  isActive: z.boolean().optional(),
});
export type DiscountInsert = z.infer<typeof DiscountInsertSchema>;

export const DiscountUpdateSchema = DiscountSchema.partial().required({ id: true });
export type DiscountUpdate = z.infer<typeof DiscountUpdateSchema>;

/**
 * Kuponun KAPISI — bir kuralın birden çok kodu olur, hepsi aynı kotadan yer (0031).
 *
 * Ayrı varlık olmasının sebebi dildir: "HOSGELDIN" Türk müşteriye bir şey anlatır, Fransız'a
 * hiçbir şey. Üç ayrı `Discount` satırı açmak aynı kampanyanın kullanım tavanını üçe katlardı.
 */
export const DiscountCodeSchema = z.object({
  id: z.string().uuid(),
  discountId: z.string().uuid(),
  /** Müşterinin yazdığı kod. Harf ayrımsız ve TÜM kurallar arasında tekildir (DB indeksi). */
  code: z.string(),
  /** Kodun yazıldığı dil; `null` = dilden bağımsız (matbu kart üstündeki tek kod gibi). */
  locale: PreferredLanguageEnum.nullable(),
  createdAt: z.string(),
});
export type DiscountCode = z.infer<typeof DiscountCodeSchema>;

export const DiscountCodeInsertSchema = z.object({
  discountId: z.string().uuid(),
  code: z.string().min(1),
  locale: PreferredLanguageEnum.nullish(),
});
export type DiscountCodeInsert = z.infer<typeof DiscountCodeInsertSchema>;

export const DiscountCodeUpdateSchema = DiscountCodeSchema.partial().required({ id: true });
export type DiscountCodeUpdate = z.infer<typeof DiscountCodeUpdateSchema>;

/**
 * Kullanım KAYDI — sayaç değil. Sipariş tarafı yazar, tanım ekranı okur.
 *
 * `amount` kuralın değeri değil, o sepette GERÇEKTEN inen tutardır (matrah küçükse sabit tutar
 * kırpılır). Raporun ve "ne kadar indirim dağıttık" sorusunun cevabı budur.
 */
export const DiscountUseSchema = z.object({
  id: z.string().uuid(),
  discountId: z.string().uuid(),
  /**
   * Hangi KAPIDAN girildi — kotayı bölmez, sayımı zenginleştirir ("TR kodu mu FR kodu mu tuttu").
   * Otomatik kampanyada `null`: kod yoktur.
   */
  discountCodeId: z.string().uuid().nullable(),
  customerId: z.string().uuid().nullable(),
  orderId: z.string().uuid().nullable(),
  amount: dbNumeric,
  usedAt: z.string(),
});
export type DiscountUse = z.infer<typeof DiscountUseSchema>;

export const DiscountUseInsertSchema = z.object({
  discountId: z.string().uuid(),
  discountCodeId: z.string().uuid().nullish(),
  customerId: z.string().uuid().nullish(),
  orderId: z.string().uuid().nullish(),
  amount: z.number().nonnegative(),
});
export type DiscountUseInsert = z.infer<typeof DiscountUseInsertSchema>;

export const DiscountUseUpdateSchema = DiscountUseSchema.partial().required({ id: true });
export type DiscountUseUpdate = z.infer<typeof DiscountUseUpdateSchema>;
