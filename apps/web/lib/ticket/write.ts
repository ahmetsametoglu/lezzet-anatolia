import 'server-only';
import { OrderItemService, OrderService, TicketService, serviceDb } from '@lezzet/database';
import {
  canTransitionTicket,
  canTriggerReturn,
  checkTicketDraft,
  statusAfterCustomerReply,
  statusAfterStaffReply,
} from '@lezzet/domain-core';
import { queueTicketReplyMail, ringTicketBell, translateTicketMessageNow } from '@lezzet/application';
import { ticketAttachmentScope } from '@lezzet/storage';
import type { Ticket, TicketMessage, TicketStatus, TicketType } from '@lezzet/types';
import { notifyTicketReceived, notifyTicketStatusChanged } from './notify';

/**
 * Talep yazımları (16.1) — **kapı**: motora sorar, servise yazdırır (STACK §4).
 *
 * Her kapı `{ ok }` biçiminde bir sonuç döner, fırlatmaz: reddin sebebi ekranın müşteriye
 * söyleyeceği cümledir; exception'a çevrilirse o cümle kaybolur ve geriye "bir hata oluştu" kalır.
 *
 * **Sahiplik ve rol burada kontrol edilmez, imzada durur:** müşteri kapıları `customerId`,
 * personel kapıları `authorId` ister ve çağıran onu guard'dan alır (`currentCustomerId`,
 * `requireStaff`). Kapı kendi başına oturum okusaydı WhatsApp'tan gelen çağrı (oturumsuz) hiç
 * çalışmazdı.
 */

export type TicketWriteResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/**
 * **Ekler yalnız çağıranın kendi alanından gelebilir.**
 *
 * Anahtar istemciden geliyor ve okuma kapısı onu imzalı adrese çeviriyor. Sahiplik kontrolü TALEP
 * üzerinde yapılıp anahtar üzerinde yapılmasaydı, müşteri private kovadaki herhangi bir dosyayı
 * kendi talebine iliştirip okutabilirdi — yetki doğrulanmış olurdu ama yanlış nesnenin.
 *
 * `null` scope = biçimi tanınmayan anahtar; kabul edilmez.
 */
function attachmentsBelongTo(attachments: readonly string[] | undefined, owner: { customerId: string; ticketId?: string }): boolean {
  return (attachments ?? []).every((key) => {
    const scope = ticketAttachmentScope(key);
    if (!scope) return false;
    return scope.kind === 'draft' ? scope.customerId === owner.customerId : scope.ticketId === owner.ticketId;
  });
}

/**
 * Siparişin ve işaretli kalemlerin gerçekten bu müşteriye ait olduğu.
 *
 * Bunu ne DB ne motor bilebilir: motor siparişleri görmez, DB'de `ticket.customer_id` ile
 * `order.customer_id` arasında bir kısıt yoktur (olsaydı personelin elle açtığı talep de bozulurdu).
 * Kontrol edilmeseydi müşteri başkasının sipariş numarasını, ürünlerini ve iade tutarlarını kendi
 * talebi üzerinden okurdu — üstelik operatör de yanlış siparişte iade başlatırdı.
 *
 * Uydurma kalem kimlikleri de burada elenir: sessizce yutulsalardı müşteri işaretlediği kalemi
 * ekranda göremez, sebebini de öğrenemezdi.
 */
async function checkOrderOwnership(input: {
  customerId: string;
  orderId?: string | null;
  orderItemIds?: string[];
}): Promise<{ ok: true } | { ok: false; reason: 'order_not_found' | 'items_not_in_order' }> {
  if (!input.orderId) return { ok: true };

  const db = serviceDb();
  const order = await new OrderService(db).getById(input.orderId);
  // "Yok" ile "senin değil" ekrana aynı cümleyi kurar: olmayan bir siparişin varlığını doğrulamayız.
  if (!order || order.customerId !== input.customerId) return { ok: false, reason: 'order_not_found' };

  const itemIds = input.orderItemIds ?? [];
  if (itemIds.length === 0) return { ok: true };

  const items = await new OrderItemService(db).listByOrder(input.orderId);
  const own = new Set(items.map((item) => item.id));
  return itemIds.every((id) => own.has(id)) ? { ok: true } : { ok: false, reason: 'items_not_in_order' };
}

/**
 * Müşterinin talep açması (16.2'nin arka ucu). Talep ve ilk mesaj **tek turda** yazılır — açan
 * kişinin ne dediği bilinmeyen bir talep kuyruğa düşmemeli.
 */
export async function openTicket(input: {
  customerId: string;
  source: Ticket['source'];
  type: TicketType;
  /** Müşterinin anlatımı — talebin ilk mesajı. Boş olamaz: anlatımsız talep, çözülemeyen taleptir. */
  body: string;
  orderId?: string | null;
  orderItemIds?: string[];
  conversationId?: string | null;
  subject?: string | null;
  attachments?: string[];
  /** Personel elle açıyorsa kendi kimliği; müşteri kendi açtığında boş. */
  authorId?: string | null;
}): Promise<TicketWriteResult<Ticket>> {
  const draft = checkTicketDraft(input);
  if (!draft.ok) return { ok: false, reason: draft.reason };
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };
  // Yeni talebin henüz kimliği yok: ekler ancak müşterinin kendi taslak klasöründen gelebilir.
  if (!attachmentsBelongTo(input.attachments, { customerId: input.customerId })) {
    return { ok: false, reason: 'attachment_not_yours' };
  }

  // **Personel elle açarken sahiplik aranmaz:** operatör müşteri adına talep açar ve siparişi o
  // seçer; kendi kimliğiyle eşleşmesi beklenemez. Kontrol MÜŞTERİNİN açtığı talebe aittir.
  if (!input.authorId) {
    const owns = await checkOrderOwnership(input);
    if (!owns.ok) return { ok: false, reason: owns.reason };
  }

  const ticket = await new TicketService(serviceDb()).createWithMessage({
    ...input,
    body: input.body.trim(),
    // Personelin elle açtığı talepte ilk sözü o söyler; müşterinin kendi açtığında müşteri.
    sender: input.authorId ? 'admin' : 'customer',
  });
  // Teyit maili — talep kaydedildikten SONRA ve sonucu beklenmeden değil, beklenerek: gönderim
  // zaten kendi içinde sessiz (hata yukarı çıkmaz), ama beklemezsek server action süreci mail
  // gitmeden sonlanabilir.
  await notifyTicketReceived(ticket, input.authorId ? 'staff' : 'customer');
  return { ok: true, data: ticket };
}

/**
 * Müşterinin cevabı. **Kapanmış talep kendiliğinden yeniden açılır** (motorun kararı): "yeniden aç"
 * ile "yaz" ayrı iki düğme olsaydı müşteri yazar, düğmeye basmayı unutur ve mesajı kimsenin
 * bakmadığı kapalı bir talebin içinde kalırdı.
 */
export async function replyAsCustomer(input: {
  customerId: string;
  ticketId: string;
  body: string;
  attachments?: string[];
}): Promise<TicketWriteResult<TicketMessage>> {
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };
  const db = serviceDb();
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  // Başkasının talebine yazılamaz — ve "yok" ile "senin değil" ekrana aynı cümleyi kurar.
  if (!ticket || ticket.customerId !== input.customerId) return { ok: false, reason: 'not_found' };
  if (!attachmentsBelongTo(input.attachments, { customerId: input.customerId, ticketId: ticket.id })) {
    return { ok: false, reason: 'attachment_not_yours' };
  }

  const message = await service.reply({
    ticketId: ticket.id,
    sender: 'customer',
    body: input.body.trim(),
    attachments: input.attachments,
    newStatus: statusAfterCustomerReply(ticket.status),
  });
  /* Çeviri GÖNDERİM ANINDA (17.08) — operatör bu mesajı ilk görüşte Türkçe okusun; künyesi
     `translateTicketMessageNow`da. Düşerse mesaj yine yazılmıştır, satır kuyrukta kalır. */
  await translateTicketMessageNow(db, message);
  return { ok: true, data: message };
}

/**
 * Personelin cevabı — müşteriye **aynen** görünür (iç not yoktur, DOMAIN §15).
 *
 * Cevap yazmak durumu kendiliğinden değiştirmez: tasarım durum değiştirmeyi ayrı bir aksiyon
 * olarak sunuyor, sessiz geçiş operatörün vermediği bir kararı ona mal etmek olurdu.
 */
export async function replyAsStaff(input: {
  ticketId: string;
  authorId: string;
  body: string;
  attachments?: string[];
}): Promise<TicketWriteResult<TicketMessage>> {
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };
  const db = serviceDb();
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };

  const message = await service.reply({
    ticketId: ticket.id,
    sender: 'admin',
    authorId: input.authorId,
    body: input.body.trim(),
    attachments: input.attachments,
    newStatus: statusAfterStaffReply(ticket.status),
  });

  /* ÇEVİRİ HABERDEN VE ZİLDEN ÖNCE (kullanıcı bulgusu 17.08) — kullanıcının bildirdiği arıza tam
     burada doğuyordu: operatör Türkçe yazıyor, müşteri mesajı önce Türkçe görüyor, ekrandan çıkıp
     girince Fransızcaya dönüyordu. Künyesi `translateTicketMessageNow`da. */
  await translateTicketMessageNow(db, message);

  /* MAİL ANINDA GİTMEZ, KUYRUĞA GİRER (kullanıcı isteği 16.08 — künyesi `reply-mail.ts`de):
     müşteri ekranı açıksa cevabı zil sayesinde zaten anında görüyor; o an giden mail gürültüdür.
     Süpürge gecikme dolduğunda hâlâ okunmamışsa gönderir. `ticket` TAZE okunmaz ve okunmamalı:
     kuyruk damgası "zaten bekliyor mu" diye bakıyor, bu satırdaki nesne o kararı vermeye yeter. */
  await queueTicketReplyMail(db, ticket);
  /* MÜŞTERİNİN KANALI — operasyon zilinden ayrı (künyesi `ringTicketBell`de). Müşteri yazışmayı
     açık tutuyorsa operatörün cevabını elle tazelemeden görsün; mobil talep ekranı bu zili
     dinliyor (21.68). Zil sessizdir: çalmazsa cevap yine yazılmıştır, ekran biraz geç görür. */
  await ringTicketBell(ticket.id);
  return { ok: true, data: message };
}

/**
 * Durum değişimi — izni motor verir (`canTransitionTicket`), damgayı servis basar.
 *
 * Aktör ayrımı burada gerçek bir kapıdır: müşteri kendi talebini "çözüldü" yapamaz, yalnız
 * kapanmış olanı yeniden açabilir.
 */
export async function changeTicketStatus(input: {
  ticketId: string;
  to: TicketStatus;
  by: 'customer' | 'staff';
  /** Müşteri tarafında sahiplik kontrolü için; personelde gerekmez. */
  customerId?: string;
}): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (input.by === 'customer' && ticket.customerId !== input.customerId) return { ok: false, reason: 'not_found' };

  const check = canTransitionTicket(ticket.status, input.to, input.by);
  if (!check.allowed) return { ok: false, reason: check.reason };

  const updated = await service.setStatus(ticket.id, input.to);
  // Yalnız "çözüldü" ve "yeniden açıldı" haber doğurur, ve yalnız PERSONEL yaptığında — kararı
  // bildirim katmanı verir (16.4), burası olayı bildirmekle yetinir.
  await notifyTicketStatusChanged(updated, ticket.status, input.by);
  return { ok: true, data: updated };
}

/**
 * AI'dan devralma (16.5'in arka ucu) — `ai`'dan da `hybrid`'den de iner; bekleyen taslak servis
 * katında birlikte düşer (devralan taslağı değil sohbeti istedi).
 */
export async function takeOverTicket(ticketId: string): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.handledBy === 'human') return { ok: false, reason: 'already_human' };
  return { ok: true, data: await service.takeOver(ticket.id) };
}

/**
 * Yürütücü modunu değiştir (kullanıcı kararı 16.08): human · hybrid · ai. Motor (16.5) henüz yok
 * ama mod bir VERİ kararıdır ve bugünden yazılır — motor geldiğinde hangi talebi nasıl yürüteceğini
 * buradan okuyacak. Aynı moda "geçmek" reddedilir: ekran o düğmeyi zaten seçili gösterir, yine de
 * gelen çağrı bir yarışın işaretidir ve sessizce yutulmamalı.
 */
export async function setTicketMode(ticketId: string, mode: Ticket['handledBy']): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.handledBy === mode) return { ok: false, reason: 'already_in_mode' };
  return { ok: true, data: await service.setMode(ticket.id, mode) };
}

/**
 * Hibrit taslağı tüket (16.08) — mobildeki desenin arka ucu (`complaint-screen` v2:548).
 *
 * İki çıkış, tek kapı:
 *   · `send=true` — "Cevaba çevir": taslak OLDUĞU GİBİ personel cevabı olur. Gönderen `admin`dir,
 *     `ai` değil (20-yapay-zeka §75: `ai` yalnız AI'ın KENDİ gönderdiği mesajdır; insanın
 *     onayladığı taslak insanın cevabıdır — karıştırmak "AI yanıtladı" süzgecini yalancı yapardı).
 *   · `send=false` — "Düzenleyerek gönder": taslak satırdan düşer, metni ekran cevap kutusuna
 *     taşır; düzenleme yeri zaten orasıdır.
 *
 * Sıra bilinçli: önce gönder, SONRA temizle — gönderim düşerse taslak yerinde kalır ve operatör
 * yeniden deneyebilir. Ters sıra, düşen gönderimde taslağı sessizce yutardı.
 */
export async function consumeTicketDraft(input: {
  ticketId: string;
  authorId: string;
  send: boolean;
}): Promise<TicketWriteResult<{ ticket: Ticket; draft: string }>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  const draft = ticket.aiDraftReply;
  if (!draft) return { ok: false, reason: 'no_draft' };

  if (input.send) {
    const sent = await replyAsStaff({ ticketId: ticket.id, authorId: input.authorId, body: draft });
    if (!sent.ok) return sent;
  }
  return { ok: true, data: { ticket: await service.clearDraft(ticket.id), draft } };
}

/**
 * İade akışını bu talepten başlat — **yalnız damga.**
 *
 * Para ve stok burada HİÇ hareket etmez: iade siparişte yaşar (`adjustFulfillment` +
 * `recordForOrder`, 07.9) ve operatör oraya yönlendirilir. Bu kapı yalnız "iadeyi hangi talep
 * doğurdu" sorusunu cevaplanabilir kılar; ikinci bir iade arayüzü kurmaz (DOMAIN §8).
 */
export async function triggerReturnFromTicket(ticketId: string): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };

  const check = canTriggerReturn(ticket);
  if (!check.allowed) return { ok: false, reason: check.reason };

  return { ok: true, data: await service.markReturnTriggered(ticket.id) };
}
