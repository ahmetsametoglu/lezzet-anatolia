import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WarehouseTransferSchema,
  WarehouseTransferLineSchema,
  DispatchTransferResultSchema,
  ReceiveTransferResultSchema,
  CancelTransferResultSchema,
  type WarehouseTransfer,
  type WarehouseTransferLine,
  type DispatchLine,
  type DispatchTransferResult,
  type ReceiveLine,
  type ReceiveTransferResult,
  type CancelTransferResult,
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
 * `update`/`delete` bilerek kullanılmaz: transfer bir OLAY kaydıdır, düzeltilmez. Mal çıkıp geri
 * döndüyse çözüm ters yönde bir transferdir — kayıt silmek geçmişi yalanlar. Sevk kaydının kendisi
 * hatalıysa (mal hiç çıkmadıysa) yol `cancel()`'dır ve o da bir RPC: kayıt silinmez, damgalanır.
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
   * Sevk kaydını GERİ AL (19.6) — "mal hiç çıkmadı" hâli.
   *
   * Adı bilerek `cancel` değil davranışı anlatan bir cümle: ekranın düğmesi de "İptal" değil
   * **"Sevk kaydını geri al"** olmalı. Çünkü tek bir "iptal" iki ayrı gerçeği yutar ve stok yalan
   * söyler:
   *
   * - **Sevk kaydı hatalıydı, mal hiç çıkmadı** → burası. Miktar kaynak PARTİYE geri yazılır
   *   (yeni parti doğmaz — `initial_qty` ve geri çağırma izi bölünmesin), transfer `cancelled`
   *   olur ve kim/ne zaman/neden damgası kalır.
   * - **Mal çıktı, sonra geri döndü** → burası DEĞİL: ters yönlü yeni bir transfer. Mal fiilen iki
   *   kez yol gitti; tek kayda indirmek soğuk zincir geçmişini silerdi.
   *
   * Kabul edilmiş transfer geri alınamaz (RPC reddeder): mal hedefte parti olarak doğdu, belki
   * satıldı bile.
   */
  async cancel(input: { transferId: string; actorId?: string | null; reason?: string | null }): Promise<CancelTransferResult> {
    const raw = await this.executeRpc('cancel_transfer', {
      p_transfer_id: input.transferId,
      p_actor_id: input.actorId ?? null,
      p_reason: input.reason ?? null,
    });
    return CancelTransferResultSchema.parse(dbToApp(raw as Record<string, unknown>));
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
   * Depoların transfer geçmişi — hem gönderdikleri hem aldıkları.
   *
   * **Keyset sayfalı**: transfer kaydı veriyle büyüyen bir kümedir (CLAUDE.md §1) ve her sevk bir
   * satır ekler. Sabit bir tavanla kesseydik ekran listenin kuyruğunu sessizce yutardı — "geçen
   * yılın sevkiyatı" diye bir soru sorulduğunda cevap eksik gelirdi ve kimse fark etmezdi.
   *
   * ÇOĞUL alır (19.6): personel kapsamı birden çok depo taşıyabilir ve depo başına ayrı sorgu
   * atıp birleştirmek keyset'i bozardı — tek `or(in,in)` süzgeci sırayı tek sorguda korur.
   */
  listForWarehouses(warehouseIds: readonly string[], opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<WarehouseTransfer>> {
    const ids = warehouseIds.join(',');
    return this.getPage(undefined, {
      orFilters: [`from_warehouse_id.in.(${ids}),to_warehouse_id.in.(${ids})`],
      orderBy: 'dispatchedAt',
      orderDirection: 'desc',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
    });
  }

  /**
   * Depo süzgeçsiz geçmiş — "Tüm depolar" bağlamının listesi (19.6). `listForWarehouse`un
   * kuralları aynen: veriyle büyüyen küme, keyset; tavanla kesilseydi kuyruk sessizce yutulurdu.
   * Kapsam SORUSU burada değil: depo-üstü bakış yalnız yöneticinindir ve o kapı çağıranda
   * (`readWarehouseContext` bağlamı 'all' vermeyen kullanıcıya bu metot hiç çağrılmaz).
   */
  listRecent(opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<WarehouseTransfer>> {
    return this.getPage(undefined, {
      orderBy: 'dispatchedAt',
      orderDirection: 'desc',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
    });
  }

  /**
   * Transferin satırları — sevk ekranının onayı ve kabul ekranının girdisi.
   *
   * Okuma artık `WarehouseTransferLineService`'te (02.8): junction tablosunun kendi evi var. Burada
   * duran ince sarmalayıcı çağıranları korumak için — transferi okuyan ekran satırları da aynı
   * yerden istiyor ve iki servis kurdurmanın bir faydası yok.
   */
  listLines(transferId: string): Promise<WarehouseTransferLine[]> {
    return new WarehouseTransferLineService(this.supabase).listByTransfer(transferId);
  }
}

/**
 * Transfer satırları (`warehouse_transfer_line`) — **junction kendi alt sınıfında** (02.8,
 * `STACK §6`), `order_item_batch` ile aynı gerekçe.
 *
 * **Yazma yolu YOK.** Satırlar sevk ve kabul RPC'leriyle doğuyor/güncelleniyor: satırın yazılması
 * ile stoğun taşınması bölünemez bir işlem (`STACK §13`). Buradan tek satır yazma kapısı açmak, o
 * bölünmezliği delen ikinci bir yol olurdu — ve transfer tam da "mal iki yerde birden görünmesin"
 * diye var.
 */
export class WarehouseTransferLineService extends BaseDbService<WarehouseTransferLine, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'warehouse_transfer_line',
      WarehouseTransferLineSchema,
      WarehouseTransferLineSchema as never,
      WarehouseTransferLineSchema as never,
      false,
    );
  }

  /**
   * Bir transferin satırları, yazıldıkları sırayla.
   *
   * **Sayfalama YOK ve bu ölçülü bir karar** (`CLAUDE.md §1`): küme veriyle büyümüyor, tek sevkin
   * kalem sayısı kadar — operatörün o an araca yüklediği şey. Sınırsız büyüyen tek şey transferlerin
   * KENDİSİ ve o zaten keyset sayfalı (`listByWarehouse`).
   */
  listByTransfer(transferId: string): Promise<WarehouseTransferLine[]> {
    return this.getAll({ transferId }, { orderBy: 'id' });
  }

  /**
   * Bir SAYFA transferin satırları tek turda (19.6) — liste ekranı satır sayısı/adet toplamı
   * yazar ve transfer başına ayrı sorgu, bir geçmiş listesinde en pahalı hatadır (09.13 dersi).
   * Gruplamayı çağıran yapar: bu katman satır getirir, toplamak görünümün işi değildir ama
   * SQL'e taşıyacak kadar da pahalı değildir (sayfa başına ≤30 transfer × birkaç kalem).
   */
  listByTransfers(transferIds: readonly string[]): Promise<WarehouseTransferLine[]> {
    if (transferIds.length === 0) return Promise.resolve([]);
    return this.getAll({ transferId: [...transferIds] }, { orderBy: 'id' });
  }

  /**
   * **YOLDAKİ MAL** — bu partilerden ÇIKMIŞ ama hedefe varmamış adet (22.34).
   *
   * Transferin ortasında mal iki depoda da yoktur: kaynaktan `dispatch` anında düşer, hedefte ancak
   * `receive` ile yeni parti olarak doğar. Aradaki adet hiçbir partinin `physical_qty`sinde
   * görünmez — ve bir stok geçmişi ekranı bunu bilmezse *"giren − çıkan = elde"* denklemi tam o
   * kadar sapar (ölçüldü 15.08: kullanıcı ekran görüntüsü, 4 adet yolda ve denklem 4 kaymıştı).
   *
   * Yalnız `in_transit` sayılır: `completed` transferin karşılığı hedefte bir PARTİ olarak duruyor
   * ve o parti zaten listeye giriyor — ikisini birden saymak malı iki kez düşürürdü. `cancelled`
   * ise kaynağa geri konmuştur.
   *
   * Süzgeç GÖMÜLÜ kolona bakıyor (`warehouse_transfer.status`): satırın kendisinde durum yok, başlık
   * taşıyor. `!inner` şart — dış birleştirme başlıksız satır üretir ve süzgeç hiçbir şeyi elemezdi.
   */
  async inTransitFromStocks(stockIds: readonly string[]): Promise<Array<{ stockId: string; qty: number }>> {
    if (stockIds.length === 0) return [];
    const rows = (await this.selectRows(
      { sourceStockId: [...stockIds], 'warehouse_transfer.status': 'in_transit' },
      { select: 'source_stock_id,qty,warehouse_transfer!inner(status)' },
    )) as Array<{ source_stock_id: string; qty: number }>;
    return rows.map((row) => ({ stockId: row.source_stock_id, qty: row.qty }));
  }
}
