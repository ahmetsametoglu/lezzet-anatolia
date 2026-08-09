import 'server-only';
import {
  MoneyMovementService,
  OrderItemService,
  OrderService,
  ProductService,
  ProductVariantService,
  TicketMessageService,
  TicketQueueService,
  TicketService,
  UserProfileService,
  serviceDb,
  type TicketQueueFilter,
} from '@lezzet/database';
import { allowedTicketTransitions, canTriggerReturn, isReturnBound, resolveUserText } from '@lezzet/domain-core';
import {
  resolveLocalizedText,
  type KeysetCursor,
  type Page,
  type PreferredLanguage,
  type ProductComplaintSignal,
  type Ticket,
  type TicketMessage,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { privateReadUrls } from '@lezzet/storage';
import { customerLabel } from '@/lib/customer/name';
import type {
  CustomerTicketSummary,
  CustomerTicketView,
  StaffTicketDetail,
  TicketMessageView,
  TicketOrderRef,
  TicketQueueItem,
  TicketReturnOutcome,
} from './ticket-types';

/**
 * Talep okumaları (16.1) — **uygulama katmanı orkestrasyonu**: motor karar verir, servisler satır
 * getirir, burası ikisini birleştirir (STACK §4).
 *
 * **Sahiplik imzada durur.** Müşteri okumaları `customerId`'yi zorunlu parametre olarak alır,
 * süzgeç olarak değil: unutulabilen bir süzgeç, bir gün başkasının talebini açan bir ekran demektir.
 */

/** Kalem adı çözümü için tek turluk yardımcı — kalem → varyant → ürün adı (N+1 kırma). */
async function resolveItemNames(
  locale: Locale,
  itemIds: readonly string[],
  orderId: string,
): Promise<Array<{ id: string; name: string; qty: number }>> {
  if (itemIds.length === 0) return [];
  const db = serviceDb();
  const items = (await new OrderItemService(db).listByOrder(orderId)).filter((i) => itemIds.includes(i.id));
  if (items.length === 0) return [];

  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const products = await new ProductService(db).listByIds(variants.map((v) => v.productId));
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  return items.map((item) => {
    const variant = variantById.get(item.variantId);
    const product = variant ? productById.get(variant.productId) : undefined;
    return {
      id: item.id,
      // Ürün silinmiş olabilir; müşteri yine de neyi işaretlediğini görmeli — adsız ama var olan satır.
      name: product ? resolveLocalizedText(product.name, locale) : '—',
      qty: item.qty,
    };
  });
}

/** Talebe bağlı siparişin künyesi + işaretli kalemler; siparişsiz talepte null. */
async function orderRefOf(locale: Locale, ticket: Ticket): Promise<TicketOrderRef | null> {
  if (!ticket.orderId) return null;
  const order = await new OrderService(serviceDb()).getById(ticket.orderId);
  if (!order) return null;
  return {
    id: order.id,
    referenceNo: order.referenceNo,
    markedItems: await resolveItemNames(locale, ticket.orderItemIds, order.id),
  };
}

/**
 * İadenin sonucu — **siparişin para hareketlerinden türetilir**, talepte saklanmaz.
 *
 * Tetik damgası yoksa hiç bakılmaz: talepten doğmamış bir iade bu talebin ekranında görünmemeli.
 */
async function returnOutcomeOf(ticket: Ticket): Promise<TicketReturnOutcome | null> {
  if (!ticket.returnTriggeredAt || !ticket.orderId) return null;
  const movements = await new MoneyMovementService(serviceDb()).listByOrder(ticket.orderId);
  const refunded = movements
    .filter((m) => m.type === 'order_refund')
    .reduce((sum, m) => sum + m.amountCents, 0); // servis cent döndürüyor (02.9) — elle `* 100` kalktı
  return { triggeredAt: ticket.returnTriggeredAt, refundedCents: refunded };
}

/**
 * Mesajı ekranın gördüğü hâle çevirir — metin **okuyucunun diline**, ekler **süreli imzalı adrese**.
 *
 * Şikâyet fotoğrafı private kovada durur ve public adresi yoktur; adres burada, yani yetkinin
 * doğrulandığı yerin içinde üretilir. Anahtarın kendisi dışarı çıkmaz: ekranın anahtarla
 * yapabileceği bir şey yok, ama sızan bir anahtar ileride açılacak her kapının önünde durur.
 *
 * Bir talebin mesajları birlikte imzalanır (`Promise.all`) — mesaj başına sıra beklemek, on
 * mesajlık bir yazışmayı on tur uzatırdı.
 *
 * **Çeviri yönü ÇAĞIRANIN dilinden gelir** (20.2): müşteri kapısı `locale` geçer, operasyon kapısı
 * `OPERATIONS_LOCALE`. Yani aynı işlev bir yazışmayı iki tarafa iki dilde açar ve hangi yön olduğunu
 * kendi bilmez — bilmesi de gerekmez, çünkü "kim okuyor" sorusunun cevabı yalnız çağıranda vardır.
 * `viewLanguage` varsayılansız ve bilerek: varsayılan koysaydık dilini vermeyi unutan bir ekran
 * herkese aynı dili gösterir ve bu hiçbir yerde hata vermezdi (aynı gerekçe `listProductReviews`'ta).
 */
async function toMessageView(message: TicketMessage, viewLanguage: PreferredLanguage): Promise<TicketMessageView> {
  const gosterilen = resolveUserText(
    { text: message.body, language: message.language, translations: message.translations },
    viewLanguage,
  );
  return {
    id: message.id,
    sender: message.sender,
    // Motor boş metinde `null` döner; mesaj gövdesi boş olamaz (`min(1)`) ama tip yalan söylemesin.
    body: gosterilen.text ?? message.body,
    bodyTranslated: gosterilen.isTranslated,
    language: message.language,
    originalBody: message.body,
    attachmentUrls: await privateReadUrls(message.attachments),
    createdAt: message.createdAt,
  };
}

const toMessageViews = (messages: readonly TicketMessage[], viewLanguage: PreferredLanguage): Promise<TicketMessageView[]> =>
  Promise.all(messages.map((m) => toMessageView(m, viewLanguage)));

/**
 * Müşterinin "Taleplerim" listesi (08.6) — keyset sayfalı (talep sayısı veriyle büyür).
 *
 * Ham `ticket` satırı yerine **kuyruk görünümünden** okur: tasarımın kartta gösterdiği iki bağlam —
 * "son mesaj: bugün" ve "LZA-2451" — yalnız orada türetilmiş hâlde duruyor. Ham satırdan okumak,
 * sayfa başına bir sipariş turu + talep başına bir mesaj turu (N+1) demekti.
 *
 * Sıra da oradan geliyor ve müşteri için de doğru: **son mesaja göre**, yani az önce cevaplanan
 * talep başa çıkar. Açılış tarihine göre sıralasaydık, cevap bekleyen taze talep eski bir kaydın
 * altında kalırdı.
 *
 * Görünümün personel alanları (`customerName`, `handledBy`, `lastMessageBody`) BURADA DÜŞER —
 * müşteri tipine hiç girmezler. Sızıntı riski taşımayanları bile taşımıyoruz: bir gün eklenecek
 * gerçek bir iç alanın önündeki tek engel bu ayrımın kendisi.
 */
export async function listCustomerTickets(
  customerId: string,
  cursor?: KeysetCursor,
  limit?: number,
): Promise<Page<CustomerTicketSummary>> {
  const page = await new TicketQueueService(serviceDb()).list({ customerId }, cursor, limit);
  return {
    rows: page.rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      subject: row.subject,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
      orderReferenceNo: row.orderReferenceNo,
    })),
    nextCursor: page.nextCursor,
  };
}

/**
 * Müşterinin tek talebi — yazışma, sipariş zemini ve iade sonucuyla.
 *
 * **Başkasının talebi `null` döner, hata değil:** "bu talep var ama senin değil" demek, olmayan bir
 * kaydın varlığını doğrulamaktır. Ekran için ikisi de aynı: yok.
 */
export async function getCustomerTicket(locale: Locale, customerId: string, ticketId: string): Promise<CustomerTicketView | null> {
  const db = serviceDb();
  const ticket = await new TicketService(db).getById(ticketId);
  if (!ticket || ticket.customerId !== customerId) return null;

  const [order, messages, returnOutcome] = await Promise.all([
    orderRefOf(locale, ticket),
    new TicketMessageService(db).listByTicket(ticket.id),
    returnOutcomeOf(ticket),
  ]);

  return {
    id: ticket.id,
    type: ticket.type,
    status: ticket.status,
    subject: ticket.subject,
    createdAt: ticket.createdAt,
    order,
    // Müşteri yazışmayı KENDİ dilinde okur: personelin Türkçe cevabı burada çevrilir.
    messages: await toMessageViews(messages, locale),
    returnOutcome,
    allowedTransitions: allowedTicketTransitions(ticket.status, 'customer'),
  };
}

/** Sipariş detayındaki "bu siparişle ilgili talebiniz var" bağı — sahiplik yine imzada. */
export async function listTicketsForOrder(customerId: string, orderId: string): Promise<Ticket[]> {
  const rows = await new TicketService(serviceDb()).listByOrder(orderId);
  return rows.filter((t) => t.customerId === customerId);
}

/**
 * Operasyon kuyruğu (16.3) — son mesaja göre sıralı, keyset sayfalı, **tek sorgu**.
 *
 * Müşteri adı, sipariş numarası ve son mesajın metni görünümden gelir (`ticket_queue`): ekran
 * onları ayrı ayrı çekseydi 30 satırlık bir kuyruk 90 sorguya çıkardı. Bu işlev yalnız sunum
 * kararını ekler — önizlemenin kırpılması ve adsız müşterinin anılabilir kılınması.
 *
 * **ADSIZ MÜŞTERİ İÇİN İKİNCİ BİR OKUMA VAR ve şartlı** (kullanıcı tespiti 09.08): görünüm
 * `user_profiles.name`'i olduğu gibi veriyor, o da OTP ile giren müşteride BOŞ DİZGE oluyor
 * (`customerLabel` künyesi) — satırın başlığı boş çıkıyordu. Yedek e-posta görünümde yok, o yüzden
 * yalnız **adı boş olan satırlar için** tek bir toplu profil okuması yapılır (`listByIds`, satır
 * başına sorgu değil). Adsız satır yoksa hiç sorgu koşmaz.
 *
 * Kalıcı çözüm e-postayı görünüme eklemektir (`ticket_queue`, `0026`) ve tek satırlık bir
 * değişiklik — ama migration'ı düzenlemek `db:reset` istiyor ve o KULLANICININ kararı (`CLAUDE §0`).
 * Sıradaki reset penceresinde alınmak üzere işaretlendi. BEKLEYEN(16.3)
 */
export async function listTicketQueue(
  viewLanguage: PreferredLanguage,
  filter: TicketQueueFilter = { openOnly: true },
  cursor?: KeysetCursor,
  limit?: number,
): Promise<Page<TicketQueueItem>> {
  const db = serviceDb();
  const page = await new TicketQueueService(db).list(filter, cursor, limit);

  const namelessIds = [...new Set(page.rows.filter((row) => !row.customerName?.trim()).map((row) => row.customerId))];
  const profiles = namelessIds.length > 0 ? await new UserProfileService(db).listByIds(namelessIds) : [];
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));

  return {
    rows: page.rows.map((row) => {
      // Önizleme de ÇEVRİLİR (20.2): detay çevrilip kuyruk çevrilmeseydi personel talebi ancak
      // açarak triyaj edebilirdi — kuyruğun tek işi ise açmadan sıralamaktır.
      const gosterilen = resolveUserText(
        { text: row.lastMessageBody, language: row.lastMessageLanguage, translations: row.lastMessageTranslations },
        viewLanguage,
      );
      return {
        id: row.id,
        customerName: customerLabel(row.customerName, emailById.get(row.customerId)),
        type: row.type,
        status: row.status,
        handledBy: row.handledBy,
        answeredByAi: row.answeredByAi,
        source: row.source,
        preview: previewOf(gosterilen.text ?? ''),
        previewTranslated: gosterilen.isTranslated,
        lastMessageAt: row.lastMessageAt,
        awaitingReply: row.awaitingReply,
        hasAttachment: row.hasAttachment,
        orderReferenceNo: row.orderReferenceNo,
        returnBound: isReturnBound(row.type),
      };
    }),
    nextCursor: page.nextCursor,
  };
}

/** Kuyruk önizlemesi: ilk satır, kısaltılmış. Ekran taraması için — tam metin detayda okunur. */
function previewOf(body: string): string {
  const firstLine = body.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine;
}

/**
 * Operasyon talep detayı (16.3).
 *
 * **Müşteri bağlamı bilerek burada:** "sürekli şikâyet eden mi, ilk kez mi" sorusu iade kararının
 * bir parçasıdır (tasarım §2) ve ayrı bir çağrıya bırakılsaydı ekran onu çekmeyi unutabilirdi.
 */
export async function getStaffTicketDetail(locale: Locale, ticketId: string): Promise<StaffTicketDetail | null> {
  const db = serviceDb();
  const row = await new TicketQueueService(db).getRow(ticketId);
  if (!row) return null;

  const [customer, order, messages, returnOutcome, customerTickets] = await Promise.all([
    new UserProfileService(db).getById(row.customerId),
    orderRefOf(locale, row),
    new TicketMessageService(db).listByTicket(row.id),
    returnOutcomeOf(row),
    // SAYIM, sayfa değil: "sürekli şikâyet eden mi" ölçüsü iade kararının girdisi ve tam da tavanda
    // anlamsızlaşır. Bir sayfanın satır sayısını "toplam" diye göstermek 300 talebi 100 gösterirdi.
    new TicketService(db).countByCustomer(row.customerId),
  ]);

  return {
    ticket: row,
    customer: {
      id: row.customerId,
      // Kuyrukla AYNI kural (`customerLabel`): adsız müşteri e-postasıyla anılır. Burada bir tur
      // `name ?? '—'` yazılıydı ve yalnız profil YOKSA devreye giriyordu; profili olup adı boş olan
      // müşteri — yani OTP'yle giren herkes — detayda da boş görünüyordu.
      name: customerLabel(customer?.name, customer?.email),
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
      totalTickets: customerTickets,
    },
    order,
    // Ters yön: müşterinin kendi dilinde yazdığı şikâyet personele operasyon dilinde açılır. Çağıran
    // `OPERATIONS_LOCALE` geçiyor — burada `'tr'` sabitlemek o kararı ikinci bir yere kopyalardı.
    messages: await toMessageViews(messages, locale),
    returnOutcome,
    allowedTransitions: allowedTicketTransitions(row.status, 'staff'),
    returnTrigger: canTriggerReturn(row),
  };
}

/** Dashboard rozeti — kapanmamış talep sayısı. */
export function countOpenTickets(): Promise<number> {
  return new TicketService(serviceDb()).countOpen();
}

/**
 * Kuyruk başlığının sayaçları — durum başına, TÜM kuyruk üzerinden.
 *
 * Yüklenmiş sayfadan saymak yanlış olurdu ve tam da sayının anlam kazandığı yerde: kuyruk keyset
 * sayfalı, yani "2 işlemde" aslında "ilk sayfada 2 işlemde" demek olurdu (`CLAUDE.md §1`).
 */
export function countTicketsByStatus(): Promise<Record<Ticket['status'], number>> {
  return new TicketService(serviceDb()).countByStatus();
}

/**
 * **Ürün başına şikâyet yoğunluğu** (16.6 · operasyon talebi 03.08) — Geri Bildirim ekranının skor
 * tablosunda, ürünün skorunun YANINDA okunur.
 *
 * Kalite sorunu ile beğeni verisinin yan yana durduğu yer: "çok beğenilmiş ama bozuk geliyor" ile
 * "az beğenilmiş ama şikâyeti de yok" iki ayrı durumdur ve tek başına skor ikisini ayıramaz.
 *
 * Haritada olmayan ürünün şikâyeti YOKTUR; çağıran `?? 0` okur — her ürün için sıfırlı bir kayıt
 * üretmek, şikâyetsiz bir katalogda yüzlerce boş nesne olurdu (`getProductScores` ile aynı desen).
 *
 * `since` (ISO) verilirse yalnız o dönemin şikâyetleri; ekranın "Son 30 gün" seçicisi budur.
 */
export async function getProductComplaintSignals(
  productIds: readonly string[] = [],
  since?: string,
): Promise<Map<string, ProductComplaintSignal>> {
  const rows = await new TicketService(serviceDb()).listComplaintSignals(productIds, since);
  return new Map(rows.map((row) => [row.productId, row]));
}
