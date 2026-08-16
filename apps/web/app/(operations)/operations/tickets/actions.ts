'use server';

import { revalidatePath } from 'next/cache';
import { generateTicketDraft } from '@lezzet/application';
import { OrderService, serviceDb } from '@lezzet/database';
import {
  DEFAULT_PAGE_SIZE,
  ORDER_STATUS_LABELS,
  TicketHandlerEnum,
  TicketStatusEnum,
  type KeysetCursor,
  type Page,
  type TicketHandler,
  type TicketStatus,
} from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { searchCustomerOptions, type CustomerOption } from '@/lib/customer-options';
import { shortDate } from '@/components/operation/ui/format';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { listTicketQueue } from '@/lib/ticket/read';
import {
  changeTicketStatus,
  consumeTicketDraft,
  openTicket,
  replyAsStaff,
  setTicketMode,
  takeOverTicket,
  triggerReturnFromTicket,
} from '@/lib/ticket/write';
import { toRowViews, toTicketFilter } from './tickets-read';
import { ManualTicketSchema, TICKET_ORDER_OPTION_LIMIT, type TicketOrderOption, type TicketRowView } from './tickets-types';
import { parseTicketsUrl, TICKETS_PATH } from './tickets-url';

// Talepler ekranının yazma kapıları (16.3) — guard ilk, servise devret, `{ data, error }` DÖNER.
//
// **Hepsi `requireAdmin`.** Ekran yalnız yöneticiye açık (`admin-talepler.md §6`) ve kapı burada
// durur: düğmeyi çizmemek bir güvence değildir, action doğrudan da çağrılabilir.
//
// **İş kuralı burada YOK.** Hangi geçişin geçerli olduğunu, iadenin tetiklenip tetiklenemeyeceğini,
// cevabın durumu değiştirip değiştirmediğini `lib/ticket/write` kapıları motora sorarak biliyor
// (STACK §4). Buradaki tek çeviri, kapının `{ ok:false, reason }` sözleşmesini ekranın
// `{ data, error }` sözleşmesine döndürmek.

/**
 * Kapı reddinin OPERATÖRE söylenecek hâli.
 *
 * Ham `reason` bir anahtardır ("not_found") ve ekranda gösterilirse operatör ne yapacağını
 * bilemez. Tanınmayan anahtar için elde ne varsa o gösterilir — yeni bir sebep eklendiğinde
 * ekranın sessizce boş bir uyarı vermesindense ham anahtarı görmesi yeğdir.
 */
const REJECTION: Record<string, string> = {
  not_found: 'Talep bulunamadı — bu sırada silinmiş olabilir. Ekranı tazeleyin.',
  empty_body: 'Boş cevap gönderilemez.',
  already_human: 'Bu talebi zaten bir insan yürütüyor.',
  no_order: 'Bu talep bir siparişe bağlı değil; iade akışı başlatılamaz.',
  already_triggered: 'İade bu talepten zaten başlatılmıştı.',
  order_not_found: 'Seçilen sipariş bulunamadı.',
  items_not_in_order: 'İşaretlenen kalemler bu siparişe ait değil.',
  attachment_not_yours: 'Ek dosya bu talebe ait değil.',
  invalid_transition: 'Bu durum değişikliği bu talepte yapılamaz — ekranı tazeleyin.',
  already_in_mode: 'Talep zaten bu modda — bir başkası az önce değiştirmiş olabilir, ekranı tazeleyin.',
  no_draft: 'Bekleyen AI taslağı yok — bu sırada tüketilmiş olabilir. Ekranı tazeleyin.',
};

const readable = (reason: string): string => REJECTION[reason] ?? reason;

/** Kuyruk ve detay aynı adreste yaşıyor — her yazımdan sonra ikisi birden tazelenir. */
function refresh(): void {
  revalidatePath(TICKETS_PATH);
}

/**
 * Personelin cevabı. **Durumu kendiliğinden değiştirmez** — kararı kapı verir (`statusAfterStaffReply`);
 * ekran yalnız yazdığını gönderir.
 *
 * Müşteriye e-posta bildirimi kapının içinde gider (16.4) ve düşerse cevabı geri almaz.
 */
export async function replyToTicketAction(ticketId: string, body: string): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAdmin();
    const result = await replyAsStaff({ ticketId, authorId: actor.profileId, body });
    if (!result.ok) return { data: null, error: readable(result.reason) };
    refresh();
    return { data: { id: result.data.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Durum değişimi. Hedef enum'dan DOĞRULANIR: ekran yalnız izinli geçişleri sunuyor ama action
 * doğrudan çağrılabilir ve "resolvedd" gibi bir dizge servise kadar gitmemeli.
 */
export async function changeTicketStatusAction(ticketId: string, to: TicketStatus): Promise<ActionResult<{ status: TicketStatus }>> {
  try {
    await requireAdmin();
    const target = TicketStatusEnum.parse(to);
    const result = await changeTicketStatus({ ticketId, to: target, by: 'staff' });
    if (!result.ok) return { data: null, error: readable(result.reason) };
    refresh();
    return { data: { status: result.data.status }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** AI'dan devralma (16.5'in ucu) — `ai`'dan da `hybrid`'den de insana indirir, bekleyen taslağı düşürür. */
export async function takeOverTicketAction(ticketId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const result = await takeOverTicket(ticketId);
    if (!result.ok) return { data: null, error: readable(result.reason) };
    refresh();
    return { data: { id: result.data.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Yürütücü modu (kullanıcı kararı 16.08): human · hybrid · ai. Hedef enum'dan DOĞRULANIR — action
 * doğrudan çağrılabilir ve uydurma bir dizge servise kadar gitmemeli (`changeTicketStatusAction`
 * ile aynı gerekçe).
 */
export async function setTicketModeAction(ticketId: string, mode: TicketHandler): Promise<ActionResult<{ mode: TicketHandler }>> {
  try {
    await requireAdmin();
    const target = TicketHandlerEnum.parse(mode);
    const result = await setTicketMode(ticketId, target);
    if (!result.ok) return { data: null, error: readable(result.reason) };
    refresh();
    return { data: { mode: result.data.handledBy }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** AI üretim sonucunun operatöre söylenecek hâli — başarı `null` döndürür (hata yok). */
const DRAFT_FAILURE: Record<string, string> = {
  not_configured: 'AI yapılandırılmamış — env dosyasına sağlayıcı anahtarı (AI_PROVIDER + API anahtarı) eklenmeli.',
  provider_error: 'AI sağlayıcısına ulaşılamadı — birazdan yeniden deneyin.',
  invalid_output: 'AI beklenen biçimde cevap üretemedi — yeniden deneyin; sürerse bildirin.',
  wrong_mode: 'Taslak yalnız hibrit modda üretilir — önce modu Hibrit yapın.',
  nothing_to_answer: 'Cevaplanacak yeni müşteri mesajı yok — son sözü zaten biz söylemişiz.',
  empty_thread: 'Bu talepte hiç mesaj yok — taslak üretilecek bir soru yok.',
  not_found: 'Talep bulunamadı — ekranı tazeleyin.',
};

/**
 * **Taslak öner** (20.4): hibrit talepte AI taslağını İSTEK üzerine üretir — cron'u beklemeden.
 * `force`: operatör düğmeye bastıysa sebep ondadır; önbellek kuralı ezilir, model çağrılır.
 */
export async function suggestTicketDraftAction(ticketId: string): Promise<ActionResult<{ generated: true }>> {
  try {
    await requireAdmin();
    const outcome = await generateTicketDraft(serviceDb(), ticketId, { force: true });
    if (outcome.status === 'skipped' || outcome.status === 'failed') {
      return { data: null, error: DRAFT_FAILURE[outcome.reason] ?? outcome.reason };
    }
    refresh();
    return { data: { generated: true }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Hibrit taslağı tüket (16.08) — iki çıkışın tek kapısı: `send=true` taslak olduğu gibi personel
 * cevabı olur (gönderen `admin`, AI değil — 20-yapay-zeka §75); `send=false` taslak satırdan düşer
 * ve dönen metni ekran cevap kutusuna taşır.
 */
export async function consumeTicketDraftAction(ticketId: string, send: boolean): Promise<ActionResult<{ draft: string }>> {
  try {
    const actor = await requireAdmin();
    const result = await consumeTicketDraft({ ticketId, authorId: actor.profileId, send });
    if (!result.ok) return { data: null, error: readable(result.reason) };
    refresh();
    return { data: { draft: result.data.draft }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * İade akışını bu talepten başlat — **yalnız damga** (DOMAIN §8). Para ve stok siparişte hareket
 * eder.
 *
 * Dönen `orderId` ekranın operatörü oraya götürmesi için: damga tek başına hiçbir şey bitirmiyor
 * ve operatörü damgayla baş başa bırakmak, iadenin yarım kalmasının en kolay yolu olurdu.
 */
export async function triggerReturnAction(ticketId: string): Promise<ActionResult<{ orderId: string }>> {
  try {
    await requireAdmin();
    const result = await triggerReturnFromTicket(ticketId);
    if (!result.ok) return { data: null, error: readable(result.reason) };
    refresh();
    // `canTriggerReturn` siparişsiz talebi zaten eledi; tip daraltması için yine de kontrol edilir.
    const orderId = result.data.orderId;
    if (!orderId) return { data: null, error: readable('no_order') };
    return { data: { orderId }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Elle talep açma — WhatsApp/telefon konuşmasından (`admin-talepler.md §3`).
 *
 * `source: 'admin'` ve `authorId` operatörün kendisi: ikisi birlikte ilk sözü operatörün söylediği
 * anlamına geliyor (`openTicket`) ve müşteriye "bize yazdıklarınız" başlıklı bir teyit maili
 * GİTMİYOR — müşteri kendi yazmadığı bir metni okumamalı (16.4 kararı).
 */
export async function openManualTicketAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAdmin();
    const parsed = ManualTicketSchema.parse(input);
    const result = await openTicket({
      customerId: parsed.customerId,
      source: 'admin',
      type: parsed.type,
      body: parsed.body,
      orderId: parsed.orderId ?? null,
      subject: parsed.subject || null,
      authorId: actor.profileId,
    });
    if (!result.ok) return { data: null, error: readable(result.reason) };
    refresh();
    return { data: { id: result.data.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Kuyruğun SONRAKİ sayfası. Süzgeç ADRESTEN okunur, istemciden gelen bir nesneden değil: devam eden
 * sayfa ilk sayfayla aynı ölçüte uymalı ve o ölçüt tek yerde (`tickets-url`) tanımlı.
 */
export async function loadMoreTicketsAction(
  search: string,
  cursor: KeysetCursor,
): Promise<ActionResult<Page<TicketRowView>>> {
  try {
    await requireAdmin();
    const urlState = parseTicketsUrl(Object.fromEntries(new URLSearchParams(search)));
    const page = await listTicketQueue(OPERATIONS_LOCALE, toTicketFilter(urlState.f), cursor, DEFAULT_PAGE_SIZE);
    return { data: { rows: toRowViews(page.rows, Date.now()), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Elle talep penceresinin müşteri seçicisi — satırın biçimi ORTAK (`lib/customer-options`). */
export async function searchTicketCustomersAction(term: string): Promise<ActionResult<CustomerOption[]>> {
  try {
    await requireAdmin();
    return { data: await searchCustomerOptions(term), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Seçilen müşterinin siparişleri — elle talep penceresinin ikinci seçicisi.
 *
 * Sınır KAPIDA (`TICKET_ORDER_OPTION_LIMIT`) ve GÖRÜNÜR: sınıra dayanıldığında pencere bunu
 * yazıyor — sessizce kesilen bir liste "bu müşterinin başka siparişi yok" diye okunurdu.
 */
export async function listCustomerOrdersAction(customerId: string): Promise<ActionResult<TicketOrderOption[]>> {
  try {
    await requireAdmin();
    const page = await new OrderService(serviceDb()).listByCustomer(customerId, { limit: TICKET_ORDER_OPTION_LIMIT });
    return {
      data: page.rows.map((order) => ({
        id: order.id,
        // Numara henüz üretilmemiş olabilir (taslak/yeni sipariş); kimliğin başı yine de tanıtır.
        label: order.referenceNo ?? `#${order.id.slice(0, 8)}`,
        hint: [shortDate(order.deliveryDate), ORDER_STATUS_LABELS[order.status]].filter(Boolean).join(' · '),
      })),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
