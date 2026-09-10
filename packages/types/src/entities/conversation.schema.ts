import { z } from 'zod';
import {
  ConversationLinkProofEnum,
  ConversationSourceEnum,
  MessageDirectionEnum,
  MessageKindEnum,
  PreferredLanguageEnum,
  TemplateCategoryEnum,
  TicketHandlerEnum,
  TicketSenderEnum,
} from '../primitives/enums.schema';
import { SourceLanguageSchema, TranslationBagSchema } from '../primitives/user-text.schema';

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
  /**
   * İZNİN VERİLDİĞİ an. Bir kanıttır: ne zaman verildiği yazılmadan "izin var" demek GDPR'da bir
   * şey ifade etmez. **Bir kez yazılır ve izin geri alınsa bile SİLİNMEZ** — ispat yükü bizde
   * (md. 7/1) ve "o gün izni vardı" sorusu sonradan da cevaplanabilmeli.
   */
  optInAt: z.string().nullable(),
  /**
   * SORULDUĞU an — cevap ne olursa olsun (15.12). `optIn`/`optInAt` ile birlikte üç hâl kurar:
   * boş → hiç sorulmadı · dolu + `optIn=false` → soruldu, reddetti · `optInAt` dolu → izin verildi.
   *
   * Ayrı bir kolon, çünkü iki alan üç hâli taşıyamıyordu: ret `optIn=false, optInAt=null` yazıyor,
   * varsayılan da tam olarak buydu — yani ret hiçbir iz bırakmıyordu ve ajan reddeden müşteriye
   * tekrar tekrar sorabilirdi.
   */
  optInAskedAt: z.string().nullable(),
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
  /**
   * Kanıtın TÜRÜ — değeri saklanmaz (`CLAUDE §1`: kimlik yazılır, içerik yazılmaz). Operatörün üç
   * kanıtı + sistemin doğruladığı sepet bağlantısı (`cart_link`, 15.22) — ayrım enum künyesinde.
   */
  linkProof: ConversationLinkProofEnum.nullable(),
  /**
   * **Müşteriyle KONUŞTUĞUMUZ dil** (15.28) — giden mesajın çevrileceği hedef.
   *
   * `preferred_language` enum'u (tr|fr|de), `SourceLanguage` DEĞİL: bu alan "müşteri hangi dilde
   * yazdı"yı değil "biz ona hangi dilde yazarız"ı söyler ve o küme bizim konuştuğumuz üç dildir.
   * Boşnakça yazan müşteriye Boşnakça cevap üretemeyiz; onun satırı boş kalır ve hedef yedek
   * zincirden gelir (profil dili → piyasa varsayılanı, `outboundLanguage`).
   *
   * **Gelen mesajdan ÖĞRENİLİR, son gelen kazanır:** müşterinin yazdığı dil, profildeki tercihten
   * daha güçlü kanıttır — profili kayıtta operatör de doldurmuş olabilir. `null` = müşteri henüz
   * üç dilden birinde bir şey yazmadı (yalnız fotoğraf gönderdi, ya da "ok").
   */
  language: PreferredLanguageEnum.nullable(),
  /**
   * **Müşterinin SÖYLEDİĞİ posta kodu** (15.20 · kullanıcı kararı 10.09) — sohbette bir kez söylenir,
   * burada saklanır; ajanın araçları "bu adrese gider mi"yi buna göre okur ve sepete yer bilinmeden
   * yazmaz (`cart/chat-place.ts`). Yalnız gerçek, tek ülkeli kod yazılır — yazım hatası saklanmaz.
   */
  postalCode: z.string().regex(/^\d{5}$/).nullable(),
  /** Son hareketin anı — konuşmanın "ne zaman kımıldadı" damgası. `recordMessage` yazar. */
  lastMessageAt: z.string().nullable(),
  /**
   * **Kuyruğun sıralama alanı** (21.289) — son GELEN mesajın anı; giden mesaj dokunmaz.
   *
   * `lastMessageAt` bu iş için yanlış eksendi: kendi cevabımız da onu ilerletiyor, yani operatör
   * bir sohbete cevap yazdığı an o sohbet tepeye çıkıyordu — oysa artık yapılacak bir şey yok.
   * Bu alana göre sıralayınca "cevap bekleyenler" ayrı bir kurala gerek kalmadan üste çıkar:
   * bekleyen bir sohbet, tanımı gereği en son müşterinin yazdığı sohbettir.
   *
   * `null` = müşteri hiç yazmamış (konuşmayı biz açmışız) — o satır kuyruğun sonuna düşer.
   */
  lastInboundAt: z.string().nullable(),
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
  /**
   * Gelen medyanın PRIVATE R2 anahtarı (`r2Keys.conversationMedia`) — sağlayıcının medya kimliği
   * DEĞİL. Meta'nın adresi dakikalar içinde ölüyor, medyanın kendisi ~30 gün sonra siliniyor;
   * kanıt olacak bir fotoğrafın ömrü sağlayıcının saklama süresine bağlanamaz.
   *
   * **Medya mesajında bile `null` olabilir** ve bu bilinçli: indirme düşse de satır yazılır.
   * Defterin ilk kuralı mesajın kaybolmamasıdır (DB kısıtı da tam bu yönde tek taraflıdır).
   */
  mediaKey: z.string().nullable(),
  /** Ekran fotoğrafı mı sesi mi çizeceğini buradan bilir — `kind` hepsine `media` diyor. */
  mediaMime: z.string().nullable(),
  /**
   * Sesli mesajın MAKİNE tarafından çözülmüş metni (15.26) — `body.text` DEĞİL.
   *
   * Ayrım şart: `body.text` müşterinin kendi yazdığı alt yazıdır, bu ise duyulanın yazıya
   * geçirilmiş hâli. Aynı alana koymak ikisini ayırt edilemez kılardı — operatör hangi cümlenin
   * insandan geldiğini bilemez, ajan da makine çıktısını müşterinin kesin sözü sanardı. Ajanın
   * teyit kuralı (15.26) tam olarak bu ayrımın üstüne kurulu.
   */
  mediaTranscript: z.string().nullable(),
  /**
   * **Kanaldan geçen metnin dili** (15.28) — `ticket_message.language` ile aynı sözleşme, bir
   * farkla: burada "metin" gelen mesajda müşterinin yazdığı, giden mesajda müşteriye GÖNDERİLEN
   * cümledir. `body.text` daima kanaldan geçen hâldir; operatörün Türkçesi giden mesajda
   * torbada durur (`translations.tr`). Böylece telefondan/echo'dan düşen mesaj ile API'den
   * gönderilen mesaj aynı kuralı taşır — ledger "müşteri ne okudu" sorusuna hep aynı yerden
   * cevap verir.
   *
   * Sesli mesajda dil TRANSKRİPTİN dilidir (alt yazı yok); torba da transkripti çevirir.
   * Serbest ISO 639: müşteri Boşnakça da konuşabilir. `null` = tespit koşmadı ya da metin yok.
   */
  language: SourceLanguageSchema.nullable(),
  /**
   * Makine çevirileri — kaynak dil torbada YOKTUR (`TranslationBagSchema` künyesi). Operatör
   * `tr`yi okur (`resolveUserText`), giden mesajda `tr` operatörün/ajanın kendi yazdığıdır.
   */
  translations: TranslationBagSchema.nullable(),
  /** Çeviri baktı mı — başarısızlıkta da dolar (`ticket_message` kuralı); kuyruk bunu okur. */
  translatedAt: z.string().nullable(),
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
  /** İndirme başarılıysa dolu; düştüyse boş kalır ve satır yine yazılır. */
  mediaKey: z.string().nullish(),
  mediaMime: z.string().nullish(),
  /** Çözülemeyen ya da henüz çözülmemiş kayıtta boş kalır — yokluğu normal bir hâl. */
  mediaTranscript: z.string().nullish(),
  /**
   * Çeviri üçlüsü YAZIMDA da gelebilir (15.28): giden mesaj gönderimden ÖNCE çevrilir ve gönderilen
   * metinle birlikte tek turda yazılır. Gelen mesajda boş kalır, çeviri yazımdan sonra koşar.
   */
  language: SourceLanguageSchema.nullish(),
  translations: TranslationBagSchema.nullish(),
  translatedAt: z.string().nullish(),
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
  /**
   * Son mesajın çeviri üçlüsü + sesli mesajın çözümü (15.28) — `ticket_queue` ile aynı gerekçe:
   * detay çevrilip kuyruk çevrilmezse operatör sohbeti ancak AÇARAK tarayabilir. Görünüm son
   * mesajı zaten okuyor, alanlar bedavaya geliyor.
   */
  lastMessageLanguage: SourceLanguageSchema.nullable(),
  lastMessageTranslations: TranslationBagSchema.nullable(),
  /** Sesli mesajın önizlemesi transkripttir — "[görsel / dosya]" değil, müşterinin dediği. */
  lastMessageTranscript: z.string().nullable(),
});
export type ConversationInboxRow = z.infer<typeof ConversationInboxRowSchema>;
