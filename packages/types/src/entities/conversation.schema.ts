import { z } from 'zod';
import { ConversationSourceEnum, MessageDirectionEnum, MessageKindEnum } from '../primitives/enums.schema';

// Conversation / Message — WhatsApp konuşma zemini (15.1, migration 0039). CHANNELS §7.
//
// Konuşma durumu BİZİM veritabanımızda yaşar: AI ajanının bağlamı, servis penceresi ve opt-in
// kararı bizde olmalı; sağlayıcı (360dialog) değişse de geçmiş bizde kalır.
//
// Adım 1'de satırları admin ELLE doğurur, adım 2'de aynı satırları webhook yazar. Veri modeli
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
   * Sağlayıcıdaki kişi/thread anahtarı. WhatsApp'ta **E.164 normalize telefon** — `wa_id` numarayı
   * `+` olmadan verir, biz `+33…` tutarız. Normalize etmeyen bir yazım aynı kişiye ikinci bir
   * konuşma açar ve geçmiş ikiye bölünür.
   */
  externalRef: z.string(),
  /** Ticari mesaj izni (DOMAIN §11) — Faz 2 broadcast'inin dayanağı; bugün yalnız kaydedilir. */
  optIn: z.boolean(),
  /** İzin bir KANITTIR: ne zaman verildiği yazılmadan "izin var" demek GDPR'da bir şey ifade etmez. */
  optInAt: z.string().nullable(),
  /**
   * 24 saatlik servis penceresinin bitişi — hangi mesajın ücretsiz, hangisinin template olduğu
   * buradan okunur (15.11). Kararı motor verir (`serviceWindowExpiry`), tablo yalnız saklar.
   */
  windowExpiresAt: z.string().nullable(),
  /** Son hareketin anı; gelen kutusunun sıralama alanı. `recordMessage` yazar. */
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * Konuşma açılışı. `source` varsayılanlı, `optIn`/pencere/damgalar YOK: hepsi ya varsayılandır ya
 * da bir olayın sonucudur — açan tarafın onları seçebilmesi, izni ve pencereyi kapının dışından
 * uydurmak olurdu.
 */
export const ConversationInsertSchema = z.object({
  source: ConversationSourceEnum.default('whatsapp'),
  externalRef: z.string().min(1),
  customerId: z.string().uuid().nullish(),
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
  kind: MessageKindEnum,
  body: MessageBodySchema,
  /** Meta-onaylı şablonun adı — yalnız `template` mesajında dolu (DB kısıtı da bunu zorlar). */
  templateName: z.string().nullable(),
  /** 360dialog/Cloud API mesaj kimliği. Adım 1'de boş (elle kayıt), adım 2'de dolar. */
  providerMessageId: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessageInsertSchema = z.object({
  conversationId: z.string().uuid(),
  direction: MessageDirectionEnum,
  kind: MessageKindEnum.default('text'),
  body: MessageBodySchema,
  templateName: z.string().nullish(),
  providerMessageId: z.string().nullish(),
});
export type MessageInsert = z.infer<typeof MessageInsertSchema>;
