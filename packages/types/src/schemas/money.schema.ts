import { z } from 'zod';
import { CurrencyEnum } from './enums.schema';

// Para ve ön muhasebe (DOMAIN §9, data-model/para.md).
//
// TEK MANTIK: **para bir hesapta durur, hareketlerle girer/çıkar.** Kasa hareketi ile banka hareketi
// aynı şeydir, yalnız hesabı farklıdır — bu yüzden tek tablo, kasa/banka ayrımı yok.
//
// BAKİYE SAKLANMAZ, hareketlerden türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz, kayarsa izi
// bulunamaz). Türetimin tek yeri `account_movement` görünümüdür — bkz. `AccountLedgerRow`.

// PG numeric supabase-js'te string dönebilir → number'a indir (okuma tarafı).
const dbNumeric = z.union([z.number(), z.string()]).transform((v) => Number(v));

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

/** Hareket elle mi girildi, banka dosyasından mı (12.4) — eşleştirme akışı bunu ayırır. */
export const MovementSourceEnum = z.enum(['manual', 'bank_import']);
export type MovementSource = z.infer<typeof MovementSourceEnum>;

export const MoneyMovementSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  direction: MovementDirectionEnum,
  amount: dbNumeric,
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
  createdAt: z.string(),
});
export type MoneyMovement = z.infer<typeof MoneyMovementSchema>;

export const MoneyMovementInsertSchema = z.object({
  accountId: z.string().uuid(),
  direction: MovementDirectionEnum,
  amount: z.number().positive(),
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
  /** Bu hesap için işaretli tutar: girişte +, çıkışta −; transferin karşı ucunda ters. */
  signedAmount: dbNumeric,
});
export type AccountLedgerRow = z.infer<typeof AccountLedgerRowSchema>;

/** `account_balance` görünümü — bakiye SAKLANMAZ, defter satırlarından toplanır. */
export const AccountBalanceSchema = z.object({
  accountId: z.string().uuid(),
  balance: dbNumeric,
  movementCount: z.number().int(),
});
export type AccountBalance = z.infer<typeof AccountBalanceSchema>;
