import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';
import { PaymentMethodEnum } from '../primitives/enums.schema';
import { MovementDirectionEnum } from './money.schema';
import { QueueRowSchema } from './queue.schema';

// Kasa aynası: sertifikalı kasaya (Hiboutik) ne yazıldığının bizdeki kaydı. Sonraki yazımın farkı buna göre çıkar.

/** Fiş kaleminin kaynağı: sipariş kalemi ya da kargo ücretinin bir KDV oranına düşen payı. */
export const RegisterLineKindEnum = z.enum(['item', 'shipping']);
export type RegisterLineKind = z.infer<typeof RegisterLineKindEnum>;

export const RegisterLineSchema = z.object({
  kind: RegisterLineKindEnum,
  /** Sipariş kaleminde dolu, kargoda `null`. */
  orderItemId: z.string().uuid().nullable(),
  /** İşaretli: iade fişinde eksi. */
  qty: z.number().int(),
  /** **Cent**, işaretli, kanalın tabanında (B2C'de KDV dahil). */
  amountCents: z.number().int(),
  vatRate: dbNumeric,
});
export type RegisterLine = z.infer<typeof RegisterLineSchema>;

export const RegisterPaymentSchema = z.object({
  method: PaymentMethodEnum,
  /** **Cent**, işaretli: tahsilat artı, iade eksi. */
  amountCents: z.number().int(),
  /** Satırın taşıdığı para hareketi. Kasadaki satır değişmez; tutarı, yöntemi ya da siparişi değişen hareketin farkı yeni satırdır. */
  movementId: z.string().uuid(),
});
export type RegisterPayment = z.infer<typeof RegisterPaymentSchema>;

/** Kasaya yazılan ödemenin numarası: gün kapanmışsa kasa ödemeyi satışın nakit akışı olarak kaydeder. */
export const RegisterPaymentRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('payment'), id: z.number().int() }),
  z.object({ kind: z.literal('cash_flow'), id: z.number().int() }),
]);
export type RegisterPaymentRef = z.infer<typeof RegisterPaymentRefSchema>;

/** Siparişin kasadaki bir fişi, kalemleri ve ödeme satırlarıyla. */
export const RegisterTicketSnapshotSchema = z.object({
  seq: z.number().int().positive(),
  lines: z.array(RegisterLineSchema),
  payments: z.array(RegisterPaymentSchema),
});
export type RegisterTicketSnapshot = z.infer<typeof RegisterTicketSnapshotSchema>;

/**
 * Kasadaki satışın kasa portundaki okunuşu: tutar cent, oran yüzde, ödeme yöntemi bizim adımızla (kasada tanınmayan kod `null`).
 * Kapanmamış satış mali kayıt değildir; yarım yazım ancak açıkken yeniden kurulur.
 */
export const RegisterSaleSchema = z.object({
  saleId: z.number().int(),
  extRef: z.string(),
  closed: z.boolean(),
  uniqueSaleId: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  lines: z.array(
    z.object({
      lineId: z.number().int(),
      productId: z.number().int(),
      quantity: z.number(),
      unitPriceCents: z.number().int(),
      vatRate: z.number(),
    }),
  ),
  payments: z.array(z.object({ paymentId: z.number().int(), method: PaymentMethodEnum.nullable(), amountCents: z.number().int() })),
  /** Gün kapandıktan sonra satışa eklenen ödemeler. */
  cashFlows: z.array(z.object({ cashFlowId: z.number().int(), method: PaymentMethodEnum.nullable(), amountCents: z.number().int() })),
});
export type RegisterSale = z.infer<typeof RegisterSaleSchema>;

/**
 * Kasadaki fiş dışı nakit hareketi; açıklama bizim kaydımızın künyesini taşır, yarıda kalan yazım onunla bulunur. `at` kasanın yerel
 * saatidir (`YYYY-MM-DD hh:mm:ss`), tutar işaretlidir: giriş artı, çıkış eksi.
 */
export const RegisterCashMoveSchema = z.object({
  tillId: z.number().int(),
  label: z.string(),
  at: z.string(),
  amountCents: z.number().int(),
});
export type RegisterCashMove = z.infer<typeof RegisterCashMoveSchema>;

/** Kasanın bir iş günü: oran başına KDV dahil toplam ve satış başına ödemeler, nakit akışları dahil (**cent**). */
export const RegisterDaySchema = z.object({
  vat: z.array(z.object({ vatRate: z.number(), grossCents: z.number().int() })),
  payments: z.array(z.object({ saleId: z.number().int(), method: PaymentMethodEnum.nullable(), amountCents: z.number().int() })),
});
export type RegisterDay = z.infer<typeof RegisterDaySchema>;

/**
 * Gün sonu, defter ↔ ayna: aralıkta açılmış hareketin kasada beklenen etkisi (defter) ve aynada yazılmış olanı (**cent**, işaretli).
 * `payment` fişin ödeme satırıdır (yöntem başına), `cash` çekmecenin kasa kaydıdır.
 */
export const RegisterDayMovementSchema = z.object({
  movementId: z.string().uuid(),
  kind: z.enum(['payment', 'cash']),
  method: PaymentMethodEnum.nullable(),
  expectedCents: z.number().int(),
  writtenCents: z.number().int(),
});
export type RegisterDayMovement = z.infer<typeof RegisterDayMovementSchema>;

/** `writing`: kasaya çağrı başladı ama sonucu aynaya geçmedi; yarıda kalan yazım bu satırdan tamamlanır. */
export const RegisterWriteStatusEnum = z.enum(['writing', 'written']);
export type RegisterWriteStatus = z.infer<typeof RegisterWriteStatusEnum>;

/** Tesis deposunun kasa mağazası ve fiziksel çekmecesinin nakit hesabı. */
export const RegisterStoreSchema = z.object({
  warehouseId: z.string().uuid(),
  externalStoreId: z.number().int(),
  cashAccountId: z.string().uuid(),
  createdAt: z.string(),
});
export type RegisterStore = z.infer<typeof RegisterStoreSchema>;

export const RegisterStoreInsertSchema = RegisterStoreSchema.omit({ createdAt: true });
export type RegisterStoreInsert = z.infer<typeof RegisterStoreInsertSchema>;

export const RegisterProductSchema = z.object({
  id: z.string().uuid(),
  kind: RegisterLineKindEnum,
  /** Kalemde dolu, kargoda `null`; kargo oran başına ayrı üründür. */
  variantId: z.string().uuid().nullable(),
  externalProductId: z.number().int(),
  name: z.string(),
  vatRate: dbNumeric,
  /** **Cent** (STACK §8); kasaya yazılan katalog fiyatı. */
  priceCents: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RegisterProduct = z.infer<typeof RegisterProductSchema>;

export const RegisterProductInsertSchema = RegisterProductSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type RegisterProductInsert = z.infer<typeof RegisterProductInsertSchema>;

export const RegisterProductUpdateSchema = RegisterProductSchema.pick({ id: true, name: true, vatRate: true, priceCents: true })
  .partial()
  .required({ id: true });
export type RegisterProductUpdate = z.infer<typeof RegisterProductUpdateSchema>;

export const RegisterTicketSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  seq: z.number().int().positive(),
  /** Fişin yazıldığı mağazanın deposu; araç satışı aracın ana deposudur. */
  warehouseId: z.string().uuid(),
  extRef: z.string().max(25),
  externalSaleId: z.number().int().nullable(),
  /** Kasanın günlük sıra numarası. */
  uniqueSaleId: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  status: RegisterWriteStatusEnum,
  writtenAt: z.string().nullable(),
  createdAt: z.string(),
});
export type RegisterTicket = z.infer<typeof RegisterTicketSchema>;

export const RegisterTicketInsertSchema = RegisterTicketSchema.pick({ orderId: true, seq: true, warehouseId: true, extRef: true });
export type RegisterTicketInsert = z.infer<typeof RegisterTicketInsertSchema>;

export const RegisterTicketUpdateSchema = RegisterTicketSchema.pick({
  id: true,
  externalSaleId: true,
  uniqueSaleId: true,
  receiptUrl: true,
  status: true,
  writtenAt: true,
})
  .partial()
  .required({ id: true });
export type RegisterTicketUpdate = z.infer<typeof RegisterTicketUpdateSchema>;

export const RegisterTicketLineSchema = RegisterLineSchema.extend({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  /** Kasadaki kalem numaraları; kuruş için bölünen kalem iki satırdır. */
  externalLineIds: z.array(z.number().int()),
  createdAt: z.string(),
});
export type RegisterTicketLine = z.infer<typeof RegisterTicketLineSchema>;

export const RegisterTicketLineInsertSchema = RegisterLineSchema.extend({
  ticketId: z.string().uuid(),
  externalLineIds: z.array(z.number().int()).optional(),
});
export type RegisterTicketLineInsert = z.infer<typeof RegisterTicketLineInsertSchema>;

export const RegisterTicketLineUpdateSchema = RegisterTicketLineSchema.pick({ id: true, externalLineIds: true });
export type RegisterTicketLineUpdate = z.infer<typeof RegisterTicketLineUpdateSchema>;

export const RegisterPaymentRowSchema = RegisterPaymentSchema.extend({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  externalPaymentId: z.number().int().nullable(),
  externalCashFlowId: z.number().int().nullable(),
  status: RegisterWriteStatusEnum,
  createdAt: z.string(),
  /** Kasaya yazıldığı an; gün sonu bunu sayar. */
  writtenAt: z.string().nullable(),
});
export type RegisterPaymentRow = z.infer<typeof RegisterPaymentRowSchema>;

export const RegisterPaymentInsertSchema = RegisterPaymentSchema.extend({ ticketId: z.string().uuid() });
export type RegisterPaymentInsert = z.infer<typeof RegisterPaymentInsertSchema>;

export const RegisterPaymentUpdateSchema = RegisterPaymentRowSchema.pick({
  id: true,
  movementId: true,
  externalPaymentId: true,
  externalCashFlowId: true,
  status: true,
  writtenAt: true,
})
  .partial()
  .required({ id: true });
export type RegisterPaymentUpdate = z.infer<typeof RegisterPaymentUpdateSchema>;

/** Fiş olmayan nakit hareketinin kasadaki karşılığı. */
export const RegisterCashOpSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  /** Kaydın taşıdığı hareket; etkisi değişen hareketin eski kaydı ters çevrilir, yenisi yazılır. */
  movementId: z.string().uuid(),
  /** Bu kaydın ters çevirdiği kayıt. */
  reversalOf: z.string().uuid().nullable(),
  direction: MovementDirectionEnum,
  /** **Cent** (STACK §8), işaretsiz; yön `direction`dadır. */
  amountCents: z.number().int().positive(),
  /** Kasa dökümünde görünen açıklama; yarıda kalan yazım kasadaki satırı bununla bulur. */
  label: z.string(),
  externalTillId: z.number().int().nullable(),
  status: RegisterWriteStatusEnum,
  createdAt: z.string(),
  /** Kasaya yazıldığı an; gün sonu bunu sayar. */
  writtenAt: z.string().nullable(),
});
export type RegisterCashOp = z.infer<typeof RegisterCashOpSchema>;

export const RegisterCashOpInsertSchema = RegisterCashOpSchema.pick({
  warehouseId: true,
  movementId: true,
  reversalOf: true,
  direction: true,
  amountCents: true,
  label: true,
});
export type RegisterCashOpInsert = z.infer<typeof RegisterCashOpInsertSchema>;

export const RegisterCashOpUpdateSchema = RegisterCashOpSchema.pick({ id: true, externalTillId: true, status: true, writtenAt: true })
  .partial()
  .required({ id: true });
export type RegisterCashOpUpdate = z.infer<typeof RegisterCashOpUpdateSchema>;

/** Kuyruk satırı: bir sipariş ya da bir nakit hareketi yeniden eşitlenecek; satırı `money_movement` tetikleyicisi yazar. */
export const RegisterQueueSchema = QueueRowSchema.extend({
  orderId: z.string().uuid().nullable(),
  movementId: z.string().uuid().nullable(),
});
export type RegisterQueue = z.infer<typeof RegisterQueueSchema>;

/** Kuyruğa elle yalnız kasa hareketi düşer: çekmece eşlenmeden önce yazılan hareket tetikleyiciden geçmemiştir. */
export const RegisterQueueInsertSchema = z.object({ movementId: z.string().uuid() });
export type RegisterQueueInsert = z.infer<typeof RegisterQueueInsertSchema>;
