import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import {
  OrderSaleSchema,
  OrderSchema,
  DEFAULT_PAGE_SIZE,
  type Business,
  type KeysetCursor,
  type OrderSale,
  type Page,
  type VatTreatment,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
// Para alan listesi tek yerde (`order.service`), çünkü görünüm siparişin kolonlarını aynen taşır ve kopya liste ad değişikliğinde
// birini güncellemeyi unutturur.
import { ORDER_MONEY_FIELDS } from './order.service';

const PAGE_BATCH = 500;

/** Keyset sayfalarını sonuna kadar okur: tek sorgu PostgREST'in satır tavanında (varsayılan 1000) sessizce kesilir ve toplam eksik çıkardı. */
async function readAllPages<T>(read: (cursor: KeysetCursor | undefined) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: KeysetCursor | undefined;
  do {
    const page = await read(cursor);
    all.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

/**
 * Gerçekleşmiş satışlar (`order_sale` görünümü): muhasebe aktarımının ve dönemsel kârlılığın ortak okuma zemini; kendi sınıfı var,
 * çünkü keyset sayfalama `tableName`'e bağlıdır. Hediye sipariş burada süzülmez, süzgeç aktarım kapısındadır (`exportEligibility`).
 */
export class OrderSaleService extends BaseDbService<OrderSale, never, never> {
  /** Görünüm para kolonlarını euro `numeric` taşır, şema `OrderSchema`'dan türediği için `…Cents` bekler (STACK §8). */
  protected override readonly moneyFields = ORDER_MONEY_FIELDS;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_sale', OrderSaleSchema, OrderSaleSchema as never, OrderSaleSchema as never, false);
  }

  /** Dönemin bütün satışları, satış gününe göre ve iki uç dahil; tam okumadır, imleç dışarı sızmaz. */
  listPeriod(from: string, to: string, business?: Business): Promise<OrderSale[]> {
    return this.listBetween({ business }, from, to);
  }

  /** Dönemin verilen KDV türlerindeki satışları; OSS özeti yalnız uzaktan satışları okur. */
  listPeriodByTreatments(from: string, to: string, treatments: readonly VatTreatment[]): Promise<OrderSale[]> {
    return this.listBetween({ vatTreatment: [...treatments] }, from, to);
  }

  private listBetween(filters: Record<string, unknown>, from: string, to: string): Promise<OrderSale[]> {
    return readAllPages((cursor) =>
      this.getPage(filters, {
        orderBy: 'saleDate',
        keysetAfter: cursor,
        limit: PAGE_BATCH,
        rangeFilters: [
          { field: 'saleDate', operator: 'gte', value: from },
          { field: 'saleDate', operator: 'lte', value: to },
        ],
      }),
    );
  }

  /** Siparişlerin satış satırı; gerçekleşmemiş sipariş görünümde yoktur. Kimlikler öbeklenir, çünkü `in(...)` listesi URL'e gömülür. */
  async listByIds(ids: readonly string[]): Promise<OrderSale[]> {
    const BATCH_SIZE = 200;
    const all: OrderSale[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) all.push(...(await this.getAll({ id: ids.slice(i, i + BATCH_SIZE) })));
    return all;
  }

  /**
   * Fatura numarası elle bağlanan satışlar (`reference_no` ↔ `invoice_no` eşleştirme kuyruğu), en uzun bekleyen başta. Hediye sipariş
   * girmez, çünkü dış muhasebeye gitmez; B2B satışı girmez, çünkü faturası Pennylane'de kendiliğinden kesilir ve elle bağlanan numara
   * aynı satışı ikinci kez faturalatırdı.
   */
  pendingInvoices(opts: { cursor?: KeysetCursor; limit?: number; business?: Business } = {}): Promise<Page<OrderSale>> {
    return this.getPage(
      { isGiftOrder: false, channel: 'b2c', business: opts.business },
      {
        orderBy: 'saleDate',
        keysetAfter: opts.cursor,
        limit: opts.limit ?? DEFAULT_PAGE_SIZE,
        isNullFields: ['invoiceNo'],
      },
    );
  }
}

const TreatmentOrderSchema = OrderSchema.pick({
  id: true,
  referenceNo: true,
  status: true,
  vatTreatment: true,
  createdAt: true,
  pricesIncludeVat: true,
  shippingFeeCents: true,
});
/** KDV türüyle okunan siparişin alanları: kimlik, durum ve KDV kırılımının tabanı. */
export type TreatmentOrder = z.infer<typeof TreatmentOrderSchema>;

/**
 * Verilen KDV türlerindeki siparişler, yazıldıkları ana göre ve durumdan bağımsız; eşik toplamı gerçekleşmeyi beklemez, çünkü karar
 * sipariş yazılırken verilir. Kendi sınıfı var, çünkü sipariş servisinin listeleri bu süzgeci taşımaz ve okuma tam okumadır.
 */
export class TreatmentOrderService extends BaseDbService<TreatmentOrder, never, never> {
  protected override readonly moneyFields = ['shippingFeeCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'order', TreatmentOrderSchema, TreatmentOrderSchema as never, TreatmentOrderSchema as never, false);
  }

  /** `[from, to)` aralığında yazılmış siparişler, sayfa sayfa birleştirilerek. */
  listCreated(treatments: readonly VatTreatment[], range: { from: string; to: string }): Promise<TreatmentOrder[]> {
    return readAllPages((cursor) =>
      this.getPage(
        { vatTreatment: [...treatments] },
        {
          select: 'id,reference_no,status,vat_treatment,created_at,prices_include_vat,shipping_fee',
          orderBy: 'createdAt',
          keysetAfter: cursor,
          limit: PAGE_BATCH,
          rangeFilters: [
            { field: 'createdAt', operator: 'gte', value: range.from },
            { field: 'createdAt', operator: 'lt', value: range.to },
          ],
        },
      ),
    );
  }
}
