import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderBoxInsertSchema,
  OrderBoxItemInsertSchema,
  OrderBoxItemSchema,
  OrderBoxItemUpdateSchema,
  OrderBoxSchema,
  OrderBoxUpdateSchema,
  type OrderBox,
  type OrderBoxInsert,
  type OrderBoxItem,
  type OrderBoxItemInsert,
  type OrderBoxItemUpdate,
  type OrderBoxUpdate,
  type PreparationPick,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sipariş kutusu (`order_box`, Modül 23 · `0048_order_box.sql`) — bizim bastığımız QR'ın kaydı.
 *
 * Servis SAF I/O'dur: kutu döngüsünün kuralları (kimin kutusu, açılabilir mi, birleşim nasıl
 * kurulur) uygulama katmanında (`application/warehouse/boxes.ts`); kapanışın kendisi RPC'de
 * (`seal_order_box` — kutu + picks tek transaction, STACK §13). Buradan `sealed_at` yazan bir
 * kapı BİLEREK yok: mühür yalnız RPC'den vurulur.
 */
export class OrderBoxService extends BaseDbService<OrderBox, OrderBoxInsert, OrderBoxUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_box', OrderBoxSchema, OrderBoxInsertSchema, OrderBoxUpdateSchema, false);
  }

  /** Siparişin kutuları, sipariş içi sırayla — hazırlık kuyruğunun ve web özetinin okuması. */
  async listByOrder(orderId: string): Promise<OrderBox[]> {
    return this.getAll({ orderId }, { orderBy: 'boxNo' });
  }

  /**
   * **Taşıyıcıya verilmeyi bekleyen kutu sayısı** — deponun rampasındaki yığın (07.12).
   *
   * Üç şartın ÜÇÜ birden gerekiyor ve her biri ayrı bir gerçeği eliyor:
   *   · `sealed_at not null` — açık kutu taşıyıcıya verilemez (hâlâ doluyor)
   *   · `shipment_id not null` — etiketi satın alınmamış kutu da verilemez (devir kapısının şartı)
   *   · `loaded_at is null` — verilmiş kutu yığında değildir
   *
   * Süzgeçler **devir kapısının reddettikleriyle birebir aynı** (`handOverBox`: `not_sealed` ·
   * `not_announced`) ve bu bir tercih değil zorunluluk: sayaç kapıdan gevşek olsaydı hub "3 kutu
   * bekliyor" der, depocu rampada üçünü de okutur ve biri reddedilirdi — sayının söylediği iş
   * yapılamaz çıkardı.
   */
  async countAwaitingHandover(warehouseId: string): Promise<number> {
    return this.count({ warehouseId }, { isNotNullFields: ['sealedAt', 'shipmentId'], isNullFields: ['loadedAt'] });
  }

  /** Birden çok siparişin kutuları TEK sorguda — kuyruk sipariş başına tur atmasın (21.11d dersi). */
  async listByOrders(orderIds: string[]): Promise<OrderBox[]> {
    if (orderIds.length === 0) return [];
    return this.getAll({ orderId: orderIds }, { orderBy: 'boxNo' });
  }

  /** Okutulan QR'ın kutusu — yükleme ve teslim (23.8) yalnız kodu görür. */
  async getByCode(code: string): Promise<OrderBox | null> {
    return this.getOneBy({ code });
  }

  /**
   * **Taşıyıcı webhook'unun eşleşme kapısı** (07.12) — sağlayıcının KOLİ kimliği.
   *
   * `getByCode` ile karıştırılmaz: o BİZİM bastığımız QR, bu SAĞLAYICININ kimliği; iki ayrı
   * kimlik uzayı. Takip numarasına bağlanan bir eşleşme erken olayları kaçırır — numara bazı
   * taşıyıcılarda geç atanıyor (tasarım kaydı §6.2).
   */
  async getByParcelRef(providerParcelRef: string): Promise<OrderBox | null> {
    return this.getOneBy({ providerParcelRef });
  }

  /**
   * **Devir okutmasının eşleşme kapısı** (07.12) — taşıyıcının TAKİP numarası.
   *
   * `getByParcelRef` ile karıştırılmaz: o sağlayıcının İÇ koli kimliği (webhook'un eşleşmesi),
   * bu ise etiketin ÜSTÜNDE yazan ve barkodu okutulabilen numara. Devir okutması etiketi okuyor,
   * webhook ise sağlayıcının kendi kimliğiyle konuşuyor — iki ayrı kaynak, iki ayrı kolon.
   */
  async getByTrackingNumber(trackingNumber: string): Promise<OrderBox | null> {
    return this.getOneBy({ trackingNumber });
  }

  /**
   * **Kutu kapanışı** (`seal_order_box`, 0048): kutu kalemleri + hazırlık kaydı + mühür TEK
   * transaction. `picks` ABSOLÜT birleşimdir — kurma sorumluluğu çağıran kapıda (`sealBox`);
   * RPC eşitliği denetler (Σ kutu = karşılanan) ve bozuksa TÜMÜNÜ geri alır.
   */
  async seal(
    boxId: string,
    items: ReadonlyArray<{ orderItemId: string; qty: number }>,
    picks: readonly PreparationPick[],
    actorId: string | null,
  ): Promise<void> {
    await this.executeRpc('seal_order_box', {
      p_box_id: boxId,
      p_items: items.map((item) => ({ order_item_id: item.orderItemId, qty: item.qty })),
      p_picks: picks.map((pick) => ({
        order_item_id: pick.orderItemId,
        batches: pick.batches.map((batch) => ({ stock_id: batch.stockId, qty: batch.qty })),
      })),
      p_actor: actorId,
    });
  }

  /**
   * **Kutuyu geri açar** (01.09) — mühür kalkar, döküm silinir, karşılanan adet kalan kutuların
   * birleşimiyle yeniden yazılır. Kararın tamamı RPC'de (`0048`): araca binmiş kutu ve hazırlıktan
   * çıkmış sipariş REDDEDİLİR, `ready` sipariş `preparing`e döner.
   */
  async unseal(boxId: string, actorId: string | null): Promise<void> {
    await this.executeRpc('unseal_order_box', { p_box_id: boxId, p_actor: actorId });
  }

  /**
   * **Boş taslak kutuyu atar** (02.09) — mühürsüz VE boş olma şartı RPC'de (`0048`).
   *
   * Servis silmeye KAPALI (`allowDelete = false`) ve öyle kalmalı: açmak, mühürlü kutuyu da
   * silinebilir yapardı. Uygulama katmanı bir tur `delete` çağırıyordu ve dal hiç koşmamıştı —
   * ilk tetikleyen kullanıcı oldu, uç 500 döndü (künye migration'da).
   */
  async discard(boxId: string, actorId: string | null): Promise<void> {
    await this.executeRpc('discard_order_box', { p_box_id: boxId, p_actor: actorId });
  }
}

/**
 * Kutu kalemleri (`order_box_item`) — **junction tablosu kendi alt sınıfında** (STACK §6).
 *
 * **Yazma yolu YOK ve bu bilinçli** (`order_item_batch`in aynı kararı): satırlar yalnız
 * `seal_order_box` RPC'sinde doğar — kutu içeriği ile parti izi bölünemez bir yazımdır. Buradan
 * tek satır ekleme kapısı açmak o bölünmezliği delen ikinci bir yol olurdu.
 */
export class OrderBoxItemService extends BaseDbService<OrderBoxItem, OrderBoxItemInsert, OrderBoxItemUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_box_item', OrderBoxItemSchema, OrderBoxItemInsertSchema, OrderBoxItemUpdateSchema, false);
  }

  /** Kutuların içerikleri tek turda — kuyruk kutu başına tur atmaz. */
  async listByBoxes(boxIds: string[]): Promise<OrderBoxItem[]> {
    if (boxIds.length === 0) return [];
    return this.getAll({ boxId: boxIds });
  }
}
