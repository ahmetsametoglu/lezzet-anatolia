import type { TicketStatus, TicketType } from '@lezzet/types';
import { readableCode } from '../order/reference-no';

/**
 * Talep durum makinesi ve kapıları (16.1) — DOMAIN §15.
 *
 * **Karmaşık ticket mekaniği yok.** Üç durum, iki aktör. Sipariş makinesinden ayrı bir dosyada
 * durur çünkü ayrı bir gerçeği anlatır: sipariş bir malın yolculuğu, talep bir konuşmanın hâli.
 *
 * Burada yalnız "olur mu" sorusu cevaplanır. Geçişin neyi tetiklediği (e-posta, iade akışı,
 * damga) uygulama katmanının işidir — motor karar verir, uygulama uygular (STACK §4).
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
 * Geçiş izinli mi. İzinsiz geçiş bir HATA DEĞERİDİR, fırlatma değil — çağıran `{data, error}`
 * sözleşmesine çevirir (STACK §8).
 *
 * `forbidden_for_actor` ile `not_allowed` ayrı sebeplerdir: birincisi "bu geçiş var ama sen
 * yapamazsın", ikincisi "böyle bir geçiş yok". Ekran ikisine aynı cümleyi kurmaz.
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
 * Müşteri kapanmış bir talebe yazarsa talep **kendiliğinden yeniden açılır**.
 *
 * "Yeniden aç" ile "yaz" ayrı iki düğme olsaydı müşteri yazar, düğmeye basmayı unutur ve mesajı
 * kapalı bir talebin içinde kimsenin görmediği yerde kalırdı. Açık talepte durum DEĞİŞMEZ:
 * personel "işlemde" işaretlediyse müşterinin yeni cümlesi onu başa sarmamalı.
 *
 * `null` = durum değişmez.
 */
export function statusAfterCustomerReply(current: TicketStatus): TicketStatus | null {
  return current === 'resolved' ? 'open' : null;
}

/**
 * Personelin cevabı durumu **kendiliğinden değiştirmez** (`null`).
 *
 * Tasarım durum değiştirmeyi ayrı bir aksiyon olarak sunuyor; cevap yazmayı sessizce "işlemde"ye
 * çevirmek, operatörün vermediği bir kararı onun adına kaydetmek olurdu. Fonksiyon yine de var:
 * kuralın "yok" olduğu, çağıranın her ihtimale karşı kendi varsayımını kurmasından iyidir.
 */
export function statusAfterStaffReply(_current: TicketStatus): TicketStatus | null {
  return null;
}

export type ReturnTriggerCheck = { allowed: true } | { allowed: false; reason: 'no_order' | 'already_triggered' };

/**
 * Bu talepten iade akışı başlatılabilir mi.
 *
 * **Tip kısıtlanmaz** — `question` bir talebin içinden de haklı bir iade çıkabilir; müşteri
 * sorununu her zaman doğru kutuya koymaz. Kısıt yalnız fiziksel gerçekten gelir: iade edilecek bir
 * sipariş yoksa tetiklenecek bir akış da yoktur.
 *
 * İkinci tetik engellenir: iade siparişte yaşar ve oradan yürür; talepten ikinci kez başlatmak,
 * aynı iade için iki ayrı akış açmak olurdu (DOMAIN §8).
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
 * Şikâyet fotoğrafı olarak kabul edilen dosya türleri (16.2).
 *
 * **Yalnız görsel.** Talep eki bir kanıttır: "bozuk geldi"nin fotoğrafı. PDF, arşiv ya da ofis
 * dosyası bu işi görmez — ama private kovaya her şeyin yüklenebilmesi, kovayı bir dosya paylaşım
 * alanına çevirir. Kural motorda, çünkü "neyi kanıt sayarız" bir iş kararıdır, depo ayarı değil.
 *
 * HEIC var: iPhone varsayılanı, ve müşteri dönüştürmekle uğraşmaz.
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
 * Ek dosyanın anahtarındaki tek kullanımlık kimlik.
 *
 * Aynı talebe birden çok fotoğraf eklenebilir ve hiçbiri diğerinin üzerine yazmamalı — bozuk ürünün
 * ikinci açısı, birincisinin yerine geçmez. Üreteç kriptografiktir (`readableCode` varsayılanı):
 * tahmin edilebilir bir anahtar, imzalı adresi isteyebilen birine komşu fotoğrafı verirdi.
 */
export function attachmentToken(random?: () => number): string {
  return readableCode(12, random);
}
