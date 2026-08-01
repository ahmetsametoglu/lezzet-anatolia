import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WarehouseTransferSchema,
  WarehouseTransferLineSchema,
  DispatchTransferResultSchema,
  ReceiveTransferResultSchema,
  type WarehouseTransfer,
  type WarehouseTransferLine,
  type DispatchLine,
  type DispatchTransferResult,
  type ReceiveLine,
  type ReceiveTransferResult,
  type KeysetCursor,
  type Page,
  DEFAULT_PAGE_SIZE,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Depolar arası transfer servisi (19.1) — DOMAIN §17, K11/T4.
 *
 * İki fiziksel-gerçek an var ve ikisi de RPC: sevkte mal kaynaktan düşer, kabulde hedefte YENİ
 * parti olarak doğar. Arada sanal bir "transit depo" yoktur — yoldaki mal hiçbir deponun stoğunda
 * değildir ve bu yüzden hiçbir yerde satılamaz. "Yolda ne var" sorusunun kaynağı transfer kaydıdır.
 *
 * Yazım yolları neden RPC (STACK §13 (b)): transfer kaydı + satırlar + parti düşümü tek gerçektir.
 * Yarısı yazılırsa "mal düştü ama transfer yok" hâli doğar ve stok elle düzeltilir.
 *
 * `update`/`delete` bilerek kullanılmaz: transfer bir OLAY kaydıdır, düzeltilmez. Yanlış sevk
 * yapıldıysa çözüm ters yönde bir transferdir — kayıt silmek geçmişi yalanlar.
 */
export class WarehouseTransferService extends BaseDbService<WarehouseTransfer, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'warehouse_transfer',
      WarehouseTransferSchema,
      WarehouseTransferSchema as never,
      WarehouseTransferSchema as never,
      false,
    );
  }

  /**
   * Sevk — kaynak depo KALEMLERDEN türer, ayrıca sorulmaz: partiler zaten bir depoda duruyor ve
   * ayrıca sorulan bir kaynak onlarla çelişebilirdi.
   *
   * Sevk edilebilecek miktarın ölçüsü fiili değil KULLANILABİLİR stoktur: müşteriye söz verilmiş
   * mal başka şehre gidemez (RPC reddeder).
   */
  async dispatch(input: {
    toWarehouseId: string;
    lines: DispatchLine[];
    actorId?: string | null;
    note?: string | null;
  }): Promise<DispatchTransferResult> {
    const raw = await this.executeRpc('dispatch_transfer', {
      p_to_warehouse_id: input.toWarehouseId,
      p_lines: input.lines.map((l) => ({ source_stock_id: l.sourceStockId, qty: l.qty })),
      p_actor_id: input.actorId ?? null,
      p_note: input.note ?? null,
    });
    return DispatchTransferResultSchema.parse(dbToApp(raw as Record<string, unknown>));
  }

  /**
   * Kabul — hedefte tarih/lot/alış kopyalanmış YENİ parti doğar (T4: parti kimliği korunur,
   * birleşmez; birleştirseydik `initialQty` ve geri çağırma izi bozulurdu).
   *
   * **Her satır için miktar gerekir.** Eksik gelen mal `receivedQty: 0` ile beyan edilir; satırı
   * hiç göndermemek kabulü bloklar — yoksa mal kaynaktan düşmüş, hedefte doğmamış ve "yolda"
   * listesinden de çıkmış olurdu (RPC reddeder).
   */
  async receive(input: {
    transferId: string;
    lines: ReceiveLine[];
    actorId?: string | null;
  }): Promise<ReceiveTransferResult> {
    const raw = await this.executeRpc('receive_transfer', {
      p_transfer_id: input.transferId,
      p_lines: input.lines.map((l) => ({ line_id: l.lineId, received_qty: l.receivedQty })),
      p_actor_id: input.actorId ?? null,
    });
    return ReceiveTransferResultSchema.parse(dbToApp(raw as Record<string, unknown>));
  }

  /**
   * Yoldakiler — hedef deposu verilirse "bana ne geliyor", verilmezse tüm ağ (admin).
   *
   * Sayfalanmaz ve bu bilinçli: küme FİZİKSEL gerçekle sınırlı — aynı anda yolda olan sevkiyat
   * sayısı kadar. Zamanla büyümez, her kabul birini düşürür. Bu listenin TAM olması gerekir:
   * bir sevkiyatı kaçırmak, iki depoda da görünmeyen mal demektir.
   */
  listInTransit(toWarehouseId?: string): Promise<WarehouseTransfer[]> {
    return this.getAll(
      toWarehouseId ? { status: 'in_transit', toWarehouseId } : { status: 'in_transit' },
      { orderBy: 'dispatchedAt', orderDirection: 'desc' },
    );
  }

  /**
   * Bir deponun transfer geçmişi — hem gönderdikleri hem aldıkları.
   *
   * **Keyset sayfalı**: transfer kaydı veriyle büyüyen bir kümedir (CLAUDE.md §1) ve her sevk bir
   * satır ekler. Sabit bir tavanla kesseydik ekran listenin kuyruğunu sessizce yutardı — "geçen
   * yılın sevkiyatı" diye bir soru sorulduğunda cevap eksik gelirdi ve kimse fark etmezdi.
   */
  listForWarehouse(warehouseId: string, opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<WarehouseTransfer>> {
    return this.getPage(undefined, {
      orFilters: [`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`],
      orderBy: 'dispatchedAt',
      orderDirection: 'desc',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
    });
  }

  /**
   * Transferin satırları — sevk ekranının onayı ve kabul ekranının girdisi.
   *
   * BEKLEYEN(02.8): junction tablosu kendi alt sınıfını hak ediyor (CLAUDE.md §1); `order_item_batch`
   * için aynı borç zaten kayıtlı. İkisi birlikte çıkarılacak — tek transferin satır sayısı doğal
   * olarak sınırlı (sevk kalemleri), o yüzden burada sayfalama gerekmiyor.
   */
  async listLines(transferId: string): Promise<WarehouseTransferLine[]> {
    const { data, error } = await this.supabase
      .from('warehouse_transfer_line')
      .select('*')
      .eq('transfer_id', transferId)
      .order('id');
    if (error) throw error;
    return (data ?? []).map((row) => WarehouseTransferLineSchema.parse(dbToApp(row)));
  }
}
