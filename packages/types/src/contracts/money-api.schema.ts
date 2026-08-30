import { z } from 'zod';
import { AccountTypeEnum } from '../entities/money.schema';
import { OrderStatusEnum, PaymentMethodEnum } from '../primitives/enums.schema';

/**
 * `/api/v1/money/*` SÖZLEŞME şemaları (21.12) — Para bölümünün (M1 tahsilat izleme · M2 gün sonu)
 * uçlarıyla ekranlarının ortak dili.
 *
 * PARA EKRANLARI SALT OKUNURDUR (tasarımın altın kuralı: "'bakiye düzeltme' diye bir kavram yok")
 * — bu dosyada hiçbir istek gövdesi şeması yoktur ve bu bir eksik değil, tasarım kararının
 * sözleşmedeki karşılığıdır: yazma ucu açılacaksa önce o karar değişmeli.
 */

/* ── M1 · TAHSİLAT İZLEME (v2:358-363, 721-750) ─────────────────────────────── */

/**
 * Bekleyen tahsilat satırı. `kind` cümlenin şeklini seçer (v2:735):
 * - `door`    → kapıda ödenecek; tahsil edilecek tutar ve yöntem bilinir.
 * - `partial` → kısmen ödenmiş; kalan tutar yazılır.
 * Vadeli (B2B term) satır BİLEREK yok: modelde vade alanı yok, uydurulmaz — alan doğduğu gün
 * buraya artımlı eklenir (tipler artımlı, CLAUDE §1).
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
 * Kuryenin üstündeki para — **SEFER BAŞINA** (v3:23, kullanıcı bulgusu 30.08).
 *
 * Önce tek toplam taşınıyordu ve ekran onu yöntem kırılımıyla yazıyordu; tasarım ise kartı kurye
 * kurye çiziyor ("Marc Lemoine · SF-26-YRNWV9 · 186,00 €"). Toplam, muhasebecinin soramadığı
 * soruyu cevapsız bırakıyordu: **kimde**. Para birinin cebindeyse o kişinin adı bilginin kendisidir;
 * "186,00 € kuryelerde" ile "186,00 € Marc'ta" aynı cümle değildir.
 *
 * Veri zaten defterdeydi: `delivery_run` künyeyi (`referenceNo` · `courierId`), `delivery_run`ın
 * tahsilat satırı da beklenen tutarları taşıyor — eksik olan yalnız zarftı.
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
   * Bugün deftere düşen tahsilat ADEDİ (v3:23 rozeti — "14 tahsilat").
   *
   * Tutarın yanında DURAN ama ondan türetilEMEYEN sayı: 1.286,50 € iki tahsilattan da gelebilir,
   * kırktan da; muhasebecinin "gün yoğun muydu" sorusunun cevabı adettedir. `todayByMethod`
   * yöntem başına yalnız tutar taşır, dolayısıyla adet oradan çıkarılamaz — kendi alanı olmak
   * zorunda.
   */
  todayCount: z.number().int().nonnegative(),
  /**
   * Kuryelerin üstündeki para: bugünün HENÜZ KAPANMAMIŞ seferlerinde kapıda toplanan tutarlar,
   * **sefer başına**. Online/havale bu dökümde YOKTUR (v2:744) — o para hiç kuryenin eline değmez.
   * Küme bugünün açık seferleriyle sınırlı olduğu için doğal tavanlı (tek tur, sayfalama yok).
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
   * Beklenen ↔ sayılan nakit farkı, bugünün KAPANMIŞ seferleri üzerinden.
   * `null` = bugün kapanan sefer yok; mutabakat sorusu henüz sorulmadı (0 "fark yok" derdi — yalan).
   *
   * `runs` KÜNYEDİR, toplam değil (v3:24, kullanıcı bulgusu 30.08): şablon uyuşmazlığın altına
   * "SF-26-YRNWV9 · Marc Lemoine · 17:42" yazıyor. Bir eksiğin peşine düşen muhasebeci **hangi
   * seferi** arayacağını bilmeli; toplam tek başına "bir yerde 4,50 € eksik" demekten öteye
   * gitmiyordu. Yalnız FARKI OLAN seferler girer — tutan sefer bir künye değil, sessiz bir onaydır.
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
  /** Defterde eşleşmemiş (reconcile edilmemiş) hareket sayısı. */
  unmatchedMovementCount: z.number().int().nonnegative(),
});
export type MoneyDayEnd = z.infer<typeof MoneyDayEndSchema>;
