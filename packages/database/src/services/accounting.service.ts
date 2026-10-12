import type { SupabaseClient } from '@supabase/supabase-js';
import { OrderSaleSchema, DEFAULT_PAGE_SIZE, type Business, type KeysetCursor, type OrderSale, type Page } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
// Para alan listesi tek yerde (`order.service`), çünkü görünüm siparişin kolonlarını aynen taşır ve kopya liste ad değişikliğinde
// birini güncellemeyi unutturur.
import { ORDER_MONEY_FIELDS } from './order.service';

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

  /**
   * Dönemin bütün satışları, sayfa sayfa çekilip birleştirilir: tek sorgu PostgREST'in satır tavanında (varsayılan 1000) sessizce
   * kesilir ve dosya eksik çıkardı. Sayfalama tam okuma içindir, bu yüzden imleç dışarı sızmaz.
   */
  async listPeriod(from: string, to: string, business?: Business): Promise<OrderSale[]> {
    const BATCH_SIZE = 500;
    const all: OrderSale[] = [];
    let cursor: KeysetCursor | undefined;

    do {
      const page = await this.getPage(
        { business },
        {
          orderBy: 'saleDate',
          keysetAfter: cursor,
          limit: BATCH_SIZE,
          rangeFilters: [
            { field: 'saleDate', operator: 'gte', value: from },
            { field: 'saleDate', operator: 'lte', value: to },
          ],
        },
      );
      all.push(...page.rows);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return all;
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
