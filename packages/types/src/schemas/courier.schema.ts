import { z } from 'zod';

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
  // Para alanları CENT (02.9). DB kolonları euro `numeric` kalır; dönüşüm sınırda
  // (`CourierDayCloseService.moneyFields`). Mutabakat farkı tamsayı çıkarma oldu — kuruş altı
  // kalıntı doğuran kayan nokta aritmetiği bu kayıttan tamamen kalktı.
  expectedCashCents: z.number().int(),
  expectedCardCents: z.number().int(),
  expectedChequeCents: z.number().int(),
  countedCashCents: z.number().int(),
  countedCardCents: z.number().int(),
  countedChequeCents: z.number().int(),
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
  expectedCashCents: z.number().int(),
  expectedCardCents: z.number().int(),
  expectedChequeCents: z.number().int(),
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
  // RPC dönüşü bir TABLO SATIRI değil (jsonb), yani `moneyFields` yolundan geçmez — dönüşüm
  // servis sınırında `rpcMoneyToCents` ile yapılır. Alanlar `optional`: `ok:false` dalında RPC
  // hiçbirini döndürmez ve orada sıfır yazmak "hesaplandı, sıfır çıktı" demek olurdu.
  expectedCashCents: z.number().int().optional(),
  expectedCardCents: z.number().int().optional(),
  expectedChequeCents: z.number().int().optional(),
  countedCashCents: z.number().int().optional(),
  countedCardCents: z.number().int().optional(),
  countedChequeCents: z.number().int().optional(),
  /** Sayılan − beklenen. İşaret anlamlıdır: eksi eksik teslim, artı fazla para. */
  differenceCashCents: z.number().int().optional(),
  differenceCardCents: z.number().int().optional(),
  differenceChequeCents: z.number().int().optional(),
  reconciled: z.boolean().optional(),
  deliveredCount: z.number().int().optional(),
  returnedCount: z.number().int().optional(),
  pendingCount: z.number().int().optional(),
});
export type CourierDayCloseResult = z.infer<typeof CourierDayCloseResultSchema>;

/**
 * **TESLİM KANITI — siparişe yazılan kayıt** (11.2 · `order.delivery_proof` jsonb).
 *
 * Şema burada, çünkü sözleşmenin İKİ UCU var: kurye kapısı yazıyor (`lib/courier/delivery.ts`),
 * operasyon ekranı okuyor (sipariş detayı). İkisi ayrı ayrı yazılmıştı ve **ayrışmıştı** —
 * yazan `kind/imageKey/receivedBy/courierId/at` koyuyordu, okuyan `signature/photos[]/note/by`
 * arıyordu. Ortak tek alan `at` idi: ekran kanıtı "var" gösteriyor ama neyin var olduğunu
 * söyleyemiyordu ve `imageKey` hiç okunmuyordu — yani **kanıt yazılıyor, hiç açılamıyordu.**
 * Kanıtın tek amacı "eksik geldi" ihtilafında açılmaktır.
 *
 * Hiçbir yerde hata vermiyordu: iki taraf da kendi içinde tutarlıydı. Tek çare şemayı tek kaynağa
 * bağlamak (`CLAUDE §1`) — artık yanlış alan adı DERLEME hatası.
 */
export const DeliveryProofRecordSchema = z.object({
  /** İmza çizimi mi kapı fotoğrafı mı — ikisi de görsel olarak saklanır. */
  kind: z.enum(['signature', 'photo']),
  /** PRIVATE kovadaki anahtar (`delivery/proofs/{orderId}/…`). Public adresi YOKTUR. */
  imageKey: z.string(),
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy: z.string().nullable(),
  /** Kanıtı üreten kurye — sipariş sonradan başkasına atansa da kanıt kimin olduğunu söyler. */
  courierId: z.string().uuid(),
  at: z.string(),
});
export type DeliveryProofRecord = z.infer<typeof DeliveryProofRecordSchema>;
