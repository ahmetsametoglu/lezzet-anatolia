import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAGE_SIZE,
  TicketInsertSchema,
  TicketMessageInsertSchema,
  TicketMessageSchema,
  TicketQueueRowSchema,
  TicketSchema,
  TicketUpdateSchema,
  type KeysetCursor,
  type Page,
  type Ticket,
  type TicketInsert,
  type TicketMessage,
  type TicketMessageInsert,
  type TicketQueueRow,
  type TicketStatus,
  type TicketType,
  type TicketUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Talep / şikâyet servisleri (16.1) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * Hangi durum geçişinin geçerli olduğu burada DEĞİL, motorda (`domain-core/support`): servis
 * geçişe izin verip vermemeyi bilseydi aynı kural iki yerde yaşar ve WhatsApp'tan gelen talep
 * başka, formdan gelen başka davranabilirdi.
 */
export class TicketService extends BaseDbService<Ticket, TicketInsert, TicketUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ticket', TicketSchema, TicketInsertSchema, TicketUpdateSchema, false);
  }

  /**
   * **Talep + ilk mesaj tek turda** (`create_ticket`). İki ayrı yazım, ikincisi düştüğünde
   * anlatımsız bir talep bırakırdı — kuyrukta duran ama açanın ne dediği bilinmeyen bir satır.
   *
   * Bu yüzden `insert` bu serviste açık DEĞİL (`allowDelete=false` gibi, tek yazma yolu RPC).
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
   * Cevap + (gerekiyorsa) durum değişimi, tek turda (`reply_ticket`).
   *
   * `newStatus` KARAR DEĞİL, kararın taşınmasıdır: hangi cevabın durumu değiştirdiğini motor
   * söyler (`statusAfterCustomerReply`). Servis kuralı bilseydi aynı karar iki yerde yaşardı.
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
   * Müşterinin "Taleplerim" listesi — yeniden eskiye, keyset sayfalı.
   *
   * Sayfalı, çünkü talep sayısı veriyle büyür (CLAUDE.md: sınırsız büyüyen küme → keyset). Sıralama
   * `createdAt`'tir, son mesaj değil: müşteri kendi listesinde talebi ne zaman AÇTIĞINI hatırlar.
   */
  listByCustomer(customerId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<Ticket>> {
    return this.getPage({ customerId }, { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor });
  }

  /** Siparişe bağlı talepler — sipariş detayındaki "bu siparişle ilgili talebiniz var" bağı. */
  listByOrder(orderId: string): Promise<Ticket[]> {
    return this.getAll({ orderId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /** Konuşmadan açılmış talepler (15.x) — WhatsApp izlemeden talebe köprü. */
  listByConversation(conversationId: string): Promise<Ticket[]> {
    return this.getAll({ conversationId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Durum yazımı. `resolvedAt` damgası duruma BAĞLI yazılır — ikisi ayrışamaz (DB kısıtı da bunu
   * zorlar): "ne zaman çözüldü" sorusunun cevabı hâlâ açık bir talepte olamaz.
   *
   * Geçişin geçerliliği çağırana aittir (`domain-core/support.canTransition`).
   */
  async setStatus(id: string, status: TicketStatus): Promise<Ticket> {
    return this.update({ id, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : null });
  }

  /**
   * AI'dan devralma (16.5) — talep insana geçer ve AI o talepte susar.
   *
   * Tek yönlüdür ve öyle kalmalı: insandan AI'a geri vermek, müşterinin konuştuğu muhatabın
   * habersiz değişmesi olurdu.
   */
  takeOver(id: string): Promise<Ticket> {
    return this.update({ id, handledBy: 'human' });
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
   * Müşterinin KAPANMAMIŞ talep sayısı (09.9) — SAYIM, sayfa uzunluğu değil.
   *
   * Sayfayı çekip satırları saymak, tam da sayının anlam kazandığı yerde (çok talep açmış müşteride)
   * tavana takılıp yalan söylerdi.
   */
  countOpenByCustomer(customerId: string): Promise<number> {
    return this.count({ customerId }, OPEN_TICKET_FILTER);
  }

  /**
   * Müşterinin toplam talep sayısı — operatörün "sürekli şikâyet eden mi" bakışı.
   *
   * SAYIM'dır, sayfa uzunluğu değil: bir sayfanın satır sayısını "toplam" diye göstermek, sayıyı
   * tam da anlam kazandığı yerde (çok talep açmış müşteride) yalancı yapardı.
   */
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
   * Tek müşterinin talepleri — müşterinin kendi "Taleplerim" listesi (08.6).
   *
   * Görünüm zaten `customer_id` taşıyor; süzgeç eksikti. Müşteri listesi bu görünümden okunuyor
   * çünkü tasarımın istediği iki alan (son mesajın anı, siparişin numarası) yalnız burada türetilmiş
   * hâlde duruyor — ham `ticket` satırından okumak sayfa başına iki ek tur demekti.
   */
  customerId?: string;
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

  /**
   * Operasyon kuyruğu — **son mesaja göre** sıralı: kuyruğun tek amacı cevap bekleyeni
   * bekletmemektir, o yüzden sıra açılış tarihine değil son harekete bakar.
   */
  list(filter: TicketQueueFilter = {}, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<TicketQueueRow>> {
    const orFilters: string[] = [];
    if (filter.openOnly) orFilters.push('status.eq.open,status.eq.in_progress');
    return this.getPage(
      { status: filter.status, type: filter.type, awaitingReply: filter.awaitingReply, customerId: filter.customerId },
      {
        orderBy: 'lastMessageAt',
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
 * Talep yazışması (16.1). Talebin ilk açıklaması da bir mesajdır — ayrı bir `description` alanı
 * olsaydı "müşterinin anlatımı" ile sonraki cevapları iki ayrı yerde dururdu.
 */
export class TicketMessageService extends BaseDbService<TicketMessage, TicketMessageInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ticket_message', TicketMessageSchema, TicketMessageInsertSchema, TicketMessageSchema as never, false);
  }

  /**
   * Bir talebin yazışması — eskiden yeniye, TAMAMI.
   *
   * Sayfalanmaz ve bu bilinçli: yazışma sınırsız büyüyen bir küme değil, tek bir konuşmadır
   * (üç durumlu sade döngü, DOMAIN §15). Ortasından okunmaz — baştan okunur.
   */
  listByTicket(ticketId: string): Promise<TicketMessage[]> {
    return this.getAll({ ticketId }, { orderBy: 'createdAt' });
  }
}
