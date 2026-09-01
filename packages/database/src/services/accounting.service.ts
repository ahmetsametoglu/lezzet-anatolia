import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderSaleSchema,
  DEFAULT_PAGE_SIZE,
  type KeysetCursor,
  type OrderSale,
  type Page,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
// Para alan listesi TEK yerde (`order.service`): görünüm siparişin kolonlarını aynen taşıyor, yani
// listenin de aynısı olmak zorunda. Kopya tutulduğu sürece ad değişikliği birini güncellemeyi
// unutturuyordu — 01.09'da tam olarak bu oldu.
import { ORDER_MONEY_FIELDS } from './order.service';

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
/** `order_sale` görünümü `Order`'ın para kolonlarını aynen taşır — liste de aynı (STACK §8). */

export class OrderSaleService extends BaseDbService<OrderSale, never, never> {
  /**
   * Görünüm siparişin para kolonlarını olduğu gibi taşır (euro `numeric`), şema ise `OrderSchema`'dan
   * türediği için `…Cents` bekler — beyan bu yüzden burada da gerekli (02.9 · STACK §8).
   */
  protected override readonly moneyFields = ORDER_MONEY_FIELDS;

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
    const BATCH_SIZE = 500;
    const all: OrderSale[] = [];
    let cursor: KeysetCursor | undefined;

    do {
      const page = await this.getPage(
        {},
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
