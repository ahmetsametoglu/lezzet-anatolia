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
   * **Cevap maili kuyruğu** (17.08) — okunmamış cevabı `cutoff`tan eskiye dayanmış talepler.
   *
   * Süpürge dakikada bir koşuyor ve kümenin normal hâli BOŞ; kısmi indeks (`ticket_reply_pending_idx`)
   * birebir bu sorgunun şeklidir. En eski önce: gecikmesi en çok büyümüş müşteri ilk haberi alsın.
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
   * **Bu sipariş kalemine açık bir soru var mı** (10.3) — eksik kararının çift talep koruması.
   *
   * Depo ekranı "müşteriye sorulsun" düğmesini iki kez gördüğünde (yenilenmemiş sayfa, iki depocu,
   * çift tıklama) aynı soru iki kez sorulur ve ikisi de ayrı kuyruk satırı olarak yaşar — müşteri
   * aynı soruyu iki kez alır, operasyon hangisinin cevaplandığını bilemez.
   *
   * **`contains`, eşitlik değil:** `order_item_ids` bir dizi kolonu (junction tablosu yok) ve bir
   * talep birden çok kalem işaretleyebilir. `@>` operatörü "bu kalem o dizinin içinde mi" diye
   * sorar; eşitlik yalnız TEK kalemli talepleri bulurdu ve iki kalemli bir soru görünmez kalırdı.
   *
   * **Çözülmüş talep engel DEĞİL:** cevabı alınmış bir soru geçmiştir; aynı kalem yeniden eksik
   * kalırsa yeniden sorulabilmeli.
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
   * **Bu siparişlerde hangi kalemler cevap bekliyor** (10.3) — hazırlık kuyruğunun izi.
   *
   * Soru sorulduktan sonra ekranda hiçbir iz kalmazsa depocu o kalemi ya unutur ya ikinci kez
   * sorar; kuyruk bu yüzden "cevap bekleniyor" diyebilmeli. **Sipariş başına sorgu YOK** — sayfanın
   * tamamı tek turda okunur (N+1 kırılır), dönen küme yalnız kalem kimlikleri.
   *
   * Dar seçim (`order_item_ids`): kuyruğun sorusu "bu kalem bekliyor mu", talebin kendisi değil —
   * talep satırını taşımak, depo ekranına müşteri yazışması getirmek olurdu (`DOMAIN §2`).
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
   * AI'dan devralma (16.5) — talep insana geçer ve AI o talepte susar. `ai`'dan da `hybrid`'den
   * de iner; bekleyen taslak varsa birlikte düşer (devralan taslağı değil sohbeti istedi).
   */
  takeOver(id: string): Promise<Ticket> {
    return this.update({ id, handledBy: 'human', aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /**
   * Yürütücü modunu değiştir (kullanıcı kararı 16.08): human · hybrid · ai — üçü de operatörün
   * AÇIK kararıyla seçilir; ilk yazımdaki "insandan AI'a geri verilmez" duruşu, mod anahtarı
   * ekrana çıkınca kalktı (kararı veren zaten muhatabın kendisi, sessiz bir değişim yok).
   *
   * Moddan düşerken taslak temizlenir: `human`/`ai` modunda bekleyen taslağın tüketicisi yoktur —
   * kalsaydı hibride bir sonraki dönüşte BAYAT bir cevap "hazır" diye sunulurdu.
   */
  setMode(id: string, mode: TicketHandler): Promise<Ticket> {
    return mode === 'hybrid'
      ? this.update({ id, handledBy: mode })
      : this.update({ id, handledBy: mode, aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /**
   * Bekleyen AI taslağını tüket (16.08) — gönderilmiş ya da düzenlemeye alınmış taslak satırdan
   * düşer. Cevabın kendisi buradan YAZILMAZ (`reply` ayrı kapı): tüketmek ile göndermek ayrı
   * işler ve gönderim düşerse taslak yerinde kalmalıydı — sıra bu yüzden çağıranda.
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
   * Cevabı insanın yazmadığı KAPANMAMIŞ talep sayısı (16.5) — başlığın "N AI'da" sayacı.
   *
   * `ai` + `hybrid` birlikte: soru "kaç talep AI'ın elinde", modun alt türü değil. Kapanmışlar
   * sayılmaz — sayaç bir İŞ YÜKÜ göstergesi, tarihsel istatistik değil.
   */
  countHandledByAi(): Promise<number> {
    return this.count({ handledBy: ['ai', 'hybrid'] }, OPEN_TICKET_FILTER);
  }

  /**
   * Durum başına talep sayısı — Talepler ekranının (16.3) başlık satırı: *"3 açık · 2 işlemde"*.
   *
   * **Yüklenmiş sayfadan sayılamaz** ve talep bunu doğru tespit etmişti: kuyruk keyset sayfalı, yani
   * oradan türetilen "2 işlemde" aslında "ilk SAYFADA 2 işlemde" olurdu — ve sayı tam da anlam
   * kazandığı yerde (kalabalık kuyrukta) yalan söylerdi. `CLAUDE.md §1`: sayfalayan okumanın sayacı
   * sayfadan türetilmez.
   *
   * Her durum için AYRI bir sayım turu atılıyor; tek `group by` daha zarif olurdu ama PostgREST onu
   * ancak bir RPC ile verir ve `STACK §13` okuma-RPC eşiği burada karşılanmıyor: küme üç değerli ve
   * sayımlar indeksli — üç ucuz tur için şemaya fonksiyon eklemek, kazancından pahalı bir bağ olurdu.
   *
   * **`handledBy` kırılımı BİLEREK yok.** Talep de aynısını söylüyordu: `16.5` (AI işletme) inene
   * kadar her talep `human`, yani üçüncü sayı daima 0 çıkardı. Sıfır gösteren bir sayaç, ekranda
   * "AI çalışmıyor" değil "AI yok" der ve ikisi ayrı şeydir; kırılım 16.5 ile birlikte gelir.
   */
  async countByStatus(): Promise<Record<TicketStatus, number>> {
    const statuses = TicketStatusEnum.options;
    const counts = await Promise.all(statuses.map((status) => this.count({ status })));
    return Object.fromEntries(statuses.map((status, i) => [status, counts[i] ?? 0])) as Record<TicketStatus, number>;
  }

  /**
   * **Ürün başına şikâyet yoğunluğu** (16.6 · operasyon talebi 03.08) — Geri Bildirim ekranının
   * skor tablosunda, ürünün skorunun yanında okunur.
   *
   * **Neden RPC:** zincir `order_item_ids` DİZİSİNDEN geçiyor (talep → kalem → varyant → ürün) ve
   * dizi açımı (`unnest`) + join PostgREST'ten sorulamaz; ekranda satır satır kurmak N+1 olurdu.
   * `STACK §13`'ün RPC eşiği burada karşılanıyor — "üç ucuz tur" değil, yapılamayan bir sorgu.
   *
   * `productIds` boşsa TÜM ürünler döner; kapsam vermek okumayı daraltır, zorunlu değil.
   */
  async listComplaintSignals(productIds: readonly string[] = [], since?: string): Promise<ProductComplaintSignal[]> {
    const rows = await this.executeRpc<unknown[]>('product_complaint_signal', {
      p_since: since ?? null,
      p_product_ids: productIds.length > 0 ? [...productIds] : null,
    });
    return (rows ?? []).map((row) => ProductComplaintSignalSchema.parse(dbToApp(row)));
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
  /**
   * Talebi ŞU AN kim yürütüyor (16.5) — satır rozetinin süzgeci.
   *
   * `answeredByAi` ile karıştırılmamalı ve fark kalıcı: bu "şu an", öteki "hiç" sorusudur.
   * Dizi = "şunlardan biri" (`in`): ekranın "AI'da" çipi `['ai','hybrid']` geçer — ikisi de
   * "cevabı insan yazmıyor" kümesidir ve iki ayrı çip şeridi kalabalıklaştırırdı (16.08).
   */
  handledBy?: TicketHandler | TicketHandler[];
  /**
   * AI bu talepte HİÇ konuştu mu (16.5 · operasyon talebi 03.08) — kalite denetiminin kümesi.
   *
   * `handledBy: 'ai'` ile süzmek bu soruyu sessizce yanlış cevaplardı: devralınmış talepler dışarıda
   * kalırdı, oysa denetim en çok onlara bakar — devralma zaten bir şeyin ters gittiğinin işareti.
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
export class TicketMessageService extends BaseDbService<TicketMessage, TicketMessageInsert, TicketMessageTranslationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'ticket_message', TicketMessageSchema, TicketMessageInsertSchema, TicketMessageTranslationUpdateSchema, false);
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

  /**
   * **Çeviri kuyruğu** (20.2) — çevirisi henüz koşmamış mesajlar, en eski önce.
   * Kısmi indeksle birebir (`ticket_message_untranslated_idx`).
   *
   * Yazışmanın İKİ yönü de kuyruktadır: müşterinin mesajını personel Türkçe okuyacak, personelin
   * mesajını müşteri kendi dilinde okuyacak. Gönderene göre süzmek yarısını dilsiz bırakırdı.
   */
  listUntranslated(limit = 20): Promise<TicketMessage[]> {
    return this.getAll({}, { isNullFields: ['translatedAt'], orderBy: 'createdAt', limit });
  }
}
