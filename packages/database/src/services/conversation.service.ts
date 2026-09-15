import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ConversationInboxRowSchema,
  CustomerInboxRowSchema,
  ConversationInsertSchema,
  ConversationNoteInsertSchema,
  ConversationNoteSchema,
  ConversationSchema,
  ConversationUpdateSchema,
  MessageInsertSchema,
  MessageSchema,
  type Conversation,
  type ConversationInboxRow,
  type CustomerInboxRow,
  type ConversationInsert,
  type ConversationNote,
  type ConversationNoteInsert,
  type ConversationSource,
  type ConversationUpdate,
  type Message,
  type MessageBody,
  type MessageDirection,
  type MessageInsert,
  type MessageKind,
  type PreferredLanguage,
  type SourceLanguage,
  type TemplateCategory,
  type TicketHandler,
  type TicketSender,
  type TranslationBag,
  type KeysetCursor,
  type ConversationLinkProof,
  type Page,
  DEFAULT_PAGE_SIZE,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/** Kimlik çözümü uygulama katmanında, pencerenin 24 saati motorda: servis karar vermez, satır getirir ve yazar. */
export class ConversationService extends BaseDbService<Conversation, ConversationInsert, ConversationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'conversation', ConversationSchema, ConversationInsertSchema, ConversationUpdateSchema, false);
  }

  /**
   * Tek yazma yolu bu RPC: oku-sonra-yaz, arka arkaya gelen iki mesajda tekillik indeksine çarpar ve mesaj kaybolurdu. Müşteri
   * bağı ezilmez (birleştirme insanın kararı), profil adı ise son görülen değerle güncellenir.
   */
  async open(input: {
    source: ConversationSource;
    externalRef: string;
    customerId?: string | null;
    providerAccountRef?: string | null;
    profileName?: string | null;
    /** RPC yalnız satır doğarken yazar; var olan sohbetin modu değişmez. */
    handledBy?: TicketHandler | null;
  }): Promise<Conversation> {
    const raw = await this.executeRpc('open_conversation', {
      p_source: input.source,
      p_external_ref: input.externalRef,
      p_customer_id: input.customerId ?? null,
      p_provider_account_ref: input.providerAccountRef ?? null,
      p_profile_name: input.profileName ?? null,
      p_handled_by: input.handledBy ?? null,
    });
    return ConversationSchema.parse(dbToApp(raw));
  }

  /** `source` zorunlu: tekillik o ikilide, aynı dize başka kaynakta başka birini gösterebilir. */
  async findByExternalRef(source: ConversationSource, externalRef: string): Promise<Conversation | null> {
    const rows = await this.getAll({ source, externalRef }, { limit: 1 });
    return rows[0] ?? null;
  }

  /** Sayfalanmaz: müşterinin konuşma sayısı kanal sayısı kadardır, veriyle büyümez. */
  listByCustomer(customerId: string): Promise<Conversation[]> {
    return this.getAll({ customerId }, { orderBy: 'lastMessageAt', orderDirection: 'desc' });
  }

  /**
   * Yalnız boşsa yazar: bağlı konuşmayı başka müşteriye kaydırmak birleştirme kararıdır ve Müşteriler ekranının işidir. Yarışı
   * DB çözer, kaybeden `null` alır.
   */
  linkCustomer(
    id: string,
    input: { customerId: string; linkedBy: string | null; proof: ConversationLinkProof },
  ): Promise<Conversation | null> {
    // Bağ ve künyesi tek yazımda: ayrı çağrıda ikincisi düşerse "kim bağladı, neye dayanarak" cevapsız kalırdı. Damga burada,
    // DB varsayılanında değil: sistemin kurduğu WhatsApp bağında kolon boş kalmalı.
    return this.updateIfNull(id, 'customerId', {
      customerId: input.customerId,
      linkedBy: input.linkedBy,
      linkedAt: new Date().toISOString(),
      linkProof: input.proof,
    });
  }

  /**
   * Yalnız boşsa yazar: Messenger/Instagram webhook'u ad taşımaz ve ad ayrı bir Graph çağrısıyla bir kez öğrenilir; her mesajda
   * yazmak elle düzeltmeyi ezerdi.
   */
  setProfileName(id: string, profileName: string): Promise<Conversation | null> {
    return this.updateIfNull(id, 'profileName', { profileName });
  }

  /** İzin ve anı birlikte yazılır, ret de `optInAskedAt` ile iz bırakır. Ret geldiğinde `optInAt`e dokunulmaz: "o gün izni vardı" kanıtı yok olurdu. */
  setOptIn(id: string, granted: boolean): Promise<Conversation> {
    const now = new Date().toISOString();
    return this.update({ id, optIn: granted, optInAskedAt: now, ...(granted ? { optInAt: now } : {}) });
  }

  /**
   * Cevap değil, sorunun kendisi: `setOptIn`e yüklenseydi "reddetti" ile "cevap gelmedi" aynı çağrıya girerdi. Yalnız boşsa
   * yazar ki ilk soru anı korunsun ve ajan her turda yeniden sormasın.
   */
  markOptInAsked(id: string): Promise<Conversation | null> {
    return this.updateIfNull(id, 'optInAskedAt', { optInAskedAt: new Date().toISOString() });
  }

  /** Hibritten düşerken bekleyen taslak da düşer, yoksa sonraki dönüşte bayat bir cevap "hazır" diye sunulurdu. */
  setMode(id: string, mode: TicketHandler): Promise<Conversation> {
    return mode === 'hybrid'
      ? this.update({ id, handledBy: mode })
      : this.update({ id, handledBy: mode, aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  clearDraft(id: string): Promise<Conversation> {
    return this.update({ id, aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /** Son gelen kazanır, `updateIfNull` değil: müşteri "Bonjour" ile başlayıp Türkçe sürdürebilir. */
  setLanguage(id: string, language: PreferredLanguage): Promise<Conversation> {
    return this.update({ id, language });
  }

  /** Kanal süzgecine uyar: süzgeçli kuyruğun başlığı süzgeçsiz sayı yazsaydı kalabalıkta yalan söylerdi. */
  countHandledByAi(source?: ConversationSource): Promise<number> {
    return this.count({ handledBy: ['ai', 'hybrid'], source });
  }

  /** Mod süzgeci yok: sohbet `human`a çevrilse de taslak satırda durur; modla süzülse sayıdan düşer ama ekranda kalırdı. */
  countPendingDrafts(source?: ConversationSource): Promise<number> {
    return this.count({ source }, { isNotNullFields: ['ai_draft_reply'] });
  }

  /**
   * Talep kuyruğu pencereyi buradan öğrenir: `ticket_queue` o kolonu seçmez ve soru sayfa başına tek `in(...)` okumasıyla
   * cevaplanır. Yalnız damga döner: pencerenin hâlini çağıran motordan hesaplar.
   */
  async windowsByIds(ids: readonly string[]): Promise<Map<string, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.getAll({ id: unique });
    return new Map(rows.map((row) => [row.id, row.windowExpiresAt ?? null]));
  }
}

/** Defterdir, yazılır ve güncellenmez: güncelleme tipi `never`, "mesajı düzelt" derlemede durur. */
export class MessageService extends BaseDbService<Message, MessageInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'message', MessageSchema, MessageInsertSchema, MessageSchema as never, false);
  }

  /**
   * Türetilmiş alan olduğu için defterin tek yazılabilir alanı. Yalnız boşsa yazar: çözüm yeniden koşabilir ve operatörle ajan
   * aynı metni görmeli.
   */
  setTranscript(id: string, transcript: string): Promise<Message | null> {
    return this.updateIfNull(id, 'mediaTranscript', { mediaTranscript: transcript });
  }

  /** Yalnız boşsa yazar: gelişteki çeviri ile kuyruk aynı satıra denk gelebilir; `null` = yarış kaybedildi, hata değil. */
  setTranslation(
    id: string,
    patch: { language: SourceLanguage | null; translations: TranslationBag | null; translatedAt: string },
  ): Promise<Message | null> {
    return this.updateIfNull(id, 'translatedAt', patch);
  }

  /** Mesaj ve konuşma damgaları tek turda: ikinci yazım düşerse gelen kutusu sessizce bayatlardı. `windowExpiresAt` verilmezse pencereye dokunulmaz. */
  async record(input: {
    conversationId: string;
    direction: MessageDirection;
    body: MessageBody;
    /** Verilmezse RPC yönden türetir. */
    author?: TicketSender | null;
    kind?: MessageKind;
    templateName?: string | null;
    templateCategory?: TemplateCategory | null;
    providerMessageId?: string | null;
    windowExpiresAt?: string | null;
    /** İndirme düşse de satır yazılır: defterin ilk kuralı mesajın kaybolmamasıdır. */
    mediaKey?: string | null;
    mediaMime?: string | null;
    mediaTranscript?: string | null;
    /** Giden mesajda gönderilen metinle tek turda yazılır; gelende `setTranslation` sonradan doldurur. */
    language?: SourceLanguage | null;
    translations?: TranslationBag | null;
    translatedAt?: string | null;
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
      p_author: input.author ?? null,
      p_media_key: input.mediaKey ?? null,
      p_media_mime: input.mediaMime ?? null,
      p_media_transcript: input.mediaTranscript ?? null,
      p_language: input.language ?? null,
      p_translations: input.translations ?? null,
      p_translated_at: input.translatedAt ?? null,
    });
    return MessageSchema.parse(dbToApp(raw));
  }

  listByConversation(conversationId: string): Promise<Message[]> {
    return this.getAll({ conversationId }, { orderBy: 'createdAt' });
  }

  /**
   * Çözümü gelmemiş ses kuyruğa girmez: kuyruk metinsiz satırı damgalar ve transkript saniyeler sonra geldiğinde satır kapanmış
   * olurdu. Süzgeç DB'de: çağıranda süzülse çözümsüz sesler `limit`i doldurup kuyruğu tıkardı.
   */
  listUntranslated(limit = 20): Promise<Message[]> {
    return this.getAll(
      {},
      {
        isNullFields: ['translatedAt'],
        orFilters: ['media_mime.is.null,media_mime.not.like.audio/*,media_transcript.not.is.null'],
        orderBy: 'createdAt',
        limit,
      },
    );
  }

  /** Eskiden yeniye: sohbeti baştan okuyan yollar için (yapay zekâ bağlamı, dışa aktarma); ekranın kapısı `listRecent`. */
  listPage(conversationId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<Message>> {
    return this.getPage({ conversationId }, { orderBy: 'createdAt', limit, keysetAfter: cursor });
  }

  /** Yeniden eskiye: sohbet penceresi en yenisiyle açılır. İki yön tek metotta birleşmez: unutulan `direction` sessizce yanlış uca düşerdi. */
  listRecent(conversationId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<Message>> {
    return this.getPage(
      { conversationId },
      { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor },
    );
  }
}

/** Mesaj servisinden ayrı: not pencereye, "cevap bekliyor" hesabına ve çeviri kuyruğuna girmez. */
export class ConversationNoteService extends BaseDbService<ConversationNote, ConversationNoteInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'conversation_note', ConversationNoteSchema, ConversationNoteInsertSchema, ConversationNoteSchema as never, false);
  }

  listByConversation(conversationId: string): Promise<ConversationNote[]> {
    return this.getAll({ conversationId }, { orderBy: 'createdAt' });
  }
}

/** Görünüm yazılmaz: aynı sınıfta dursaydı yazma metotları açılırdı. */
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
   * Son gelen mesaja göre: kendi cevabımız sohbeti tepeye taşısaydı bekleyen müşteri aşağıda kalırdı. Eksen `inboxAt`: boş son
   * gelen mesaj azalan sırada başa düşer ve imleç kurulamaz.
   */
  list(
    filter: { awaitingReply?: boolean; source?: ConversationSource; handledBy?: TicketHandler } = {},
    cursor?: KeysetCursor,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<Page<ConversationInboxRow>> {
    return this.getPage(
      // "Ajanın kendi yürüttükleri" ile "insan bekleyenler" ayrı sorulardır: biri denetim, öteki iş.
      { awaitingReply: filter.awaitingReply, source: filter.source, handledBy: filter.handledBy },
      { orderBy: 'inboxAt', orderDirection: 'desc', limit, keysetAfter: cursor },
    );
  }

  /** Sayım, sayfa uzunluğu değil: "ilk sayfada 3 bekliyor" ile "3 bekliyor" aynı cümle değil. */
  countAwaitingReply(source?: ConversationSource): Promise<number> {
    return this.count({ awaitingReply: true, source });
  }
}

/** Gruplama görünümde (`0041`); sohbet başına kuyruk (`ConversationInboxService`) native uygulama için yerinde durur. */
export class CustomerInboxService extends BaseDbService<CustomerInboxRow, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'customer_inbox', CustomerInboxRowSchema, CustomerInboxRowSchema as never, CustomerInboxRowSchema as never, false);
  }

  /** Süzgeçler kişiye uygulanır: satır yine kişinin bütün kanallarını taşır. */
  list(
    filter: { awaitingReply?: boolean; source?: ConversationSource } = {},
    cursor?: KeysetCursor,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<Page<CustomerInboxRow>> {
    return this.getPage(
      { awaitingAny: filter.awaitingReply },
      { orderBy: 'inboxAt', orderDirection: 'desc', limit, keysetAfter: cursor, containsFilters: channelFilter(filter.source) },
    );
  }

  /** Kişi sayısı, kuyrukla aynı süzgeç. */
  countAwaitingReply(source?: ConversationSource): Promise<number> {
    return this.count({ awaitingAny: true }, { containsFilters: channelFilter(source) });
  }

  /** Süzgeç kişi anahtarında ve toplamanın altına iner: tek kişiyi okumak bütün kutuyu hesaplatmaz. */
  rowOf(personKey: string): Promise<CustomerInboxRow | null> {
    return this.getOneBy({ personKey });
  }
}

function channelFilter(source?: ConversationSource): { field: string; values: readonly unknown[] }[] | undefined {
  return source ? [{ field: 'sources', values: [source] }] : undefined;
}
