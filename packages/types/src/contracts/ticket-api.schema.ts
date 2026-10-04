import { z } from 'zod';
import { TicketMessageSchema, TicketSchema } from '../entities/ticket.schema';
import { TicketTypeEnum } from '../primitives/enums.schema';
import { SourceLanguageSchema } from '../primitives/user-text.schema';

/**
 * `/api/v1/me/tickets` sözleşmesi: üreten uç ile tüketen ekran aynı şemayı çağırır ki alan adı değişince iki taraf derlemede kırılsın.
 * Yalnız müşterinin gördüğü alanlar var; operasyonun iç bilgisi ve jetondan çözülen kimlik yok, uç `parse` ettiği için zarfa da sızmaz.
 */

/**
 * Listenin tek satırı. `lastMessageAt` taşınır, çünkü liste son mesaja göre sıralıdır ve ölçütü göstermeyen liste rastgele görünür;
 * `subject`i müşteri yazmaz, personelin açtığı talepte dolar.
 */
export const MeTicketSummarySchema = TicketSchema.pick({
  id: true,
  type: true,
  status: true,
  subject: true,
  createdAt: true,
}).extend({
  lastMessageAt: z.string(),
  /** Bağlı siparişin müşteri numarası (`LA-26-…`); siparişsiz talepte `null` ("Genel"). */
  orderReference: z.string().nullable(),
});
export type MeTicketSummary = z.infer<typeof MeTicketSummarySchema>;

/**
 * Sayfa zarfı: talep sayısı veriyle sınırsız büyüdüğü için keyset; `nextCursor` opak bir dizedir ve `null` listenin bittiğini söyler.
 * `total` yok, çünkü ekranda sayaç yok ve süzgeç eklendiği gün sessizce yanlış bir sayı kalırdı.
 */
export const MeTicketPageSchema = z.object({
  tickets: z.array(MeTicketSummarySchema),
  nextCursor: z.string().nullable(),
});
export type MeTicketPage = z.infer<typeof MeTicketPageSchema>;

/**
 * Yazışmadaki tek mesaj. `sender` yerine `fromCustomer` taşınır, çünkü `ai` göndericisi de işletmedir ve bu eşleme iki ekranda ayrı
 * yazılmamalı; metin okuyucunun dilinde gelir ve `originalBody` korunur, çünkü makine çevirisi bir şikâyeti yumuşatabilir.
 */
export const MeTicketMessageSchema = TicketMessageSchema.pick({
  id: true,
  createdAt: true,
}).extend({
  /** Müşterinin kendi mesajı mı — baloncuğun hizasını ve rengini bu belirler. */
  fromCustomer: z.boolean(),
  /** Okuyucunun dilinde gösterilecek metin; o dile çeviri yoksa orijinalin kendisi. */
  body: z.string(),
  /** Gösterilen metin makine çevirisi mi — ekran bunu işaretlemeli. */
  translated: z.boolean(),
  /** ORİJİNALİN dili; `null` = tespit henüz koşmadı. */
  language: SourceLanguageSchema.nullable(),
  originalBody: z.string(),
  /** Eklerin süreli imzalı okuma adresleri, anahtar değil; ad "fotoğraf", çünkü motor yalnız görsel geçirir ve ekran resim çizer. */
  photos: z.array(z.string()),
});
export type MeTicketMessage = z.infer<typeof MeTicketMessageSchema>;

/**
 * İadenin sonucu siparişin para hareketlerinden türer. İki alan ayrı, çünkü "tetiklendi ama ödenmedi" gerçek bir ara hâldir ve ekran
 * bandı yalnız `refundedCents > 0` iken çizer.
 */
export const MeTicketReturnSchema = z.object({
  triggeredAt: z.string(),
  refundedCents: z.number().int(),
});

/**
 * Talep detayı, sayfanın tamamı tek turda. İşaretli kalemler yok, çünkü hiçbir müşteri ekranı onları çizmiyor ve taşımak detay başına
 * üç ek sorgu demekti.
 */
export const MeTicketDetailSchema = MeTicketSummarySchema.extend({
  /**
   * Yazışmanın tamamı eskiden yeniye ve sayfasız, çünkü bir konuşma baştan okunur. Talep ilk mesajıyla tek turda yazıldığı için boş
   * olamaz.
   */
  messages: z.array(MeTicketMessageSchema).min(1),
  returnOutcome: MeTicketReturnSchema.nullable(),
});
export type MeTicketDetail = z.infer<typeof MeTicketDetailSchema>;

/**
 * Yeni talep gövdesi. Sipariş numarayla adreslenir, çünkü mobil sözleşme sipariş kimliğini taşımaz; `subject` ve `source` yok, çünkü
 * müşteri başlık değil anlatım yazar ve geliş yolu istemcinin beyanı değil ucun bilgisidir.
 */
export const TicketOpenSchema = z.object({
  type: TicketTypeEnum,
  /** Müşterinin anlatımı — talebin ilk mesajı. Boş olamaz: anlatımsız talep, çözülemeyen taleptir. */
  body: z.string().min(1),
  orderReference: z.string().min(1).nullish(),
  orderItemIds: z.array(z.string().uuid()).optional(),
  /** Fotoğraf ekleri, yükleme kapısının verdiği anahtarlar; açılış yalnız müşterinin kendi taslak klasöründen geleni kabul eder. */
  attachments: z.array(z.string().min(1)).optional(),
});

/** Açılışın cevabı yalnız yeni talebin kimliğidir; ekran yazışmayı onunla açar. */
export const TicketCreatedSchema = z.object({ id: z.string().uuid() });

/**
 * Açılışın adlı retleri; cümleyi ekran kurar. `order_unavailable` "yok", "senin değil" ve "kalem o siparişte değil"i birlikte taşır,
 * çünkü ayrımı söylemek başkasının sipariş numarasını deneme yanılmayla doğrulatırdı.
 */
export const TicketOpenErrorEnum = z.enum(['empty_body', 'order_unavailable', 'items_without_order', 'attachment_not_yours']);
export type TicketOpenError = z.infer<typeof TicketOpenErrorEnum>;

/**
 * Talep fotoğrafının imzalı yükleme adresi: `POST /me/tickets/uploads` açılış taslağına, `POST /me/tickets/:id/uploads` yazışmaya.
 * `alreadyRequested` istemciden gelir, çünkü sayı henüz gönderilmemiş bir mesaja ait; güvenlik sınırı ekin sahipliği kontrolüdür.
 */
export const TicketUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  alreadyRequested: z.number().int().min(0).default(0),
});

/** Yükleme adresi: dosya `uploadUrl`e `contentType` başlığıyla `PUT` edilir; `Authorization` istemez, çünkü imza yetkinin kendisidir. */
export const TicketUploadSchema = z.object({
  key: z.string().min(1),
  uploadUrl: z.string().url(),
  contentType: z.string().min(1),
});
export type TicketUpload = z.infer<typeof TicketUploadSchema>;

/** Yükleme adresinin adlı retleri — dosya türü · tavan · depo yapılandırılmamış (503) · talep yok ya da başkasının (404). */
export const TicketUploadErrorEnum = z.enum(['unsupported_type', 'too_many', 'storage_unavailable', 'ticket_not_found']);
export type TicketUploadError = z.infer<typeof TicketUploadErrorEnum>;

/**
 * `POST /api/v1/me/tickets/:id/messages` gövdesi — yazışmaya cevap. "Yeniden aç" alanı yok, çünkü kapanmış talebe yazmak onu
 * kendiliğinden açar; ekler yalnız o talebin klasöründen gelir (`POST /me/tickets/:id/uploads`).
 */
export const TicketReplySchema = z.object({
  body: z.string().min(1),
  attachments: z.array(z.string().min(1)).optional(),
});

/** Cevabın adlı retleri. `ticket_not_found` = "yok" ile "senin değil" — ikisi aynı cevabı verir. */
export const TicketReplyErrorEnum = z.enum(['empty_body', 'ticket_not_found', 'attachment_not_yours']);
export type TicketReplyError = z.infer<typeof TicketReplyErrorEnum>;
