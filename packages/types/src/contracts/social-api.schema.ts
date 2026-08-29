import { z } from 'zod';
import { ConversationInboxRowSchema, MessageSchema } from '../entities/conversation.schema';
import { ConversationHandlerEnum, TicketHandlerEnum } from '../primitives/enums.schema';

/**
 * Sosyal gelen kutusu SÖZLEŞME şemaları (15.15 · mobil ayağı 21.08) — mobil `/api/v1/social/*`
 * uçlarının ve onları tüketen operasyon "Sosyal Mesajlar" ekranının ORTAK dili.
 *
 * Gerekçe `warehouse-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak"): şema uçta
 * yaşarken istemci ya kendi tipini elle yazar (ikinci sözleşme) ya da hiç doğrulamaz.
 *
 * ── ALANLAR VARLIK ŞEMASINDAN `pick` İLE TÜRER, ELLE YAZILMAZ ────────────────
 * Kaynak `entities/conversation.schema.ts` (`ConversationInboxRowSchema` · `MessageSchema`) —
 * `MeSchema`nın aynı kararı: pick bir SÜZGEÇTİR, pick'te olmayan alan (optIn kanıtı,
 * `providerAccountRef` işletme hesabı, taslağın üretim damgası) zarfa sızamaz. Ekran HAM alan alır
 * (`windowExpiresAt`, `lastMessageKind`), hesaplanmış etiket almaz: pencere cümlesi ve kanal rozeti
 * SUNUM kararıdır ve iki yüzey kendi sözlüğünden kurar — web `social-labels`tan, mobil
 * `messages.json`dan.
 *
 * ── MESAJLAR YENİDEN ESKİYE ─────────────────────────────────────────────────
 * Detayın kapısı `MessageService.listRecent` (yön hatası ölçülmüş: `listPage` artan sıralıdır ve
 * ilk sayfası iki ay önceki "merhaba" olurdu). Sıra ters çevirme EKRANIN işi — sohbet penceresi
 * en yeniyi altta gösterir, imleç "daha eski"ye gider.
 */

/**
 * Kuyruk satırı — gelen kutusu görünümünün mobil yüzü. `customerName ?? profileName ?? externalRef`
 * başlık zinciri EKRANDA kurulur (web `titleOf` ile aynı karar): üçü de ham gelir, çünkü hangisinin
 * gösterileceği bir sunum sorusudur ve kimliksiz sohbette (`customerId: null` — Messenger/IG'nin
 * varsayılan hâli) boşluk uydurulmaz, görünür kalır.
 */
export const SocialConversationRowSchema = ConversationInboxRowSchema.pick({
  id: true,
  source: true,
  externalRef: true,
  customerId: true,
  customerName: true,
  profileName: true,
  handledBy: true,
  /** Hibrit modun bekleyen taslağı satırda durur (varlık kararı) — ekran "taslak hazır" rozetini ve metni buradan okur. */
  aiDraftReply: true,
  windowExpiresAt: true,
  lastMessageAt: true,
  messageCount: true,
  awaitingReply: true,
  lastMessageText: true,
  lastMessageDirection: true,
  lastMessageKind: true,
});
export type SocialConversationRowContract = z.infer<typeof SocialConversationRowSchema>;

/**
 * `GET /social/conversations` yanıtı — sayfa + başlık sayaçları TEK turda.
 *
 * `counts` her sayfada gelir ve bu bilinçli: sayaçlar SAYIMDIR, sayfa uzunluğu değil (servis
 * künyesi — süzgeçli kuyruğun başlığı süzgeçsiz sayı yazamaz) ve ayrı bir uç, aynı ekran açılışına
 * ikinci bir tur ekleyip iki değeri farklı anlardan okuturdu. Devam sayfasında ekran onları yok
 * sayar — bayat sayacı taze listeyle karıştırmamak istemcinin sunum kararı.
 */
export const SocialInboxResponseSchema = z.object({
  rows: z.array(SocialConversationRowSchema),
  /** Keyset imleci — telde OPAK dize; istemci yorumlamaz, aynen geri verir. `null` = liste bitti. */
  nextCursor: z.string().nullable(),
  counts: z.object({
    awaitingReply: z.number().int(),
    handledByAi: z.number().int(),
  }),
});
export type SocialInboxResponse = z.infer<typeof SocialInboxResponseSchema>;

/** Sohbet baloncuğunun satırı. `author` ayrımı ekranın tonu (AI ayrı görünür — varlık künyesi). */
export const SocialMessageSchema = MessageSchema.pick({
  id: true,
  direction: true,
  author: true,
  kind: true,
  body: true,
  /** Dolu = Meta-onaylı kalıp mesaj (yalnız WhatsApp) — ekran bunu rozetle söyler. */
  templateName: true,
  createdAt: true,
});
export type SocialMessageContract = z.infer<typeof SocialMessageSchema>;

/**
 * `GET /social/conversations/:id` yanıtı — künye + mesajların İLK sayfası (yeniden eskiye).
 *
 * `conversation` kuyruk satırıyla AYNI şekil: detayın başlığı, pencere durumu, mod ve taslak
 * listedekiyle aynı alanlardan kurulur — iki şekil ayrışsaydı listede "top bizde" görünen sohbet
 * detayda başka bir hâl gösterebilirdi.
 */
export const SocialConversationDetailSchema = z.object({
  conversation: SocialConversationRowSchema,
  messages: z.array(SocialMessageSchema),
  /** Daha ESKİ mesajların imleci — sohbet penceresinin "geçmişi yükle" kapısı. */
  nextCursor: z.string().nullable(),
});
export type SocialConversationDetail = z.infer<typeof SocialConversationDetailSchema>;

/**
 * Cevap gövdesi — yalnız metin. `templateName` YOK ve olamaz (web `recordOutboundAction`ın aynı
 * kararı): defter evresinde operatör serbest metin yazıyor; onaylı şablon gönderimi API işidir
 * (15.11) ve alanı şimdiden açmak, hiç gönderilmemiş bir şablonun ücretini deftere yazdırırdı.
 */
export const SocialReplyRequestSchema = z.object({
  text: z.string().trim().min(1),
});
export type SocialReplyRequest = z.infer<typeof SocialReplyRequestSchema>;

/**
 * Yürütücü modu isteği — `ConversationHandlerEnum`den TÜRER, elle sayılmaz.
 *
 * Enum bir tur boyunca `ai`yi dışlıyordu ve istek onu kapıda reddediyordu: arkasında hiçbir şey
 * koşmayan bir modu yazmak, mobil ekrana da "AI yürütüyor" dedirtirdi. Kısıt **29.08'de kalktı**
 * (motor + cron taraması + gönderim kanalı, üçü de ölçüldü) ve bu şema tek satır bile değişmeden
 * genişledi — türetmenin karşılığı tam olarak bu. Kural yine SUNUCUDA duruyor, tek istemcinin
 * nezaketine bırakılmıyor; değişen yalnız kuralın ne dediği.
 */
export const SocialModeRequestSchema = z.object({
  mode: ConversationHandlerEnum,
});
export type SocialModeRequest = z.infer<typeof SocialModeRequestSchema>;

/**
 * Yanıt GENİŞ kalır (`TicketHandlerEnum`) ve asimetri bilinçli: kolon hâlâ `ai` taşıyabilir (16.08
 * ile 22.08 arasında o modu seçmiş satırlar), okuma yolu onları gösterebilmeli. Daralan yalnız
 * yazma.
 */
export const SocialModeResponseSchema = z.object({
  mode: TicketHandlerEnum,
});
export type SocialModeResponse = z.infer<typeof SocialModeResponseSchema>;

/**
 * Taslak tüketiminin yanıtı — metin SUNUCUDAN döner, istemcideki kopya kullanılmaz (web
 * `consumeConversationDraftAction`ın aynı yarış kararı): başka operatör az önce tüketmiş ya da
 * taslak yenilenmiş olabilir; ekrandaki metin bayat olabilir, dönen metin gerçektir.
 */
export const SocialDraftConsumeResponseSchema = z.object({
  draft: z.string(),
});
export type SocialDraftConsumeResponse = z.infer<typeof SocialDraftConsumeResponseSchema>;

/** Taslak üretiminin yanıtı — metin DÖNMEZ: taslak satıra yazılır, ekran detayı yeniden okur (web ile aynı akış). */
export const SocialDraftResponseSchema = z.object({
  generated: z.literal(true),
});
export type SocialDraftResponse = z.infer<typeof SocialDraftResponseSchema>;
