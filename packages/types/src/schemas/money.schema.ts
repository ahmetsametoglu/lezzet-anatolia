import { z } from 'zod';
import { CurrencyEnum } from './enums.schema';

// Para ve ön muhasebe (DOMAIN §9, data-model/para.md).
//
// TEK MANTIK: **para bir hesapta durur, hareketlerle girer/çıkar.** Kasa hareketi ile banka hareketi
// aynı şeydir, yalnız hesabı farklıdır — bu yüzden tek tablo, kasa/banka ayrımı yok.
//
// BAKİYE SAKLANMAZ, hareketlerden türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz, kayarsa izi
// bulunamaz). Türetimin tek yeri `account_movement` görünümüdür — bkz. `AccountLedgerRow`.

/** Paranın durduğu yer. "Online havuz" ayrı değil — o da bir hesap (Stripe). */
export const AccountTypeEnum = z.enum(['cash', 'bank', 'provider']);
export type AccountType = z.infer<typeof AccountTypeEnum>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: AccountTypeEnum,
  currency: CurrencyEnum,
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountInsertSchema = z.object({
  name: z.string().min(1),
  type: AccountTypeEnum,
  currency: CurrencyEnum.optional(),
  isActive: z.boolean().optional(),
});
export type AccountInsert = z.infer<typeof AccountInsertSchema>;

export const AccountUpdateSchema = AccountSchema.partial().required({ id: true });
export type AccountUpdate = z.infer<typeof AccountUpdateSchema>;

/** Paranın yönü — hesabın gözünden: `in` girdi, `out` çıktı. */
export const MovementDirectionEnum = z.enum(['in', 'out']);
export type MovementDirection = z.infer<typeof MovementDirectionEnum>;

/**
 * Hareketin SEBEBİ. Yön çoğunlukla sebepten türer (satış parayı içeri, gider dışarı alır) — bu
 * ilişki motorda tanımlıdır (`domain-core/money.expectedDirection`), veri modelinde değil: kural
 * değişirse tek yerde değişir.
 */
export const MovementTypeEnum = z.enum([
  'order_payment', // sipariş tahsilatı
  'order_refund', // müşteriye iade
  'purchase', // stok alımı (StockIntake bağı)
  'expense', // kira/akaryakıt/maaş… (`category` ile ayrışır)
  'transfer', // hesaplar arası: nakit→banka, Stripe→banka payout
  'capital', // sermaye girişi
  'misc',
]);
export type MovementType = z.infer<typeof MovementTypeEnum>;

/**
 * Reklam giderinin kategori etiketi (12.5) — kampanya ROI raporu (13.2) bu değeri süzer. Kategori
 * serbest metin olduğu için tek kaçış yolu budur: kapı bunu yazar, rapor bunu okur. İki yerde
 * yazılsaydı biri değişince rapor hata vermeden BOŞALIRDI — sessiz sıfır, yanlış cevabın en kötüsü.
 */
export const ADVERTISING_CATEGORY = 'advertising';

/** Hareket elle mi girildi, banka dosyasından mı (12.4) — eşleştirme akışı bunu ayırır. */
export const MovementSourceEnum = z.enum(['manual', 'bank_import']);
export type MovementSource = z.infer<typeof MovementSourceEnum>;

export const MoneyMovementSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  direction: MovementDirectionEnum,
  /** **Cent** (02.9 · STACK §8); DB kolonu `money_movement.amount` euro `numeric`. İşARETSİZ — yön
   *  `direction`tadır, işaretli hâli defter satırındadır (`signedAmountCents`). */
  amountCents: z.number().int(),
  type: MovementTypeEnum,
  /** Gider/gelir alt kategorisi (kira, akaryakıt, maaş, `advertising`…). Serbest metin: kategori
   *  listesi işletmeyle büyür, enum'a hapsedilirse her yeni gider kalemi migration ister. */
  category: z.string().nullable(),
  /** Ek etiket — reklam giderinde `{campaign}`: kampanya gider↔ciro (gerçek ROI) raporu (12.5/13). */
  meta: z.record(z.unknown()).nullable(),
  /** Transferde KARŞI hesap. Transfer TEK satırdır; karşı hesaba ters işaretle yansır (görünüm). */
  counterAccountId: z.string().uuid().nullable(),
  orderId: z.string().uuid().nullable(),
  stockIntakeId: z.string().uuid().nullable(),
  /** Tedarikçiye ödemeyse — tedarikçi borcu bundan türetilir (Σ giriş − Σ ödeme). */
  supplierId: z.string().uuid().nullable(),
  /** Paranın gerçekten hareket ettiği gün; kayıt günü (`createdAt`) ondan farklı olabilir. */
  valueDate: z.string(),
  description: z.string().nullable(),
  source: MovementSourceEnum,
  /** Banka ekstresiyle eşleşti mi (12.4). Elle girilen hareket eşleşmeyi bekler. */
  reconciled: z.boolean(),
  /**
   * Banka satırının üretilmiş kimliği (12.4) — aynı satır iki kez yazılmasın diye. Elle girilen
   * harekette `null`: elle iki kez 20 € girmek meşrudur, kısıt ona takılmamalı.
   */
  importFingerprint: z.string().nullable(),
  bankImportId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type MoneyMovement = z.infer<typeof MoneyMovementSchema>;

export const MoneyMovementInsertSchema = z.object({
  accountId: z.string().uuid(),
  direction: MovementDirectionEnum,
  amountCents: z.number().int().positive(),
  type: MovementTypeEnum,
  category: z.string().nullish(),
  meta: z.record(z.unknown()).nullish(),
  counterAccountId: z.string().uuid().nullish(),
  orderId: z.string().uuid().nullish(),
  stockIntakeId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  valueDate: z.string().optional(),
  description: z.string().nullish(),
  source: MovementSourceEnum.optional(),
  reconciled: z.boolean().optional(),
  importFingerprint: z.string().nullish(),
  bankImportId: z.string().uuid().nullish(),
});
export type MoneyMovementInsert = z.infer<typeof MoneyMovementInsertSchema>;

export const MoneyMovementUpdateSchema = MoneyMovementSchema.partial().required({ id: true });
export type MoneyMovementUpdate = z.infer<typeof MoneyMovementUpdateSchema>;

/**
 * `account_movement` görünümünün satırı — **defter satırı**: bir hareket dokunduğu HER hesapta bir
 * satır üretir (transfer iki hesabı birden etkiler). `signedAmount` işaret kuralının TEK
 * uygulamasıdır; bakiye de ekstre de bunun üstünde durur, kural iki yere yazılmaz.
 */
export const AccountLedgerRowSchema = MoneyMovementSchema.extend({
  /** Satırın ait olduğu hesap — transferde `accountId`'den farklı olabilir. */
  ledgerAccountId: z.string().uuid(),
  /** Bu hesap için işaretli tutar (**cent**): girişte +, çıkışta −; transferin karşı ucunda ters. */
  signedAmountCents: z.number().int(),
});
export type AccountLedgerRow = z.infer<typeof AccountLedgerRowSchema>;

/**
 * `record_order_movement` / `resync_order_amounts` dönüşü (12.2). Tutarlar **hareketlerden yeniden
 * hesaplanır**, artırılmaz — kaçırılan/tekrarlanan çağrı kalıcı sapma bırakmasın.
 */
export const OrderAmountsSchema = z.object({
  ok: z.boolean(),
  movementId: z.string().uuid().optional(),
  // RPC euro döndürür; cent'e çevrim servis sınırında (`rpcMoneyToCents`, 02.9 · STACK §8).
  amountCollectedCents: z.number().int(),
  amountRefundedCents: z.number().int(),
});
export type OrderAmounts = z.infer<typeof OrderAmountsSchema>;

/** `account_balance` görünümü — bakiye SAKLANMAZ, defter satırlarından toplanır. */
export const AccountBalanceSchema = z.object({
  accountId: z.string().uuid(),
  balanceCents: z.number().int(),
  movementCount: z.number().int(),
});
export type AccountBalance = z.infer<typeof AccountBalanceSchema>;
