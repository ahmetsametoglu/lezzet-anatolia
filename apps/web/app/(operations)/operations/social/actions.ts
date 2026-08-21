'use server';

import { revalidatePath } from 'next/cache';
import { generateConversationDraft, recordInboundMessage, recordOutboundMessage } from '@lezzet/application';
import { ConversationInboxService, ConversationService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, TicketHandlerEnum, type KeysetCursor, type Page, type TicketHandler } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { openTicket } from '@/lib/ticket/write';
import { openWhatsappConversation } from '@/lib/messaging/conversation';
import { toInboxRows } from './social-read';
import {
  ConversationTicketSchema,
  FollowUpInboundSchema,
  ManualInboundSchema,
  RecordOutboundSchema,
  type InboxRowView,
} from './social-types';
import { channelSource, parseSocialUrl, SOCIAL_PATH } from './social-url';

// Sosyal gelen kutusunun YAZMA KAPILARI (15.5 · üç kanal 15.15 + 15.1'in yüzey yarısı) — guard ilk,
// kapıya devret, `{ data, error }` DÖNER.
//
// **Hepsi `requireAdmin`.** Ekran yalnız yöneticiye açık ve kapı burada durur: düğmeyi çizmemek bir
// güvence değildir, action doğrudan da çağrılabilir.
//
// **İş kuralı burada YOK.** Kimlik çözümü, pencere hesabı ve israf nöbeti uygulama kapısında
// (`lib/messaging/conversation`) motora sorularak yapılıyor (STACK §4). Buradaki tek çeviri, kapının
// sonucunu ekranın sözleşmesine döndürmek.
//
// ── BURADAN MESAJ GÖNDERİLMEZ ────────────────────────────────────────────────
// Adım 1'de gönderim kanalı yok (webhook/sürücü 15.7/15.11). Bu kapılar DEFTER tutar: yazışma
// admin'in telefonundan/Business Suite'ten yürür, olan biten buraya işlenir. Adları da bunu
// söylüyor — `record…`, `send…` değil.

function refresh(): void {
  revalidatePath(SOCIAL_PATH);
}

/**
 * Kuyruğun SONRAKİ sayfası. Süzgeç ADRESTEN okunur, istemciden gelen bir nesneden değil: devam eden
 * sayfa ilk sayfayla aynı ölçüte uymalı ve o ölçüt tek yerde (`social-url`) tanımlı — kanal çipi de
 * dahil.
 */
export async function loadMoreConversationsAction(search: string, cursor: KeysetCursor): Promise<ActionResult<Page<InboxRowView>>> {
  try {
    await requireAdmin();
    const urlState = parseSocialUrl(Object.fromEntries(new URLSearchParams(search)));
    const page = await new ConversationInboxService(serviceDb()).list(
      { awaitingReply: urlState.f === 'awaiting' ? true : undefined, source: channelSource(urlState.ch) },
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
 * **Yalnız WhatsApp:** kimlik anahtarı telefondur ve operatör onu telefonundan okur; Messenger/IG
 * kişi kimliği (PSID/IGSID) operatörce bilinemez — o konuşmaları webhook doğuracak (15.7).
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

    await recordInboundMessage(serviceDb(), {
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
 * Var olan sohbete GELEN mesaj (devam) — KANAL-NÖTR: konuşma zaten var, kimlik anahtarı gerekmez.
 *
 * Eski yol devam mesajını da telefon üzerinden işliyordu (`openManualDmAction`) ve her seferinde
 * kimlik çözümünü yeniden koşuyordu; Messenger/IG'de telefon hiç olmadığı için o yol kapanır —
 * devam kapısı konuşma kimliğiyle çalışır (15.15). Pencereyi yine gelen mesaj açar, damga şart.
 */
export async function recordFollowUpInboundAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = FollowUpInboundSchema.parse(input);
    const message = await recordInboundMessage(serviceDb(), {
      conversationId: parsed.conversationId,
      text: parsed.text,
      receivedAt: parsed.receivedAt,
    });
    refresh();
    return { data: { id: message.id }, error: null };
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
    const message = await recordOutboundMessage(serviceDb(), { conversationId: parsed.conversationId, text: parsed.text });
    refresh();
    return { data: { id: message.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Yürütücü modu (kullanıcı kararı 16.08): human · hybrid · ai — talep ekranıyla aynı üçlü.
 * Hedef enum'dan doğrulanır; aynı moda ikinci çağrı bir yarışın işaretidir ve reddedilir.
 * "Devral" da bu kapıdan geçer (`mode='human'`) — ayrı bir devralma ucu, aynı yazımın ikinci
 * adresi olurdu.
 */
export async function setConversationModeAction(
  conversationId: string,
  mode: TicketHandler,
): Promise<ActionResult<{ mode: TicketHandler }>> {
  try {
    await requireAdmin();
    const target = TicketHandlerEnum.parse(mode);
    const service = new ConversationService(serviceDb());
    const conversation = await service.getById(conversationId);
    if (!conversation) return { data: null, error: 'Konuşma bulunamadı — ekranı tazeleyin.' };
    if (conversation.handledBy === target) {
      return { data: null, error: 'Sohbet zaten bu modda — bir başkası az önce değiştirmiş olabilir, ekranı tazeleyin.' };
    }
    const updated = await service.setMode(conversationId, target);
    refresh();
    return { data: { mode: updated.handledBy }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** AI üretim sonucunun operatöre söylenecek hâli — Talepler ekranıyla aynı sözlük mantığı. */
const DRAFT_FAILURE: Record<string, string> = {
  not_configured: 'AI yapılandırılmamış — env dosyasına sağlayıcı anahtarı (AI_PROVIDER + API anahtarı) eklenmeli.',
  provider_error: 'AI sağlayıcısına ulaşılamadı — birazdan yeniden deneyin.',
  invalid_output: 'AI beklenen biçimde cevap üretemedi — yeniden deneyin; sürerse bildirin.',
  wrong_mode: 'Taslak yalnız hibrit modda üretilir — önce modu Hibrit yapın.',
  nothing_to_answer: 'Cevaplanacak yeni müşteri mesajı yok — son sözü zaten biz söylemişiz.',
  empty_thread: 'Bu konuşmada hiç mesaj yok — taslak üretilecek bir soru yok.',
  not_found: 'Konuşma bulunamadı — ekranı tazeleyin.',
};

/** **Taslak öner** (20.4) — hibrit konuşmada AI taslağını istek üzerine üretir, cron beklenmez. */
export async function suggestConversationDraftAction(conversationId: string): Promise<ActionResult<{ generated: true }>> {
  try {
    await requireAdmin();
    const outcome = await generateConversationDraft(serviceDb(), conversationId, { force: true });
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
 * Hibrit taslağı tüket (16.08). Talep ekranından farkı: burada GÖNDERME yolu yok (kanal 15.7/15.11)
 * — taslağın tek dürüst çıkışı defter kutusuna taşınmaktır; operatör metni telefonundan gönderir,
 * gönderdiğini deftere işler. "Gönderildi" demeden tüketir, dönen metni kutu alır.
 */
export async function consumeConversationDraftAction(conversationId: string): Promise<ActionResult<{ draft: string }>> {
  try {
    await requireAdmin();
    const service = new ConversationService(serviceDb());
    const conversation = await service.getById(conversationId);
    if (!conversation) return { data: null, error: 'Konuşma bulunamadı — ekranı tazeleyin.' };
    const draft = conversation.aiDraftReply;
    if (!draft) return { data: null, error: 'Bekleyen AI taslağı yok — bu sırada tüketilmiş olabilir. Ekranı tazeleyin.' };
    await service.clearDraft(conversationId);
    refresh();
    return { data: { draft }, error: null };
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
 * (Kanal ne olursa olsun kaynak 'admin' DOĞRU: talebi konuşmanın kendisi değil, onu okuyan operatör
 * açıyor; kanal bağı `conversation_id` üzerinden zaten duruyor. `ticket_source`'a messenger/
 * instagram değerleri, talebi KANALIN açtığı gün — ajan 15.14 — eklenir.)
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
