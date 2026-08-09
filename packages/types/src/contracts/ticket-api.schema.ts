import { z } from 'zod';
import { TicketMessageSchema, TicketSchema } from '../entities/ticket.schema';
import { TicketTypeEnum } from '../primitives/enums.schema';
import { SourceLanguageSchema } from '../primitives/user-text.schema';

/**
 * `/api/v1/me/tickets` SÖZLEŞME şemaları (21.14 · modül 16) — mobil talep uçlarının ve
 * "Taleplerim / talep detayı / bize yazın" ekranlarının ORTAK dili.
 *
 * Terfi gerekçesi `me-api.schema.ts` · `order-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek
 * kaynak"): üreten uç ile tüketen ekran AYNI şemayı çağırır, alan adı değişirse iki taraf birden
 * DERLEME anında kırılır. Entity/taşıma ayrımı da oradaki künyede: `ticket.schema.ts` DB satırının
 * aynasıdır, bu dosya "bu yüzey tele ne verir"i söyler.
 *
 * ── KAPSAM: YALNIZ MÜŞTERİNİN GÖRDÜĞÜ ────────────────────────────────────────
 * `handledBy` · `source` · `conversationId` · `customerId` · `answeredByAi` BİLEREK yok. İlk üçü
 * operasyonun iç bilgisi (kim yürütüyor, nereden geldi, hangi WhatsApp konuşması), dördüncüsü
 * jetondan çözülüyor ve telefonun onunla yapacağı bir şey yok. Uç `parse` ile döndürür: pick'te
 * olmayan alan zarfa SIZAMAZ — süzme tipte değil, çalışma zamanında da geçerli.
 */

/**
 * "Taleplerim" listesinin tek satırı (v3 `vTalepler` kartı).
 *
 * `lastMessageAt` iki işi birden yapıyor ve ikincisi bir zorunluluk: liste SON MESAJA göre sıralı
 * (kapının ölçülmüş kuralı — cevaplanan talep başa çıkar) ve sıralama ölçütünü göstermeyen bir
 * liste kullanıcıya rastgele sıralı görünürdü. Web'in mobil kartı da üç parçayı birden yazıyor
 * (`kapsam · açılış · son mesaj`) — aynı müşteri iki yüzeyde aynı satırı okur.
 *
 * `subject` kümede ama müşteri onu YAZMAZ (entity künyesi: müşteri başlık değil anlatım yazar);
 * personelin elle açtığı talepte dolu olur ve o zaman kartın adı "Eksik ürün · Gözleme" olur.
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
 * Sayfa zarfı — `MeOrderPageSchema` ile aynı şekil ve aynı gerekçe: talep sayısı veriyle sınırsız
 * büyür → keyset + sonsuz kaydırma; `nextCursor` OPAK bir dizedir (istemci yorumlamaz, bir sonraki
 * isteğe aynen geri verir), `null` = liste bitti. İmleç URL'e/ekran durumuna yazılmaz (CLAUDE §1).
 *
 * `total` yok: v3'te "N talep" diye bir başlık yok ve olmayan bir sayacı taşımak, bir gün süzgeç
 * eklendiğinde sessizce yalan söyleyen bir alan bırakırdı (sipariş zarfının aynı kararı).
 */
export const MeTicketPageSchema = z.object({
  tickets: z.array(MeTicketSummarySchema),
  nextCursor: z.string().nullable(),
});
export type MeTicketPage = z.infer<typeof MeTicketPageSchema>;

/**
 * Yazışmadaki tek mesaj.
 *
 * **`sender` YERİNE `fromCustomer`** ve bu bir sadeleştirme değil, bir KARARIN tek yerde
 * tutulmasıdır: `ai` göndericisi de İŞLETMEDİR (web `ticket-thread.tsx` künyesi — müşteri "bir
 * robotla mı konuşuyorum" sorusuyla baş başa bırakılmaz). Ham `sender` gönderilseydi bu eşleme
 * ekranda yeniden yazılırdı ve 16.5 geldiği gün iki yüzey iki farklı şey gösterirdi.
 *
 * **Metin OKUYUCUNUN dilinde gelir** (20.2): personelin Türkçe cevabı müşteriye kendi dilinde
 * açılır. `translated` bunu ekranda işaretlemek için, `originalBody` ise "orijinali göster" için —
 * çeviri orijinalin YERİNE GEÇMEZ: makine çevirisi bir şikâyeti yumuşatabilir.
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
  /**
   * Eklerin SÜRELİ imzalı okuma adresleri — anahtar DEĞİL (ekranın anahtarla yapabileceği bir şey
   * yok, ama sızan bir anahtar ileride açılacak her kapının önünde durur).
   *
   * Ad "ek" değil "fotoğraf": motor yalnız görsel uzantı geçiriyor (`checkAttachment`) ve ekran
   * onları `Image` olarak çiziyor — telin adı, karşı tarafın ne çizeceğini söylemeli.
   */
  photos: z.array(z.string()),
});
export type MeTicketMessage = z.infer<typeof MeTicketMessageSchema>;

/**
 * İadenin sonucu — **siparişin para hareketlerinden türetilir**, talepte saklanmaz (DOMAIN §8).
 *
 * İki alan ayrı durur çünkü "tetiklendi ama henüz ödenmedi" gerçek bir ara hâldir: tek bir tutar
 * alanı olsaydı o hâl kaybolur, ekran 0 € iadeyi "iade yok" sanırdı. v3'ün "✓ Sonuç: 11,40 € iade
 * edildi" bandı yalnız `refundedCents > 0` iken çizilir (web bandının aynı ölçütü).
 */
export const MeTicketReturnSchema = z.object({
  triggeredAt: z.string(),
  refundedCents: z.number().int(),
});

/**
 * Talep detayı — yazışma ve iade sonucuyla; sayfanın TAMAMI tek turda.
 *
 * **İşaretli kalemler ("2× Gözleme") BİLEREK yok** ve bu ölçülmüş bir karar: v3 detayı onları
 * çizmiyor, web müşteri yüzeyi de çizmiyor — `markedItems`i okuyan tek yer operasyon talep detayı
 * ve o BAŞKA bir kapıdan geliyor (`getStaffTicketDetail`). Taşımak, hiçbir ekranın basmayacağı bir
 * dizi için detay başına üç ek sorgu (kalem → varyant → ürün adı) demekti. İhtiyaç doğduğu gün
 * küme buradan büyür; bugün müşteri neyi işaretlediğini kendi anlatımında okuyor.
 */
export const MeTicketDetailSchema = MeTicketSummarySchema.extend({
  /**
   * Yazışmanın TAMAMI, eskiden yeniye. Sayfalanmaz ve bu bilinçli: yazışma sınırsız büyüyen bir
   * küme değil, üç durumlu sade bir konuşmadır (DOMAIN §15) — ortasından değil baştan okunur.
   *
   * `min(1)`: talep ve ilk mesaj TEK turda yazılıyor (`create_ticket`), yani mesajsız bir talep
   * bir anomalidir — sözleşme onu parse anında keser.
   */
  messages: z.array(MeTicketMessageSchema).min(1),
  returnOutcome: MeTicketReturnSchema.nullable(),
});
export type MeTicketDetail = z.infer<typeof MeTicketDetailSchema>;

/**
 * `POST /api/v1/me/tickets` gövdesi — yeni talep (v3 `vTalepNew`).
 *
 * **Sipariş REFERANSLA adreslenir, kimlikle değil:** mobil sipariş sözleşmesi UUID'yi bilerek
 * dışarıda bırakıyor (`MeOrderSummarySchema` künyesi — müşteriye gösterilen ve destekle konuşurken
 * kullanılan şey numaradır). Uç referansı sahiplikle birlikte çözer; çözemezse `order_unavailable`.
 *
 * `orderItemIds` sipariş DETAYINDAN gelen satır kimlikleridir (`MeOrderDetailSchema.lines[].id`).
 * `subject` YOK: müşteri başlık yazmaz, anlatımını yazar (entity künyesi) — başlığı olan talep
 * personelin elle açtığıdır ve o akış bu uçtan geçmez.
 *
 * `source` da YOK ve gönderilmemeli: geliş yolu istemcinin beyanı değil, ucun bilgisidir — gövdeden
 * kabul etmek WhatsApp'tan geldiğini söyleyen bir telefona inanmak olurdu.
 */
export const TicketOpenSchema = z.object({
  type: TicketTypeEnum,
  /** Müşterinin anlatımı — talebin ilk mesajı. Boş olamaz: anlatımsız talep, çözülemeyen taleptir. */
  body: z.string().min(1),
  orderReference: z.string().min(1).nullish(),
  orderItemIds: z.array(z.string().uuid()).optional(),
});

/**
 * Açılışın cevabı — YALNIZ yeni talebin kimliği.
 *
 * Özeti ya da detayı döndürmedik ve gerekçe ölçülebilir: v3 gönderimden sonra LİSTEYE dönüyor
 * (`tnSubmit` → `stack:[{n:'talepler'}]`) ve liste odağa gelince zaten tazeleniyor. Kuyruk satırını
 * burada kurmak, hiç okunmayacak bir gövde için fazladan bir görünüm turu olurdu.
 *
 * Kimlik yine de dönüyor çünkü bir gün gerekecek olan tek şey o: "talebi aç" diyen bir onay bağı,
 * ya da bildirime yazılacak adres. Boş bir 200, o günü yeni bir sözleşme turuna bırakırdı.
 */
export const TicketCreatedSchema = z.object({ id: z.string().uuid() });

/**
 * Talep açılışının adlı retleri — cümleyi ekran kurar, anahtar sözleşmede yaşar.
 *
 * **`order_unavailable` ÜÇ iç sebebi birden taşır** ("sipariş yok" · "senin değil" · "kalem o
 * siparişte değil") ve ayrım BİLEREK söylenmiyor: web müşteri kapısının ölçülmüş kararı bu
 * (`customerErrorKey` → `ticket_unavailable`). Farkı söylemek, deneme yanılmayla başkasının sipariş
 * numarasını doğrulatmak olurdu — müşteri için üçü de aynı şey: "bu siparişi size bağlayamıyoruz".
 *
 * `items_without_order` ayrı kalıyor çünkü ayrı cinsten: bir yetki sorusu değil, gövdenin kendi
 * içinde tutarsız olması (kalem işaretlenmiş ama sipariş yok) — yani istemci hatası ve görünmesi
 * gerekir (CLAUDE §0: belirtiyi susturan çözüm, arızayı gözden saklar).
 */
export const TicketOpenErrorEnum = z.enum(['empty_body', 'order_unavailable', 'items_without_order']);
export type TicketOpenError = z.infer<typeof TicketOpenErrorEnum>;

/**
 * `POST /api/v1/me/tickets/:id/messages` gövdesi — yazışmaya cevap.
 *
 * **"Yeniden aç" diye bir alan YOK ve olmayacak:** kapanmış talebe yazmak onu kendiliğinden açar
 * (motorun kararı — `statusAfterCustomerReply`). Ayrı bir bayrak olsaydı müşteri yazar, işaretlemeyi
 * unutur ve mesajı kimsenin bakmadığı kapalı bir talepte kalırdı.
 *
 * Ek dosya alanı da yok: mobilde fotoğraf seçici henüz yok (yerel modül kararı) ve kabul edeceği bir
 * anahtar üretecek uç da yok — alanı bugün açmak, doldurulamayan bir söz vermek olurdu.
 */
export const TicketReplySchema = z.object({
  body: z.string().min(1),
});

/** Cevabın adlı retleri. `ticket_not_found` = "yok" ile "senin değil" — ikisi aynı cevabı verir. */
export const TicketReplyErrorEnum = z.enum(['empty_body', 'ticket_not_found']);
export type TicketReplyError = z.infer<typeof TicketReplyErrorEnum>;
