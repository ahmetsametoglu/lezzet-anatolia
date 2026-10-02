import { z } from 'zod';
import { MovementDirectionEnum } from './money.schema';

/**
 * Pennylane portunun okunuşu (`docs/feature/kasa-muhasebe.md` §8): kimlikler Pennylane'in tamsayılarıdır, tutar cent ve yönü bizim
 * dilimizle. Kip, anahtarın hangi şirkete yazacağını söyler; uyuşmayan şirkete hiçbir istek gitmez.
 */

export const PennylaneModeEnum = z.enum(['sandbox', 'live']);
export type PennylaneMode = z.infer<typeof PennylaneModeEnum>;

export const PennylaneCompanySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  /** Test şirketinde `sandbox-` ile başlar; kipin denetimi buna bakar. */
  regNo: z.string(),
});
export type PennylaneCompany = z.infer<typeof PennylaneCompanySchema>;

/** Pennylane'deki banka hesabı; bizim banka hesabımız buna eşlenir. */
export const PennylaneBankAccountSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  currency: z.string(),
});
export type PennylaneBankAccount = z.infer<typeof PennylaneBankAccountSchema>;

/** Bankadan Pennylane'e gelen hareket; arşivlenen hareket muhasebede yok sayılır. */
export const PennylaneTransactionSchema = z.object({
  id: z.number().int(),
  bankAccountId: z.number().int(),
  date: z.string(),
  label: z.string().nullable(),
  direction: MovementDirectionEnum,
  /** **Cent**, avro karşılığı, işaretsiz; yön `direction`da. */
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  archived: z.boolean(),
  updatedAt: z.string(),
});
export type PennylaneTransaction = z.infer<typeof PennylaneTransactionSchema>;

/** Hareket sayfası; `nextCursor` yoksa liste bitti. */
export const PennylaneTransactionPageSchema = z.object({
  items: z.array(PennylaneTransactionSchema),
  nextCursor: z.string().nullable(),
});
export type PennylaneTransactionPage = z.infer<typeof PennylaneTransactionPageSchema>;

/** Değişiklik akışının satırı: hangi kayıt, ne oldu, akışa ne zaman düştü. */
export const PennylaneChangeSchema = z.object({
  id: z.number().int(),
  operation: z.enum(['insert', 'update', 'delete']),
  processedAt: z.string(),
});
export type PennylaneChange = z.infer<typeof PennylaneChangeSchema>;

export const PennylaneChangePageSchema = z.object({
  items: z.array(PennylaneChangeSchema),
  nextCursor: z.string().nullable(),
});
export type PennylaneChangePage = z.infer<typeof PennylaneChangePageSchema>;

/** Banka hesabımızın Pennylane'deki karşılığı; `listedAt` boşsa sonraki tur canlıya geçiş gününden listeyi okur. */
export const PennylaneAccountSchema = z.object({
  accountId: z.string().uuid(),
  pennylaneBankAccountId: z.number().int(),
  pennylaneName: z.string(),
  listedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PennylaneAccount = z.infer<typeof PennylaneAccountSchema>;

export const PennylaneAccountInsertSchema = PennylaneAccountSchema.omit({ createdAt: true }).partial({ listedAt: true });
export type PennylaneAccountInsert = z.infer<typeof PennylaneAccountInsertSchema>;

/** Pennylane hareketinin son okunan hâli ve bizdeki banka satırı (`pennylane_transaction`). */
export const PennylaneTransactionMirrorSchema = z.object({
  pennylaneId: z.number().int(),
  accountId: z.string().uuid(),
  /** Sıfır tutarlı hareket yazılmaz, Pennylane'de silinen izahsız satır silinir; ikisinde de `null`. */
  movementId: z.string().uuid().nullable(),
  valueDate: z.string(),
  direction: MovementDirectionEnum,
  /** **Cent**; kolon `amount` euro. */
  amountCents: z.number().int().nonnegative(),
  label: z.string().nullable(),
  removed: z.boolean(),
  readAt: z.string(),
});
export type PennylaneTransactionMirror = z.infer<typeof PennylaneTransactionMirrorSchema>;

export const PennylaneTransactionMirrorInsertSchema = PennylaneTransactionMirrorSchema.partial({ readAt: true });
export type PennylaneTransactionMirrorInsert = z.infer<typeof PennylaneTransactionMirrorInsertSchema>;

/** Değişiklik akışının kaldığı an, akış başına bir satır. */
export const PennylaneCursorSchema = z.object({
  stream: z.enum(['transactions']),
  processedAt: z.string(),
  updatedAt: z.string(),
});
export type PennylaneCursor = z.infer<typeof PennylaneCursorSchema>;
