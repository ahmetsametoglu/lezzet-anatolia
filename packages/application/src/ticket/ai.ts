import { runTask, ticketAgentTask, ticketDraftTask, type AiModel, type SupportContextInput } from '@lezzet/ai';
import { brand } from '@lezzet/brand';
import {
  ConversationNoteService,
  ConversationService,
  MessageService,
  OrderItemService,
  OrderService,
  ProductService,
  ProductVariantService,
  TicketMessageService,
  TicketService,
} from '@lezzet/database';
import { formatForChannel, statusAfterStaffReply } from '@lezzet/domain-core';
import { formatShortDate } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import { ORDER_STATUS_LABELS, resolveLocalizedText, type Conversation, type Order, type Ticket } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cartAgentTools, cartLinkIfDue } from '../cart/agent-tools';
import { chatPlaceMemory } from '../cart/chat-place';
import { withCartLink, type ChatLink } from '../cart/link-text';
import { anchorGateOf, type AnchorGate } from '../customer/anchor';
import { sendOutboundMessage, type MessageSender } from '../messaging/send';
import { ringConversationBell, ringConversationsBell, ringTicketBell, ringTicketsBell } from '../realtime/bell';
import { translateTicketMessageNow } from './translate';
import { customerSupportTools, type PendingProductCard } from './support-tools';
import { queueTicketReplyMail } from './reply-mail';

/**
 * Hibrit taslak ve özerk cevabın tek çekirdeği: web'in "Taslak öner" düğmesi de backend'in taraması da buradan çağırır. Model
 * hesaplamaz, okur: talebin bağlamı girdiye yazılır, gerisi müşteri kimliğine kapatılmış salt okur araçlarla cevaplanır.
 */

/** Modele giden yazışmanın tavanı — bağlam freni: kırk mesajlık talepte son 12 mesaj yeter. */
const THREAD_LIMIT = 12;

/**
 * Araçlar müşteri kimliğine kapatılmış kurulur; model onları çağırabilir ama kime ait olduklarını değiştiremez. Enjekte model (test)
 * araç çağırmaz, araç geçmek testi ağa açardı.
 */
async function runOpts(
  db: SupabaseClient,
  customerId: string | null,
  opts: SupportAiOpts,
  known: AnchorGate | null = null,
  /**
   * Sepet araçları kimlik kapısından bağımsızdır: kimliksiz sohbette sepet sohbetin kendisine yazılır, fiyat kademesi ve kayıtlı adres
   * yine kapıya bağlıdır. E-posta talebinde sohbet olmadığı için sepet aracı da yok.
   */
  cart: { conversation: Conversation; sink: CartLinkSink } | null = null,
) {
  if (opts.model) return { model: opts.model };
  /* İki araç seti aynı yer hafızasını paylaşır: ürün aramada söylenen posta kodu aynı turda sepete eklemede de bilinir. */
  const place = cart ? chatPlaceMemory(db, cart.conversation) : null;
  const cartTools = (identity: string | null, gate: AnchorGate | null) =>
    cart
      ? cartAgentTools(db, {
          conversation: cart.conversation,
          pricingCustomerId: identity,
          addressCustomerId: identity,
          place,
          accountLink: accountLinkOffered(cart.conversation, gate),
          onLink: (link) => {
            // Sepet bağlantısı hesap bağlantısını ezer (o da hesabı bağlar, üstelik sepete götürür); sohbette tek düğme kalır.
            if (link.purpose === 'cart' || !cart.sink.link) cart.sink.link = link;
          },
          onCartWrite: (hazir) => {
            cart.sink.wrote = true;
            cart.sink.ready = hazir;
          },
        })
      : {};
  // Ürün kartı kancası yalnız sohbet turunda: kart kanala göre çizilir, e-posta talebinde kanal yok.
  const cardHook = cart ? { conversation: cart.conversation, onCard: (card: PendingProductCard) => cart.sink.cards.push(card) } : null;
  // Kimlik kapısı yalnız geçmiş araçlarını kapatır; katalog, fiyat ve teslimat şartları sitede ziyaretçiye zaten açık. Kapı araçta,
  // prompt'ta değil: modele "söyleme" demek ricadır, aracı vermemek kısıttır.
  if (!customerId) return { tools: { ...customerSupportTools(db, null, cardHook, place), ...cartTools(null, null) } };
  const gate = known ?? (await anchorGateOf(db, customerId));
  if (!gate.open) logger.info({ customerId, anchor: gate.state }, 'ai: kimlik kapısı kapalı — yalnız kamusal araçlar verildi');
  const identity = toolsIdentityOf(customerId, gate);
  return { tools: { ...customerSupportTools(db, identity, cardHook, place), ...cartTools(identity, gate) } };
}

/** Sohbet turunun kabı: araçlar bağlantıyı ve kartları buraya bırakır, cevabın sonuna `withCartLink` ekler. */
interface CartLinkSink {
  link: ChatLink | null;
  /** Bu turda sepete yazıldıysa bağlantı modelin sözünü beklemeden eklenir. */
  wrote: boolean;
  /**
   * Son yazımdan sonra sepet sipariş verilebilir mi: yer biliniyor, asgari tutar dolu, gönderilemeyen kalem yok. Değilse yazım bağlantıyı
   * kendiliğinden getirmez, asgarinin altındaki sepete "ödemek için" bağlantısı gitmesin.
   */
  ready: boolean;
  /** Özerk yolda metinden önce gönderilir; taslak yolunda gönderilmez, çünkü operatör onları görmedi. */
  cards: PendingProductCard[];
}

/** Sohbet turunun boş kabı — her tur yeni; kap sınıflar arasında paylaşılmaz. */
function bosKap(): CartLinkSink {
  return { link: null, wrote: false, ready: false, cards: [] };
}

/**
 * `null` "araç yok" değil, "kamusal set" demektir. Saf ve sınanıyor, çünkü koşul yalnız `customerId`e bakmaya kaysa çapası kapalı
 * müşterinin geçmişi sessizce açılırdı.
 */
export function toolsIdentityOf(customerId: string | null, gate: AnchorGate | null): string | null {
  return customerId && gate?.open ? customerId : null;
}

/**
 * Hesap bağlantısı aracı yalnız işe yarayacağı yerde verilir: sohbette müşteri yokken ya da WhatsApp'ta kapı kapalı ve bekleyen kimlik
 * sorusu yokken. Operatörün kurduğu Messenger/IG bağı başka hesapla ezilemez, bekleyen kimlik sorusu varken ikinci yol açılmaz.
 */
export function accountLinkOffered(conversation: Pick<Conversation, 'customerId' | 'source'>, gate: AnchorGate | null): boolean {
  if (!conversation.customerId) return true;
  if (conversation.source !== 'whatsapp') return false;
  return gate !== null && !gate.open && gate.ask === null;
}

export type SupportAiOutcome =
  | { status: 'generated' }
  | { status: 'cached' }
  | { status: 'replied' }
  | { status: 'handoff'; reason: string }
  /** `in_flight`: aynı sohbetin cevabı zaten üretiliyor; eksiklik değil yarış işaretidir. */
  | { status: 'skipped'; reason: 'not_found' | 'wrong_mode' | 'nothing_to_answer' | 'empty_thread' | 'in_flight' }
  /**
   * `not_configured` AI anahtarının, `send_not_configured` gönderim jetonunun yokluğudur. Ayrı, çünkü jeton eksikken taslak üretimi
   * çalışmaya devam etmeli.
   */
  | { status: 'failed'; reason: 'not_configured' | 'send_not_configured' | 'provider_error' | 'invalid_output' };

/** Model verilirse env ve ağ atlanır (test). */
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
    // Tutar bilerek yok: para konuşulacaksa insan konuşur. Vade ise "faturayı ne zaman öderim" sorusunun güvenle verilebilen cevabı.
    paymentLabel: order.onAccount ? 'vadeli (açık hesap)' : null,
    items: items.map((item) => {
      const variant = variantOf.get(item.variantId);
      const product = variant ? productOf.get(variant.productId) : undefined;
      return { name: product ? resolveLocalizedText(product.name, 'tr') || 'Ürün' : 'Ürün', qty: item.qty };
    }),
  };
}

/**
 * Tek yerde, çünkü iki bağlam kurucusu aynı değeri geçmeli; biri makine biçimini geçse müşteriye okunaksız numara söylenirdi.
 * `phoneDisplay` müşterinin okuyacağı biçimdir.
 */
const BUSINESS_CARD: SupportContextInput['business'] = {
  whatsapp: brand.contact.phoneDisplay,
  email: brand.contact.email,
};

/** Talebin yazışması → görev girdisi. Kırpma BURADA (son N mesaj) — sınır kapıda, prompt'ta değil. */
async function ticketContextOf(db: SupabaseClient, ticket: Ticket): Promise<SupportContextInput | null> {
  const messages = await new TicketMessageService(db).listByTicket(ticket.id);
  if (messages.length === 0) return null;
  return {
    channel: 'ticket',
    business: BUSINESS_CARD,
    messages: messages.slice(-THREAD_LIMIT).map((message) => ({
      who: message.sender === 'customer' ? 'customer' : message.sender === 'ai' ? 'ai' : 'staff',
      text: message.body,
    })),
    order: await orderContextOf(db, ticket.orderId),
  };
}

/**
 * Mod kapısı içeride, cron ile operatör düğmesi aynı kuralı iki kez yazmasın. Başarısızlıkta satıra hiçbir şey yazılmaz: bozuk taslağı
 * "hazır" göstermektense taslaksız kalmak yeğdir.
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

  // Taslak son mesajdan tazeyse model çağrılmaz; aynı soruya ikinci kez para ödenmez.
  if (!opts.force && ticket.aiDraftReply && ticket.aiDraftGeneratedAt) {
    const lastMessageAt = (await new TicketMessageService(db).listByTicket(ticket.id)).at(-1)?.createdAt;
    if (lastMessageAt && ticket.aiDraftGeneratedAt >= lastMessageAt) return { status: 'cached' };
  }

  const result = await runTask(ticketDraftTask, context, { ...(await runOpts(db, ticket.customerId, opts)), usageContext: { ticketId: ticket.id } });
  if (!result.ok) return { status: 'failed', reason: result.reason };

  /* Taslak ham yazılır: talebi gösteren bütün yüzeyler biçimi çiziyor ve silinen vurgu geri getirilemez. Sohbet yolunda ölçüt kanal
     olduğu için orada `formatForChannel` söker. */
  await tickets.update({
    id: ticket.id,
    aiDraftReply: result.data.reply,
    aiDraftGeneratedAt: new Date().toISOString(),
  });
  // Taslağı çoğu zaman tarama yazar; zil çalmazsa operatör onu ancak sayfayı elle yenileyince görürdü.
  await ringTicketsBell();
  return { status: 'generated' };
}

/**
 * Geçmişteki bir transkriptin bağlamda kaplayabileceği en fazla karakter. Cevaplanan SON mesaj bu
 * sınıra girmez — orada eksik bilgi, yanlış cevabın ta kendisidir.
 */
const TRANSCRIPT_CONTEXT_LIMIT = 400;

/**
 * Metinsiz mesaj modele türü ve sınırıyla birlikte anlatılır: model ne bilmediğini bilince "duyamıyorum, dinleyip döneceğiz" der,
 * uydurmaz.
 */
function mediaPlaceholder(
  message: { kind: string; mediaMime: string | null; mediaTranscript: string | null },
  sonMu: boolean,
): string {
  if (message.kind !== 'media') return '[metinsiz mesaj]';
  const mime = message.mediaMime ?? '';
  /* Çözülmüş ses "müşterinin sözü" diye değil işaretle verilir: model kaynağı görünce önce "şunu mu demek istediniz" diye teyit eder. */
  const cozum = message.mediaTranscript?.trim();
  if (cozum) {
    /* Son mesaj tam, geçmiş kırpık: talep çoğu zaman uzun anlatımın sonunda söylenir, geçmişin uzun dökümleri ise yeni soruyu
       bağlamdan iter. Kırpma mekaniktir, özetleme değil: yalnız eksiltir ve eksilttiğini söyler. */
    const kirp = !sonMu && cozum.length > TRANSCRIPT_CONTEXT_LIMIT;
    const govde = kirp ? `${cozum.slice(0, TRANSCRIPT_CONTEXT_LIMIT)}… [kısaltıldı]` : cozum;
    return `[müşterinin SESLİ MESAJININ makine çözümü — birebir doğru olmayabilir]: ${govde}`;
  }
  if (mime.startsWith('audio/')) return '[müşteri SESLİ MESAJ gönderdi — sen sesi dinleyemezsin, içeriğini bilmiyorsun]';
  if (mime.startsWith('image/')) return '[müşteri FOTOĞRAF gönderdi — sen görseli göremezsin, içeriğini bilmiyorsun]';
  return '[müşteri bir DOSYA gönderdi — sen dosyayı açamazsın, içeriğini bilmiyorsun]';
}

/**
 * Yeniden selam eşiği (saat), parametrik. Fransız görgüsünde aynı gün ikinci "bonjour" kabalıktır; sabah yazıp akşam dönen yeniden
 * selam alır, on dakika sonra dönen almaz.
 */
const SESSION_GAP_HOURS = 12;

/** Sosyal konuşmanın yazışması → görev girdisi. Kanal konuşmadan okunur, çünkü müşteri kanal adını görüyor. */
async function conversationContextOf(db: SupabaseClient, conversation: Conversation): Promise<SupportContextInput | null> {
  const messages = await new MessageService(db).listByConversation(conversation.id);
  if (messages.length === 0) return null;
  return {
    channel: conversation.source,
    business: BUSINESS_CARD,
    messages: messages.slice(-THREAD_LIMIT).map((message, i, dizi) => {
      /* Model zamanı görmez: son gelen mesaj öncekinden `SESSION_GAP_HOURS` geç geldiyse başına işaret düşer, selam kararını istem verir. */
      const onceki = dizi[i - 1];
      const sonMu = i === dizi.length - 1;
      const araSaat =
        sonMu && onceki && message.direction === 'inbound'
          ? (Date.parse(message.createdAt) - Date.parse(onceki.createdAt)) / 3_600_000
          : 0;
      const araIsareti = araSaat >= SESSION_GAP_HOURS ? `[uzun aradan sonra yazdı — ${Math.round(araSaat)} saat] ` : '';
      return {
        who: message.direction === 'inbound' ? 'customer' : message.author === 'ai' ? 'ai' : 'staff',
        /* Müşterinin sözü orijinaliyle, bizimki Türkçemizle: model kendi turlarını Fransızca görseydi "Türkçe yaz" kuralı her turda
           aşınırdı. */
        text:
          araIsareti +
          ((message.direction === 'outbound' ? message.translations?.tr?.trim() : undefined) ||
            message.body.text?.trim() ||
            mediaPlaceholder(message, sonMu)),
      };
    }),
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

  // Kimliği çözülmemiş konuşmada geçmiş araçları verilmez, kamusal araçlar verilir (`runOpts`un kapısı).
  const gate = conversation.customerId ? await anchorGateOf(db, conversation.customerId) : null;
  const cartLink = bosKap();
  const result = await runTask(
    ticketDraftTask,
    gate?.ask ? { ...context, identity: { ask: gate.ask } } : context,
    { ...(await runOpts(db, conversation.customerId, opts, gate, { conversation, sink: cartLink })), usageContext: { conversationId: conversation.id } },
  );
  if (!result.ok) return { status: 'failed', reason: result.reason };

  /* Taslak kanala göre biçimlenir, çünkü operatör kutudaki metni olduğu gibi gönderir. Sepet bağlantısı da taslağa burada girer;
     operatör görür, isterse siler. */
  // Model bağlantı vaat edip aracı çağırmadıysa sistem üretir.
  cartLink.link ??= await cartLinkIfDue(db, conversation, { reply: result.data.reply, cartWritten: cartLink.wrote && cartLink.ready });
  if (cartLink.cards.length > 0) {
    // Taslak yolunda kart gönderilmez: operatör onaylamadığı bir şeyi göndermiş olurdu.
    logger.info({ context: 'application/conversation-ai', conversationId: conversation.id, cards: cartLink.cards.length }, 'taslak yolunda ürün kartı gönderilmedi');
  }
  await conversations.update({
    id: conversation.id,
    aiDraftReply: withCartLink(formatForChannel(result.data.reply, conversation.source), cartLink.link),
    aiDraftGeneratedAt: new Date().toISOString(),
  });
  /* Taslak iki yüzeyde görünür: çoğul zil kuyruğun rozetini, tekil zil açık yazışmadaki kartı tazeler. */
  await ringConversationsBell();
  await ringConversationBell(conversation.id);
  return { status: 'generated' };
}

/**
 * Beyan hukuki yükümlülüktür (AB Yapay Zekâ Yasası madde 50, Meta politikası), bu yüzden modele bırakılmaz, cevaba koddan eklenir. İnsana
 * geçiş yolu ilk mesajda duyurulmaz ama vardır: müşteri isteyince ajan devreder.
 */
const AI_DISCLOSURE = `Merhaba! Ben ${brand.name} yapay zekâ asistanıyım; ürünler, fiyatlar ve siparişiniz için 7/24 buradayım.`;

/** Devirde müşteriye sebep yazılmaz, iç arıza müşterinin sorunu hâline gelmesin; sebep log'a ve kuyruğa gider. */
const HANDOFF_NOTICE = 'Bu konuda size bir yetkilimiz yardımcı olacak — en kısa sürede dönüş yapacağız.';

/**
 * Soru cevabın sonuna eklenir, ayrı mesaj ikinci bir bildirim olurdu. Kaydı ajan yapmaz ve metin bunu vaat etmez: modelin "evet mi
 * dedi" yorumu GDPR'ın açık rıza şartını bir tahmine dayandırırdı, müşteri izni tercihler sayfasından kendi açar.
 */
const OPT_IN_QUESTION =
  'Bu arada: kampanyalarımızdan haberdar olmak isterseniz hesabınızın tercihler sayfasından açabilirsiniz — istemezseniz bir şey yapmanıza gerek yok.';

/** İzin sorusunun en erken turu, parametrik: önce yardım, sonra istek. */
const OPT_IN_MIN_TURNS = 4;

/**
 * Güvenli taraf daima devirdir: boş cevap devredilir, şemaya uymayan cevap yazılmaz. Yanlış cevap geç cevaptan pahalıdır ve geri
 * alınamaz.
 */
export async function runAutonomousTicketReply(db: SupabaseClient, ticketId: string, opts: SupportAiOpts = {}): Promise<SupportAiOutcome> {
  const tickets = new TicketService(db);
  const ticket = await tickets.getById(ticketId);
  if (!ticket) return { status: 'skipped', reason: 'not_found' };
  if (ticket.handledBy !== 'ai') return { status: 'skipped', reason: 'wrong_mode' };

  const context = await ticketContextOf(db, ticket);
  if (!context) return { status: 'skipped', reason: 'empty_thread' };
  if (context.messages[context.messages.length - 1]?.who !== 'customer') return { status: 'skipped', reason: 'nothing_to_answer' };

  /* Beyan yazışmanın başında ve uzun sessizlikten sonra tekrarlanır; pencereden düşen beyan müşteri için yapılmamış beyandır. Karar
     model çağrılmadan verilir ki model ayrıca selam vermesin. */
  const alreadyDisclosed = context.messages.some((message) => message.who === 'ai');
  const result = await runTask(
    ticketAgentTask,
    alreadyDisclosed ? context : { ...context, greeting: true as const },
    { ...(await runOpts(db, ticket.customerId, opts)), usageContext: { ticketId: ticket.id } },
  );
  if (!result.ok) return { status: 'failed', reason: result.reason };

  // Cevap ham gider; gerekçe taslak yolundaki yorumda.
  const reply = result.data.action === 'reply' ? (result.data.reply ?? '').trim() || null : null;
  if (!reply) {
    // Devir: sebep KAYDA geçer ama müşteri metnine sızmaz — operatör kuyrukta görür.
    const reason = result.data.handoffReason?.trim() || 'AI cevap veremedi — sebep bildirmedi.';
    await tickets.setMode(ticket.id, 'human');
    logger.info({ context: 'application/ticket-ai', ticketId: ticket.id }, `özerk ajan insana devretti: ${reason}`);
    // Zil çalmazsa kuyruk hâlâ "AI yürütüyor" yazar ve kimse o talebe bakmaz.
    await ringTicketsBell();
    return { status: 'handoff', reason };
  }

  const written = await tickets.reply({
    ticketId: ticket.id,
    sender: 'ai',
    body: alreadyDisclosed ? reply : `${AI_DISCLOSURE}\n\n${reply}`,
    newStatus: statusAfterStaffReply(ticket.status),
  });
  /* Çeviri haberden ve zilden önce: müşteri cevabı ilk görüşte kendi dilinde okusun. */
  await translateTicketMessageNow(db, written, opts.model ? { model: opts.model } : {});
  /* Mail anında gitmez, kuyruğa girer: özerk ajan arka arkaya cevap verebildiği için erteleme burada daha da gerekli. */
  await queueTicketReplyMail(db, ticket);
  await ringTicketsBell();
  // Müşteri de yazışmayı açık tutuyor olabilir; onun kanalı ayrı.
  await ringTicketBell(ticket.id);
  return { status: 'replied' };
}

/**
 * `refused` (bizim kuralımız: pencere kapalı, hesap kimliği yok) insana devredilir; geçici `failed` modu değiştirmez ki yapılandırma
 * boşluğu kalıcı bir veri değişikliğine dönmesin. Defter yazımı gönderim kapısındadır, ajan ikinci kayıt yazmaz.
 */
export async function runAutonomousConversationReply(
  db: SupabaseClient,
  sender: MessageSender,
  conversationId: string,
  opts: SupportAiOpts = {},
): Promise<SupportAiOutcome> {
  /* Aynı sohbete iki cevap yazılamaz: tarama ile gelen mesajın tetiği aynı satıra denk gelebilir ve müşteriye iki mesaj gider. Kilit
     bellekte, çünkü backend tek süreç ve kaybı zararsız: sonraki tur yeniden dener. */
  if (inFlightConversations.has(conversationId)) return { status: 'skipped', reason: 'in_flight' };
  inFlightConversations.add(conversationId);
  try {
    return await autonomousConversationReply(db, sender, conversationId, opts);
  } finally {
    inFlightConversations.delete(conversationId);
  }
}

/** Cevabı üretilmekte olan sohbetler. */
const inFlightConversations = new Set<string>();

async function autonomousConversationReply(
  db: SupabaseClient,
  sender: MessageSender,
  conversationId: string,
  opts: SupportAiOpts,
): Promise<SupportAiOutcome> {
  const conversations = new ConversationService(db);
  const conversation = await conversations.getById(conversationId);
  if (!conversation) return { status: 'skipped', reason: 'not_found' };
  if (conversation.handledBy !== 'ai') return { status: 'skipped', reason: 'wrong_mode' };

  const context = await conversationContextOf(db, conversation);
  if (!context) return { status: 'skipped', reason: 'empty_thread' };
  if (context.messages[context.messages.length - 1]?.who !== 'customer') return { status: 'skipped', reason: 'nothing_to_answer' };

  /* Beyan penceredeki AI mesajına bakar; otuz mesaj önceki beyan müşteri için yapılmamış beyandır. */
  const alreadyDisclosed = context.messages.some((message) => message.who === 'ai');

  /**
   * Sessiz devir yok: Meta politikası otomatik hizmetin her girdiye cevap vermesini ister. `notify` false ise devir gönderemediğimiz
   * için olmuştur ve haber de gidemez.
   */
  const handOff = async (reason: string, notify: boolean): Promise<SupportAiOutcome> => {
    if (notify) {
      const outcome = await sendOutboundMessage(db, sender, {
        conversationId: conversation.id,
        text: alreadyDisclosed ? HANDOFF_NOTICE : `${AI_DISCLOSURE}\n\n${HANDOFF_NOTICE}`,
        author: 'ai',
      });
      /* Haber gidemezse DEVİR YİNE OLUR. Tersi olsaydı, gönderilemeyen bir bildirim yüzünden sohbet
         AI'da asılı kalır ve ajan bir sonraki turda aynı cevabı yeniden üretmeye çalışırdı. */
      if (outcome.status !== 'sent') {
        logger.warn(
          { context: 'application/conversation-ai', conversationId: conversation.id, reason: outcome.reason },
          'devir haberi müşteriye GÖNDERİLEMEDİ — devir yine de yapılıyor',
        );
      }
    }
    await conversations.setMode(conversation.id, 'human');
    logger.info({ context: 'application/conversation-ai', conversationId: conversation.id }, `özerk ajan insana devretti: ${reason}`);
    /* Sebep sohbetin iç notuna da yazılır: operatör "AI neden bıraktı"yı devrin olduğu yerde okur. Not bir izdir, devrin şartı değil. */
    await new ConversationNoteService(db)
      .insert({ conversationId: conversation.id, author: 'ai', body: `AI devretti — ${reason}` })
      .catch((err: unknown) =>
        logger.warn({ context: 'application/conversation-ai', conversationId: conversation.id, err: String(err) }, 'devir notu yazılamadı'),
      );
    // Kuyruk hâlâ "AI yürütüyor" yazarsa kimse bakmaz; tekil zil açık ekrandaki mod çipini tazeler.
    await ringConversationsBell();
    await ringConversationBell(conversation.id);
    return { status: 'handoff', reason };
  };

  /* Kimliği çözülmemiş sohbette ajan yalnız kamusal bilgiyle konuşur. Kimlik sorusu yalnız sohbette sorulur, çünkü çapanın cevabı
     müşterinin kendi numarasından gelmek zorunda. */
  const gate = conversation.customerId ? await anchorGateOf(db, conversation.customerId) : null;
  const cartLink = bosKap();
  const result = await runTask(
    ticketAgentTask,
    {
      ...context,
      ...(gate?.ask ? { identity: { ask: gate.ask } } : {}),
      // Karşılamayı sistem verir: model selam vermez, iki "Merhaba" gitmez.
      ...(alreadyDisclosed ? {} : { greeting: true as const }),
    },
    { ...(await runOpts(db, conversation.customerId, opts, gate, { conversation, sink: cartLink })), usageContext: { conversationId: conversation.id } },
  );
  if (!result.ok) return { status: 'failed', reason: result.reason };

  /* Kanal biçimi gönderimden önce: Messenger/IG işaretleri çizmez. Sepet bağlantısı biçimlendirmeden sonra eklenir ki sökücü
     bağlantının alt çizgisine dokunmasın. */
  const govdeMetni = result.data.action === 'reply' ? formatForChannel(result.data.reply ?? '', conversation.source).trim() || null : null;
  /* Model bağlantı vaat edip aracı çağırmasa da sepet doluysa sistem bağlantıyı üretir; kural `cartLinkIfDue`da. */
  cartLink.link ??= await cartLinkIfDue(db, conversation, { reply: govdeMetni, cartWritten: cartLink.wrote && cartLink.ready });
  const reply = govdeMetni ? withCartLink(govdeMetni, cartLink.link) : null;
  if (!reply) return handOff(result.data.handoffReason?.trim() || 'AI cevap veremedi — sebep bildirmedi.', true);

  /* İzin sorusu üç deterministik şarta bağlı: kanal WhatsApp (izin şeması yalnız e-posta ve WhatsApp taşır), daha önce sorulmamış,
     yeterince tur geçmiş. Cevap gelmese de tekrar sorulmaz: ısrar retten kötü izlenim bırakır. */
  const musteriMesaji = context.messages.filter((m) => m.who === 'customer').length;
  // Sepet bağlantısı taşıyan cevaba izin sorusu eklenmez: o mesajın tek işi ödeme bağlantısı.
  const izinSorulacak =
    conversation.source === 'whatsapp' && conversation.optInAskedAt === null && musteriMesaji >= OPT_IN_MIN_TURNS && !cartLink.link;

  const govde = izinSorulacak ? `${reply}\n\n${OPT_IN_QUESTION}` : reply;

  /* Ürün kartları metinden önce, çünkü metin onlara atıf yapar. Kart gidemezse metin yine gider: kartsız cevap cevapsız müşteriden iyidir. */
  for (const kart of cartLink.cards) {
    const kartSonucu = await sendOutboundMessage(db, sender, {
      conversationId: conversation.id,
      text: kart.text,
      kind: 'interactive',
      payload: { interactive: kart.interactive, productCard: true },
      author: 'ai',
      language: kart.language,
    });
    if (kartSonucu.status !== 'sent') {
      logger.warn(
        { context: 'application/conversation-ai', conversationId: conversation.id, reason: kartSonucu.reason },
        'ürün kartı gönderilemedi — metin cevabı yine gidiyor',
      );
    }
  }

  const outcome = await sendOutboundMessage(db, sender, {
    conversationId: conversation.id,
    text: alreadyDisclosed ? govde : `${AI_DISCLOSURE}\n\n${govde}`,
    /* Yazar `ai`: boş kalsaydı RPC gideni `admin` sayar, ekranın AI tonu ve kuyruğun AI süzgeci yanlış kümeyi gösterirdi. */
    author: 'ai',
  });

  if (outcome.status === 'refused') return handOff(`gönderilemedi: ${outcome.reason}`, false);
  if (outcome.status === 'failed') {
    /* Kalıcı sağlayıcı reddi de devirdir: geçersiz alıcı ya da jeton tekrar denemekle düzelmez, aynı reddi Meta'ya ısrarla yedirmek
       hesabı riske atar. Yapılandırma boşluğu (`not_configured`) bu sınıfa girmez; jeton gelince aynı tur gider. */
    if (outcome.reason !== 'not_configured' && !outcome.retryable) {
      return handOff(`gönderilemedi (kalıcı sağlayıcı reddi): ${outcome.reason}`, false);
    }
    logger.warn(
      { context: 'application/conversation-ai', conversationId: conversation.id, reason: outcome.reason },
      'özerk cevap gönderilemedi — geçici; mod DEĞİŞMEDİ, sonraki tur yeniden denenecek',
    );
    return { status: 'failed', reason: outcome.reason === 'not_configured' ? 'send_not_configured' : 'provider_error' };
  }

  /* Damga gönderim başarılı olduktan sonra: önce atılsaydı müşteriye hiç ulaşmayan soru bir daha sorulmazdı. */
  if (izinSorulacak) await conversations.markOptInAsked(conversation.id);

  /* Operatör sohbeti açık tutuyorsa ajanın cevabını görmeli. */
  await ringConversationsBell();
  await ringConversationBell(conversation.id);
  return { status: 'replied' };
}
