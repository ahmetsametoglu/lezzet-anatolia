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
  /**
   * **CANLI ZİLİN KANAL ADI** (21.289) — ekran bunu dinler, mesaj gelince kuyruğu tazeler.
   *
   * ── NEDEN SUNUCUDAN GELİYOR, İSTEMCİ HESAPLAMIYOR ───────────────────────────
   * Talep ve bildirim kanallarının adı `@lezzet/types`ta hesaplanıyor, çünkü doğal bir sırdan
   * (UUID) türüyorlar. Operasyon KUYRUKLARININ böyle bir kimliği yok: `ops:conversations` gibi
   * açık bir ad, anon anahtarı olan herkese *"operasyona şu an mesaj düştü"* zaman bilgisini
   * sızdırırdı (`opsChannel` künyesi). Bu yüzden ad sunucu sırrından türetiliyor ve istemci onu
   * ancak SÖYLENEREK öğrenebilir.
   *
   * Söyleyen kapı `admin` guard'ının arkasında, yani adı öğrenen taraf kuyruğu görmeye zaten
   * yetkili olan taraf — web'in aynı kararı (sunucu bileşeni `LiveRefresh`e prop olarak geçiriyor).
   *
   * Yük DAİMA BOŞ (zilin kendi kuralı): adı ele geçiren biri "bir hareket oldu"dan fazlasını
   * öğrenemez, içeriği yine guard'lı uçtan istemek zorundadır.
   */
  channel: z.string().min(1),
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
  /** Fotoğraf mı ses mi çizileceği — `kind` ikisine de `media` diyor (varlık künyesi). */
  mediaMime: true,
  /**
   * Sesli mesajın MAKİNE çözümü (15.26) — `body.text` DEĞİL ve o alana katılmaz. Mobil için
   * kritik: ses ÇALINAMASA bile operatör ne söylendiğini buradan okur.
   */
  mediaTranscript: true,
  createdAt: true,
}).extend({
  /**
   * Medyanın İMZALI okuma adresi (15 dk) — R2 anahtarı DEĞİL, geçit yolu da değil (21.287).
   *
   * ── NEDEN WEB'İN GEÇİDİ DEĞİL ───────────────────────────────────────────────
   * Web `/operations/social/media/<id>` geçidine işaret ediyor ve gerekçesi ölçülmüş bir arıza:
   * sayfa SUNUCUDA çiziliyor, adres HTML'e gömülüyor, açık sekmede 15 dakikada ölüyordu. Mobilde
   * o arıza YOK — ekran her odaklanışta detayı yeniden okuyor (`useFocusEffect`), yani adres
   * kullanıldığı ana yakın imzalanıyor. Geçit kurmak, `Image` bileşenine Bearer başlığı taşıtmayı
   * ve o başlığın R2'ye yönlendirmede ne olacağını da çözmeyi gerektirirdi.
   *
   * Mobilin KENDİ İÇİNDE bu zaten kurulu bir karar: talep ekleri de sözleşmede imzalı geliyor
   * (`ticket/read.ts` → `privateReadUrls`) ve ızgara onları doğrudan çiziyor. İkinci bir desen
   * açmak, aynı soruyu iki yerde ayrı cevaplamak olurdu.
   *
   * `null` üç hâlde: medyası olmayan mesaj · indirmesi düşmüş medya mesajı (`mediaKey` boş —
   * varlık künyesi bunu meşru sayıyor) · R2 ayarlı değil (yerel geliştirme). Üçünde de ekran
   * fotoğrafsız çizer, çökmez.
   */
  mediaUrl: z.string().nullable(),

  /* ── ÇEVİRİ ÜÇLÜSÜ (21.297) — talep ekranının kurduğu desenin üçüncü yüzeyi ────────────────
     Sohbet mesajı 15.28'den beri İKİ YÖNLÜ çevriliyor ve kural şu: `body.text` DAİMA KANALDAN
     GEÇEN metindir. Yani Fransızca konuşulan bir sohbette giden mesajın gövdesi Fransızcadır ve
     operatörün yazdığı Türkçe torbadadır. Mobil bu üç alanı almadığı için telefonda operatör
     kendi yazdığını değil, müşteriye giden çeviriyi okuyordu.

     ADLAR TALEPTEKİNDEN FARKLI ve bilinçli: talepte gövde ZATEN çözülmüş gelir (`body` gösterilen,
     `originalBody` asıl). Burada `body` defterin alanıdır ve anlamı değiştirilemez — medya, şablon
     ve gönderim yolları hep onu okuyor. O yüzden çözülmüş metin AYRI bir alanda taşınıyor; ekran
     `shownText`i çizer, "orijinali gör" `body.text`i açar.

     Çözüm sunucuda ve motorla yapılır (`domain-core.resolveUserText`) — web'in sosyal ekranı da
     aynı motoru çağırıyor (`social-read.ts` → `shownTextOf`). Kural tek yerde: iki yüzey iki ayrı
     seçim yapamaz. */

  /**
   * Operasyon dilindeki metin (Türkçe). `null` = metinsiz mesaj (yalnız medya) ya da hiçbir dilde
   * metin bulunamadı — ekran o hâlde gövde çizmez, `body.text`e DÜŞMEZ (yanlış dilde bir metni
   * "Türkçe" diye göstermek, çevirinin varlığını yalanlardı).
   */
  shownText: z.string().nullable(),
  /**
   * `shownText` bir MAKİNE ÇEVİRİSİ mi. `false` ise "orijinali gör" düğmesi ÇİZİLMEZ — aynı metni
   * iki kez açan bir düğme, operatöre olmayan bir fark vaat ederdi (talep baloncuğunun kararı).
   */
  shownTranslated: z.boolean(),
  /** Mesajın KENDİ dili (kod, ör. `fr`) — etiket yüzeyde kurulur. `null` = dil ölçülemedi. */
  language: z.string().nullable(),
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
  /**
   * **BU SOHBETİN CANLI ZİLİ** (21.291) — ekran dinler, mesaj gelince yazışmayı tazeler.
   *
   * Kuyruğun kanalından AYRI ve bilerek: kuyruk zili "listede bir şey değişti" der ve onu dinleyen
   * bir sohbet ekranı, ilgisiz her hareket için kendini yeniden çizerdi. Bu ad konuşmanın
   * UUID'sinden türer (doğal sır) — ama yine SUNUCUDAN geliyor, çünkü adı üreten işlev zili çalan
   * tarafla ortak; istemcide ikinci kez yazmak bir gün sessizce çalmayan bir zil demekti.
   *
   * Yük boş (zilin kendi kuralı): duyan taraf mesajı kanaldan değil, guard'lı uçtan okur.
   */
  channel: z.string().min(1),
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
 * Cevabın AKIBETİ (21.286) — mobil artık deftere yazmıyor, GÖNDERİYOR.
 *
 * Üç hâl ve üçü ayrı, çünkü operatörün yapacağı şey üçünde farklı (`SendOutcome` künyesi):
 *   · `sent`    — gitti; ekran yazışmayı tazeler.
 *   · `refused` — BİZİM kuralımız reddetti (servis penceresi kapalı, yanlış kanal). Tekrar denemek
 *                 anlamsız; operatör başka bir yol seçmeli (kalıp mesaj, telefon).
 *   · `failed`  — SAĞLAYICI tarafı düştü. `retryable` ise aynı düğme yeniden basılabilir.
 *
 * Tek kovaya atmak çağıranı "yeniden dene" düğmesini yanlış yere koymaya iterdi: pencere kapalıyken
 * yeniden denemek aynı reddi üretir ve operatör bunu ancak deneyerek öğrenirdi.
 *
 * `detail` yalnız `sent`te dolu: gönderilmemiş bir cevaptan sonra yazışmayı tazelemek, ekrana
 * değişmemiş bir listeyi ikinci kez çizdirmekten başka bir şey yapmaz.
 */
export const SocialReplyResponseSchema = z.object({
  status: z.enum(['sent', 'refused', 'failed']),
  /** Ret ya da başarısızlığın ANAHTARI — ekran onu kendi sözlüğünden cümleye çevirir. */
  reason: z.string().nullable(),
  /** Yalnız `failed`te anlamlı: sağlayıcı geçici mi düştü, yeniden denenebilir mi. */
  retryable: z.boolean(),
  detail: SocialConversationDetailSchema.nullable(),
});
export type SocialReplyResponse = z.infer<typeof SocialReplyResponseSchema>;

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
