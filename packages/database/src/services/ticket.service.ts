import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAGE_SIZE,
  TicketInsertSchema,
  ProductComplaintSignalSchema,
  TicketMessageInsertSchema,
  TicketMessageSchema,
  TicketMessageTranslationUpdateSchema,
  TicketQueueRowSchema,
  TicketSchema,
  TicketStatusEnum,
  TicketTypeEnum,
  TicketUpdateSchema,
  type KeysetCursor,
  type Page,
  type Ticket,
  type TicketHandler,
  type TicketInsert,
  type ProductComplaintSignal,
  type TicketMessage,
  type TicketMessageInsert,
  type TicketMessageTranslationUpdate,
  type TicketQueueRow,
  type TicketStatus,
  type TicketType,
  type TicketUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Talep servisleri karar vermez, satır getirir ve yazar. Durum geçişinin geçerliliği motordadır, yoksa aynı kural iki yerde
 * yaşar ve farklı kanaldan gelen talepler farklı davranabilirdi.
 */
export class TicketService extends BaseDbService<Ticket, TicketInsert, TicketUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ticket', TicketSchema, TicketInsertSchema, TicketUpdateSchema, false);
  }

  /**
   * Talep ve ilk mesaj tek turda (`create_ticket`), çünkü ikinci yazım düşerse anlatımsız bir talep kalırdı. Bu yüzden `insert` bu
   * serviste açık değil; tek yazma yolu RPC.
   */
  async createWithMessage(input: {
    customerId: string;
    source: Ticket['source'];
    type: TicketType;
    body: string;
    orderId?: string | null;
    orderItemIds?: string[];
    conversationId?: string | null;
    subject?: string | null;
    attachments?: string[];
    /** Personelin elle açtığı talepte ilk mesajın sahibi. */
    authorId?: string | null;
    sender?: TicketMessage['sender'];
  }): Promise<Ticket> {
    const raw = await this.executeRpc('create_ticket', {
      p_customer_id: input.customerId,
      p_source: input.source,
      p_type: input.type,
      p_body: input.body,
      p_order_id: input.orderId ?? null,
      p_order_item_ids: input.orderItemIds ?? [],
      p_conversation_id: input.conversationId ?? null,
      p_subject: input.subject ?? null,
      p_attachments: input.attachments ?? [],
      p_author_id: input.authorId ?? null,
      p_sender: input.sender ?? 'customer',
    });
    return TicketSchema.parse(dbToApp(raw));
  }

  /**
   * Cevap ve gerekiyorsa durum değişimi tek turda (`reply_ticket`). `newStatus` karar değil, motorun kararının taşınmasıdır.
   */
  async reply(input: {
    ticketId: string;
    sender: TicketMessage['sender'];
    body: string;
    attachments?: string[];
    authorId?: string | null;
    newStatus?: TicketStatus | null;
  }): Promise<TicketMessage> {
    const raw = await this.executeRpc('reply_ticket', {
      p_ticket_id: input.ticketId,
      p_sender: input.sender,
      p_body: input.body,
      p_attachments: input.attachments ?? [],
      p_author_id: input.authorId ?? null,
      p_new_status: input.newStatus ?? null,
    });
    return TicketMessageSchema.parse(dbToApp(raw));
  }

  /**
   * Cevap maili kuyruğu: okunmamış cevabı `cutoff`tan eskiye dayanmış talepler, kısmi indeksin (`ticket_reply_pending_idx`)
   * şeklinde. En eski önce, ki gecikmesi en çok büyümüş müşteri ilk haberi alsın.
   */
  listReplyPendingBefore(cutoff: string, limit = 50): Promise<Ticket[]> {
    return this.getAll(
      {},
      {
        isNotNullFields: ['replyPendingSince'],
        rangeFilters: [{ field: 'replyPendingSince', operator: 'lte', value: cutoff }],
        orderBy: 'replyPendingSince',
        limit,
      },
    );
  }

  /**
   * Bu sipariş kalemine açık bir soru var mı — aynı sorunun iki kez sorulmasını önler. `contains`, çünkü talep birden çok kalem
   * işaretleyebilir; çözülmüş talep engel değil, aynı kalem yeniden eksik kalırsa yeniden sorulabilmeli.
   */
  async findOpenByOrderItem(orderItemId: string): Promise<Ticket | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .contains('order_item_ids', [orderItemId])
      .neq('status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    return row ? TicketSchema.parse(dbToApp(row)) : null;
  }

  /**
   * Bu siparişlerde hangi kalemler cevap bekliyor — hazırlık kuyruğunun izi, sayfanın tamamı tek turda. Yalnız kalem kimlikleri
   * seçilir, ki depo ekranına müşteri yazışması taşınmasın.
   */
  async awaitingItemIds(orderIds: readonly string[]): Promise<Set<string>> {
    const awaiting = new Set<string>();
    if (orderIds.length === 0) return awaiting;

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('order_item_ids')
      .in('order_id', [...orderIds])
      .neq('status', 'resolved');
    if (error) throw error;

    for (const row of (data ?? []) as unknown as Array<{ order_item_ids: string[] | null }>) {
      for (const id of row.order_item_ids ?? []) awaiting.add(id);
    }
    return awaiting;
  }

  /**
   * Müşterinin "Taleplerim" listesi, keyset sayfalı çünkü veriyle büyür. Sıralama açılış anına göre, çünkü müşteri talebi ne zaman
   * açtığını hatırlar.
   */
  listByCustomer(customerId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<Ticket>> {
    return this.getPage({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor });
  }

  /** Siparişe bağlı talepler — sipariş detayındaki "bu siparişle ilgili talebiniz var" bağı. */
  listByOrder(orderId: string): Promise<Ticket[]> {
    return this.getAll({ orderId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /** Konuşmadan açılmış talepler — sohbetten talebe köprü. */
  listByConversation(conversationId: string): Promise<Ticket[]> {
    return this.getAll({ conversationId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Durum yazımı; `resolvedAt` damgası duruma bağlı yazılır ve ikisi ayrışamaz (DB kısıtı da zorlar). Geçişin geçerliliği
   * çağırana aittir.
   */
  async setStatus(id: string, status: TicketStatus): Promise<Ticket> {
    return this.update({ id, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : null });
  }

  /** AI'dan devralma — talep insana geçer; bekleyen taslak birlikte düşer, çünkü devralan taslağı değil sohbeti istedi. */
  takeOver(id: string): Promise<Ticket> {
    return this.update({ id, handledBy: 'human', aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /**
   * Yürütücü modunu değiştir. Hibritten çıkarken taslak temizlenir, yoksa hibride bir sonraki dönüşte bayat bir cevap "hazır" diye
   * sunulurdu.
   */
  setMode(id: string, mode: TicketHandler): Promise<Ticket> {
    return mode === 'hybrid'
      ? this.update({ id, handledBy: mode })
      : this.update({ id, handledBy: mode, aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /**
   * Talebin türünü düzeltir; tür bir sınıflandırmadır ve geçiş kuralı yoktur. Yanlış sınıflandırılmış kayıt düzeltilemeseydi
   * süzgeç ve rapor sayıları kalıcı olarak yanlış kalırdı.
   */
  setType(id: string, type: TicketType): Promise<Ticket> {
    return this.update({ id, type });
  }

  /**
   * Bekleyen AI taslağını satırdan düşürür. Cevap buradan yazılmaz, çünkü gönderim düşerse taslak yerinde kalmalı; sıra çağırandadır.
   */
  clearDraft(id: string): Promise<Ticket> {
    return this.update({ id, aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /**
   * İade akışının bu talepten başlatıldığını damgalar. **Tutar yazılmaz** — iade siparişte yaşar,
   * buradaki damga yalnız "hangi talep doğurdu" sorusunu cevaplar (DOMAIN §8, §15).
   */
  markReturnTriggered(id: string): Promise<Ticket> {
    return this.update({ id, returnTriggeredAt: new Date().toISOString() });
  }

  /** Kapanmamış talep sayısı — dashboard rozeti. */
  countOpen(): Promise<number> {
    return this.count(undefined, OPEN_TICKET_FILTER);
  }

  /**
   * Cevabı insanın yazmadığı (`ai` + `hybrid`) kapanmamış talep sayısı — başlığın "N AI'da" sayacı. Kapanmışlar sayılmaz, çünkü
   * sayaç bir iş yükü göstergesi.
   */
  countHandledByAi(): Promise<number> {
    return this.count({ handledBy: ['ai', 'hybrid'] }, OPEN_TICKET_FILTER);
  }

  /**
   * Durum başına talep sayısı; kuyruk sayfalı olduğu için yüklenmiş sayfadan sayılamaz. Durum başına ayrı ve indeksli tur atılır,
   * çünkü tek `group by` ancak bir RPC ile gelir ve üç ucuz tur için şemaya fonksiyon eklemek kazancından pahalı.
   */
  async countByStatus(): Promise<Record<TicketStatus, number>> {
    const statuses = TicketStatusEnum.options;
    const counts = await Promise.all(statuses.map((status) => this.count({ status })));
    return Object.fromEntries(statuses.map((status, i) => [status, counts[i] ?? 0])) as Record<TicketStatus, number>;
  }

  /**
   * Ürün başına şikâyet yoğunluğu — Geri Bildirim ekranında ürün skorunun yanında okunur. RPC, çünkü zincir `order_item_ids`
   * dizisinden geçiyor ve `unnest` + join PostgREST'ten sorulamaz; `productIds` boşsa tüm ürünler döner.
   */
  async listComplaintSignals(productIds: readonly string[] = [], since?: string): Promise<ProductComplaintSignal[]> {
    const rows = await this.executeRpc<unknown[]>('product_complaint_signal', {
      p_since: since ?? null,
      p_product_ids: productIds.length > 0 ? [...productIds] : null,
    });
    return (rows ?? []).map((row) => ProductComplaintSignalSchema.parse(dbToApp(row)));
  }

  /** Müşterinin kapanmamış talep sayısı — sayım, çünkü sayfa uzunluğu çok talep açmış müşteride tavana takılırdı. */
  countOpenByCustomer(customerId: string): Promise<number> {
    return this.count({ customerId }, OPEN_TICKET_FILTER);
  }

  /** Müşterinin toplam talep sayısı — sayım, sayfa uzunluğu değil; operatörün "sürekli şikâyet eden mi" bakışı. */
  countByCustomer(customerId: string): Promise<number> {
    return this.count({ customerId });
  }
}

/**
 * "Kapanmamış talep" ölçütü — TEK yerde. İki sayaç (dashboard ve müşteri kartı) onu paylaşır; ayrı
 * yazılsalardı biri `resolved`'ı bir gün açık sayardı.
 */
const OPEN_TICKET_FILTER: { orFilters: string[] } = { orFilters: ['status.eq.open,status.eq.in_progress'] };

/** Kuyruk süzgeci — hepsi opsiyonel; verilmeyen süzmez (varsayılan odak: kapanmamışlar). */
export interface TicketQueueFilter {
  status?: TicketStatus;
  type?: TicketType;
  /** Yalnız cevap bekleyenler (son sözü müşteri söylemiş). */
  awaitingReply?: boolean;
  /** `true` → yalnız siparişli, `false` → yalnız siparişsiz talepler. */
  hasOrder?: boolean;
  /** Kapanmışları gizle — kuyruğun varsayılan hâli. */
  openOnly?: boolean;
  /**
   * Tek müşterinin talepleri; müşteri listesi bu görünümden okunur, çünkü son mesajın anı ve siparişin numarası yalnız burada
   * türetilmiş hâlde durur.
   */
  customerId?: string;
  /**
   * Talebi şu an kim yürütüyor; `answeredByAi` "hiç" sorusudur, bu "şu an". Dizi "şunlardan biri" demek: "AI'da" çipi
   * `['ai','hybrid']` geçer.
   */
  handledBy?: TicketHandler | TicketHandler[];
  /**
   * AI bu talepte hiç konuştu mu — kalite denetiminin kümesi. `handledBy: 'ai'` devralınmış talepleri dışarıda bırakırdı, oysa
   * denetim en çok onlara bakar.
   */
  answeredByAi?: boolean;
}

/**
 * `ticket_queue` görünümü — talep + türetilen kuyruk bilgisi (son mesaj, bekleyen cevap, fotoğraf).
 *
 * Ayrı bir servis, çünkü görünüm YAZILMAZ: aynı sınıfa koymak, insert/update'i olmayan bir tabloya
 * yazma metotları açardı.
 */
export class TicketQueueService extends BaseDbService<TicketQueueRow, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ticket_queue', TicketQueueRowSchema, TicketQueueRowSchema as never, TicketQueueRowSchema as never, false);
  }

  /** Tek talebin kuyruk satırı — detay ekranı başlığı (son mesaj, bekleyen cevap). */
  getRow(id: string): Promise<TicketQueueRow | null> {
    return this.getById(id);
  }

  /** Cevap bekleyen açık taleplerin sayımı — yönetim karar kutusunun rozeti; sayfa uzunluğundan sayılmaz. */
  countAwaiting(): Promise<number> {
    return this.count({ awaitingReply: true, status: ['open', 'in_progress'] });
  }

  /**
   * Talep listesi süzgeç çiplerinin sayaçları; `all` ayrı tur değil türlerin toplamıdır, çünkü tür açık kuyruğu tam olarak böler ve
   * ayrı sayım bir gün ayrışabilirdi. `awaiting` ve `resolved` aynı kümeye bakan başka sorulardır, toplamı bozmaz.
   */
  async countForFilters(): Promise<{ all: number; byType: Record<TicketType, number>; awaiting: number; resolved: number }> {
    const types = TicketTypeEnum.options;
    const [typeCounts, awaiting, resolved] = await Promise.all([
      Promise.all(types.map((type) => this.count({ type, status: ['open', 'in_progress'] }))),
      this.countAwaiting(),
      this.count({ status: 'resolved' }),
    ]);
    const byType = Object.fromEntries(types.map((type, i) => [type, typeCounts[i] ?? 0])) as Record<TicketType, number>;
    return { all: typeCounts.reduce((sum, n) => sum + n, 0), byType, awaiting, resolved };
  }

  /**
   * Operasyon kuyruğu — **son mesaja göre** sıralı: kuyruğun tek amacı cevap bekleyeni
   * bekletmemektir, o yüzden sıra açılış tarihine değil son harekete bakar.
   */
  list(filter: TicketQueueFilter = {}, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<TicketQueueRow>> {
    const orFilters: string[] = [];
    if (filter.openOnly) orFilters.push('status.eq.open,status.eq.in_progress');
    return this.getPage(
      {
        status: filter.status,
        type: filter.type,
        awaitingReply: filter.awaitingReply,
        customerId: filter.customerId,
        handledBy: filter.handledBy,
        answeredByAi: filter.answeredByAi,
      },
      {
        /* Sıra `queueSortAt`ten: cevap bekleyenler üstte, kendi içlerinde en taze önce. Tek sütun, çünkü keyset imleci tek alana
           dayanıyor ve iki `order by` her sayfalanan listenin imlecini değiştirirdi. */
        orderBy: 'queueSortAt',
        orderDirection: 'desc',
        limit,
        keysetAfter: cursor,
        orFilters: orFilters.length > 0 ? orFilters : undefined,
        isNullFields: filter.hasOrder === false ? ['orderId'] : undefined,
        isNotNullFields: filter.hasOrder === true ? ['orderId'] : undefined,
      },
    );
  }
}

/**
 * Talep yazışması. Talebin ilk açıklaması da bir mesajdır, yoksa müşterinin anlatımı ile sonraki cevapları iki ayrı yerde dururdu.
 */
export class TicketMessageService extends BaseDbService<TicketMessage, TicketMessageInsert, TicketMessageTranslationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ticket_message', TicketMessageSchema, TicketMessageInsertSchema, TicketMessageTranslationUpdateSchema, false);
  }

  /** Bir talebin yazışması, eskiden yeniye ve tamamı; sayfalanmaz, çünkü sınırsız büyüyen bir küme değil tek bir konuşmadır. */
  listByTicket(ticketId: string): Promise<TicketMessage[]> {
    return this.getAll({ ticketId }, { orderBy: 'createdAt' });
  }

  /**
   * Çeviri kuyruğu: çevirisi koşmamış mesajlar, en eski önce, kısmi indeksle birebir. İki yön de kuyruktadır; gönderene göre
   * süzmek yazışmanın yarısını dilsiz bırakırdı.
   */
  listUntranslated(limit = 20): Promise<TicketMessage[]> {
    return this.getAll({}, { isNullFields: ['translatedAt'], orderBy: 'createdAt', limit });
  }
}
