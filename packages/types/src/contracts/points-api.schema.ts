import { z } from 'zod';
import { DiscountSchema } from '../entities/discount.schema';
import { PointsBalanceSchema, PointsEntrySchema } from '../entities/points.schema';
import { PointsReasonEnum } from '../primitives/enums.schema';

/** `/api/v1/me/points` sözleşme şemaları: hesap ekranının puan bölümü ve puan → kupon çevirmesinin ortak dili. */

/**
 * Kullanılabilir kişisel kupon; kupon ayrı tablo değil, `customer_id`si dolu bir indirim satırıdır ki sepetteki indirim motoru onu
 * görsün. Listede olan kupon süzgeçten geçmiştir; kodsuz kupon listeye girmez, çünkü müşteriye yazacak bir şey yoktur.
 */
export const MeCouponSchema = DiscountSchema.pick({
  id: true,
  amountCents: true,
  percent: true,
  minBasketCents: true,
  validTo: true,
}).extend({ code: z.string() });

/**
 * Puan kazanma yolunun anahtarı defterin sebep sözlüğünden türer ki ayar, defter ve tel aynı sözcüğü kullansın. `order` dışarıda,
 * çünkü sipariş puanı artık yazılmıyor ve kazanılamayan yolu listelemek motorun vermeyeceği sözü ekrana yazmaktır.
 */
export const MePointsEarnWayKeyEnum = PointsReasonEnum.extract([
  'referral',
  'neighbor',
  'review',
  'feedback_purchase',
  'feedback_candidate',
  'visit',
]);
export type MePointsEarnWayKey = z.infer<typeof MePointsEarnWayKeyEnum>;

/**
 * Tek kazanma yolu: anahtar ve sayı, metin yok; cümleyi müşterinin dilinde ekran kurar. `points` ayardan gelir ve pozitiftir,
 * çünkü motor sıfır değerli aksiyonu reddeder ve ekran kazandırmayan işi kazanç gibi göstermemeli.
 */
export const MePointsEarnWaySchema = z.object({
  key: MePointsEarnWayKeyEnum,
  points: z.number().int().positive(),
});

/**
 * Programın kimliksiz okunabilen kuralları; misafir onboarding de ekranın söylediği sayıları motordan okur. `centValue` ayrıca
 * taşınır, çünkü eşikten bölerek türetmek kuruşa bölünemeyen bir eşikte yanlış para basardı.
 */
export const PointsRulesSchema = z.object({
  redeem: z.object({
    minimumPoints: z.number().int(),
    /** Tek kupona çevrilebilecek azami puan; fazlası bakiyede kalır. */
    maximumPoints: z.number().int(),
    valueCents: z.number().int(),
  }),
  /** Bir puanın CENT karşılığı — bir yolun para değeri `points × centValue`. */
  centValue: z.number().int().positive(),
  /** Bir komşu davetinden kaç ödül doğar; ekrana gömülmez, çünkü davetin tek sefere ait ve sınırlı olduğu motorun sayısıyla söylenmeli. */
  neighborMaxUses: z.number().int().positive(),
  /** Puan kazanma yolları — sıra sunucudan gelir (bkz. `MePointsEarnWaySchema`). */
  earnWays: z.array(MePointsEarnWaySchema),
});

/**
 * Puan kartı: bakiye ve çevirme kuralı; eşik ayardan gelir ki ekran reddedilecek düğme göstermesin. Davet kodu ve kazanma yolları
 * kartın içinde, çünkü kart B2B'de `null` ve ikisinin de o hâlde anlamı yok.
 */
export const MePointsCardSchema = PointsBalanceSchema.pick({ balance: true }).merge(PointsRulesSchema).extend({
  /** Düğmeye basılınca çevrilecek puan ve karşılığı; ekran hesaplamaz, çünkü tavan ve eşik motorun kuralıdır. */
  nextRedeem: z.object({ points: z.number().int(), valueCents: z.number().int() }),
  /** Davet kodu, kart çizildiyse garantili (yoksa üretilir); `null` yalnız üretim başarısızsa, o hâlde ekran davet yolunu göstermez. */
  referralCode: z.string().nullable(),
  /** Kodun paylaşılabilir tam adresi; kod okunur, adres paylaşılır ve adresi ekran kurmaz ki rota adı değişince bağlantı kırılmasın. */
  inviteUrl: z.string().nullable(),
  /**
   * Bugünkü ziyaret puanı alındı mı; kimliğe bağlı olduğu için misafirin de gördüğü `earnWays`te değil kartta durur. Gün
   * işletmenin günüdür (Europe/Paris), yoksa gece yarısı civarında ekran ile motor ayrı günlerde olurdu.
   */
  visitClaimedToday: z.boolean(),
  /**
   * Ödemesi bekleyen komşu ödülleri; ödül para alınınca doğar ve o ana kadar müşteri bir iz görmeliydi. Puan değeri değil olay
   * taşınır, deftere de yazılmaz, çünkü defter olanı tutar, olabilecek olanı değil.
   */
  pendingNeighborAwards: z.array(
    z.object({
      /** Komşunun YALNIZ adı (ilk sözcük) — cümlenin öznesi; soyadı göstermenin bir işlevi yok. */
      neighborName: z.string(),
      deliveryDate: z.string(),
    }),
  ),
});

/**
 * Okuma ve çevirme aynı zarfı döner ki çevirmeden sonra ikinci okuma gerekmesin. `points` B2B'de `null`dır ve sıfır değildir;
 * kuponlar aynı koşula bağlı ve sayfalanmaz, çünkü tek kullanımlık kuponların doğal tavanı var.
 */
export const MePointsViewSchema = z.object({
  points: MePointsCardSchema.nullable(),
  coupons: z.array(MeCouponSchema),
});

/**
 * Puan geçmişinin bir satırı; davet ve komşu ödülleri müşteri uygulamada değilken doğduğu için görünür oldukları tek yer burası.
 * Sebep kümesi defterin tamamıdır; `note`, `refId` ve `createdBy` iç bilgi olduğu için dışarıda.
 */
export const MePointsHistoryEntrySchema = PointsEntrySchema.pick({
  id: true,
  /** İşaretli: **+ kazanım, − harcama.** Ekran işareti hem renkten hem rakamdan okutur. */
  points: true,
  reason: true,
}).extend({
  /** Hareketin anı — `createdAt`in taşıma adı; ekran onu tarihe çevirir, ham damgayı yazmaz. */
  at: PointsEntrySchema.shape.createdAt,
});

/**
 * Geçmişin sayfa zarfı; defter sınırsız büyüdüğü için keyset imleç, offset değil. İmleç opaktır ve URL'e yazılmaz; `total` yok,
 * çünkü tasarımda sayaç yok.
 */
export const MePointsHistoryPageSchema = z.object({
  entries: z.array(MePointsHistoryEntrySchema),
  nextCursor: z.string().nullable(),
});

/** Çevirmenin adlı retleri motorun sözlüğüyle aynı, yalnız `b2b` dışarı `not_eligible` çıkar; cümleyi ekran kurar. */
export const MePointsRedeemErrorEnum = z.enum(['insufficient_balance', 'below_minimum', 'not_eligible']);
export type MePointsRedeemError = z.infer<typeof MePointsRedeemErrorEnum>;

/**
 * Çevirmenin cevabı güncel cüzdan ve yeni kuponun kodu; kod ayrıca taşınır ki ekran yeni kuponu listeyi karşılaştırmadan söylesin.
 * `null` yalnız RPC kod döndürmezse, o hâlde bildirim gösterilmez.
 */
export const MePointsRedeemResultSchema = MePointsViewSchema.extend({ redeemedCode: z.string().nullable() });
