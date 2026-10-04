import type { TicketStatus, TicketType } from '@lezzet/types';
import { readableCode } from '../order/reference-no';

/**
 * Talep durum makinesi (DOMAIN §15): üç durum, iki aktör; sipariş makinesinden ayrıdır, çünkü sipariş bir malın yolculuğu, talep bir
 * konuşmanın hâlidir. Burada yalnız "olur mu" cevaplanır, geçişin tetiklediği iş uygulama katmanınındır.
 */

/** Talebi kim ilerletiyor. Müşteri ile personelin yetkisi aynı değildir. */
export type TicketActor = 'customer' | 'staff';

/**
 * Personelin yapabileceği geçişler. `open → resolved` doğrudan izinlidir: tek cevapla kapanan
 * soru için araya "işlemde" adımı koymak, gerçekte olmayan bir aşamayı kayda geçirmek olurdu.
 */
const STAFF_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['in_progress', 'resolved'],
  in_progress: ['resolved', 'open'],
  // Kapanmış talep yeniden açılabilir — müşteri çözümden memnun kalmamış olabilir.
  resolved: ['open'],
};

/**
 * Müşterinin yapabileceği tek geçiş: **kapanmış talebi yeniden açmak.**
 *
 * Müşteri kendi talebini "işlemde" ya da "çözüldü" yapamaz ve bu bilinçli: durum bizim iş
 * kuyruğumuzun hâlidir, müşterinin memnuniyetinin değil. Müşteri memnun olmadığını söyler
 * (`open`), çözüldüğünü biz söyleriz.
 */
const CUSTOMER_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: [],
  in_progress: [],
  resolved: ['open'],
};

export type TicketTransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'same_status' | 'not_allowed' | 'forbidden_for_actor' };

/**
 * Geçiş izinli mi; izinsiz geçiş fırlatma değil hata değeridir (STACK §8). `forbidden_for_actor` "geçiş var ama sen yapamazsın",
 * `not_allowed` "böyle bir geçiş yok" demektir ve ekran ikisine aynı cümleyi kurmaz.
 */
export function canTransitionTicket(from: TicketStatus, to: TicketStatus, by: TicketActor): TicketTransitionCheck {
  if (from === to) return { allowed: false, reason: 'same_status' };
  const forActor = by === 'staff' ? STAFF_TRANSITIONS : CUSTOMER_TRANSITIONS;
  if (forActor[from].includes(to)) return { allowed: true };
  // Geçişin kendisi var ama bu aktöre kapalıysa sebep ayrışır.
  const existsForAnyone = STAFF_TRANSITIONS[from].includes(to) || CUSTOMER_TRANSITIONS[from].includes(to);
  return { allowed: false, reason: existsForAnyone ? 'forbidden_for_actor' : 'not_allowed' };
}

/** Ekranın sunacağı geçişler — yasak olan hiç gösterilmez. */
export function allowedTicketTransitions(from: TicketStatus, by: TicketActor): readonly TicketStatus[] {
  return by === 'staff' ? STAFF_TRANSITIONS[from] : CUSTOMER_TRANSITIONS[from];
}

/**
 * Müşteri kapanmış talebe yazarsa talep kendiliğinden yeniden açılır, yoksa mesaj kimsenin görmediği kapalı talepte kalırdı. Açık talepte
 * durum değişmez (`null`), ki müşterinin yeni cümlesi "işlemde"yi başa sarmasın.
 */
export function statusAfterCustomerReply(current: TicketStatus): TicketStatus | null {
  return current === 'resolved' ? 'open' : null;
}

/**
 * İşletmenin ilk cevabı açık talebi `in_progress`e geçirir, ki müşteri cevabın yanında "alındı, sırada" görmesin. Öteki durumlarda cevap
 * durumu değiştirmez; operatör durumu yine ayrı eylemle değiştirir.
 */
export function statusAfterStaffReply(current: TicketStatus): TicketStatus | null {
  return current === 'open' ? 'in_progress' : null;
}

export type ReturnTriggerCheck = { allowed: true } | { allowed: false; reason: 'no_order' | 'already_triggered' };

/**
 * Bu talepten iade akışı başlatılabilir mi: tür kısıtlanmaz, çünkü müşteri sorununu her zaman doğru kutuya koymaz; kısıt siparişin
 * varlığıdır. İkinci tetik engellenir, çünkü aynı iade için iki akış açılırdı (DOMAIN §8).
 */
export function canTriggerReturn(ticket: { orderId: string | null; returnTriggeredAt: string | null }): ReturnTriggerCheck {
  if (!ticket.orderId) return { allowed: false, reason: 'no_order' };
  if (ticket.returnTriggeredAt) return { allowed: false, reason: 'already_triggered' };
  return { allowed: true };
}

/**
 * Talep açılışının tutarlılığı — formun ve API'nin aynı kuralı.
 *
 * DB de bunu zorlar (`ticket_items_need_order`, `ticket_source_link`); burada olması tekrar değil,
 * **kullanıcıya sebebini söyleyebilmek** içindir: veritabanı kısıtı ihlal edildiğinde eline geçen
 * şey bir constraint adıdır, müşteriye gösterilecek bir cümle değil.
 */
export type TicketDraftCheck = { ok: true } | { ok: false; reason: 'items_without_order' | 'whatsapp_without_conversation' | 'order_source_without_order' };

export function checkTicketDraft(draft: {
  source: 'order' | 'form' | 'whatsapp' | 'admin';
  orderId?: string | null;
  orderItemIds?: readonly string[];
  conversationId?: string | null;
}): TicketDraftCheck {
  if ((draft.orderItemIds?.length ?? 0) > 0 && !draft.orderId) return { ok: false, reason: 'items_without_order' };
  if (draft.source === 'whatsapp' && !draft.conversationId) return { ok: false, reason: 'whatsapp_without_conversation' };
  if (draft.source === 'order' && !draft.orderId) return { ok: false, reason: 'order_source_without_order' };
  return { ok: true };
}

/**
 * İade kararına giden tipler — kuyruğun "bu iş para işi" ayrımı.
 *
 * Bir YASAK değil bir İŞARET'tir (`canTriggerReturn` tipe bakmaz): operasyon ekranı bunları öne
 * alır, çünkü bozuk ve eksik bekledikçe müşteri parasını bekliyor demektir.
 */
export const RETURN_BOUND_TYPES: readonly TicketType[] = ['damaged', 'missing'];

export function isReturnBound(type: TicketType): boolean {
  return RETURN_BOUND_TYPES.includes(type);
}

/**
 * Şikâyet fotoğrafı olarak yalnız görsel kabul edilir, çünkü ek bir kanıttır ve her şeyin yüklenebilmesi kovayı dosya paylaşım alanına
 * çevirirdi. HEIC iPhone'un varsayılanıdır, müşteri dönüştürmekle uğraşmaz.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

/** Talep başına ek sayısı tavanı — birkaç açı yeterlidir; sınırsız yükleme kovayı doldurur. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export type AttachmentCheck = { ok: true; extension: string } | { ok: false; reason: 'unsupported_type' | 'too_many' };

export function checkAttachment(filename: string, alreadyRequested = 0): AttachmentCheck {
  if (alreadyRequested >= MAX_ATTACHMENTS_PER_MESSAGE) return { ok: false, reason: 'too_many' };

  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension)) return { ok: false, reason: 'unsupported_type' };
  return { ok: true, extension };
}

/**
 * Ek dosyanın anahtarındaki tek kullanımlık kimlik, ki aynı talebin fotoğrafları birbirinin üzerine yazmasın. Üreteç kriptografiktir,
 * çünkü tahmin edilebilir anahtar imzalı adres isteyebilen birine komşu fotoğrafı verirdi.
 */
export function attachmentToken(random?: () => number): string {
  return readableCode(12, random);
}
