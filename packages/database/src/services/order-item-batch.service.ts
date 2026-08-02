import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderItemBatchInsertSchema,
  OrderItemBatchSchema,
  OrderItemBatchUpdateSchema,
  RecallHitSchema,
  type OrderItemBatch,
  type OrderItemBatchInsert,
  type OrderItemBatchUpdate,
  type OrderStatus,
  type RecallHit,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Kalem ↔ parti eşlemesi (`order_item_batch`) — **junction tablosu kendi alt sınıfında** (02.8,
 * `STACK §6`).
 *
 * ── NEDEN AYRI BİR EV ────────────────────────────────────────────────────────
 * Üç okuma `OrderService`'in içinde ham `this.supabase` çağrısı olarak durmuştu ve üçü de aynı
 * tabloyu okuyordu. Ham sorgunun bedeli görünmez: şema doğrulamasını ve ad dönüşümünü çağıranın
 * hatırlamasına bırakır — biri `dbToApp` yazmayı unuttuğu gün uygulamanın içine `order_item_id`
 * diye bir alan sızar ve tip sistemi bunu yakalayamaz (satır `unknown`).
 *
 * Üçü BİRLİKTE taşındı; yalnız birini ayırmak aynı tabloyu iki eve bölerdi, ki bu eski hâlden
 * kötüdür — "bu tablo nereden okunuyor" sorusunun iki cevabı olurdu.
 *
 * ── BU TABLO NEYİN KAYDI ─────────────────────────────────────────────────────
 * Depocunun hazırlıkta ONAYLADIĞI gerçek: hangi kalem hangi partiden çıktı. Tahmin değil, öneri
 * değil. İki soru bunun üstünde duruyor ve ikisi de zıt yönde okunur:
 *   · sipariş → partiler (`listByOrder`) — gerçek COGS ve iade
 *   · parti → siparişler (`recallByStocks`) — geri çağırma
 *
 * **Yazma yolu YOK ve bu bilinçli.** Satırlar hazırlık onayı ve hızlı satış RPC'leriyle doğuyor
 * (`record_preparation`, `quick_sale`): kalem–parti eşlemesi ile stoğun düşmesi bölünemez bir
 * yazımdır (`STACK §13`). Buradan tek satır yazma kapısı açmak, o bölünmezliği delen ikinci bir
 * yol açmak olurdu.
 */
export class OrderItemBatchService extends BaseDbService<OrderItemBatch, OrderItemBatchInsert, OrderItemBatchUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_item_batch', OrderItemBatchSchema, OrderItemBatchInsertSchema, OrderItemBatchUpdateSchema, false);
  }

  /**
   * Siparişin kalem–parti eşlemesi — geri çağırma ve gerçek COGS bunun üstünde durur.
   *
   * Süzgeç GÖMÜLÜ kolona bakıyor (`order_item.order_id`): junction'ın kendisinde sipariş kimliği
   * yok, kalem üzerinden bağlanıyor. `!inner` şart — dış birleştirme kalemi olmayan satır üretirdi
   * ve süzgeç hiçbir şeyi elemezdi.
   */
  listByOrder(orderId: string): Promise<OrderItemBatch[]> {
    return this.getAll(
      { 'order_item.order_id': orderId },
      // Süzme için gömülen `order_item` şemada yok — Zod fazla anahtarı zaten eler.
      { select: '*,order_item!inner(order_id)' },
    );
  }

  /**
   * **Geri çağırma (rappel) sorgusu** — "bu partilerden çıkan mal kime gitti" (09.13).
   *
   * `listByOrder`'ın TERS yönü: orada sipariş verilir partiler istenir, burada parti verilir
   * siparişler. Zincir hazırlık kaydından gelir, yani depocunun onayladığı gerçektir. Tedarikçi bir
   * lotu geri çağırdığında cevabın dakikalar içinde verilmesi gerekir; tek turda okunur (sipariş
   * başına ayrı sorgu, tam da acele edilen anda ekranı yavaşlatırdı).
   *
   * **Sipariş başına TEK satır döner:** aynı siparişe aynı partiden iki kalem çıkmış olabilir
   * (farklı ürün satırı, aynı parti); ham satırlar aynı müşteriyi iki kez listelerdi. Miktarlar
   * toplanır — aranan "kaç sipariş, kime, ne kadar"dır.
   *
   * Müşteri ilişkisi FK adıyla ÇÖZÜLÜR: `order` tablosu `user_profiles`'a iki kez bakar (müşteri ve
   * kurye), belirsiz bırakılırsa PostgREST hangi bağı izleyeceğini bilemez.
   */
  async recallByStocks(stockIds: readonly string[]): Promise<RecallHit[]> {
    if (stockIds.length === 0) return [];

    const rows = (await this.selectRows(
      { stockId: [...stockIds] },
      { select: 'qty,order_item!inner(order:order!inner(id,reference_no,created_at,status,customer:user_profiles!order_customer_id_fkey(id,name,phone)))' },
    )) as RecallRow[];

    const byOrder = new Map<string, RecallHit>();
    for (const raw of rows) {
      const order = raw.order_item.order;
      const seen = byOrder.get(order.id);
      if (seen) {
        seen.qty += raw.qty;
        continue;
      }
      byOrder.set(
        order.id,
        RecallHitSchema.parse({
          orderId: order.id,
          referenceNo: order.reference_no,
          orderCreatedAt: order.created_at,
          orderStatus: order.status,
          customerId: order.customer.id,
          customerName: order.customer.name,
          customerPhone: order.customer.phone,
          qty: raw.qty,
        }),
      );
    }
    // En yeni sipariş önce: geri çağırmada önce hâlâ müşterinin elinde olabilecek mal aranır.
    return [...byOrder.values()].sort((a, b) => b.orderCreatedAt.localeCompare(a.orderCreatedAt));
  }

  /**
   * **Kalem başına gerçek maliyet** (cent) — fiilen çıkan partilerin alış fiyatından (12.6).
   * Ortalama değil gerçek: hangi partiden çıktığı bu tabloda yazılı.
   *
   * Dönüş `null` = maliyet BİLİNMİYOR (partinin alış fiyatı girilmemiş). 0 ile karıştırılmaz:
   * bilinmeyeni 0 saymak ürün marjını şişirir (DOMAIN §13). Hiç parti kaydı olmayan kalem haritada
   * yer almaz — çağıran onu da "bilinmiyor" sayar.
   */
  async itemCosts(orderItemIds: readonly string[]): Promise<Map<string, number | null>> {
    const costs = new Map<string, number | null>();

    // PostgREST'in `in (…)` listesi URL'de taşınıyor; uzun listede istek satırı tavanı aşar.
    // Parçalama başarım değil SINIR meselesi — tek turda sorulan liste bir gün sessizce kesilirdi.
    for (let i = 0; i < orderItemIds.length; i += IN_BATCH_SIZE) {
      const rows = (await this.selectRows(
        { orderItemId: orderItemIds.slice(i, i + IN_BATCH_SIZE) },
        { select: 'order_item_id,qty,stock:stock(purchase_price)' },
      )) as CostRow[];

      for (const row of rows) {
        const current = costs.get(row.order_item_id);
        const purchasePrice = row.stock?.purchase_price;
        // Tek bir partinin fiyatı bile eksikse kalemin maliyeti bilinmiyordur — kalanı toplamak
        // eksik bir sayıyı tam gibi gösterirdi.
        if (purchasePrice === null || purchasePrice === undefined || current === null) {
          costs.set(row.order_item_id, null);
          continue;
        }
        costs.set(row.order_item_id, (current ?? 0) + Math.round(Number(purchasePrice) * 100) * row.qty);
      }
    }
    return costs;
  }
}

/** `in (…)` parça boyu — PostgREST süzgeci URL'de taşınıyor, uzun liste istek satırını aşar. */
const IN_BATCH_SIZE = 200;

/**
 * Gömülü ilişkilerden gelen HAM satır şekilleri.
 *
 * `getAllAs` kullanılmıyor çünkü o, satırı bir Zod şemasıyla doğrulayıp döndürür; burada dönen şey
 * bir varlık değil, birleştirmenin ara çıktısı ve asıl doğrulama toplamadan SONRA yapılıyor
 * (`RecallHitSchema`). Aradaki şekli ikinci bir şema olarak yazmak, yalnız araya girmek için var
 * olan bir tip üretirdi.
 */
interface RecallRow {
  qty: number;
  order_item: {
    order: {
      id: string;
      reference_no: string | null;
      created_at: string;
      status: OrderStatus;
      customer: { id: string; name: string; phone: string | null };
    };
  };
}

interface CostRow {
  order_item_id: string;
  qty: number;
  stock: { purchase_price: string | number | null } | null;
}
