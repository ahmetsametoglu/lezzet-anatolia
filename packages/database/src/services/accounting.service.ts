import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderSaleSchema,
  DEFAULT_PAGE_SIZE,
  type KeysetCursor,
  type OrderSale,
  type Page,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * **Gerçekleşmiş satışlar** (`order_sale` görünümü, 12.7) — muhasebe export'unun ve dönemsel
 * kârlılığın (12.6) ortak okuma zemini.
 *
 * Görünüm salt okunurdur: sipariş yazımı `OrderService`'ten geçer. Kendi sınıfı olmasının sebebi
 * teknik — keyset sayfalama `tableName`'e bağlıdır (`AccountLedgerService` ile aynı gerekçe).
 *
 * **Hediye siparişleri BURADA süzmez.** Patron ikramı gelirdir, kârdır; yalnız dış muhasebeye
 * gitmez. Süzgeç export kapısındadır (`domain-core/accounting.exportEligibility`) — burada
 * süzseydik `isGiftOrder` "yalnız export filtresini etkiler" kuralı sessizce genişlerdi.
 */
export class OrderSaleService extends BaseDbService<OrderSale, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_sale', OrderSaleSchema, OrderSaleSchema as never, OrderSaleSchema as never, false);
  }

  /**
   * Dönemin TÜM satışları — export dosyasına girecek satırlar.
   *
   * **Sayfa sayfa çekilip birleştirilir.** Tek sorgu yazsaydık PostgREST'in satır tavanı (varsayılan
   * 1000) sessizce keserdi: dosya eksik çıkar, toplam tutmaz ve kimse fark etmezdi. Burada sayfalama
   * ekran için değil, TAM okuma için — bu yüzden imleç dışarı sızmaz.
   */
  async listPeriod(from: string, to: string): Promise<OrderSale[]> {
    const OBEK = 500;
    const hepsi: OrderSale[] = [];
    let cursor: KeysetCursor | undefined;

    do {
      const sayfa = await this.getPage(
        {},
        {
          orderBy: 'saleDate',
          keysetAfter: cursor,
          limit: OBEK,
          rangeFilters: [
            { field: 'saleDate', operator: 'gte', value: from },
            { field: 'saleDate', operator: 'lte', value: to },
          ],
        },
      );
      hepsi.push(...sayfa.rows);
      cursor = sayfa.nextCursor ?? undefined;
    } while (cursor);

    return hepsi;
  }

  /**
   * **Fatura numarası bekleyen satışlar** — `reference_no ↔ invoice_no` eşleştirme kuyruğu (12.7).
   * Eskiden yeniye: en uzun bekleyen satır başta.
   *
   * Hediye siparişler kuyruğa GİRMEZ: dış muhasebeye gitmedikleri için hiç fatura numarası
   * almayacaklar; kuyrukta kalsalardı asla boşalmazdı.
   */
  pendingInvoices(opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<OrderSale>> {
    return this.getPage(
      { isGiftOrder: false },
      {
        orderBy: 'saleDate',
        keysetAfter: opts.cursor,
        limit: opts.limit ?? DEFAULT_PAGE_SIZE,
        isNullFields: ['invoiceNo'],
      },
    );
  }
}
