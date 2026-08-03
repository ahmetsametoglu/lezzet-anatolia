'use server';

import { revalidatePath } from 'next/cache';
import type { KeysetCursor, Page } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { listCustomerTickets, getCustomerTicket } from '@/lib/ticket/read';
import { requestTicketUploadUrl } from '@/lib/ticket/attachments';
import { openTicket, replyAsCustomer } from '@/lib/ticket/write';
import type { TicketType } from '@lezzet/types';
import type { CustomerTicketSummary, CustomerTicketView } from '@/lib/ticket/ticket-types';

/**
 * Talep sayfasının kapıları (08.6).
 *
 * **Kimlik her eylemde SUNUCUDA çözülür** (`currentCustomerId`) ve sahiplik `lib/ticket`'ın
 * imzasında duruyor — talep kimliği istemciden geliyor, o yüzden "senin mi" sorusunu kapı soruyor
 * ve "yok" ile "senin değil" aynı cevabı veriyor.
 *
 * **Hata kapısı müşteriye ait** (`customerErrorKey`, denetim H1/H2 · 03.08): dönen şey metin değil
 * ANAHTAR, metin ekranın sözlüğünde. `lib/ticket`'ın ret sebepleri burada müşteri anahtarına
 * ÇEVRİLİR (`ticketErrorKey`) — o sebepler iç sözcüklerdir (`attachment_not_yours`,
 * `items_not_in_order`) ve müşteriye sistemin iç yapısını anlatırlar; ekranın sözlüğü davranışı
 * anlatmalı. Çeviri kapıda duruyor çünkü `lib/ticket` operasyon tarafıyla PAYLAŞILAN bir motor:
 * orada personel iç sebebi görmeli, müşteri yüzeyinde görmemeli.
 */

/** Sonraki sayfa — imleç URL'e yazılmaz, istemcide yaşar (CLAUDE.md §1). */
export async function loadMoreTicketsAction(cursor: KeysetCursor): Promise<CustomerResult<Page<CustomerTicketSummary>>> {
  try {
    const customerId = await requireCustomer();
    return { data: await listCustomerTickets(customerId, cursor), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Cevap yaz — **kapanmış talep kendiliğinden yeniden açılır** (motorun kararı, `replyAsCustomer`).
 *
 * Tasarımın "Yeniden aç ve yaz" düğmesi bu yüzden ayrı bir eylem DEĞİL: ayrı olsaydı müşteri
 * yazar, düğmeye basmayı unutur ve mesajı kimsenin bakmadığı kapalı bir talepte kalırdı.
 *
 * Güncel görünümü geri döndürür: ekran kendi durumunu tahmin etmek zorunda kalmasın — yeni mesajın
 * damgası ve değişen durum sunucudan gelir. `revalidatePath` de var, çünkü liste satırının "son
 * mesaj" bilgisi sunucuda çizilmiş durumda.
 */
export async function replyToTicketAction(
  locale: Locale,
  ticketId: string,
  body: string,
  attachments: readonly string[],
): Promise<CustomerResult<CustomerTicketView>> {
  try {
    const customerId = await requireCustomer();
    const result = await replyAsCustomer({ customerId, ticketId, body, attachments: [...attachments] });
    if (!result.ok) throw new CustomerError(ticketErrorKey(result.reason));

    const view = await getCustomerTicket(locale, customerId, ticketId);
    if (!view) throw new CustomerError('ticket_unavailable');

    revalidatePath('/[locale]/support', 'layout');
    return { data: view, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Fotoğraf için imzalı yükleme adresi. Dosya SUNUCUDAN GEÇMEZ — tarayıcı doğrudan R2'ye yükler
 * (`lib/ticket/attachments`); buranın işi yalnız yetkiyi doğrulatıp kısa ömürlü izni almak.
 *
 * `alreadyRequested` istemciden geliyor ve bu bilinçli: tavan kontrolü **bu mesaj için** kaç ek
 * istendiğini sayıyor ve o sayı yalnız istemcide biliniyor (henüz gönderilmemiş bir taslak). Kötüye
 * kullanımın tavanı burada değil, `openTicket`/`replyAsCustomer`'ın ek sahipliği kontrolünde.
 */
export async function requestTicketPhotoAction(
  ticketId: string | null,
  filename: string,
  alreadyRequested: number,
): Promise<CustomerResult<{ key: string; uploadUrl: string }>> {
  try {
    const customerId = await requireCustomer();
    const result = await requestTicketUploadUrl({ customerId, ticketId, filename, alreadyRequested });
    if (!result.ok) throw new CustomerError(ticketErrorKey(result.reason));
    return { data: { key: result.key, uploadUrl: result.uploadUrl }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Talep aç (08.6) — `source: 'form'`, çünkü müşteri bunu sitedeki formdan yazıyor. Sipariş
 * detayından gelinse bile kaynak formdur; `order` kaynağı WhatsApp/operatör akışlarının işi.
 *
 * Sipariş ve kalem sahipliği kapının içinde doğrulanıyor (`openTicket` → `checkOrderOwnership`):
 * kimlikler istemciden geliyor ve sorulmasaydı müşteri başkasının sipariş numarasını kendi talebi
 * üzerinden okuyabilirdi.
 *
 * Yeni talebin kimliği dönüyor; ekran onay hâlini gösterip yazışmaya oradan bağ veriyor.
 */
export async function openTicketAction(input: {
  type: TicketType;
  body: string;
  orderId: string | null;
  orderItemIds: readonly string[];
  attachments: readonly string[];
}): Promise<CustomerResult<{ ticketId: string }>> {
  try {
    const customerId = await requireCustomer();
    const result = await openTicket({
      customerId,
      source: 'form',
      type: input.type,
      body: input.body,
      orderId: input.orderId,
      orderItemIds: [...input.orderItemIds],
      attachments: [...input.attachments],
    });
    if (!result.ok) throw new CustomerError(ticketErrorKey(result.reason));

    revalidatePath('/[locale]/support', 'layout');
    return { data: { ticketId: result.data.id }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

async function requireCustomer(): Promise<string> {
  const customerId = await currentCustomerId();
  if (!customerId) throw new CustomerError('session_expired');
  return customerId;
}

/**
 * Motorun ret sebebi → müşteri yüzeyinin anahtarı.
 *
 * Üç iç sebep TEK anahtara iniyor (`not_found` · `order_not_found` · `items_not_in_order`) ve bu
 * bilinçli: müşteri için üçü de aynı şey — "bu talebi/siparişi size bağlayamıyoruz". Ayrımı
 * söylemek, başkasının sipariş kimliğini doğrulatmak olurdu (kapının kendi künyesi de aynı şeyi
 * söylüyor: "yok" ile "senin değil" aynı cevabı verir).
 *
 * Tanımadığımız sebep `unexpected`e düşer — motora yeni bir ret eklendiğinde ekran iç sözcüğü
 * göstermek yerine jenerik cümleyi kurar.
 */
function ticketErrorKey(reason: string): string {
  const map: Record<string, string> = {
    empty_body: 'message_empty',
    not_found: 'ticket_unavailable',
    order_not_found: 'ticket_unavailable',
    items_not_in_order: 'ticket_unavailable',
    // Ekin sahipliği tutmuyor: müşteri için sonuç "fotoğraf eklenemedi"dir, bir yetki dersi değil.
    attachment_not_yours: 'photo_unavailable',
    storage_unavailable: 'photo_unavailable',
    unsupported_type: 'photo_unsupported',
    too_many: 'photo_limit',
  };
  return map[reason] ?? 'unexpected';
}
