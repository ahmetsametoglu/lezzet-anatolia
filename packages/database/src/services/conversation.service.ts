import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ConversationInboxRowSchema,
  ConversationInsertSchema,
  ConversationSchema,
  ConversationUpdateSchema,
  MessageInsertSchema,
  MessageSchema,
  type Conversation,
  type ConversationInboxRow,
  type ConversationInsert,
  type ConversationSource,
  type ConversationUpdate,
  type Message,
  type MessageBody,
  type MessageDirection,
  type MessageInsert,
  type MessageKind,
  type TemplateCategory,
  type KeysetCursor,
  type Page,
  DEFAULT_PAGE_SIZE,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Konuşma servisleri (15.1) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * Kimliğin telefondan çözülmesi burada DEĞİL, uygulama katmanında (`lib/whatsapp/conversation.ts`):
 * karar motorun (`resolveIdentity`), satır servisin. Servis kimliği de çözseydi aynı kural iki
 * yerde yaşar ve WhatsApp'tan gelen müşteri, web'den gelenle farklı bir kapıdan geçerdi.
 *
 * Servis penceresinin 24 saati de burada değil (`serviceWindowExpiry`): süreyi taşıyan taraf
 * hesaplayan taraf olmamalı.
 */
export class ConversationService extends BaseDbService<Conversation, ConversationInsert, ConversationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'conversation', ConversationSchema, ConversationInsertSchema, ConversationUpdateSchema, false);
  }

  /**
   * **Aç ya da bul** (`open_conversation`) — tek deyimlik upsert.
   *
   * Oku-sonra-yaz YARIŞIR: aynı numaradan iki mesaj arka arkaya gelirse (adım 2'de olağan) ikisi de
   * "konuşma yok" görür, ikincisi tekillik indeksine çarpar ve mesaj kaybolur.
   *
   * Mevcut müşteri bağı EZİLMEZ (`coalesce`): bağlanmış bir konuşmayı başka müşteriye kaydırmak bir
   * BİRLEŞTİRME kararıdır ve insana aittir (DOMAIN §10).
   *
   * Bu yüzden `insert` bu serviste kapalı — tek yazma yolu RPC.
   */
  async open(input: { externalRef: string; customerId?: string | null; source?: ConversationSource }): Promise<Conversation> {
    const raw = await this.executeRpc('open_conversation', {
      p_source: input.source ?? 'whatsapp',
      p_external_ref: input.externalRef,
      p_customer_id: input.customerId ?? null,
    });
    return ConversationSchema.parse(dbToApp(raw));
  }

  /**
   * Sağlayıcı anahtarıyla tek konuşma — gelen mesajın hangi sohbete ait olduğu sorusu.
   *
   * `source` ile birlikte aranır, çünkü tekillik o ikilide: aynı dize başka bir kaynakta başka
   * birini gösterebilir.
   */
  async findByExternalRef(externalRef: string, source: ConversationSource = 'whatsapp'): Promise<Conversation | null> {
    const rows = await this.getAll({ source, externalRef }, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Bir müşterinin konuşmaları — müşteri kartından sohbetine geçiş (15.5).
   *
   * Sayfalanmaz ve bu bilinçli: bir müşterinin konuşma sayısı veriyle büyüyen bir küme değil,
   * kaynak sayısı kadardır (bugün bir). Sayfalayan bir okuma burada yalnız imleç taşırdı.
   */
  listByCustomer(customerId: string): Promise<Conversation[]> {
    return this.getAll({ customerId }, { orderBy: 'lastMessageAt', orderDirection: 'desc' });
  }

  /**
   * Ticari mesaj izni (DOMAIN §11) — izin ve ANI birlikte yazılır.
   *
   * İkisi ayrı çağrıya bırakılsaydı biri unutulur ve elimizde tarihsiz bir "izin var" kaydı
   * kalırdı; GDPR'da ne zaman verildiği yazılmayan izin, izin değildir. DB kısıtı da bunu zorluyor —
   * burası kısıtın okunur yüzü.
   */
  setOptIn(id: string, granted: boolean): Promise<Conversation> {
    return this.update({ id, optIn: granted, optInAt: granted ? new Date().toISOString() : null });
  }
}

/**
 * Konuşmanın mesajları (15.1). **Defterdir — yazılır, güncellenmez:** gönderilmiş mesaj değişmez,
 * o yüzden güncelleme tipi `never`. Bir gün biri "mesajı düzelt" demek istese derleme durdurur.
 */
export class MessageService extends BaseDbService<Message, MessageInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'message', MessageSchema, MessageInsertSchema, MessageSchema as never, false);
  }

  /**
   * Mesaj + konuşmanın damgaları, TEK turda (`record_message`).
   *
   * Ayrı iki yazım olsaydı ikincisi düştüğünde gelen kutusu sessizce bayatlardı: yeni mesaj gelmiş
   * ama konuşma listenin dibinde kalmış olurdu — ve kimse fark etmezdi.
   *
   * `windowExpiresAt` KARAR DEĞİL, kararın taşınmasıdır (`serviceWindowExpiry`). Verilmezse
   * pencereye dokunulmaz; giden mesaj pencereyi açmaz.
   */
  async record(input: {
    conversationId: string;
    direction: MessageDirection;
    body: MessageBody;
    kind?: MessageKind;
    templateName?: string | null;
    /** Şablonun ücret sınıfı — adla birlikte gelir, ondan ayrı düşemez (DB kısıtı zorlar). */
    templateCategory?: TemplateCategory | null;
    providerMessageId?: string | null;
    windowExpiresAt?: string | null;
  }): Promise<Message> {
    const raw = await this.executeRpc('record_message', {
      p_conversation_id: input.conversationId,
      p_direction: input.direction,
      p_kind: input.kind ?? 'text',
      p_body: input.body,
      p_template_name: input.templateName ?? null,
      p_template_category: input.templateCategory ?? null,
      p_provider_message_id: input.providerMessageId ?? null,
      p_window_expires_at: input.windowExpiresAt ?? null,
    });
    return MessageSchema.parse(dbToApp(raw));
  }

  /**
   * Bir konuşmanın mesajları — eskiden yeniye, TAMAMI.
   *
   * `TicketMessageService.listByTicket` ile aynı gerekçe: konuşma ortasından okunmaz, baştan okunur.
   * **Ama burada bir sınır var ve adım 2'de gelecek:** canlı kanalda konuşma gerçekten sınırsız
   * büyür (aylar süren tek bir sohbet). Bugün elle işlenen bir avuç mesaj var; sayfalama, onu
   * tüketecek ekranla (15.5 detayı) birlikte yazılır — bugün yazılsaydı imleci okuyan kimse
   * olmazdı ve `CLAUDE §1`'in "sayfalayan okumanın tüketeni olmalı" kuralına düşerdi.
   */
  listByConversation(conversationId: string): Promise<Message[]> {
    return this.getAll({ conversationId }, { orderBy: 'createdAt' });
  }

  /**
   * **Sayfalı geçmiş** (15.5) — canlı kanalda tek sohbet aylarca sürer.
   *
   * `listByConversation` adım 1'de doğruydu (elle işlenen bir avuç mesaj) ve DURUYOR: konuşmayı
   * baştan okuyan yollar (AI bağlamı, dışa aktarma) tamamını ister. Bu ise ekranın kapısı.
   *
   * **Sıra eskiden yeniye KORUNUYOR** — okunan şey bir sohbet, ters sıralı bir sohbet okunmaz.
   * "Daha eski" düğmesi imleci ileri taşır; ekran satırları yukarı ekler.
   */
  listPage(conversationId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<Message>> {
    return this.getPage({ conversationId }, { orderBy: 'createdAt', limit, keysetAfter: cursor });
  }
}

/**
 * `conversation_inbox` görünümü (15.5) — gelen kutusunun okuduğu satır.
 *
 * Ayrı bir servis, çünkü görünüm YAZILMAZ: aynı sınıfa koymak, insert/update'i olmayan bir tabloya
 * yazma metotları açardı (`TicketQueueService` emsali).
 */
export class ConversationInboxService extends BaseDbService<ConversationInboxRow, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'conversation_inbox',
      ConversationInboxRowSchema,
      ConversationInboxRowSchema as never,
      ConversationInboxRowSchema as never,
      false,
    );
  }

  /**
   * Kuyruk — **son harekete göre** sıralı: tek amacı cevap bekleyeni bekletmemek, o yüzden sıra
   * açılış tarihine değil son mesaja bakar.
   *
   * Sayfalı, çünkü konuşma kümesi veriyle SINIRSIZ büyür (`CLAUDE §1`) — canlı kanalda aylarca.
   * İmleci ekran tüketiyor ("daha eski" düğmesi), yani sessiz kırpma yok.
   */
  list(filter: { awaitingReply?: boolean } = {}, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<ConversationInboxRow>> {
    return this.getPage(
      { awaitingReply: filter.awaitingReply },
      { orderBy: 'lastMessageAt', orderDirection: 'desc', limit, keysetAfter: cursor },
    );
  }

  /**
   * "3 cevap bekliyor" başlığının sayısı — SAYIM, sayfa uzunluğu değil.
   *
   * Yüklenmiş sayfadan saymak, tam da sayının anlam kazandığı yerde (kalabalık kuyrukta) yalan
   * söylerdi: "ilk sayfada 3 bekliyor" ile "3 bekliyor" aynı cümle değil.
   */
  countAwaitingReply(): Promise<number> {
    return this.count({ awaitingReply: true });
  }
}
