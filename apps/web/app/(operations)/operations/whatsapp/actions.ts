'use server';

import { revalidatePath } from 'next/cache';
import { ConversationInboxService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, type KeysetCursor, type Page } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { openTicket } from '@/lib/ticket/write';
import { openWhatsappConversation, recordInboundMessage, recordOutboundMessage } from '@/lib/whatsapp/conversation';
import { toInboxRows } from './whatsapp-read';
import { ConversationTicketSchema, ManualInboundSchema, RecordOutboundSchema, type InboxRowView } from './whatsapp-types';
import { parseWhatsappUrl, WHATSAPP_PATH } from './whatsapp-url';

// WhatsApp izleme ekranının YAZMA KAPILARI (15.5 + 15.1'in yüzey yarısı) — guard ilk, kapıya
// devret, `{ data, error }` DÖNER.
//
// **Hepsi `requireAdmin`.** Ekran yalnız yöneticiye açık ve kapı burada durur: düğmeyi çizmemek bir
// güvence değildir, action doğrudan da çağrılabilir.
//
// **İş kuralı burada YOK.** Kimlik çözümü, pencere hesabı ve israf nöbeti uygulama kapısında
// (`lib/whatsapp/conversation`) motora sorularak yapılıyor (STACK §4). Buradaki tek çeviri, kapının
// sonucunu ekranın sözleşmesine döndürmek.
//
// ── BURADAN MESAJ GÖNDERİLMEZ ────────────────────────────────────────────────
// Adım 1'de gönderim kanalı yok (360dialog 15.7/15.11). Bu kapılar DEFTER tutar: yazışma admin'in
// telefonundan yürür, olan biten buraya işlenir. Adları da bunu söylüyor — `record…`, `send…` değil.

function refresh(): void {
  revalidatePath(WHATSAPP_PATH);
}

/**
 * Kuyruğun SONRAKİ sayfası. Süzgeç ADRESTEN okunur, istemciden gelen bir nesneden değil: devam eden
 * sayfa ilk sayfayla aynı ölçüte uymalı ve o ölçüt tek yerde (`whatsapp-url`) tanımlı.
 */
export async function loadMoreConversationsAction(search: string, cursor: KeysetCursor): Promise<ActionResult<Page<InboxRowView>>> {
  try {
    await requireAdmin();
    const urlState = parseWhatsappUrl(Object.fromEntries(new URLSearchParams(search)));
    const page = await new ConversationInboxService(serviceDb()).list(
      urlState.f === 'awaiting' ? { awaitingReply: true } : {},
      cursor,
      DEFAULT_PAGE_SIZE,
    );
    return { data: { rows: toInboxRows(page.rows, new Date()), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Gelen DM'i işle** — numaradan konuşmayı açar ve ilk mesajı deftere yazar (15.1'in beyanı).
 *
 * İkisi TEK adımda, çünkü mesajsız açılan bir konuşma gelen kutusunda `last_message_at` boş bir
 * satır olarak durur: sıralaması belirsiz, önizlemesi boş, `awaiting_reply` yanlış. Operatör de
 * zaten okuduğu bir mesaj yüzünden buraya geliyor.
 *
 * Kapının reddi SESSİZ GEÇİLMEZ: numara çözülemediğinde ya da telefon/e-posta ayrı müşterilere
 * çıktığında (`conflict`) konuşma AÇILMAZ — yanlış hesaba bağlanmış bir sohbet, bağlanmamış bir
 * sohbetten pahalıdır. Operatöre ne olduğu söylenir, çünkü çaresi onda: numarayı düzeltmek ya da
 * müşteri kartlarını birleştirmek.
 */
export async function openManualDmAction(input: unknown): Promise<ActionResult<{ conversationId: string }>> {
  try {
    await requireAdmin();
    const parsed = ManualInboundSchema.parse(input);

    const opened = await openWhatsappConversation({
      phone: parsed.phone,
      name: parsed.name?.trim() || null,
      email: parsed.email?.trim() || null,
    });

    if (opened.status === 'invalid_phone') {
      return { data: null, error: 'Numara okunamadı. Ülke koduyla yazın (ör. +33 6 12 34 56 78).' };
    }
    if (opened.status === 'conflict') {
      return {
        data: null,
        error: 'Bu numara ile e-posta ayrı müşterilere ait. Konuşma açılmadı — önce Müşteriler ekranından kayıtları birleştirin.',
      };
    }

    await recordInboundMessage({
      conversationId: opened.conversation.id,
      text: parsed.text,
      receivedAt: parsed.receivedAt,
    });

    refresh();
    return { data: { conversationId: opened.conversation.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Var olan konuşmaya GİDEN mesaj — pencereye dokunmaz.
 *
 * `templateName` verilmiyor ve verilemez: adım 1'de admin kendi telefonundan serbest metin yazıyor,
 * onaylı şablon gönderimi API işidir (15.11). Alan uydurulsaydı, defter hiç gönderilmemiş bir
 * şablonun ücretini raporlardı.
 */
export async function recordOutboundAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = RecordOutboundSchema.parse(input);
    const message = await recordOutboundMessage({ conversationId: parsed.conversationId, text: parsed.text });
    refresh();
    return { data: { id: message.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Sohbetten talep açma — `ticket.conversation_id`'yi dolduran TEK yol.
 *
 * Bağ 15.1'de kuruldu ama hiçbir yazma yolu onu doldurmuyordu; Talepler ekranı "bağlı konuşma var"
 * satırını çizip hiç gösteremiyordu. `source: 'admin'` + `authorId`: ilk sözü operatör söylüyor ve
 * müşteriye teyit maili GİTMİYOR (16.4 kararı) — müşteri kendi yazmadığı bir metni okumamalı.
 */
export async function openConversationTicketAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAdmin();
    const parsed = ConversationTicketSchema.parse(input);
    const result = await openTicket({
      customerId: parsed.customerId,
      conversationId: parsed.conversationId,
      source: 'admin',
      type: parsed.type,
      body: parsed.body,
      subject: parsed.subject?.trim() || null,
      authorId: actor.profileId,
    });
    if (!result.ok) return { data: null, error: `Talep açılamadı (${result.reason}).` };
    refresh();
    return { data: { id: result.data.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
