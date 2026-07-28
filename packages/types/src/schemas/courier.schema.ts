import { z } from 'zod';
import { dbNumeric } from './db-numeric';

// CourierDayClose — kurye gün kapanışı ve kasa mutabakatı (11.6). DOMAIN §7.
//
// Kapanış bir MUTABAKAT kaydıdır, para hareketi değil: para kapıda tahsil edilirken zaten yazıldı
// (12.2). Burada beklenen (sistemin hesabı) ile sayılan (kuryenin teslim ettiği) yan yana durur.
//
// `expected_*` alanları türetilebilir olduğu hâlde SAKLANIR — kapanış anının fotoğrafıdır: sonradan
// bir hareket düzeltilse bile o gün ne konuşulduğu değişmemeli. `reconciled` ise saklanmaz,
// veritabanında iki kolondan TÜRETİLİR (generated) — çelişme ihtimali şemada kapalıdır.

export const CourierDayCloseSchema = z.object({
  id: z.string().uuid(),
  courierId: z.string().uuid(),
  date: z.string(),
  expectedCash: dbNumeric,
  expectedCard: dbNumeric,
  expectedCheque: dbNumeric,
  countedCash: dbNumeric,
  countedCard: dbNumeric,
  countedCheque: dbNumeric,
  /** Günün üç akıbeti — sayı değil kimlik: kapanıştan sonra "hangi sipariş" sorusu cevaplanabilsin. */
  deliveredOrders: z.array(z.string().uuid()),
  returnedOrders: z.array(z.string().uuid()),
  /** Sonuçlanmamışlar — yarının işine devrolur. */
  pendingOrders: z.array(z.string().uuid()),
  note: z.string().nullable(),
  closedBy: z.string().uuid().nullable(),
  closedAt: z.string(),
  reconciled: z.boolean(),
});
export type CourierDayClose = z.infer<typeof CourierDayCloseSchema>;

/**
 * `courier_day_collection` görünümü — kapanış ÖNCESİ beklenen tahsilat. Kapanış satırındaki
 * `expected_*` bunun dondurulmuş hâlidir; toplama SQL'i tek yerdedir (görünümde), TypeScript'te
 * ikinci kez yazılmaz.
 */
export const CourierDayCollectionSchema = z.object({
  courierId: z.string().uuid(),
  date: z.string(),
  expectedCash: dbNumeric,
  expectedCard: dbNumeric,
  expectedCheque: dbNumeric,
});
export type CourierDayCollection = z.infer<typeof CourierDayCollectionSchema>;

/**
 * `close_courier_day` dönüşü. `already_closed` bir hata değil, bir GERÇEKTİR: kapanmış gün
 * salt-okunurdur (tasarım §6) — ikinci çağrı ezmez, mevcut kaydı bildirir.
 */
export const CourierDayCloseResultSchema = z.object({
  ok: z.boolean(),
  reason: z.literal('already_closed').optional(),
  id: z.string().uuid().optional(),
  closedAt: z.string().optional(),
  expectedCash: dbNumeric.optional(),
  expectedCard: dbNumeric.optional(),
  expectedCheque: dbNumeric.optional(),
  countedCash: dbNumeric.optional(),
  countedCard: dbNumeric.optional(),
  countedCheque: dbNumeric.optional(),
  /** Sayılan − beklenen. İşaret anlamlıdır: eksi eksik teslim, artı fazla para. */
  differenceCash: dbNumeric.optional(),
  differenceCard: dbNumeric.optional(),
  differenceCheque: dbNumeric.optional(),
  reconciled: z.boolean().optional(),
  deliveredCount: z.number().int().optional(),
  returnedCount: z.number().int().optional(),
  pendingCount: z.number().int().optional(),
});
export type CourierDayCloseResult = z.infer<typeof CourierDayCloseResultSchema>;
