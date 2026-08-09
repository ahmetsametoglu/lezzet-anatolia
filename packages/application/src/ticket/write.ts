import { OrderItemService, OrderService, TicketService } from '@lezzet/database';
import { checkTicketDraft, statusAfterCustomerReply, type TicketDraftCheck } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import { ticketAttachmentScope } from '@lezzet/storage';
import type { Order, PreferredLanguage, Ticket, TicketType } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CustomerOrderLookup } from '../order/customer-orders';
import { getCustomerTicket } from './read';
import type { CustomerTicketView } from './ticket-types';

/*
  MÜŞTERİ TALEP YAZIMI — terfi 21.14. Kaynağı `apps/web/lib/ticket/write.ts`in müşteri yarısıdır;
  köprü notu `ticket-types.ts` başlığında.

  ── YALNIZ MÜŞTERİ KAPILARI GELDİ ───────────────────────────────────────────
  `replyAsStaff` · `changeTicketStatus` · `takeOverTicket` · `triggerReturnFromTicket` web'de kaldı:
  paketin kabul ölçütü "en az iki yüzeyin çağırdığı orkestrasyon" (`index.ts`) ve dördünün de tek
  yüzeyi var (operasyon web ekranı). Personelin MÜŞTERİ ADINA talep açması da öyle — bu dosyadaki
  kapı `customerId`'nin talebin sahibi OLDUĞUNU varsayar ve adı bunu söyler.

  ── HER KAPI GÖRÜNÜR RETLE DÖNER, FIRLATMAZ ─────────────────────────────────
  Reddin sebebi ekranın müşteriye söyleyeceği cümledir; exception'a çevrilirse o cümle kaybolur ve
  geriye "bir hata oluştu" kalır (`CustomerAddressOutcome` emsali).

  ── SAHİPLİK İMZADA ─────────────────────────────────────────────────────────
  Kapı kendi başına oturum OKUMAZ: `customerId`'yi çağıran guard'dan alır (`currentCustomerId`,
  Bearer middleware). Kapı oturum okusaydı taşımaya bağlanır, WhatsApp gibi oturumsuz bir akıştan
  hiç çağrılamazdı.
*/

/** Motorun taslak reddi — kapının ret kümesine AYNEN girer, ikinci kez yazılmaz (CLAUDE §1). */
type TicketDraftReason = Extract<TicketDraftCheck, { ok: false }>['reason'];

export type OpenCustomerTicketOutcome =
  | { status: 'ok'; ticket: Ticket }
  | { status: 'empty_body' | 'order_unavailable' | 'attachment_not_yours' | TicketDraftReason };

export type ReplyToTicketOutcome =
  | { status: 'ok'; ticket: CustomerTicketView }
  | { status: 'empty_body' | 'ticket_not_found' | 'attachment_not_yours' };

/**
 * **Çağıran yüzeyin sağladığı yan etki** — `OrderEffects` ile aynı desen ve aynı gerekçe
 * (`order/effects.ts` künyesi): teyit maili `@lezzet/notify` + `@lezzet/i18n` ister, ikisi de bu
 * paketin bağımlılığı DEĞİL ve bağımlılık eklemek kök `pnpm-lock.yaml`a dokunmaktır.
 *
 * `OrderEffects`ten TEK farkı imzası: orada port yalnız `orderId` alır (çağıranların elinde zaten
 * kimlik vardı), burada TALEBİN KENDİSİ geçer — kapı satırı az önce yazdı, çağıranı onu ikinci kez
 * okutmak boşuna bir tur olurdu.
 */
export interface TicketEffects {
  /** Talep açıldı teyidi (16.4 · şablon 14.7) — web karşılığı `notifyTicketReceived(ticket, 'customer')`. */
  notifyReceived?: (ticket: Ticket) => Promise<unknown>;
}

/** Süreç başına tek uyarı: aynı eksik etki her çağrıda bağırırsa kimse duymaz olur. */
const warnedEffects = new Set<string>();

/**
 * Etkiyi koşturur; yoksa UYARIR, patlarsa kaydeder — ama işi geri almaz.
 *
 * Sessiz no-op olmaz (CLAUDE §1): "talep açıldı ama teyit maili gitmiyor" arızasını aylarca
 * görünmez kılardı. Fırlatma da olmaz: mail sağlayıcısı düştü diye kaydedilmiş bir talebi
 * "başarısız" göstermek, müşteriye ikinci kez yazdırmak olurdu.
 */
async function runEffect(effect: string, ticketId: string, run: (() => Promise<unknown>) | undefined): Promise<void> {
  if (!run) {
    if (warnedEffects.has(effect)) return;
    warnedEffects.add(effect);
    logger.warn(
      { context: 'application/ticket-effects', effect },
      'talep yan etkisi KAYITLI DEĞİL — çağıran yüzey portu geçirmedi, etki atlandı',
    );
    return;
  }
  try {
    await run();
  } catch (err) {
    // Bağlam KİMLİK taşır, içerik değil (OBSERVABILITY §5) — o kimlikle veritabanına bakılır.
    logger.warn(
      { context: 'application/ticket-effects', effect, ticketId, err: err instanceof Error ? err.message : String(err) },
      'talep yan etkisi koşarken hata — talep geri alınmadı',
    );
  }
}

/**
 * **Ekler yalnız çağıranın kendi alanından gelebilir.**
 *
 * Anahtar istemciden geliyor ve okuma kapısı onu imzalı adrese çeviriyor. Sahiplik kontrolü TALEP
 * üzerinde yapılıp ANAHTAR üzerinde yapılmasaydı, müşteri private kovadaki herhangi bir dosyayı
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
 * Siparişi çözer ve SAHİPLİĞİ doğrular; ikisi tek kapıda çünkü ayrılırlarsa biri unutulur.
 *
 * Bunu ne DB ne motor bilebilir: motor siparişleri görmez, DB'de `ticket.customer_id` ile
 * `order.customer_id` arasında bir kısıt YOKTUR (olsaydı personelin elle açtığı talep de bozulurdu).
 * Kontrol edilmeseydi müşteri başkasının sipariş numarasını, ürünlerini ve iade tutarını kendi
 * talebi üzerinden okurdu — üstelik operatör de yanlış siparişte iade başlatırdı.
 *
 * "Yok" ile "senin değil" AYNI cevabı verir (`null`): olmayan bir siparişin varlığı doğrulanmaz.
 */
async function resolveOwnOrder(db: SupabaseClient, customerId: string, lookup: CustomerOrderLookup): Promise<Order | null> {
  const service = new OrderService(db);
  if ('orderId' in lookup) {
    const order = await service.getById(lookup.orderId);
    return order && order.customerId === customerId ? order : null;
  }
  // Referansla okuma sahipliği SORGUYA gömüyor (`findByReference(reference, customerId)`) — mobil
  // siparişi numarayla adresliyor ve numara tahmin edilebilir bir dizedir.
  return service.findByReference(lookup.reference, customerId);
}

/**
 * Müşterinin talep açması. Talep ve ilk mesaj **tek turda** yazılır (`create_ticket`) — açan kişinin
 * ne dediği bilinmeyen bir talep kuyruğa düşmemeli.
 *
 * ── KONTROL SIRASI WEB'DEN FARKLI, GEREKÇESİYLE ─────────────────────────────
 * Web `checkTicketDraft`i ilk çalıştırıyor çünkü elinde zaten `orderId` vardı. Burada sipariş bir
 * REFERANSTAN çözülebiliyor, yani taslak kontrolü bir DB turunun ardına düşerdi. Sıra bu yüzden
 * "ucuzdan pahalıya" kuruldu: DB'ye hiç gitmeden reddedilebilen her şey önce reddedilir. Kural
 * kümesi değişmedi, yalnız sırası.
 */
export async function openCustomerTicket(
  db: SupabaseClient,
  input: {
    customerId: string;
    /** Geliş yolu — çağıran yüzey söyler (`form` web/mobil formu, `whatsapp` köprü). */
    source: Ticket['source'];
    type: TicketType;
    /** Müşterinin anlatımı — talebin ilk mesajı. Boş olamaz: anlatımsız talep, çözülemeyen taleptir. */
    body: string;
    /** Siparişe bağlanıyorsa kimliği YA DA numarası; genel talepte verilmez. */
    order?: CustomerOrderLookup | null;
    orderItemIds?: readonly string[];
    subject?: string | null;
    attachments?: readonly string[];
  },
  effects?: TicketEffects,
): Promise<OpenCustomerTicketOutcome> {
  const body = input.body.trim();
  if (body.length === 0) return { status: 'empty_body' };

  const itemIds = input.orderItemIds ?? [];
  // Sipariş verilmeden kalem işaretlenemez — motorun kuralı, ama DB turundan ÖNCE sorulabiliyor.
  if (itemIds.length > 0 && !input.order) return { status: 'items_without_order' };

  // Yeni talebin henüz kimliği yok: ekler ancak müşterinin kendi TASLAK klasöründen gelebilir.
  if (!attachmentsBelongTo(input.attachments, { customerId: input.customerId })) {
    return { status: 'attachment_not_yours' };
  }

  const order = input.order ? await resolveOwnOrder(db, input.customerId, input.order) : null;
  if (input.order && !order) return { status: 'order_unavailable' };

  const draft = checkTicketDraft({ source: input.source, orderId: order?.id, orderItemIds: itemIds });
  if (!draft.ok) return { status: draft.reason };

  if (order && itemIds.length > 0) {
    // Uydurma kalem kimlikleri BURADA elenir: sessizce yutulsalardı müşteri işaretlediği kalemi
    // ekranda göremez, sebebini de öğrenemezdi.
    const own = new Set((await new OrderItemService(db).listByOrder(order.id)).map((item) => item.id));
    if (!itemIds.every((id) => own.has(id))) return { status: 'order_unavailable' };
  }

  const ticket = await new TicketService(db).createWithMessage({
    customerId: input.customerId,
    source: input.source,
    type: input.type,
    body,
    orderId: order?.id ?? null,
    orderItemIds: [...itemIds],
    subject: input.subject ?? null,
    attachments: input.attachments ? [...input.attachments] : undefined,
    sender: 'customer',
  });

  // Teyit maili talep KAYDEDİLDİKTEN SONRA ve beklenerek: beklemezsek çağıran süreç (server action /
  // Hono isteği) mail gitmeden sonlanabilir. Etki kendi içinde sessiz — hata yukarı çıkmaz.
  await runEffect('notifyReceived', ticket.id, effects?.notifyReceived && (() => effects.notifyReceived!(ticket)));
  return { status: 'ok', ticket };
}

/**
 * Müşterinin cevabı. **Kapanmış talep kendiliğinden yeniden açılır** (motorun kararı): "yeniden aç"
 * ile "yaz" ayrı iki düğme olsaydı müşteri yazar, düğmeye basmayı unutur ve mesajı kimsenin
 * bakmadığı kapalı bir talebin içinde kalırdı.
 *
 * **Cevap GÜNCEL GÖRÜNÜMÜ döndürür** (adres kapılarının "cevap hep güncel liste" kararı): tek bir
 * yazım komşu gerçekleri de oynatıyor — durum `resolved`dan `open`a dönebilir, `lastMessageAt`
 * kayar. Yalnız yeni mesajı dönmek, ekranı kendi durumunu TAHMİN etmeye zorlardı; tahmin de bir gün
 * sunucudan ayrışır. Bildirim YOKTUR ve bilinçli: kimse kendi cümlesini mailde okumak istemez —
 * haber karşı taraf konuştuğunda gider (16.4).
 */
export async function replyToCustomerTicket(
  db: SupabaseClient,
  input: {
    customerId: string;
    ticketId: string;
    body: string;
    locale: PreferredLanguage;
    attachments?: readonly string[];
  },
): Promise<ReplyToTicketOutcome> {
  const body = input.body.trim();
  if (body.length === 0) return { status: 'empty_body' };

  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  // Başkasının talebine yazılamaz — ve "yok" ile "senin değil" ekrana aynı cümleyi kurar.
  if (!ticket || ticket.customerId !== input.customerId) return { status: 'ticket_not_found' };
  if (!attachmentsBelongTo(input.attachments, { customerId: input.customerId, ticketId: ticket.id })) {
    return { status: 'attachment_not_yours' };
  }

  await service.reply({
    ticketId: ticket.id,
    sender: 'customer',
    body,
    attachments: input.attachments ? [...input.attachments] : undefined,
    newStatus: statusAfterCustomerReply(ticket.status),
  });

  const view = await getCustomerTicket(db, { customerId: input.customerId, ticketId: ticket.id, locale: input.locale });
  // Az önce yazdığımız talebi okuyamıyorsak ortada bir arıza vardır; "bulunamadı" demek doğru cevap
  // değil ama uydurma bir görünüm döndürmek daha kötüsü olurdu.
  return view ? { status: 'ok', ticket: view } : { status: 'ticket_not_found' };
}
