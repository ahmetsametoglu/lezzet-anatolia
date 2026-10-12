import { Hono } from 'hono';
import { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { createStaffCustomer, previewStaffCompany } from '@lezzet/application/customer/staff-customer';
import {
  addStaffAddress,
  findStaffVariantByCode,
  placeStaffOrder,
  readStaffAddresses,
  readStaffDeliveryContext,
  readStaffOrderOrigin,
  readStaffStock,
  searchStaffCustomers,
  searchStaffVariants,
  staffCustomerOptionOf,
  staffCustomerOptionsOf,
  staffOrderRejectionText,
} from '@lezzet/application/order/staff-order';
import { canNegotiatePrice } from '@lezzet/domain-core';
import {
  StaffAddressCreateResponseSchema,
  StaffAddressInputSchema,
  StaffAddressListSchema,
  StaffCompanyLookupSchema,
  StaffCustomerCreateResponseSchema,
  StaffCustomerInputSchema,
  StaffCustomerPageSchema,
  StaffDeliveryContextRequestSchema,
  StaffDeliveryContextSchema,
  StaffOrderOriginSchema,
  StaffOrderRequestSchema,
  StaffOrderResponseSchema,
  StaffStockRequestSchema,
  StaffStockResponseSchema,
  StaffVariantPageSchema,
  StaffVariantScanSchema,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor, readJsonBody } from '../../lib/request';
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * Personelin müşteri adına sipariş girişi: okumalar ve yazım web masasıyla ortaktır (`staff-order`), uç yetkiyi ve tel şeklini koyar.
 * Kurye, depocu ve yönetici girer; pazarlıklı fiyatı ve maliyeti yalnız yönetici görür ve yazar.
 */
export const staffOrder = new Hono<StaffEnv>();

staffOrder.use('*', requireStaffRole('courier', 'warehouse', 'admin'));

const CustomerIdSchema = z.string().uuid();

const CustomerSearchQuerySchema = z.object({
  q: z.string().max(100).default(''),
  cursor: z.string().optional(),
});

staffOrder.get('/customers', async (c) => {
  const parsed = CustomerSearchQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const page = await searchStaffCustomers(serviceDb(), { term: parsed.data.q, cursor: decodeCursor(parsed.data.cursor) });
  return ok(
    c,
    StaffCustomerPageSchema.parse({
      customers: page.rows,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    } satisfies z.input<typeof StaffCustomerPageSchema>),
  );
});

/** SIRET yazılınca resmî kayıt ve aynı SIRET'li kayıtlar; kayıt açılmadan önce doğru işletmeye bakıldığı görülür. */
staffOrder.get('/company', async (c) => {
  const siret = (c.req.query('siret') ?? '').trim();
  if (!siret) return fail(c, 'siret_required', 400);
  const db = serviceDb();
  const preview = await previewStaffCompany(db, siret);
  const registry =
    typeof preview.registry === 'string' ? { status: preview.registry } : { status: 'found' as const, company: preview.registry };
  return ok(
    c,
    StaffCompanyLookupSchema.parse({
      registry,
      existing: await staffCustomerOptionsOf(db, preview.existing),
    } satisfies z.input<typeof StaffCompanyLookupSchema>),
  );
});

/** Ret hata değil cevaptır: geçersiz alan ve var olan kayıt gövdede döner ki ekran sebebi yerinde yazsın. */
staffOrder.post('/customers', async (c) => {
  const parsed = StaffCustomerInputSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);
  const db = serviceDb();
  const outcome = await createStaffCustomer(db, parsed.data);
  const body: z.input<typeof StaffCustomerCreateResponseSchema> =
    outcome.status === 'ok'
      ? { status: 'ok', customer: await staffCustomerOptionOf(db, outcome.profile) }
      : outcome.status === 'taken'
        ? { status: 'taken', key: outcome.key, existing: await staffCustomerOptionOf(db, outcome.existing) }
        : outcome;
  return ok(c, StaffCustomerCreateResponseSchema.parse(body));
});

staffOrder.get('/customers/:id/addresses', async (c) => {
  const id = CustomerIdSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const addresses = await readStaffAddresses(serviceDb(), id.data);
  return ok(c, StaffAddressListSchema.parse({ addresses } satisfies z.input<typeof StaffAddressListSchema>));
});

staffOrder.post('/customers/:id/addresses', async (c) => {
  const id = CustomerIdSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const parsed = StaffAddressInputSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);
  const outcome = await addStaffAddress(serviceDb(), id.data, parsed.data);
  if (outcome.status === 'not_found') return fail(c, 'customer_not_found', 404);
  return ok(c, StaffAddressCreateResponseSchema.parse(outcome));
});

/** Adresin teslim bağlamı ve sepetin o anki tutarında ödeme seçenekleri; ekran kalem değiştikçe yeniden sorar. */
staffOrder.post('/context', async (c) => {
  const parsed = StaffDeliveryContextRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);
  const context = await readStaffDeliveryContext(serviceDb(), parsed.data);
  if (!context) return fail(c, 'address_not_found', 404);
  return ok(c, StaffDeliveryContextSchema.parse(context));
});

const VariantQuerySchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  cursor: z.string().optional(),
});

/** Kalem seçicisi; arama boşsa bütün katalog sayfalanır. Maliyet ve hedef marj yalnız pazarlık yazabilene gider. */
staffOrder.get('/variants', async (c) => {
  const parsed = VariantQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const term = parsed.data.q?.trim() || null;
  const page = await searchStaffVariants(serviceDb(), {
    customerId: parsed.data.customerId,
    term,
    warehouseId: parsed.data.warehouseId ?? null,
    cursor: decodeCursor(parsed.data.cursor),
    includeCost: canNegotiatePrice(c.get('staff').roles),
  });
  return ok(
    c,
    StaffVariantPageSchema.parse({
      rows: page.rows,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    } satisfies z.input<typeof StaffVariantPageSchema>),
  );
});

const VariantScanQuerySchema = z.object({
  customerId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(100),
});

/** Barkod okutma: kod müşterinin fiyatı ve siparişin deposunun stoğuyla seçici satırına çözülür. */
staffOrder.get('/variants/scan', async (c) => {
  const parsed = VariantScanQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const scan = await findStaffVariantByCode(serviceDb(), {
    customerId: parsed.data.customerId,
    warehouseId: parsed.data.warehouseId ?? null,
    code: parsed.data.code,
    includeCost: canNegotiatePrice(c.get('staff').roles),
  });
  return ok(c, StaffVariantScanSchema.parse(scan));
});

/** Duraktan açılan sipariş: kurye siparişin kimliğini taşır, müşteriyi ve adresi sunucu siparişten çözer. */
staffOrder.get('/origin/:orderId', async (c) => {
  const orderId = z.string().uuid().safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_id', 400);
  const origin = await readStaffOrderOrigin(serviceDb(), orderId.data);
  if (!origin) return fail(c, 'order_not_found', 404);
  return ok(c, StaffOrderOriginSchema.parse(origin));
});

/** Stok reddinden sonra sepetteki boyların güncel kalanı; ekran tükenen kalemi kendi satırında işaretler. */
staffOrder.post('/stock', async (c) => {
  const parsed = StaffStockRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);
  const stock = await readStaffStock(serviceDb(), parsed.data);
  return ok(c, StaffStockResponseSchema.parse({ stock } satisfies z.input<typeof StaffStockResponseSchema>));
});

/** Siparişi yazan personel künyeden gelir; pazarlıklı fiyatı yönetici olmayan gönderirse sipariş yazılmaz ve 403 döner. */
staffOrder.post('/orders', async (c) => {
  const parsed = StaffOrderRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);
  const outcome = await placeStaffOrder(serviceDb(), { ...parsed.data, actorId: c.get('staff').id });
  if (outcome.status === 'price_not_allowed') return fail(c, 'forbidden', 403);
  const body: z.input<typeof StaffOrderResponseSchema> =
    outcome.status === 'placed'
      ? { status: 'placed', orderId: outcome.orderId, referenceNo: outcome.referenceNo, totalCents: outcome.totalCents }
      : { status: 'rejected', reason: outcome.status, message: staffOrderRejectionText(outcome) };
  return ok(c, StaffOrderResponseSchema.parse(body));
});
