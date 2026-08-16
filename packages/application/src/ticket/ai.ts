import { runTask, ticketAgentTask, ticketDraftTask, type AiModel, type SupportContextInput } from '@lezzet/ai';
import {
  ConversationService,
  MessageService,
  OrderItemService,
  OrderService,
  ProductService,
  ProductVariantService,
  TicketMessageService,
  TicketService,
} from '@lezzet/database';
import { statusAfterStaffReply } from '@lezzet/domain-core';
import { formatShortDate } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import { ORDER_STATUS_LABELS, resolveLocalizedText, type Conversation, type Order, type Ticket } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyTicketReplied } from './notify';

/**
 * **AI DESTEK ÇEKİRDEĞİ** (16.5 · 20.4) — hibrit taslak üretimi ve özerk cevap; iki uygulama da
 * (web'in "Taslak öner" düğmesi · backend'in cron'u) BURADAN çağırır, iki kopya doğmaz.
 *
 * ── TİCARİ DEĞER DETERMİNİSTİK OKUNUR, MODELE VERİLİR ───────────────────────
 * Sınıf 4'ün kırmızı çizgisi ("stok/fiyat/durum domain-core'dan") burada araç çağrısıyla değil
 * GİRDİYLE sağlanıyor: talebin cevaplayabileceği her ticari gerçek (sipariş durumu, teslim günü,
 * kalemler) bu dosya tarafından DB'den okunup girdiye yazılır — modelin arayacağı bir şey kalmaz,
 * girdide olmayan sayı da cevapta olamaz (görev künyesi: `ticket-support.ts`).
 *
 * ── ÖNBELLEK KURALI (20.4) ──────────────────────────────────────────────────
 * Taslak satıra yazılır (`ai_draft_reply` + damga). Son mesajdan SONRA üretilmiş bir taslak varsa
 * model HİÇ çağrılmaz — aynı soruya ikinci kez para ödenmez. `force` yalnız operatörün düğmesi
 * içindir: insan "yeniden üret" diyorsa sebep ondadır.
 */

/** Modele giden yazışmanın tavanı — bağlam freni: kırk mesajlık talepte son 12 mesaj yeter. */
const THREAD_LIMIT = 12;

export type SupportAiOutcome =
  | { status: 'generated' }
  | { status: 'cached' }
  | { status: 'replied' }
  | { status: 'handoff'; reason: string }
  | { status: 'skipped'; reason: 'not_found' | 'wrong_mode' | 'nothing_to_answer' | 'empty_thread' }
  | { status: 'failed'; reason: 'not_configured' | 'provider_error' | 'invalid_output' };

/** Test/enjeksiyon: model verilirse env ve ağ atlanır (`translate-user-text` deseniyle aynı). */
export interface SupportAiOpts {
  model?: AiModel;
  /** Önbelleği atla — operatörün "yeniden üret" kararı. */
  force?: boolean;
}

/** Siparişin modele giden özeti — İNSAN-OKUR: iç enum modele gitmez, yanlış tercüme ederdi. */
async function orderContextOf(db: SupabaseClient, orderId: string | null): Promise<SupportContextInput['order']> {
  if (!orderId) return null;
  const order: Order | null = await new OrderService(db).getById(orderId);
  if (!order) return null;

  // Kalem adları tek turda (varyant → ürün) — `resolveItemNames` ile aynı desen, N+1 yok.
  const items = await new OrderItemService(db).listByOrder(orderId);
  const variants = await new ProductVariantService(db).listByIds(items.map((item) => item.variantId));
  const products = await new ProductService(db).listByIds(variants.map((variant) => variant.productId));
  const productOf = new Map(products.map((product) => [product.id, product]));
  const variantOf = new Map(variants.map((variant) => [variant.id, variant]));

  return {
    referenceNo: order.referenceNo,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    deliveryDate: order.deliveryDate ? formatShortDate(order.deliveryDate, 'tr') : null,
    // Tutar BİLEREK yok (görev künyesi): para konuşulacaksa insan konuşur. Vade bilgisi ise
    // "faturayı ne zaman öderim" sorusunun cevabı ve güvenle verilebilir.
    paymentLabel: order.onAccount ? 'vadeli (açık hesap)' : null,
    items: items.map((item) => {
      const variant = variantOf.get(item.variantId);
      const product = variant ? productOf.get(variant.productId) : undefined;
      return { name: product ? resolveLocalizedText(product.name, 'tr') || 'Ürün' : 'Ürün', qty: item.qty };
    }),
  };
}

/** Talebin yazışması → görev girdisi. Kırpma BURADA (son N mesaj) — sınır kapıda, prompt'ta değil. */
async function ticketContextOf(db: SupabaseClient, ticket: Ticket): Promise<SupportContextInput | null> {
  const messages = await new TicketMessageService(db).listByTicket(ticket.id);
  if (messages.length === 0) return null;
  return {
    channel: 'ticket',
    messages: messages.slice(-THREAD_LIMIT).map((message) => ({
      who: message.sender === 'customer' ? 'customer' : message.sender === 'ai' ? 'ai' : 'staff',
      text: message.body,
    })),
    order: await orderContextOf(db, ticket.orderId),
  };
}

/**
 * **Hibrit taslağı üret ve satıra yaz** (sınıf 1 — 20.4).
 *
 * Mod kapısı içeride: `hybrid` değilse üretmez — cron ile operatör düğmesi aynı kuralı iki kez
 * yazmasın. Başarısızlıkta satıra HİÇBİR ŞEY yazılmaz: bozuk bir taslağı "hazır" göstermektense
 * taslaksız kalmak yeğdir; bir sonraki tur yeniden dener.
 */
export async function generateTicketDraft(db: SupabaseClient, ticketId: string, opts: SupportAiOpts = {}): Promise<SupportAiOutcome> {
  const tickets = new TicketService(db);
  const ticket = await tickets.getById(ticketId);
  if (!ticket) return { status: 'skipped', reason: 'not_found' };
  if (ticket.handledBy !== 'hybrid') return { status: 'skipped', reason: 'wrong_mode' };

  const context = await ticketContextOf(db, ticket);
  if (!context) return { status: 'skipped', reason: 'empty_thread' };
  // Son söz bizdeyse cevaplanacak bir şey yok — müşteriye durduk yerde yazdırmayız.
  if (context.messages[context.messages.length - 1]?.who !== 'customer') return { status: 'skipped', reason: 'nothing_to_answer' };

  // Önbellek: taslak son mesajdan taze ise model çağrılmaz (20.4). Kıyas son mesajın ANI ile —
  // mesajlar eskiden yeniye geldi, damga sonuncusundan yeniyse taslak o mesajı görmüş demektir.
  if (!opts.force && ticket.aiDraftReply && ticket.aiDraftGeneratedAt) {
    const lastMessageAt = (await new TicketMessageService(db).listByTicket(ticket.id)).at(-1)?.createdAt;
    if (lastMessageAt && ticket.aiDraftGeneratedAt >= lastMessageAt) return { status: 'cached' };
  }

  const result = await runTask(ticketDraftTask, context, opts.model ? { model: opts.model } : {});
  if (!result.ok) return { status: 'failed', reason: result.reason };

  await tickets.update({ id: ticket.id, aiDraftReply: result.data.reply, aiDraftGeneratedAt: new Date().toISOString() });
  return { status: 'generated' };
}

/** Konuşmanın (WhatsApp) yazışması → görev girdisi. Sipariş bağı yok — konuşma siparişe bağlanmaz. */
async function conversationContextOf(db: SupabaseClient, conversation: Conversation): Promise<SupportContextInput | null> {
  const messages = await new MessageService(db).listByConversation(conversation.id);
  if (messages.length === 0) return null;
  return {
    channel: 'whatsapp',
    messages: messages.slice(-THREAD_LIMIT).map((message) => ({
      who: message.direction === 'inbound' ? 'customer' : message.author === 'ai' ? 'ai' : 'staff',
      text: message.body.text?.trim() || '[metinsiz mesaj]',
    })),
    order: null,
  };
}

/** WhatsApp hibrit taslağı — talep eşiyle aynı sözleşme, aynı önbellek kuralı. */
export async function generateConversationDraft(
  db: SupabaseClient,
  conversationId: string,
  opts: SupportAiOpts = {},
): Promise<SupportAiOutcome> {
  const conversations = new ConversationService(db);
  const conversation = await conversations.getById(conversationId);
  if (!conversation) return { status: 'skipped', reason: 'not_found' };
  if (conversation.handledBy !== 'hybrid') return { status: 'skipped', reason: 'wrong_mode' };

  const context = await conversationContextOf(db, conversation);
  if (!context) return { status: 'skipped', reason: 'empty_thread' };
  if (context.messages[context.messages.length - 1]?.who !== 'customer') return { status: 'skipped', reason: 'nothing_to_answer' };

  if (!opts.force && conversation.aiDraftReply && conversation.aiDraftGeneratedAt && conversation.lastMessageAt) {
    if (conversation.aiDraftGeneratedAt >= conversation.lastMessageAt) return { status: 'cached' };
  }

  const result = await runTask(ticketDraftTask, context, opts.model ? { model: opts.model } : {});
  if (!result.ok) return { status: 'failed', reason: result.reason };

  await conversations.update({ id: conversation.id, aiDraftReply: result.data.reply, aiDraftGeneratedAt: new Date().toISOString() });
  return { status: 'generated' };
}

/**
 * **Özerk cevap** (sınıf 4 — 16.5): modu `ai` olan talepte müşterinin son mesajını cevaplar YA DA
 * insana devreder.
 *
 * ── GÜVENLİ TARAF DAİMA DEVİR ───────────────────────────────────────────────
 * `action='reply'` ama metin boş → devir. Model şemaya uymadı → cevap YAZILMAZ, bir sonraki tur
 * dener. Devirde mod `human`a iner (taslak da düşer — `setMode` sözleşmesi) ve talep kuyrukta
 * "cevap bekliyor" olarak insana görünür; ayrıca sebep log'a düşer. Yanlış cevap, geç cevaptan
 * pahalıdır ve geri alınamaz — müşteri okumuştur.
 *
 * Gönderen `ai`dır (`ticket_sender='ai'`): "bunu kim söyledi" sorusu sonradan da cevaplanabilmeli
 * (kuyruğun `answeredByAi` süzgeci tam bu kümeye bakıyor). Durum kararı personel cevabıyla aynı
 * motordan (`statusAfterStaffReply`) — AI'a özel bir durum kuralı YOK.
 */
export async function runAutonomousTicketReply(db: SupabaseClient, ticketId: string, opts: SupportAiOpts = {}): Promise<SupportAiOutcome> {
  const tickets = new TicketService(db);
  const ticket = await tickets.getById(ticketId);
  if (!ticket) return { status: 'skipped', reason: 'not_found' };
  if (ticket.handledBy !== 'ai') return { status: 'skipped', reason: 'wrong_mode' };

  const context = await ticketContextOf(db, ticket);
  if (!context) return { status: 'skipped', reason: 'empty_thread' };
  if (context.messages[context.messages.length - 1]?.who !== 'customer') return { status: 'skipped', reason: 'nothing_to_answer' };

  const result = await runTask(ticketAgentTask, context, opts.model ? { model: opts.model } : {});
  if (!result.ok) return { status: 'failed', reason: result.reason };

  const reply = result.data.action === 'reply' ? result.data.reply?.trim() : null;
  if (!reply) {
    // Devir: sebep KAYDA geçer ama müşteri metnine sızmaz — operatör kuyrukta görür.
    const reason = result.data.handoffReason?.trim() || 'AI cevap veremedi — sebep bildirmedi.';
    await tickets.setMode(ticket.id, 'human');
    logger.info({ context: 'application/ticket-ai', ticketId: ticket.id }, `özerk ajan insana devretti: ${reason}`);
    return { status: 'handoff', reason };
  }

  await tickets.reply({
    ticketId: ticket.id,
    sender: 'ai',
    body: reply,
    newStatus: statusAfterStaffReply(ticket.status),
  });
  // Haber SESSİZ gider (16.4): sağlayıcı düştü diye yazılmış cevap geri alınmaz. Talep taze
  // okunur — cevap durumu değiştirmiş olabilir. Aynı kurucu, aynı mail: personel cevabıyla bir.
  const fresh = (await tickets.getById(ticket.id)) ?? ticket;
  await notifyTicketReplied(db, fresh);
  return { status: 'replied' };
}
