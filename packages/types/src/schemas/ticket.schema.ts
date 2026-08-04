import { z } from 'zod';
import { TicketHandlerEnum, TicketSenderEnum, TicketSourceEnum, TicketStatusEnum, TicketTypeEnum } from './enums.schema';
import { SourceLanguageSchema, TranslationBagSchema } from './user-text.schema';

// Ticket / TicketMessage — müşteri talebi ve şikâyeti (16.1, migration 0035). DOMAIN §15.
//
// Basit yaşam döngüsü: `open → in_progress → resolved`, yeniden açılabilir. Karmaşık ticket
// mekaniği yok — atama, öncelik matrisi, SLA sayacı yok.
//
// **İki şey burada YAZMAZ:**
//   • İade sonucu — talep iadeyi tetikler, sonuçlandırmaz. Tutar siparişin hareketlerinden türer;
//     burada yalnız tetiğin anı durur (`returnTriggeredAt`).
//   • Kuyruk sırası — "son mesaj: bugün" `ticket_queue` görünümünde türetilir (`TicketQueueRow`).

export const TicketSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  /** Siparişsiz talep geçerlidir (genel soru) — o zaman kalem ve iade bağlamı yoktur. */
  orderId: z.string().uuid().nullable(),
  /** Müşterinin işaretlediği kalemler; şikâyetin somut zemini. Siparişsiz talepte boş. */
  orderItemIds: z.array(z.string().uuid()),
  /** WhatsApp'tan açıldıysa konuşma bağı (15.x). */
  conversationId: z.string().uuid().nullable(),
  source: TicketSourceEnum,
  type: TicketTypeEnum,
  status: TicketStatusEnum,
  handledBy: TicketHandlerEnum,
  subject: z.string().nullable(),
  /** Admin bu talepten iade akışını başlattı; tutar BURADAN okunmaz, siparişten türetilir. */
  returnTriggeredAt: z.string().nullable(),
  createdAt: z.string(),
  /** `resolved` damgası — yeniden açılınca null'a döner. */
  resolvedAt: z.string().nullable(),
});
export type Ticket = z.infer<typeof TicketSchema>;

/**
 * Talep açılışı. `status`/`handledBy` YOK: yeni talep daima `open` ve `human`'dır — açan tarafın
 * bunları seçebilmesi, durum makinesini kapının dışından atlatmak olurdu.
 *
 * `subject` opsiyonel ve bilerek öyle: müşteri başlık yazmaz, ilk mesajını yazar. Başlığı yüzey
 * türetir (tip + ürün adı) ya da personel koyar.
 */
export const TicketInsertSchema = z.object({
  customerId: z.string().uuid(),
  orderId: z.string().uuid().nullish(),
  orderItemIds: z.array(z.string().uuid()).optional(),
  conversationId: z.string().uuid().nullish(),
  source: TicketSourceEnum,
  type: TicketTypeEnum,
  subject: z.string().nullish(),
});
export type TicketInsert = z.infer<typeof TicketInsertSchema>;

export const TicketUpdateSchema = TicketSchema.partial().required({ id: true });
export type TicketUpdate = z.infer<typeof TicketUpdateSchema>;

/**
 * Yazışma. Talebin ilk açıklaması da BİR MESAJDIR — ayrı bir `description` alanı olsaydı
 * "müşterinin anlatımı" ile "müşterinin ilk cevabı" iki yerde durur, ekran ikisini birleştirirdi.
 */
export const TicketMessageSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  sender: TicketSenderEnum,
  /** Yazan personel — yalnız `admin` mesajında dolu; müşteri talebin sahibi, AI'ın kimliği yok. */
  authorId: z.string().uuid().nullable(),
  body: z.string(),
  /**
   * Mesajın GERÇEK dili — `null` = tespit henüz koşmadı. Yalnız çeviri işi yazar (20.2).
   *
   * Yazışma İKİ YÖNLÜ çevrilir: müşteri kendi dilinde yazar personel Türkçe okur, personel Türkçe
   * yazar müşteri kendi dilinde okur.
   */
  language: SourceLanguageSchema.nullable(),
  /** Makine çevirileri; kaynak dil torbada yoktur (orijinal `body`'de durur). */
  translations: TranslationBagSchema.nullable(),
  /** Çeviri işi bu satıra baktı mı — başarısızlıkta da dolar. */
  translatedAt: z.string().nullable(),
  /** R2 anahtarları (`r2Keys.ticketAttachment`) — bozuk ürün fotoğrafı. İsteğe bağlı. */
  attachments: z.array(z.string()),
  createdAt: z.string(),
});
export type TicketMessage = z.infer<typeof TicketMessageSchema>;

export const TicketMessageInsertSchema = z.object({
  ticketId: z.string().uuid(),
  sender: TicketSenderEnum,
  authorId: z.string().uuid().nullish(),
  body: z.string().min(1),
  attachments: z.array(z.string()).optional(),
});
export type TicketMessageInsert = z.infer<typeof TicketMessageInsertSchema>;

/**
 * Mesajın güncellenebilir TEK yanı: çeviri (20.2).
 *
 * Servisin `TUpdate`'i eskiden `never`'dı — "gönderilmiş mesaj değişmez" değişmezi tipe yazılıydı ve
 * doğruydu. Çeviri o değişmezi bozmuyor: `body`'ye dokunmuyor, yanına bir okuma kolaylığı koyuyor.
 * Bu yüzden şema GENİŞLETİLMEDİ, DAR bir güncelleme şeması eklendi — `body`/`sender` alanları
 * burada yok, yani bir gün biri "mesajı düzelt" demek istese derleme durdurur.
 */
export const TicketMessageTranslationUpdateSchema = TicketMessageSchema.pick({
  id: true,
  language: true,
  translations: true,
  translatedAt: true,
})
  .partial()
  .required({ id: true });
export type TicketMessageTranslationUpdate = z.infer<typeof TicketMessageTranslationUpdateSchema>;

/**
 * `ticket_queue` görünümü — talep + türetilen kuyruk bilgisi. Ekran bu satırı okur, ikinci bir
 * sorgu atmaz.
 *
 * `awaiting_reply` durumdan ÇIKARILAMAZ: `in_progress` bir talepte müşteri yeni bir şey yazmış da
 * olabilir yazmamış da. Kuyruğun tek amacı cevap bekleyeni bekletmemek olduğu için bu ayrı bir
 * gerçektir — ve son mesajın göndericisinden türer.
 */
export const TicketQueueRowSchema = TicketSchema.extend({
  lastMessageAt: z.string(),
  messageCount: z.number().int(),
  /** Son sözü müşteri söyledi — top bizde. */
  awaitingReply: z.boolean(),
  hasAttachment: z.boolean(),
  returnTriggered: z.boolean(),
  /** Son mesajın TAM metni; kuyruk önizlemesini yüzey kırpar (kısaltma bir sunum kararıdır). */
  lastMessageBody: z.string().nullable(),
  /**
   * Son mesajın ÇEVİRİ bağlamı (20.2) — önizleme de okuyucunun dilinde gösterilebilsin diye.
   *
   * Detay çevrilip kuyruk çevrilmeseydi personel talebi ancak açarak triyaj edebilirdi; oysa
   * kuyruğun tek işi açmadan sıralamaktır.
   */
  lastMessageLanguage: SourceLanguageSchema.nullable(),
  lastMessageTranslations: TranslationBagSchema.nullable(),
  /**
   * AI bu talepte HİÇ konuştu mu (16.5). `handledBy`'dan ayrı bir soru: devralınan talepte
   * `handledBy` `human`'a döner ama AI'ın mesajı yerinde kalır — kalite denetimi o kümeye bakar.
   * Bir kez `true` olduktan sonra `false`'a dönmez, yani "şu an" değil "hiç" sorusudur.
   */
  answeredByAi: z.boolean(),
  /** Kuyruk satırında okunan iki bağlam — ayrı sorgu ATILMAZ, görünüm birlikte getirir. */
  customerName: z.string(),
  orderReferenceNo: z.string().nullable(),
});
export type TicketQueueRow = z.infer<typeof TicketQueueRowSchema>;

/**
 * **Ürün başına şikâyet yoğunluğu** (16.6 zemini · `product_complaint_signal` fonksiyonu).
 *
 * Geri Bildirim ekranının skor tablosunda, ürünün skorunun YANINDA okunur: "çok beğenilmiş ama
 * bozuk geliyor" ile "az beğenilmiş ama şikâyeti de yok" farklı iki durumdur ve tek başına skor
 * ikisini ayıramaz.
 *
 * Sayım **talep başına**, kalem başına değil: bir talep aynı üründen üç kalem taşıyabilir ve düz
 * sayım tek bir olayı üç şikâyet gösterirdi.
 */
export const ProductComplaintSignalSchema = z.object({
  productId: z.string().uuid(),
  /** `damaged` + `missing` toplamı. Soru/diğer SAYILMAZ — onlar kalite sinyali değil. */
  complaintCount: z.number().int(),
  damagedCount: z.number().int(),
  missingCount: z.number().int(),
  lastComplaintAt: z.string(),
});
export type ProductComplaintSignal = z.infer<typeof ProductComplaintSignalSchema>;
