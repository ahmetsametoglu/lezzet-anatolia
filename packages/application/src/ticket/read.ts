import { MoneyMovementService, TicketMessageService, TicketQueueService } from '@lezzet/database';
import { resolveUserText } from '@lezzet/domain-core';
import { privateReadUrls } from '@lezzet/storage';
import type { KeysetCursor, Page, PreferredLanguage, TicketMessage, TicketQueueRow } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clearTicketReplyMail } from './reply-mail';
import type {
  CustomerTicketSummary,
  CustomerTicketView,
  TicketMessageView,
  TicketReturnOutcome,
} from './ticket-types';

/*
  MÜŞTERİ TALEP OKUMASI — terfi 21.14. Kaynağı `apps/web/lib/ticket/read.ts`in müşteri yarısıdır;
  gerekçe ve köprü notu `ticket-types.ts` başlığında.

  ── SAHİPLİK İMZADA DURUR ───────────────────────────────────────────────────
  Her okuma `customerId`'yi ZORUNLU parametre olarak alır, süzgeç olarak değil: unutulabilen bir
  süzgeç, bir gün başkasının talebini açan bir ekran demektir. Ve başkasının talebi `null` döner,
  hata değil — "bu talep var ama senin değil" demek, olmayan bir kaydın varlığını doğrulamaktır.

  ── TEK KAYNAK: `ticket_queue` GÖRÜNÜMÜ ─────────────────────────────────────
  Hem liste hem DETAY ham `ticket` satırından değil kuyruk görünümünden okur. İki sebep:
  (a) ekranın istediği iki bağlam — "son mesaj: bugün" ve sipariş numarası — yalnız orada
      türetilmiş hâlde duruyor; ham satırdan okumak talep başına iki ek tur (N+1) olurdu. Web'in
      detay kapısı siparişi ayrıca okuyordu; terfide düşen bir tur.
  (b) liste ile detay AYNI satırı okuduğu için `lastMessageAt` ikisinde ayrışamaz — iki ayrı
      kaynaktan okusaydık liste "bugün" derken detay dünü gösterebilirdi.

  ── SIRA SON MESAJA GÖRE ────────────────────────────────────────────────────
  Az önce cevaplanan talep başa çıkar. Açılış tarihine göre sıralasaydık, cevap bekleyen taze talep
  eski bir kaydın altında kalırdı. Bu yüzden `lastMessageAt` sözleşmeye de giriyor: sıralama
  ölçütünü GÖSTERMEYEN bir liste, kullanıcıya rastgele sıralı görünür.
*/

/**
 * İadenin sonucu — **siparişin para hareketlerinden türetilir**, talepte saklanmaz (DOMAIN §8).
 *
 * Tetik damgası yoksa hiç bakılmaz: talepten doğmamış bir iade bu talebin ekranında görünmemeli.
 */
async function returnOutcomeOf(
  db: SupabaseClient,
  ticket: { returnTriggeredAt: string | null; orderId: string | null },
): Promise<TicketReturnOutcome | null> {
  if (!ticket.returnTriggeredAt || !ticket.orderId) return null;
  const movements = await new MoneyMovementService(db).listByOrder(ticket.orderId);
  // Servis cent döndürüyor (02.9); para alanı `…Cents` ile biter — elle çarpan yazılmaz.
  const refunded = movements.filter((m) => m.type === 'order_refund').reduce((sum, m) => sum + m.amountCents, 0);
  return { triggeredAt: ticket.returnTriggeredAt, refundedCents: refunded };
}

/**
 * Mesajı ekranın gördüğü hâle çevirir — metin **okuyucunun diline**, ekler **süreli imzalı adrese**.
 *
 * Şikâyet fotoğrafı private kovada durur ve public adresi yoktur; adres burada, yani yetkinin
 * doğrulandığı yerin içinde üretilir. Anahtarın kendisi dışarı çıkmaz: ekranın anahtarla
 * yapabileceği bir şey yok, ama sızan bir anahtar ileride açılacak her kapının önünde durur.
 *
 * Bir talebin mesajları BİRLİKTE imzalanır (`Promise.all`) — mesaj başına sıra beklemek, on
 * mesajlık bir yazışmayı on tur uzatırdı.
 *
 * `viewLanguage` varsayılansız ve bilerek: varsayılan koysaydık dilini vermeyi unutan bir ekran
 * herkese aynı dili gösterir ve bu hiçbir yerde hata vermezdi.
 */
async function toMessageView(message: TicketMessage, viewLanguage: PreferredLanguage): Promise<TicketMessageView> {
  const shown = resolveUserText(
    { text: message.body, language: message.language, translations: message.translations },
    viewLanguage,
  );
  return {
    id: message.id,
    sender: message.sender,
    // Motor boş metinde `null` döner; mesaj gövdesi boş olamaz (`min(1)`) ama tip yalan söylemesin.
    body: shown.text ?? message.body,
    bodyTranslated: shown.isTranslated,
    language: message.language,
    originalBody: message.body,
    attachmentUrls: await privateReadUrls(message.attachments),
    createdAt: message.createdAt,
  };
}

/**
 * Kuyruk satırı → liste satırı.
 *
 * Görünümün personel alanları (`customerName`, `handledBy`, `lastMessageBody`, `answeredByAi`)
 * BURADA DÜŞER — müşteri tipine hiç girmezler. Sızıntı riski taşımayanları bile taşımıyoruz: bir
 * gün eklenecek gerçek bir iç alanın önündeki tek engel bu ayrımın kendisi.
 */
function toSummary(row: TicketQueueRow): CustomerTicketSummary {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    subject: row.subject,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
    orderReferenceNo: row.orderReferenceNo,
  };
}

/**
 * Müşterinin "Taleplerim" listesi — keyset sayfalı (talep sayısı veriyle sınırsız büyür, CLAUDE §1).
 */
export async function listCustomerTickets(
  db: SupabaseClient,
  input: { customerId: string; cursor?: KeysetCursor; limit?: number },
): Promise<Page<CustomerTicketSummary>> {
  const page = await new TicketQueueService(db).list({ customerId: input.customerId }, input.cursor, input.limit);
  return { rows: page.rows.map(toSummary), nextCursor: page.nextCursor };
}

/**
 * Müşterinin tek talebi — yazışma ve iade sonucuyla; sayfanın tamamı tek çağrıda.
 *
 * Bulunamayan ve BAŞKASINA AİT talep aynı cevabı alır (`null`): ekran için ikisi de aynı şey — yok.
 */
export async function getCustomerTicket(
  db: SupabaseClient,
  input: { customerId: string; ticketId: string; locale: PreferredLanguage },
): Promise<CustomerTicketView | null> {
  const row = await new TicketQueueService(db).getRow(input.ticketId);
  if (!row || row.customerId !== input.customerId) return null;

  const [messages, returnOutcome] = await Promise.all([
    new TicketMessageService(db).listByTicket(row.id),
    returnOutcomeOf(db, row),
    /* OKUMA, BEKLEYEN CEVAP MAİLİNİ İPTAL EDER (17.08 — künyesi `reply-mail.ts`de). Yeri BURASI
       çünkü iki yüzeyin de müşteri talep detayı bu kapıdan geçiyor (native uygulama + web), ve
       zilin tetiklediği sessiz tazeleme de öyle: ekranı açık duran müşteri her zilde okumuş
       sayılır, mail hiç gitmez. Sonucu beklenmiyor ve fırlatmıyor — okuma yazmaya bağlanamaz. */
    clearTicketReplyMail(db, row.id),
  ]);

  return {
    ...toSummary(row),
    // Müşteri yazışmayı KENDİ dilinde okur: personelin Türkçe cevabı burada çevrilir (20.2).
    messages: await Promise.all(messages.map((m) => toMessageView(m, input.locale))),
    returnOutcome,
  };
}
