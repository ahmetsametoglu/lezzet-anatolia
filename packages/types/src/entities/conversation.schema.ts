import { z } from 'zod';
import {
  ConversationLinkProofEnum,
  ConversationSourceEnum,
  CountryEnum,
  MessageDirectionEnum,
  MessageKindEnum,
  PreferredLanguageEnum,
  TemplateCategoryEnum,
  TicketHandlerEnum,
  TicketSenderEnum,
} from '../primitives/enums.schema';
import { SourceLanguageSchema, TranslationBagSchema } from '../primitives/user-text.schema';
import { PostalCodeSchema } from '../primitives/postal-code.schema';

// Konuşma durumu bizde yaşar: yapay zekânın bağlamı, servis penceresi ve izin kararı sağlayıcı değişse de bizde kalmalı. Üç
// Meta kanalı aynı modele düşer, kanal `source` ekseninde ayrışır.

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  /** Nullable kalmalı: webhook mesajı önce yazar, kimliği sonra çözer; kimlik çözülemediği için mesaj kaybolmamalı. */
  customerId: z.string().uuid().nullable(),
  source: ConversationSourceEnum,
  /**
   * WhatsApp'ta E.164 telefon (`wa_id` `+`sız gelir), Messenger'da PSID, Instagram'da IGSID. Normalize edilmemiş telefon aynı
   * kişiye ikinci konuşma açar; PSID/IGSID opak dizedir.
   */
  externalRef: z.string(),
  /**
   * Cevabın hangi işletme hesabından gideceği buradan okunur. Tekillik `(source, external_ref)`: ikinci işletme hesabı açılınca
   * üçlüye genişletilir, PSID sayfa kapsamlıdır.
   */
  providerAccountRef: z.string().nullable(),
  /** Görünen ad, kimlik değil; kimliksiz Messenger/Instagram sohbetinin başlığı buradan okunur. */
  profileName: z.string().nullable(),
  /** `ticket.handledBy` ile aynı sözleşme: `hybrid` taslak yazar ve operatör onaylamadan gitmez, `ai` özerktir. */
  handledBy: TicketHandlerEnum,
  /** Hibrit modun bekleyen taslağı; mesaj değil, satırda durur. */
  aiDraftReply: z.string().nullable(),
  /** Taslakla birlikte dolar ve boşalır (DB kısıtı). */
  aiDraftGeneratedAt: z.string().nullable(),
  optIn: z.boolean(),
  /** İzin geri alınsa da silinmez: ispat yükü bizde ve "o gün izni vardı" sonradan da cevaplanabilmeli. */
  optInAt: z.string().nullable(),
  /**
   * Boş: hiç sorulmadı; dolu ve `optIn=false`: reddetti. Ayrı kolon, çünkü ret yoksa varsayılanla aynı iz bırakır ve ajan
   * reddeden müşteriye tekrar sorardı.
   */
  optInAskedAt: z.string().nullable(),
  /** Kararı motor verir (`serviceWindowExpiry`), tablo yalnız saklar. */
  windowExpiresAt: z.string().nullable(),
  /**
   * Üçü de boş = bağı sistem kurdu (WhatsApp'ta numaradan). `linkedBy` ayrı boşalabilir (personel silinirse): kimin bağladığı
   * kaybolabilir, neye dayanarak bağladığı hayır.
   */
  linkedBy: z.string().uuid().nullable(),
  linkedAt: z.string().nullable(),
  /** Kanıtın değeri değil türü saklanır: kayda kimlik yazılır, içerik yazılmaz. */
  linkProof: ConversationLinkProofEnum.nullable(),
  /**
   * Biz ona hangi dilde yazarız, müşteri hangi dilde yazdı değil; küme konuştuğumuz üç dildir. Gelen mesajdan öğrenilir ve son
   * gelen kazanır; `null` = müşteri henüz bu üç dilden birinde yazmadı.
   */
  language: PreferredLanguageEnum.nullable(),
  /** Sohbette bir kez söylenir; ajanın araçları sepete yer bilinmeden yazmaz (`cart/chat-place.ts`). */
  postalCode: PostalCodeSchema.nullable(),
  /** Kod iki hizmet ülkesinde geçerliyse müşteriye sorulur; `null` iken depo seçilmez. */
  postalCountry: CountryEnum.nullable(),
  lastMessageAt: z.string().nullable(),
  /** Giden mesaj dokunmaz: kendi cevabımız sohbeti tepeye taşısaydı bekleyen müşteri aşağıda kalırdı. `null` = müşteri hiç yazmadı. */
  lastInboundAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * `source` varsayılansız: sessiz bir 'whatsapp' varsayılanı, kaynağı unutan çağıranın Messenger mesajını WhatsApp konuşmasına
 * dikerdi. İzin, pencere ve damgalar yok: hepsi bir olayın sonucudur.
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
 * `text` her türde okunur: önizleme ve yapay zekâ bağlamı onu okur. `payload` açık bırakıldı: kart ve medya yapısı sağlayıcıya
 * bağlı, görmediğimiz yapıyı kapalı sözlükle uydurmak sessizce yanlış olurdu.
 */
export const MessageBodySchema = z.object({
  text: z.string().nullable(),
  payload: z.record(z.unknown()).nullish(),
});
export type MessageBody = z.infer<typeof MessageBodySchema>;

/** Defterdir, yazılır ve güncellenmez: gönderilmiş mesaj değişmez. */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  direction: MessageDirectionEnum,
  /** Yön "hangi tarafa aktı", bu alan "bunu kim söyledi": bizim adımıza yapay zekâ da personel de yazar. Yönle çelişemez (DB kısıtı). */
  author: TicketSenderEnum,
  kind: MessageKindEnum,
  body: MessageBodySchema,
  /** Yalnız `template` mesajında dolu (DB kısıtı). */
  templateName: z.string().nullable(),
  /** Ücret sınıfı adla birlikte doğar: yazılırken atlanan boyut geriye dönük doldurulamaz, Meta kategoriyi sonradan değiştirebilir. */
  templateCategory: TemplateCategoryEnum.nullable(),
  providerMessageId: z.string().nullable(),
  /**
   * Kendi private R2 anahtarımız: Meta'nın adresi dakikalarda ölür, medya ~30 günde silinir. Medya mesajında bile `null`
   * olabilir: indirme düşse de satır yazılır.
   */
  mediaKey: z.string().nullable(),
  /** `kind` bütün medyaya `media` der. */
  mediaMime: z.string().nullable(),
  /**
   * Makine çözümü, müşterinin alt yazısı (`body.text`) değil: aynı alanda operatör insan cümlesini ayırt edemez, ajan makine
   * çıktısını müşterinin kesin sözü sanardı.
   */
  mediaTranscript: z.string().nullable(),
  /**
   * Kanaldan geçen metnin dili: gelen mesajda müşterinin yazdığı, giden mesajda müşteriye gönderilen; operatörün Türkçesi torbada
   * (`translations.tr`). Sesli mesajda transkriptin dilidir; `null` = tespit koşmadı ya da metin yok.
   */
  language: SourceLanguageSchema.nullable(),
  /** Kaynak dil torbada yoktur (`TranslationBagSchema`). */
  translations: TranslationBagSchema.nullable(),
  /** Başarısızlıkta da dolar: kuyruk bakılmış satırı bir daha almaz. */
  translatedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessageInsertSchema = z.object({
  conversationId: z.string().uuid(),
  direction: MessageDirectionEnum,
  /** Verilmezse `record_message` yönden türetir. */
  author: TicketSenderEnum.nullish(),
  kind: MessageKindEnum.default('text'),
  body: MessageBodySchema,
  templateName: z.string().nullish(),
  templateCategory: TemplateCategoryEnum.nullish(),
  providerMessageId: z.string().nullish(),
  /** İndirme düştüyse boş kalır ve satır yine yazılır. */
  mediaKey: z.string().nullish(),
  mediaMime: z.string().nullish(),
  mediaTranscript: z.string().nullish(),
  /** Giden mesaj gönderimden önce çevrilir ve metinle tek turda yazılır; gelen mesajda çeviri yazımdan sonra koşar. */
  language: SourceLanguageSchema.nullish(),
  translations: TranslationBagSchema.nullish(),
  translatedAt: z.string().nullish(),
});
export type MessageInsert = z.infer<typeof MessageInsertSchema>;

/**
 * Mesaj değil ayrı defter: `message`ı okuyan her yüzey (pencere, "cevap bekliyor", çeviri kuyruğu) notu gönderilmiş mesaj
 * sayardı. Yazılır, güncellenmez.
 */
export const ConversationNoteSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  /** Müşteri iç not yazamaz (DB kısıtı): müşterinin sözü mesajdır. */
  author: TicketSenderEnum,
  body: z.string().min(1),
  createdAt: z.string(),
});
export type ConversationNote = z.infer<typeof ConversationNoteSchema>;

export const ConversationNoteInsertSchema = z.object({
  conversationId: z.string().uuid(),
  author: TicketSenderEnum.exclude(['customer']),
  body: z.string().trim().min(1),
});
export type ConversationNoteInsert = z.infer<typeof ConversationNoteInsertSchema>;

/** `awaitingReply` durumdan çıkarılamaz, son mesajın yönünden türer: son sözü müşteri söylediyse top bizdedir. */
export const ConversationInboxRowSchema = ConversationSchema.extend({
  /** Kimliksiz konuşmada `null`: eksik değil, webhook önce yazar sonra çözer. */
  customerName: z.string().nullable(),
  messageCount: z.number().int(),
  awaitingReply: z.boolean(),
  /** Tam metin: önizleme kırpması sunum kararıdır. */
  lastMessageText: z.string().nullable(),
  lastMessageDirection: MessageDirectionEnum.nullable(),
  lastMessageKind: MessageKindEnum.nullable(),
  /** Detay çevrilip kuyruk çevrilmezse operatör sohbeti ancak açarak tarayabilir. */
  lastMessageLanguage: SourceLanguageSchema.nullable(),
  lastMessageTranslations: TranslationBagSchema.nullable(),
  lastMessageTranscript: z.string().nullable(),
  /** Sıralama ekseni; müşteri hiç yazmadıysa `-infinity` — boş değer azalan sırada başa düşer ve imleç kurulamaz. */
  inboxAt: z.string(),
});
export type ConversationInboxRow = z.infer<typeof ConversationInboxRowSchema>;

export const CustomerInboxThreadSchema = ConversationInboxRowSchema.pick({ id: true, source: true, messageCount: true, awaitingReply: true });
export type CustomerInboxThread = z.infer<typeof CustomerInboxThreadSchema>;

/** Satırın yüzü kişinin en son yazdığı sohbettir; kişiye ait alanlar ayrı adlı (`awaitingReply` baş sohbetin, `awaitingAny` kişinin). */
export const CustomerInboxRowSchema = ConversationInboxRowSchema.extend({
  /** Müşteri kaydının kimliği; kimliksiz sohbette sohbetin kendi kimliği. */
  personKey: z.string().uuid(),
  /** En son yazılan önce; ilki baş sohbettir. */
  threads: z.array(CustomerInboxThreadSchema),
  /** Yalnız mesajı olan kanallar. */
  sources: z.array(ConversationSourceEnum),
  awaitingAny: z.boolean(),
});
export type CustomerInboxRow = z.infer<typeof CustomerInboxRowSchema>;
