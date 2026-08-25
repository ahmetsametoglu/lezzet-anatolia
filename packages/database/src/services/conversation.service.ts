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
  type TicketHandler,
  type TicketSender,
  type KeysetCursor,
  type LinkProofKind,
  type Page,
  DEFAULT_PAGE_SIZE,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Konuşma servisleri (15.1) — **karar vermez, satır getirir/yazar** (STACK §4).
 *
 * Kimliğin telefondan çözülmesi burada DEĞİL, uygulama katmanında (`lib/messaging/conversation.ts`):
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
   * BİRLEŞTİRME kararıdır ve insana aittir (DOMAIN §10). `profileName` ise tersine YENİSİYLE
   * güncellenir — görünen ad kimlik değil, son görülen değer tutulur.
   *
   * `source` ZORUNLU ve varsayılansız (21.08): üç kanal dünyasında sessiz bir 'whatsapp'
   * varsayılanı, kaynağı unutan tek çağıranın Messenger mesajını WhatsApp konuşmasına dikmesiydi.
   *
   * Bu yüzden `insert` bu serviste kapalı — tek yazma yolu RPC.
   */
  async open(input: {
    source: ConversationSource;
    externalRef: string;
    customerId?: string | null;
    /** Konuşmanın aktığı işletme hesabı (phone_number_id / sayfa id / IG hesap id) — webhook yazar. */
    providerAccountRef?: string | null;
    /** Sağlayıcı profil adı — kimliksiz sohbetin başlığı; son görülen değer kazanır. */
    profileName?: string | null;
  }): Promise<Conversation> {
    const raw = await this.executeRpc('open_conversation', {
      p_source: input.source,
      p_external_ref: input.externalRef,
      p_customer_id: input.customerId ?? null,
      p_provider_account_ref: input.providerAccountRef ?? null,
      p_profile_name: input.profileName ?? null,
    });
    return ConversationSchema.parse(dbToApp(raw));
  }

  /**
   * Sağlayıcı anahtarıyla tek konuşma — gelen mesajın hangi sohbete ait olduğu sorusu.
   *
   * `source` ile birlikte aranır ve ZORUNLUDUR, çünkü tekillik o ikilide: aynı dize başka bir
   * kaynakta başka birini gösterebilir (varsayılan 21.08'de kaldırıldı — `open` ile aynı gerekçe).
   */
  async findByExternalRef(source: ConversationSource, externalRef: string): Promise<Conversation | null> {
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
   * **Kimliksiz sohbeti müşteriye bağla** (15.16) — YALNIZ boşsa yazar, dolu bağı EZMEZ.
   *
   * Messenger/Instagram'da bu kapı istisna değil KURALDIR: PSID/IGSID telefon taşımaz, yani o
   * kanallarda konuşma daima kimliksiz doğar (`open_conversation` künyesi) ve kimliğin tek yolu
   * operatörün "bu sohbet şu müşteri" demesidir. WhatsApp'ta ise ancak telefon/e-posta çakışması
   * yaşandığında gerekir — orada kimlik zaten numaradan çözülür.
   *
   * Ezmeme güvencesi `open_conversation`ın `coalesce` kuralıyla AYNI cümledir ve aynı sebeple:
   * bağlanmış bir konuşmayı başka müşteriye kaydırmak bir BİRLEŞTİRME kararıdır ve insana aittir
   * (DOMAIN §10) — yanlış hesaba bağlanmış bir sohbet, bağlanmamış bir sohbetten pahalıdır.
   * Yarışı DB çözer (`updateIfNull` künyesi): kaybeden `null` alır, sessiz bir ezme olmaz.
   *
   * **Ayırma (unlink) kapısı BİLEREK YOK.** Yanlış bağı düzeltmek bir birleştirme/ayırma işidir ve
   * Müşteriler ekranının işidir (09.10); buraya ikinci bir yol açmak, aynı kararı iki yerde
   * yaşatmak olurdu.
   */
  linkCustomer(
    id: string,
    input: { customerId: string; linkedBy: string | null; proof: LinkProofKind },
  ): Promise<Conversation | null> {
    /* Bağ ve KÜNYESİ tek yazımda gider (15.19): ayrı iki çağrı olsaydı ikincisi düştüğünde
       elimizde "kim bağladı, neye dayanarak" sorusu cevapsız bir bağ kalırdı — ve tam da o satır
       denetlenmek istenen satır olurdu. Kanıtın DEĞERİ değil TÜRÜ yazılır (kolonun künyesi).
       Damgayı burada koyuyoruz, DB varsayılanıyla değil: kolon `null` kalabilmeli (sistemin
       çözdüğü WhatsApp bağı), yani `default now()` yanlış olurdu. */
    return this.updateIfNull(id, 'customerId', {
      customerId: input.customerId,
      linkedBy: input.linkedBy,
      linkedAt: new Date().toISOString(),
      linkProof: input.proof,
    });
  }

  /**
   * **Sağlayıcı profil adını doldur** (15.7 · 22.08) — `linkCustomer` ile aynı kural: YALNIZ boşsa yazar.
   *
   * İhtiyaç canlı Messenger turunda ölçüldü: Meta'nın `messages` webhook'u **ad taşımıyor**, yalnız
   * `sender.id` (PSID) veriyor — WhatsApp'ta `profile.name` geliyor, Messenger/IG'de gelmiyor. Ad
   * doldurulmazsa gelen kutusunda başlık ham PSID olur (`38324983613781600`) ve operatöre hiçbir şey
   * söylemez; adı ayrı bir Graph çağrısı getiriyor (`lib/messaging/meta-profile.ts`).
   *
   * **Neden `updateIfNull`:** ad bir kez öğrenilir ve OPERATÖRÜN düzelttiği bir alan olabilir; her
   * mesajda yeniden yazmak hem gereksiz bir tur hem de elle düzeltmeyi sessizce ezmek olurdu. Ayrıca
   * yarış güvencesi bedava gelir — iki mesaj aynı anda düşerse ikincisi `null` alır, ezme olmaz.
   */
  setProfileName(id: string, profileName: string): Promise<Conversation | null> {
    return this.updateIfNull(id, 'profileName', { profileName });
  }

  /**
   * Ticari mesaj izni (DOMAIN §11) — **müşterinin CEVABI** yazılır, üç hâl birden korunur.
   *
   * İzin ve ANI birlikte yazılır: ikisi ayrı çağrıya bırakılsaydı biri unutulur ve elimizde
   * tarihsiz bir "izin var" kaydı kalırdı; GDPR'da ne zaman verildiği yazılmayan izin, izin
   * değildir. DB kısıtı da bunu zorluyor — burası kısıtın okunur yüzü.
   *
   * ── RET DE BİR CEVAPTIR VE İZ BIRAKIR (15.12, düzeltildi 25.08) ─────────────
   * Eskiden ret `optIn=false, optInAt=null` yazıyordu — kolonların VARSAYILANIYLA birebir aynı.
   * Yani "Müşteri reddetti" düğmesi hiçbir şey kaydetmiyordu ve kimliksiz sohbette (Messenger/IG'nin
   * olağan hâli) ret tamamen kayboluyordu. Artık `optInAskedAt` her cevapta damgalanıyor.
   *
   * ── İZİN DAMGASI ÜZERİNE YAZILMAZ ───────────────────────────────────────────
   * Ret geldiğinde `optInAt`e DOKUNULMUYOR. Silmek ya da üzerine yazmak, 1. gün verilip 30. gün
   * geri alınan bir izinde *"o gün izni vardı"* kanıtını yok ederdi — oysa ispat yükü bizde.
   * `optIn` bugünkü hâli, `optInAt` ise bir kez yaşanmış olayı söyler.
   */
  setOptIn(id: string, granted: boolean): Promise<Conversation> {
    const now = new Date().toISOString();
    return this.update({ id, optIn: granted, optInAskedAt: now, ...(granted ? { optInAt: now } : {}) });
  }

  /**
   * **Soruldu ama henüz cevap YOK** (15.12) — ajanın izin sorusunu gönderdiği an.
   *
   * Cevabı beklerken `optIn` false kalır (bu doğru: izin yok). Ayrı bir kapı, çünkü `setOptIn`
   * bir CEVABI kaydediyor; soruyu da ona yükleseydik "granted=false" ile "cevap gelmedi" aynı
   * çağrıya girer ve çağıran hangisini kastettiğini söyleyemezdi.
   *
   * Koşullu yazım (`updateIfNull`) bilinçli: iki tur arka arkaya koşarsa ya da operatör aynı anda
   * kaydederse, İLK soru anı korunur — sonraki turun damgası öncekini ileri itmemeli, yoksa
   * "ne zaman sorduk" sorusu her turda tazelenir ve ajan hiç susmaz.
   */
  markOptInAsked(id: string): Promise<Conversation | null> {
    return this.updateIfNull(id, 'optInAskedAt', { optInAskedAt: new Date().toISOString() });
  }

  /**
   * Yürütücü modunu değiştir (kullanıcı kararı 16.08) — `TicketService.setMode` ile aynı sözleşme:
   * hibritten düşerken bekleyen taslak birlikte düşer, yoksa bir sonraki dönüşte bayat bir cevap
   * "hazır" diye sunulurdu.
   */
  setMode(id: string, mode: TicketHandler): Promise<Conversation> {
    return mode === 'hybrid'
      ? this.update({ id, handledBy: mode })
      : this.update({ id, handledBy: mode, aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /** Bekleyen AI taslağını tüket (16.08) — `TicketService.clearDraft` ile aynı sözleşme. */
  clearDraft(id: string): Promise<Conversation> {
    return this.update({ id, aiDraftReply: null, aiDraftGeneratedAt: null });
  }

  /**
   * Cevabı insanın yazmadığı sohbet sayısı (16.5) — başlığın "N AI'da" sayacı.
   * `TicketService.countHandledByAi` ile aynı soru; konuşmanın "kapanmış" hâli olmadığı için
   * ek durum süzgeci yok. Kanal süzgeci var (21.08): başlık süzgeçli kuyruğu sayarken süzgeçsiz
   * sayı yazsaydı, tam da kalabalıkta yalan söylerdi.
   */
  countHandledByAi(source?: ConversationSource): Promise<number> {
    return this.count({ handledBy: ['ai', 'hybrid'], source });
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
    /** Kim yazdı (16.08). Verilmezse RPC yönden türetir: gelen → customer, giden → admin. */
    author?: TicketSender | null;
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
      p_author: input.author ?? null,
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
   * **Sayfalı geçmiş — ESKİDEN YENİYE** (15.5). Konuşmayı BAŞTAN okuyan yolların kapısı: AI bağlamı,
   * dışa aktarma, denetim. Sohbet bir anlatıdır ve baştan okunur.
   *
   * `listByConversation` (tamamı) da duruyor: küçük konuşmada sayfalamanın maliyeti yok.
   *
   * ⚠ **EKRANIN kapısı bu DEĞİL** — `listRecent`. Artan sırada `keysetAfter` "bundan sonrakiler",
   * yani ileri gitmek daha YENİYE gider; sohbet penceresi ise tersini ister.
   */
  listPage(conversationId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<Message>> {
    return this.getPage({ conversationId }, { orderBy: 'createdAt', limit, keysetAfter: cursor });
  }

  /**
   * **Sohbet penceresinin kapısı — YENİDEN ESKİYE** (operasyon talebi 08.08).
   *
   * ── NEDEN İKİNCİ BİR OKUMA, VE NEDEN İLKİ YETMEDİ ───────────────────────────
   * `listPage` artan sıralı ve ilk sayfası sohbetin EN ESKİ mesajlarıdır. Adım 1'de bu görünmüyordu
   * (elle işlenmiş bir avuç mesaj), ama canlı kanalda iki ay süren bir sohbet operatöre iki ay
   * önceki *"merhaba"*dan açılırdı — cevaplanacak mesaj imlecin en sonunda, birkaç "daha fazla"
   * tıklaması ötede kalırdı. Operasyon şeridi ekranı yazarken `listPage`'i **tüketemedi** ve sebebi
   * buydu.
   *
   * **Kusur benim cevabımda da yazılıydı ve iki taraf da göremedi:** `listPage` künyesine
   * *"'daha eski' düğmesi imleci ileri taşır"* demişim — artan sırada imleci ileri taşımak daha
   * eskiye değil daha YENİYE gider. Cümle kendi içinde çelişkiliydi; talebin ifadesini devralırken
   * yönü hiç sınamamışım.
   *
   * ── İKİSİ DE MEŞRU, ADLARI YÖNLERİNİ SÖYLESİN ───────────────────────────────
   * `listPage` silinmedi: yanlış değil, farklı bir soruyu cevaplıyor. İkisini tek metotta bir
   * `direction` parametresiyle birleştirmek de yapılmadı — çağıran o parametreyi unuttuğunda
   * sessizce YANLIŞ uca düşerdi, ve bu hata tam olarak bir kez zaten yaşandı.
   *
   * **Sıra ters çevirme EKRANIN işi** (talebin kendi cümlesi): sıralama kararı burada, sunum orada.
   */
  listRecent(conversationId: string, cursor?: KeysetCursor, limit = DEFAULT_PAGE_SIZE): Promise<Page<Message>> {
    return this.getPage(
      { conversationId },
      { orderBy: 'createdAt', orderDirection: 'desc', limit, keysetAfter: cursor },
    );
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
   * açılış tarihine değil son mesaja bakar. Kanal süzgeci (21.08): sosyal gelen kutusu üç kanalı
   * tek kuyrukta gösterir, operatör istediğinde tek kanala daraltır.
   *
   * Sayfalı, çünkü konuşma kümesi veriyle SINIRSIZ büyür (`CLAUDE §1`) — canlı kanalda aylarca.
   * İmleci ekran tüketiyor ("daha eski" düğmesi), yani sessiz kırpma yok.
   */
  list(
    filter: { awaitingReply?: boolean; source?: ConversationSource } = {},
    cursor?: KeysetCursor,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<Page<ConversationInboxRow>> {
    return this.getPage(
      { awaitingReply: filter.awaitingReply, source: filter.source },
      { orderBy: 'lastMessageAt', orderDirection: 'desc', limit, keysetAfter: cursor },
    );
  }

  /**
   * "3 cevap bekliyor" başlığının sayısı — SAYIM, sayfa uzunluğu değil.
   *
   * Yüklenmiş sayfadan saymak, tam da sayının anlam kazandığı yerde (kalabalık kuyrukta) yalan
   * söylerdi: "ilk sayfada 3 bekliyor" ile "3 bekliyor" aynı cümle değil. Kanal süzgeciyle sayılır
   * (21.08) — süzgeçli kuyruğun başlığı süzgeçsiz sayı yazamaz.
   */
  countAwaitingReply(source?: ConversationSource): Promise<number> {
    return this.count({ awaitingReply: true, source });
  }
}
