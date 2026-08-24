import { z } from 'zod';
import {
  ConversationSourceEnum,
  LinkProofKindEnum,
  MessageDirectionEnum,
  MessageKindEnum,
  TemplateCategoryEnum,
  TicketHandlerEnum,
  TicketSenderEnum,
} from '../primitives/enums.schema';

// Conversation / Message — mesajlaşma konuşma zemini (15.1, migration 0039; üç kanal 21.08,
// ADR-006). CHANNELS §7.
//
// Konuşma durumu BİZİM veritabanımızda yaşar: AI ajanının bağlamı, servis penceresi ve opt-in
// kararı bizde olmalı; sağlayıcı değişse de geçmiş bizde kalır. Üç Meta kanalı (WhatsApp ·
// Messenger · Instagram DM) aynı modele düşer — kanal `source` ekseninde ayrışır, tablo bölünmez.
//
// Adım 1'de satırları admin ELLE doğurur (yalnız WhatsApp — Messenger/IG kimliği operatörce
// bilinemez, o satırları webhook yazacak), adım 2'de aynı satırları webhook yazar. Veri modeli
// değişmez — değişen tek şey satırı yazan yüzeydir.

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  /**
   * Telefonla çözülür (DOMAIN §10). **Nullable ve öyle kalmalı:** adım 2'de webhook mesajı önce
   * yazar, kimliği sonra çözer — kimlik çözülemediği için mesajın kaybolduğu bir yol olamaz.
   */
  customerId: z.string().uuid().nullable(),
  source: ConversationSourceEnum,
  /**
   * Sağlayıcıdaki kişi/thread anahtarı — kaynağa göre uzayı değişir: WhatsApp'ta **E.164 normalize
   * telefon** (`wa_id` numarayı `+` olmadan verir, biz `+33…` tutarız), Messenger'da **PSID**,
   * Instagram'da **IGSID**. Normalize etmeyen bir telefon yazımı aynı kişiye ikinci bir konuşma
   * açar ve geçmiş ikiye bölünür; PSID/IGSID opak dizedir, normalize edilmez.
   */
  externalRef: z.string(),
  /**
   * Konuşmanın aktığı İŞLETME hesabı (21.08): WhatsApp'ta `phone_number_id`, Messenger'da sayfa
   * kimliği, Instagram'da IG hesap kimliği. Zeminde (elle işleme) boş — webhook yazmaya başladığında
   * dolar; cevabın hangi hesaptan gönderileceği buradan okunur. Tekillik bugün `(source,
   * external_ref)` — ikinci bir işletme hesabı açıldığı gün üçlüye genişletilir (PSID sayfa-kapsamlı;
   * bugün genişletmek, elle işlenen geçmişi webhook geçmişinden bölerdi).
   */
  providerAccountRef: z.string().nullable(),
  /**
   * Sağlayıcı profil adı (21.08): WhatsApp push name, Messenger ad-soyad, Instagram kullanıcı adı.
   * GÖRÜNEN addır, kimlik değil — kullanıcı istediği an değiştirir. Messenger/IG'de kimlik otomatik
   * çözülemediği için (PSID/IGSID telefon taşımaz) kimliksiz sohbetin başlığı buradan okunur;
   * WhatsApp'ta okunaklı telefon zaten vardı.
   */
  profileName: z.string().nullable(),
  /**
   * Sohbeti kim yürütüyor (15.13/16.5 · kullanıcı kararı 16.08) — `ticket.handledBy` ile aynı
   * enum ve aynı sözleşme: `hybrid` = AI taslak yazar, operatör onaylamadan gitmez; `ai` = özerk.
   */
  handledBy: TicketHandlerEnum,
  /** Hibrit modun bekleyen AI taslağı — satırda durur, mesaj değil (`ticket.aiDraftReply` künyesi). */
  aiDraftReply: z.string().nullable(),
  /** Taslağın üretim anı — önbellek anahtarı; taslakla birlikte dolar/boşalır (DB kısıtı). */
  aiDraftGeneratedAt: z.string().nullable(),
  /** Ticari mesaj izni (DOMAIN §11) — Faz 2 broadcast'inin dayanağı; bugün yalnız kaydedilir. */
  optIn: z.boolean(),
  /** İzin bir KANITTIR: ne zaman verildiği yazılmadan "izin var" demek GDPR'da bir şey ifade etmez. */
  optInAt: z.string().nullable(),
  /**
   * 24 saatlik servis penceresinin bitişi — hangi mesajın ücretsiz, hangisinin template olduğu
   * buradan okunur (15.11). Kararı motor verir (`serviceWindowExpiry`), tablo yalnız saklar.
   */
  windowExpiresAt: z.string().nullable(),
  /**
   * **Bağın künyesi** (15.19) — kimliği KİM kurdu, NE ZAMAN, HANGİ KANITLA.
   *
   * **Üçü de boş = bağı SİSTEM kurdu:** WhatsApp'ta kimlik numaradan çözülür, ortada operatör
   * kararı yoktur. Boşluk burada "bilgi eksik" değil, okunur bir cevaptır.
   *
   * `linkedBy` ötekilerden ayrı boşalabilir (FK `set null` — personel kaydı silinirse): kimin
   * bağladığı kaybolabilir, neye dayanarak bağladığı hayır.
   */
  linkedBy: z.string().uuid().nullable(),
  linkedAt: z.string().nullable(),
  /** Kanıtın TÜRÜ — değeri saklanmaz (`CLAUDE §1`: kimlik yazılır, içerik yazılmaz). */
  linkProof: LinkProofKindEnum.nullable(),
  /** Son hareketin anı; gelen kutusunun sıralama alanı. `recordMessage` yazar. */
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * Konuşma açılışı. `source` ZORUNLU ve varsayılansız (21.08): üç kanal dünyasında sessiz bir
 * 'whatsapp' varsayılanı, kaynağı geçmeyi unutan tek çağıranın Messenger mesajını WhatsApp
 * konuşmasına dikmesi demekti — derleyicinin yakalayabildiği bir hata çalışma zamanına bırakılmaz.
 * `optIn`/pencere/damgalar YOK: hepsi bir olayın sonucudur — açan tarafın onları seçebilmesi,
 * izni ve pencereyi kapının dışından uydurmak olurdu.
 */
export const ConversationInsertSchema = z.object({
  source: ConversationSourceEnum,
  externalRef: z.string().min(1),
  customerId: z.string().uuid().nullish(),
  providerAccountRef: z.string().nullish(),
  profileName: z.string().nullish(),
});
export type ConversationInsert = z.infer<typeof ConversationInsertSchema>;

export const ConversationUpdateSchema = ConversationSchema.partial().required({ id: true });
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>;

/**
 * Mesaj gövdesi. `text` her türde okunabilir (kartın başlığı da bir metindir) — gelen kutusu
 * önizlemesi ve AI bağlamı onu okur; tür başına ayrı bir okuma yolu, aynı soruyu dört kez
 * cevaplamak olurdu.
 *
 * `payload` ADIM 1'DE AÇIK bırakıldı ve bu bilinçli bir eksikliktir: kart/interaktif/medya
 * yapısının şekli sağlayıcıya bağlı ve 15.9'da netleşecek. Bugün kapalı bir sözlük yazmak, henüz
 * görmediğimiz bir yapıyı uydurmak olurdu — ve uydurulan sözlük, gerçeği gördüğümüz gün sessizce
 * yanlış olurdu.
 */
export const MessageBodySchema = z.object({
  text: z.string().nullable(),
  payload: z.record(z.unknown()).nullish(),
});
export type MessageBody = z.infer<typeof MessageBodySchema>;

/**
 * Konuşmanın mesajı. **Defterdir — yazılır, güncellenmez** (`TicketMessage` ile aynı gerekçe):
 * gönderilmiş mesaj değişmez, o yüzden servisin güncelleme tipi `never`.
 */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  direction: MessageDirectionEnum,
  /**
   * Kim yazdı (16.08) — yön "hangi tarafa aktı" der, bu alan "bunu kim söyledi". Bizim adımıza AI
   * da personel de yazar ve müşteri farkı görmez; ayrım iç izlenebilirliktir ve ekranda AI
   * baloncuğunu ayrı tonda gösterir. Yönle çelişemez (DB kısıtı): gelen daima `customer`.
   */
  author: TicketSenderEnum,
  kind: MessageKindEnum,
  body: MessageBodySchema,
  /** Meta-onaylı şablonun adı — yalnız `template` mesajında dolu (DB kısıtı da bunu zorlar). */
  templateName: z.string().nullable(),
  /**
   * Şablonun kategorisi = **ücret sınıfı**; adla birlikte doğar, ondan ayrı düşemez (DB kısıtı).
   *
   * Defterle birlikte geliyor, sonradan eklenmiyor: yazılırken atlanan bir boyut geriye dönük
   * doldurulamaz — kategorisiz yazılan mesajlar için "geçen ay ne ödedik" hiçbir zaman
   * cevaplanamazdı. Şablon adına bakıp türetmek de olmaz: kategori Meta tarafında sonradan
   * değişebilir ve o gün geçmiş faturamız bugünün sınıflandırmasıyla yeniden yazılırdı.
   */
  templateCategory: TemplateCategoryEnum.nullable(),
  /** 360dialog/Cloud API mesaj kimliği. Adım 1'de boş (elle kayıt), adım 2'de dolar. */
  providerMessageId: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessageInsertSchema = z.object({
  conversationId: z.string().uuid(),
  direction: MessageDirectionEnum,
  /** Verilmezse `record_message` yönden türetir (gelen → customer, giden → admin); AI kendisi 'ai' der. */
  author: TicketSenderEnum.nullish(),
  kind: MessageKindEnum.default('text'),
  body: MessageBodySchema,
  templateName: z.string().nullish(),
  templateCategory: TemplateCategoryEnum.nullish(),
  providerMessageId: z.string().nullish(),
});
export type MessageInsert = z.infer<typeof MessageInsertSchema>;

/**
 * `conversation_inbox` görünümü (15.5) — gelen kutusunun okuduğu satır.
 *
 * Ekran bu satırı okur, ikinci bir sorgu atmaz: müşteri adı, son mesajın metni/yönü/türü ve mesaj
 * sayısı burada türetilmiş hâlde gelir. Kopya DEĞİL — görünüm her okumada kaynaktan üretir.
 *
 * **`awaitingReply` durumdan ÇIKARILAMAZ:** konuşmanın "durumu" yok. Kuyruğun tek amacı cevap
 * bekleyeni bekletmemek ve o soru son mesajın YÖNÜNDEN türer — son sözü müşteri söylediyse top
 * bizdedir.
 */
export const ConversationInboxRowSchema = ConversationSchema.extend({
  /** Kimliksiz konuşmada `null` — eksik değil, tasarımın bir hâli (webhook önce yazar, sonra çözer). */
  customerName: z.string().nullable(),
  messageCount: z.number().int(),
  awaitingReply: z.boolean(),
  /** Son mesajın TAM metni; önizleme kırpması bir sunum kararıdır, veri kapısına ait değil. */
  lastMessageText: z.string().nullable(),
  lastMessageDirection: MessageDirectionEnum.nullable(),
  lastMessageKind: MessageKindEnum.nullable(),
});
export type ConversationInboxRow = z.infer<typeof ConversationInboxRowSchema>;
