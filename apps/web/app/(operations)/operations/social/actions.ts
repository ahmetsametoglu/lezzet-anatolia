'use server';

import { revalidatePath } from 'next/cache';
import {
  generateConversationDraft,
  metaSenderFromEnv,
  recordConversationOptIn,
  sendOutboundMessage,
  setDefaultConversationHandler,
} from '@lezzet/application';
import { startCartLink } from '@lezzet/application/cart/link';
import { linkTail } from '@lezzet/application/cart/link-text';
import { ConversationService, CustomerInboxService, serviceDb } from '@lezzet/database';
import { ConversationHandlerEnum, DEFAULT_PAGE_SIZE, type CartLinkPurpose, type KeysetCursor, type Page, type TicketHandler } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { openTicket } from '@/lib/ticket/write';
import { toInboxRows } from './social-read';
import { ConversationOptInSchema, ConversationTicketSchema, RecordOutboundSchema, type InboxRowView } from './social-types';
import { channelSource, parseSocialUrl, SOCIAL_PATH } from './social-url';

// Hepsi `requireAdmin`: düğmeyi çizmemek güvence değildir, action doğrudan da çağrılabilir.

// Gelen mesajı elle yazan kapı yok: operatörün "gelen" diye yazdığı satır müşterinin söylemediği bir cümle olabilirdi.

function refresh(): void {
  revalidatePath(SOCIAL_PATH);
}

/** İmleç `null` ise ilk sayfa (yüzen mesaj penceresi için). Süzgeç adresten okunur ki devam sayfası ilk sayfayla aynı ölçüte uysun. */
export async function loadMoreConversationsAction(search: string, cursor: KeysetCursor | null): Promise<ActionResult<Page<InboxRowView>>> {
  try {
    await requireAdmin();
    const urlState = parseSocialUrl(Object.fromEntries(new URLSearchParams(search)));
    const page = await new CustomerInboxService(serviceDb()).list(
      { awaitingReply: urlState.f === 'awaiting' ? true : undefined, source: channelSource(urlState.ch) },
      cursor ?? undefined,
      DEFAULT_PAGE_SIZE,
    );
    return { data: { rows: toInboxRows(page.rows, new Date()), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

// `refused` bizim kuralımızdır ve tekrar denemek anlamsız; `failed` sağlayıcınındır ve tekrar denemek anlamlı olabilir.
// Tanınmayan sebep ham gösterilir: sağlayıcının yeni kodu operatörün elinde aranabilir bir dize olsun.
const SEND_REFUSAL: Record<string, string> = {
  conversation_not_found: 'Konuşma bulunamadı — ekranı tazeleyin.',
  template_wrong_channel: 'Kalıp mesaj yalnız WhatsApp konuşmasına gönderilebilir.',
  window_closed: 'Cevap süresi doldu — serbest metin gönderilemez. WhatsApp’ta onaylı kalıp mesaj gerekir.',
  window_never_opened: 'Müşteri bu kanaldan size hiç yazmadı — cevap penceresi hiç açılmadı.',
  account_ref_missing: 'Bu konuşma hangi işletme hesabına geldiğini taşımıyor; cevap yönlendirilemez.',
  not_configured: 'Gönderim kanalı yapılandırılmadı (META_ACCESS_TOKEN yok) — mesaj GÖNDERİLMEDİ.',
};

/**
 * `sent` ile `message: null` başarıdır: gönderim oldu, yalnız defter satırı yazılamadı.
 * BEKLEYEN(15.11): onaylı kalıp gelince `templateName`; uydurulan ad Meta'da `132001` döndürürdü.
 */
export async function sendOutboundAction(input: unknown): Promise<ActionResult<{ id: string | null }>> {
  try {
    await requireAdmin();
    const parsed = RecordOutboundSchema.parse(input);
    const outcome = await sendOutboundMessage(serviceDb(), metaSenderFromEnv(), {
      conversationId: parsed.conversationId,
      text: parsed.text,
      author: 'admin',
    });
    refresh();

    if (outcome.status === 'sent') return { data: { id: outcome.message?.id ?? null }, error: null };
    if (outcome.status === 'refused') {
      return { data: null, error: SEND_REFUSAL[outcome.reason] ?? `Gönderilemedi (${outcome.reason}).` };
    }
    // Çeviri düştüyse mesaj gitmedi ve bu bizim tarafımız: cümle onu sağlayıcı hatası gibi okutmamalı.
    if (outcome.reason === 'translation_failed') {
      return { data: null, error: 'Mesaj çevrilemedi, o yüzden GÖNDERİLMEDİ — birazdan tekrar deneyin.' };
    }
    // Sebep ham geçer (`meta_131030: …`) ki operatör arayabilsin; yeniden denemenin anlamı da söylenir.
    return {
      data: null,
      error: outcome.retryable
        ? `Sağlayıcı şu an gönderemedi (${outcome.reason}) — birazdan tekrar deneyin.`
        : `Sağlayıcı reddetti (${outcome.reason}) — tekrar denemek aynı sonucu verir.`,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Ayara yazar, sohbete değil: `open_conversation` yürütücüyü yalnız doğuşta yazar, açık sohbetler değişmez. */
export async function setDefaultConversationModeAction(mode: unknown): Promise<ActionResult<{ mode: TicketHandler }>> {
  try {
    await requireAdmin();
    const parsed = ConversationHandlerEnum.parse(mode);
    await setDefaultConversationHandler(serviceDb(), parsed);
    refresh();
    return { data: { mode: parsed }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Aynı moda ikinci çağrı bir yarışın işaretidir ve reddedilir. "Devral" da bu kapıdan geçer: ayrı uç aynı yazımın ikinci adresi olurdu. */
export async function setConversationModeAction(
  conversationId: string,
  mode: TicketHandler,
): Promise<ActionResult<{ mode: TicketHandler }>> {
  try {
    await requireAdmin();
    const target = ConversationHandlerEnum.parse(mode);
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

const DRAFT_FAILURE: Record<string, string> = {
  not_configured: 'AI yapılandırılmamış — env dosyasına sağlayıcı anahtarı (AI_PROVIDER + API anahtarı) eklenmeli.',
  provider_error: 'AI sağlayıcısına ulaşılamadı — birazdan yeniden deneyin.',
  invalid_output: 'AI beklenen biçimde cevap üretemedi — yeniden deneyin; sürerse bildirin.',
  wrong_mode: 'Taslak yalnız hibrit modda üretilir — önce modu Hibrit yapın.',
  nothing_to_answer: 'Cevaplanacak yeni müşteri mesajı yok — son sözü zaten biz söylemişiz.',
  empty_thread: 'Bu konuşmada hiç mesaj yok — taslak üretilecek bir soru yok.',
  not_found: 'Konuşma bulunamadı — ekranı tazeleyin.',
};

/** Cron beklenmez: hibrit sohbette taslak istek üzerine üretilir. */
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

/** Taslak gönderilmez, cevap kutusuna taşınır: göndermek operatörün kararı. */
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
 * Sohbetin izni (`conversation.opt_in`) ile müşterinin izni (`marketing_consent`) ayrı soruları cevaplar; müşteri kaydına
 * yalnız WhatsApp yazılır, çünkü kaydın Messenger/Instagram kutusu yok. İzin bir kanıttır: damga ve kaynak olmadan "izin var"
 * demek GDPR'da bir şey ifade etmez.
 */
export async function recordConversationOptInAction(input: unknown): Promise<ActionResult<{ granted: boolean }>> {
  try {
    await requireAdmin();
    const parsed = ConversationOptInSchema.parse(input);
    const sonuc = await recordConversationOptIn(serviceDb(), parsed);
    if (sonuc.status === 'refused') return { data: null, error: 'Konuşma bulunamadı — ekranı tazeleyin.' };

    refresh();
    return { data: { granted: parsed.granted }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Kaynak `admin`: talebi kanal değil sohbeti okuyan operatör açar, kanal bağı `conversation_id`de durur. Müşteriye teyit
 * maili gitmez: müşteri kendi yazmadığı bir metni okumamalı.
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

// Panelde çapa kapısı yok: operatör kod üretmez, çapayı müşteri hesap bağlantısıyla girerek kendisi kurar (`anchorStateOf`).

/**
 * Ajanın `sepet_baglantisi` / `hesap_baglantisi` araçlarının operatör eli: sohbeti personel yürütürken ajan araçları çalışmaz.
 * Bağlantı ajanınkiyle aynı kapıdan üretilir ve aynı kuyrukla gider ki ikisi ayrışmasın.
 */
export async function sendCartLinkAction(conversationId: string): Promise<ActionResult<{ id: string | null }>> {
  return sendChatLink(conversationId, 'cart');
}

/** Sepetsiz sohbeti müşteri kendisi bağlasın: girişte sohbet onun hesabına bağlanır. */
export async function sendAccountLinkAction(conversationId: string): Promise<ActionResult<{ id: string | null }>> {
  return sendChatLink(conversationId, 'account');
}

async function sendChatLink(conversationId: string, purpose: CartLinkPurpose): Promise<ActionResult<{ id: string | null }>> {
  try {
    await requireAdmin();

    const link = await startCartLink(serviceDb(), { conversationId, purpose });
    if (link.status !== 'ok') {
      const cumle: Record<typeof link.status, string> = {
        conversation_not_found: 'Konuşma bulunamadı — ekranı tazeleyin.',
        unavailable: 'Bağlantı üretilemedi — bir kez daha deneyin.',
      };
      return { data: null, error: cumle[link.status] };
    }

    const outcome = await sendOutboundMessage(serviceDb(), metaSenderFromEnv(), {
      conversationId,
      text: linkTail({ url: link.url, purpose }),
      author: 'admin',
    });
    refresh();

    if (outcome.status === 'sent') return { data: { id: outcome.message?.id ?? null }, error: null };
    if (outcome.status === 'refused') return { data: null, error: SEND_REFUSAL[outcome.reason] ?? `Gönderilemedi (${outcome.reason}).` };
    return { data: null, error: `Sağlayıcı reddetti (${outcome.reason}) — bağlantı üretildi, pencere açılınca yeniden deneyin.` };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
