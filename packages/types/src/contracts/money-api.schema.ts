import { z } from 'zod';
import { AccountTypeEnum } from '../entities/money.schema';
import { OrderStatusEnum, PaymentMethodEnum } from '../primitives/enums.schema';

/**
 * `/api/v1/money/*` sözleşme şemaları: Para bölümünün (tahsilat izleme, gün sonu) uçlarıyla ekranlarının ortak dili.
 * Para ekranları salt okunurdur, bu yüzden istek gövdesi şeması yoktur; yazma ucu açılacaksa önce o karar değişmeli.
 */

/* ── M1 · TAHSİLAT İZLEME (v2:358-363, 721-750) ─────────────────────────────── */

/**
 * Bekleyen tahsilat satırı; `kind` cümlenin şeklini seçer: `door` kapıda ödenecek (tutar ve yöntem bilinir), `partial` kısmen ödenmiş (kalan yazılır).
 * Vadeli satır yoktur, çünkü modelde vade alanı yok ve uydurulmaz.
 */
export const PendingCollectionSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  customerName: z.string(),
  /** Satırın hâl etiketi ("rotada", "teslim edildi") duruma göre YÜZEYDE kurulur. */
  status: OrderStatusEnum,
  kind: z.enum(['door', 'partial']),
  /** Tahsil edilecek KALAN tutar (cent). */
  remainingCents: z.number().int(),
  method: PaymentMethodEnum.nullable(),
});
export type PendingCollection = z.infer<typeof PendingCollectionSchema>;

/** Bugün gerçekleşen tahsilatın yöntem kırılımı — yalnız hareketi olan yöntemler döner. */
export const MethodTotalSchema = z.object({
  method: PaymentMethodEnum,
  cents: z.number().int(),
});
export type MethodTotal = z.infer<typeof MethodTotalSchema>;

/** Defterdeki hesap bakiyesi — hesap SAYISI operatör kurulumudur (doğal tavan, tek tur). */
export const AccountBalanceRowSchema = z.object({
  name: z.string(),
  type: AccountTypeEnum,
  cents: z.number().int(),
});
export type AccountBalanceRow = z.infer<typeof AccountBalanceRowSchema>;

/**
 * Kuryenin üstündeki para, sefer başına: para birinin cebindeyse o kişinin adı bilginin kendisidir ("186,00 € Marc'ta").
 * Künye `delivery_run`dan, beklenen tutarlar seferin tahsilat görünümünden gelir.
 */
export const CourierFloatRowSchema = z.object({
  runId: z.string().uuid(),
  referenceNo: z.string(),
  /** Seferi süren kurye; profili okunamazsa ad UYDURULMAZ (`null` → ekran kuyruksuz yazar). */
  courierName: z.string().nullable(),
  cashCents: z.number().int(),
  cardCents: z.number().int(),
  chequeCents: z.number().int(),
});
export type CourierFloatRow = z.infer<typeof CourierFloatRowSchema>;

export const MoneyOverviewSchema = z.object({
  /**
   * Günün bekleyen tahsilatları — küme TESLİM GÜNÜYLE sınırlı olduğu için doğal tavanlı (tek tur).
   * "Tüm zamanların ödenmemişleri" bu ekranın sorusu değil; o döküm masaüstü muhasebenin işidir.
   */
  pending: z.array(PendingCollectionSchema),
  todayByMethod: z.array(MethodTotalSchema),
  /**
   * Bugün deftere düşen tahsilat adedi: tutardan türetilemez ("gün yoğun muydu" sorusunun cevabı adettir) ve `todayByMethod` yalnız tutar taşır.
   */
  todayCount: z.number().int().nonnegative(),
  /**
   * Bugünün kapanmamış seferlerinde kapıda toplanan tutarlar, sefer başına; online ve havale burada yoktur, çünkü kuryenin eline değmez.
   * Küme bugünün açık seferleriyle sınırlıdır, tek turda gelir.
   */
  courierFloat: z.array(CourierFloatRowSchema),
  accounts: z.array(AccountBalanceRowSchema),
});
export type MoneyOverview = z.infer<typeof MoneyOverviewSchema>;

/* ── M2 · GÜN SONU MUTABAKAT ÖZETİ (v2:758-779) ─────────────────────────────── */

export const MoneyDayEndSchema = z.object({
  /** Özetin günü (YYYY-MM-DD). */
  date: z.string(),
  /** Bugün deftere giren sipariş tahsilatı (cent). */
  collectedCents: z.number().int(),
  /** Bugünün iadeleri — NEGATİF tutulur: işaret veridedir, ekranda uydurulmaz. */
  refundCents: z.number().int(),
  /** Kapanan seferlerde sayılıp teslim edilen nakit (cent). */
  courierHandoverCents: z.number().int(),
  /**
   * Bugünün kapanmış seferlerinde beklenen ile sayılan nakit farkı; `null` = bugün kapanan sefer yok (0 "fark yok" derdi).
   * `runs` künyedir, toplam değil: muhasebeci hangi seferi arayacağını bilmeli; yalnız farkı olan seferler girer.
   */
  discrepancy: z
    .object({
      expectedCents: z.number().int(),
      countedCents: z.number().int(),
      runs: z.array(
        z.object({
          referenceNo: z.string(),
          /** Profili okunamazsa ad UYDURULMAZ — künye kuyruksuz yazılır. */
          courierName: z.string().nullable(),
          closedAt: z.string(),
          /** sayılan − beklenen; eksi = eksik teslim, artı = fazla para. */
          differenceCents: z.number().int(),
        }),
      ),
    })
    .nullable(),
  /** Defterde izah edilmemiş hareket sayısı: sipariş, mal kabul, tedarikçi, belge, etiket ya da transfer bağı olmayan satırlar. */
  unexplainedMovementCount: z.number().int().nonnegative(),
});
export type MoneyDayEnd = z.infer<typeof MoneyDayEndSchema>;
