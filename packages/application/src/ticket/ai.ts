import { runTask, ticketAgentTask, ticketDraftTask, type AiModel, type SupportContextInput } from '@lezzet/ai';
import { brand } from '@lezzet/brand';
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
import { sendOutboundMessage, type MessageSender } from '../messaging/send';
import { ringConversationsBell, ringTicketBell, ringTicketsBell } from '../realtime/bell';
import { translateTicketMessageNow } from './translate';
import { customerSupportTools } from './support-tools';
import { queueTicketReplyMail } from './reply-mail';

/**
 * **AI DESTEK ÇEKİRDEĞİ** (16.5 · 20.4) — hibrit taslak üretimi ve özerk cevap; iki uygulama da
 * (web'in "Taslak öner" düğmesi · backend'in cron'u) BURADAN çağırır, iki kopya doğmaz.
 *
 * ── TİCARİ DEĞER İKİ YOLDAN: GİRDİ VE DAR ARAÇ SETİ ─────────────────────────
 * Sınıf 4'ün kırmızı çizgisi ("stok/fiyat/durum domain-core'dan") iki mekanizmayla korunuyor.
 * Talebin KENDİ bağlamı (sipariş durumu, teslim günü, kalemler) burada DB'den okunup girdiye
 * yazılır. Talebin bağlamında olmayan ama müşterinin sorabileceği şeyler (adresine hangi günler
 * geliniyor, son siparişleri) 16.9'dan beri ARAÇLA cevaplanıyor: `customerSupportTools` müşteri
 * kimliğine kapatılmış, salt okur bir set döndürür ve `runOpts` onu koşuya geçirir. Araçların
 * gövdesi yine motorlara dayanır — model hesaplamaz, okur (`support-tools.ts` künyesi).
 *
 * ── ÖNBELLEK KURALI (20.4) ──────────────────────────────────────────────────
 * Taslak satıra yazılır (`ai_draft_reply` + damga). Son mesajdan SONRA üretilmiş bir taslak varsa
 * model HİÇ çağrılmaz — aynı soruya ikinci kez para ödenmez. `force` yalnız operatörün düğmesi
 * içindir: insan "yeniden üret" diyorsa sebep ondadır.
 */

/** Modele giden yazışmanın tavanı — bağlam freni: kırk mesajlık talepte son 12 mesaj yeter. */
const THREAD_LIMIT = 12;

/**
 * Koşunun araç ayarı (16.9) — **kimlik burada kapanır.**
 *
 * Araçlar müşteri kimliğine kapatılmış hâlde kuruluyor; model onları yalnız çağırabilir, kime ait
 * olduklarını değiştiremez (`support-tools.ts` künyesi). Enjekte model verildiğinde (test) araç
 * geçilmiyor: sahte model araç çağırmaz ve geçmek testi ağa açardı.
 */
function runOpts(db: SupabaseClient, customerId: string, opts: SupportAiOpts) {
  if (opts.model) return { model: opts.model };
  return { tools: customerSupportTools(db, customerId) };
}

export type SupportAiOutcome =
  | { status: 'generated' }
  | { status: 'cached' }
  | { status: 'replied' }
  | { status: 'handoff'; reason: string }
  | { status: 'skipped'; reason: 'not_found' | 'wrong_mode' | 'nothing_to_answer' | 'empty_thread' }
  /**
   * `not_configured` **AI anahtarının** yokluğudur; `send_not_configured` **gönderim jetonunun**.
   * İkisi ayrı, çünkü çağıranın tepkisi ayrı: ilkinde tüm tur anlamsızdır (her tarama model
   * çağıracak), ikincisinde yalnız özerk sohbet taraması anlamsızdır — taslak üretimi çalışmalı.
   * Tek kovaya atmak, jeton eksikken operatörün taslağını da sessizce durdururdu.
   */
  | { status: 'failed'; reason: 'not_configured' | 'send_not_configured' | 'provider_error' | 'invalid_output' };

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

/**
 * İşletme künyesinin görev girdisine giren hâli — TEK yerde kuruluyor.
 *
 * İki bağlam kurucusu (talep · sohbet) aynı değeri geçmek zorunda: ayrı ayrı yazılsaydı biri gün
 * gelip makine biçimini (`+33616990681`) geçer ve müşteriye okunaksız bir numara söylenirdi.
 * `phoneDisplay` bilinçli tercih — bu numara müşterinin OKUYACAĞI hâlidir, `wa.me`'nin istediği
 * biçim değil (marka künyesi ikisini ayrı alanda tutuyor, tam da bu yüzden).
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

  const result = await runTask(ticketDraftTask, context, runOpts(db, ticket.customerId, opts));
  if (!result.ok) return { status: 'failed', reason: result.reason };

  await tickets.update({ id: ticket.id, aiDraftReply: result.data.reply, aiDraftGeneratedAt: new Date().toISOString() });
  // Taslağı çoğu zaman CRON yazıyor (5 dakikada bir tur) — yani ekranda hiçbir şey olmadan beliriyor.
  // Zil çalmazsa operatör taslağı ancak sayfayı elle yenileyince görürdü (16.8).
  await ringTicketsBell();
  return { status: 'generated' };
}

/**
 * Sosyal konuşmanın yazışması → görev girdisi. Sipariş bağı yok — konuşma siparişe bağlanmaz.
 *
 * Kanal KONUŞMADAN okunur, sabit değil (21.08): sabit `'whatsapp'` yazılıydı ve Messenger'dan yazan
 * müşteriye ajan "WhatsApp" diyordu. Kanal adı modele söyleniyor çünkü müşteri onu görüyor.
 */
async function conversationContextOf(db: SupabaseClient, conversation: Conversation): Promise<SupportContextInput | null> {
  const messages = await new MessageService(db).listByConversation(conversation.id);
  if (messages.length === 0) return null;
  return {
    channel: conversation.source,
    business: BUSINESS_CARD,
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

  // Kimliği ÇÖZÜLMEMİŞ konuşmada araç verilmez (16.9): tanımadığımız bir numaranın "benim
  // siparişlerim" sorusu kimin siparişi olduğu belirsizken cevaplanamaz. Kapalı girdiyle koşar.
  const result = await runTask(
    ticketDraftTask,
    context,
    conversation.customerId ? runOpts(db, conversation.customerId, opts) : opts.model ? { model: opts.model } : {},
  );
  if (!result.ok) return { status: 'failed', reason: result.reason };

  await conversations.update({ id: conversation.id, aiDraftReply: result.data.reply, aiDraftGeneratedAt: new Date().toISOString() });
  // Taslağı cron yazdı — WhatsApp ekranı açık duran operatör onu elle yenilemeden görsün (16.8).
  await ringConversationsBell();
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
/**
 * **OTOMATİK ASISTAN BEYANI** — özerk cevabın müşteriye kendini tanıttığı cümle.
 *
 * ── NEDEN PROMPT'TA DEĞİL, BURADA ───────────────────────────────────────────
 * Bu bir hukuki yükümlülük (AB Yapay Zekâ Yasası md. 50; Meta mesajlaşma politikası: *"automated
 * chat experiences must disclose that a person is interacting with an automated service"*) ve
 * modelin unutabileceği bir talimat, yükümlülük olamaz. Prompt'a yazılsaydı beyan sıcaklığa, bağlam
 * uzunluğuna ve modelin o günkü hâline bağlı kalırdı; burada deterministik.
 *
 * ── İKİNCİ CÜMLE SÜS DEĞİL, İKİNCİ YÜKÜMLÜLÜK ───────────────────────────────
 * Meta'nın kuralı beyanla bitmiyor: *"must have a way for users to chat with a human agent as
 * needed"*. Devir kapısı sistemde var (ajan `handoff` seçer, mod insana döner) ama MÜŞTERİ bunu
 * bilmiyordu — bileceği tek yer cevabın kendisi.
 *
 * ── TÜRKÇE, ÇÜNKÜ ÇEVİRİ SONRA ──────────────────────────────────────────────
 * Cevap gövdesine EKLENİYOR ve gövdeyle birlikte `translateTicketMessageNow`den geçiyor: müşteri
 * beyanı da kendi dilinde okuyor. Ayrı bir kanaldan gönderilseydi çeviri kuralını ikinci bir yerde,
 * denetimsiz yaşatırdık (20.2'nin kararı).
 *
 * 15.8'in özerk SOHBET motoru doğduğunda aynı cümleyi kullanır — kanal değişse de yükümlülük aynı.
 */
const AI_DISCLOSURE =
  'Bu cevabı otomatik asistanımız yazdı. Dilediğiniz an bir yetkiliye bağlanmak isterseniz yazmanız yeterli.';

/**
 * **DEVİR HABERİ** (15.8) — ajan susarken müşteriye söylenen tek cümle.
 *
 * Sebep YAZILMAZ ve bu bilinçli: *"stok verisine ulaşamadım"* ya da *"bu soruyu anlamadım"* gibi bir
 * cümle, iç arızayı müşterinin sorunu hâline getirir. Sebep log'a ve kuyruğa gider — operatör görür,
 * müşteri beklemesi gerektiğini bilir. İkisi ayrı bilgi ve ayrı yerlere aittir (`CLAUDE §1`).
 */
const HANDOFF_NOTICE = 'Bu konuda size bir yetkilimiz yardımcı olacak — en kısa sürede dönüş yapacağız.';

/**
 * **İZİN SORUSU** (15.12) — cevabın sonuna eklenir, ayrı mesaj olarak gönderilmez.
 *
 * ── NEDEN AYRI MESAJ DEĞİL ──────────────────────────────────────────────────
 * İkinci bir mesaj ikinci bir bildirim demek: müşteri sorusuna cevap alır, telefonu bir kez daha
 * titrer ve karşısında pazarlama sorusu bulur. Aynı baloncuğun sonuna eklenen bir cümle ise
 * konuşmanın doğal kapanışı gibi okunur. (Pencere içinde ücret farkı yok — ikisi de ücretsiz.)
 *
 * ── METİN OTOMATİK İŞLEME VAAT ETMİYOR ──────────────────────────────────────
 * *"Evet yazmanız yeterli"* diyor ve orada duruyor; kaydı OPERATÖR yapıyor (bugünkü tek yol —
 * `recordConversationOptIn`). Model müşterinin cevabını yorumlayıp izni kendi kaydetseydi, GDPR'ın
 * *"açık ve tereddüde yer bırakmayan"* (md. 4/11) şartını bir tahmine dayandırmış olurduk.
 * İnteraktif düğmeler (15.9) geldiğinde cevap tahmin değil PAYLOAD olur; kayıt o gün otomatikleşir.
 *
 * ── İSTEMEYENE HİÇBİR ŞEY YAPTIRMIYOR ───────────────────────────────────────
 * "İstemezseniz bir şey yapmanıza gerek yok" cümlesi sessizliği RET saymıyor — sessizlik cevapsızdır
 * ve `optIn` false kalır. Söylediği tek şey müşterinin kendini savunmak zorunda olmadığı.
 */
const OPT_IN_QUESTION =
  'Bu arada: kampanyalarımızdan haberdar olmak ister misiniz? "Evet" yazmanız yeterli — istemezseniz bir şey yapmanıza gerek yok.';

/**
 * İzin sorusunun sorulacağı EN ERKEN tur — parametrik ve varsayılanı bilinçli (15.12).
 *
 * İlk mesajda sormak, daha yardım etmeden pazarlama istemektir; müşterinin gözünde cevabın kendisi
 * de o isteğin bahanesi hâline gelir. İki müşteri mesajı, "bir soru soruldu, cevaplandı" eşiğidir.
 * Sayı bir tercih olduğu için sabit: veriye bakarak seçilmedi (yerel veri sahtedir — `CLAUDE`).
 */
const OPT_IN_MIN_TURNS = 2;

export async function runAutonomousTicketReply(db: SupabaseClient, ticketId: string, opts: SupportAiOpts = {}): Promise<SupportAiOutcome> {
  const tickets = new TicketService(db);
  const ticket = await tickets.getById(ticketId);
  if (!ticket) return { status: 'skipped', reason: 'not_found' };
  if (ticket.handledBy !== 'ai') return { status: 'skipped', reason: 'wrong_mode' };

  const context = await ticketContextOf(db, ticket);
  if (!context) return { status: 'skipped', reason: 'empty_thread' };
  if (context.messages[context.messages.length - 1]?.who !== 'customer') return { status: 'skipped', reason: 'nothing_to_answer' };

  const result = await runTask(ticketAgentTask, context, runOpts(db, ticket.customerId, opts));
  if (!result.ok) return { status: 'failed', reason: result.reason };

  const reply = result.data.action === 'reply' ? result.data.reply?.trim() : null;
  if (!reply) {
    // Devir: sebep KAYDA geçer ama müşteri metnine sızmaz — operatör kuyrukta görür.
    const reason = result.data.handoffReason?.trim() || 'AI cevap veremedi — sebep bildirmedi.';
    await tickets.setMode(ticket.id, 'human');
    logger.info({ context: 'application/ticket-ai', ticketId: ticket.id }, `özerk ajan insana devretti: ${reason}`);
    // Devir de EKRANA yansımalı: talep az önce AI'daydı, artık operatörü bekliyor. Zil çalmazsa
    // kuyruk hâlâ "AI yürütüyor" yazar ve kimse o talebe bakmaz (16.8).
    await ringTicketsBell();
    return { status: 'handoff', reason };
  }

  /*
    Beyan YAZIŞMANIN BAŞINDA ve uzun sessizlikten sonra tekrar — politikanın kendi üç anı: *"at the
    beginning of any conversation or message thread, after a significant lapse of time, or when a
    chat moves from human interaction to automated experience"*.

    Ölçüt olarak PENCEREYİ (son N mesaj) kullanıyoruz, yazışmanın tamamını değil ve bu bilinçli: AI
    otuz mesaj önce konuşmuşsa müşteri o beyanı çoktan unutmuştur — pencereden düşmesi tam olarak
    "uzun aralık" demektir. Tamamına bakan bir ölçüt, bir kez beyan edip ömür boyu susmak olurdu.
  */
  const alreadyDisclosed = context.messages.some((message) => message.who === 'ai');
  const written = await tickets.reply({
    ticketId: ticket.id,
    sender: 'ai',
    body: alreadyDisclosed ? reply : `${AI_DISCLOSURE}\n\n${reply}`,
    newStatus: statusAfterStaffReply(ticket.status),
  });
  /* ÇEVİRİ HABERDEN VE ZİLDEN ÖNCE (17.08): müşteri bu cevabı ilk görüşte kendi dilinde okusun.
     Düşerse hiçbir şey olmaz, satır çeviri kuyruğunda kalır (kapının künyesi). */
  await translateTicketMessageNow(db, written, opts.model ? { model: opts.model } : {});
  /* Mail ANINDA gitmez, kuyruğa girer — personel cevabıyla aynı kural (künyesi `reply-mail.ts`de).
     AI cevabı da karşı taraftır ve aynı gürültüyü üretir; hatta özerk ajan arka arkaya cevap
     verebildiği için burada erteleme daha da gerekli. */
  await queueTicketReplyMail(db, ticket);
  await ringTicketsBell();
  // Müşteri de yazışmayı açık tutuyor olabilir — onun kanalı AYRI (künyesi `ringTicketBell`de).
  await ringTicketBell(ticket.id);
  return { status: 'replied' };
}

/**
 * **ÖZERK SOHBET CEVABI** (15.8) — `runAutonomousTicketReply`ın sohbet karşılığı.
 *
 * ── NEDEN AYRI BİR FONKSİYON, AMA AYNI DOSYA ────────────────────────────────
 * İki kanal aynı işi yapmıyor: talep cevabı deftere yazılıp mail kuyruğuna girer, sohbet cevabı
 * SAĞLAYICIYA GİDER ve gidemediği anlar vardır (pencere kapandı, hesap kimliği yok). Ama beyan,
 * devir kuralı ve bağlam kurulumu ortaktır — bu yüzden ayrı dosya değil, aynı dosyada ikinci giriş:
 * `AI_DISCLOSURE` ve `conversationContextOf` tek kopya kalsın.
 *
 * ── SAĞLAYICI PARAMETRE, ÇÜNKÜ UYGULAMA KATMANI HTTP BİLMEZ ─────────────────
 * `sender` dışarıdan geçiliyor (`STACK §4`): cron gerçek Cloud API sürücüsünü verir, test sahte
 * Meta'yı. Motor ikisini ayırt etmez ve etmemeli — ayırt etseydi testte koşan kod, canlıda koşan
 * kod olmazdı.
 *
 * ── "REDDEDİLDİ" İLE "DÜŞTÜ" AYRI SONUÇ DOĞURUR ────────────────────────────
 * Gönderim kapısı bu ikisini bilerek ayırıyor (`send.ts`) ve ajan da öyle davranmalı:
 *
 * · **`refused` → İNSANA DEVİR.** Bu BİZİM kuralımızdır (pencere kapandı, hesap kimliği yok);
 *   tekrar denemek aynı sonucu verir ve müşteri cevapsız kalır. İnsan ise yapabileceği başka
 *   şeyler bilir — onaylı şablon göndermek, aramak. Devretmemek, müşteriyi sessizce beklemede
 *   bırakmak olurdu.
 * · **`failed` → MOD DEĞİŞMEZ.** Bu sağlayıcı ya da YAPILANDIRMA tarafıdır (`not_configured`, ağ
 *   hatası). Jeton eksik diye her sohbeti insana devretmek, bir yapılandırma boşluğunu geri
 *   alınması zor bir VERİ değişikliğine çevirirdi: kuyruktaki her satır "insanda" damgası yer ve
 *   kanal açıldığında hiçbiri geri dönmez. Bir sonraki tur yeniden dener.
 *
 * ── DEFTER YAZIMI BURADA DEĞİL, KAPIDA ──────────────────────────────────────
 * `sendOutboundMessage` gönderimi ve defter yazımını tek kapıda tutuyor; ajan ikinci bir kayıt
 * yazmaz. Yazsaydı, gönderilmemiş bir cevabın deftere düşmesi ihtimali geri gelirdi.
 */
export async function runAutonomousConversationReply(
  db: SupabaseClient,
  sender: MessageSender,
  conversationId: string,
  opts: SupportAiOpts = {},
): Promise<SupportAiOutcome> {
  const conversations = new ConversationService(db);
  const conversation = await conversations.getById(conversationId);
  if (!conversation) return { status: 'skipped', reason: 'not_found' };
  if (conversation.handledBy !== 'ai') return { status: 'skipped', reason: 'wrong_mode' };

  const context = await conversationContextOf(db, conversation);
  if (!context) return { status: 'skipped', reason: 'empty_thread' };
  if (context.messages[context.messages.length - 1]?.who !== 'customer') return { status: 'skipped', reason: 'nothing_to_answer' };

  /* Beyan penceredeki AI mesajına bakar, yazışmanın tamamına değil — gerekçesi talep eşinin
     künyesinde: otuz mesaj önceki beyan, müşteri için hiç yapılmamış beyandır. */
  const alreadyDisclosed = context.messages.some((message) => message.who === 'ai');

  /**
   * Devir tek yerde: iki farklı sebeple (cevap üretilemedi · gönderilemedi) aynı sonuca varılıyor.
   *
   * ── SESSİZ DEVİR YASAK — BEKLEYEN(15.8) BURADA KAPANIYOR ────────────────────
   * Meta mesajlaşma politikası: *"Automated bots must respond to any and all input"*. Modu insana
   * çevirip müşteriye hiçbir şey söylememek, müşteri açısından **cevapsız kalmakla aynı şeydir** —
   * ajan sustu, operatör henüz bakmadı, arada geçen süre müşteri için sessizlik.
   *
   * `notify` parametresi bir kaçamak değil, bir OLGU: devir zaten *gönderemediğimiz için* olduysa
   * (pencere kapandı, hesap kimliği yok) haber de gidemez. O hâlde ikinci kez denemek, aynı reddi
   * bir kez daha yemek ve log'u iki kat gürültüyle doldurmaktır. Devrin kendisi yine kayda geçer.
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
    // Zil şart: kuyruk hâlâ "AI yürütüyor" yazarsa kimse o sohbete bakmaz (16.8).
    await ringConversationsBell();
    return { status: 'handoff', reason };
  };

  /* Kimliği ÇÖZÜLMEMİŞ sohbette araç verilmez — taslak yolunun kuralının aynısı (16.9). Messenger/
     IG'de PSID telefon taşımaz, yani kimliksiz sohbet istisna değil KURAL; ajan o hâlde de konuşur
     ama yalnız herkese açık bilgiyle. */
  const result = await runTask(
    ticketAgentTask,
    context,
    conversation.customerId ? runOpts(db, conversation.customerId, opts) : opts.model ? { model: opts.model } : {},
  );
  if (!result.ok) return { status: 'failed', reason: result.reason };

  const reply = result.data.action === 'reply' ? result.data.reply?.trim() : null;
  if (!reply) return handOff(result.data.handoffReason?.trim() || 'AI cevap veremedi — sebep bildirmedi.', true);

  /*
    İZİN SORUSU (15.12) — üç şart, üçü de deterministik; modele sorulmuyor.

    Kanal WhatsApp olmalı: müşteri kartındaki izin şeması bugün yalnız `email` ve `whatsapp`
    taşıyor, Messenger/IG izni Meta'nın kendi mekanizmasıyla gelecek (`opt-in.ts` künyesi).
    Olmayan bir kanal için izin sormak, dayanağı olmayan bir kayıt üretmekti.

    `optInAskedAt` boş olmalı — bir kez sorulur. Cevap gelmese bile tekrar sorulmaz: ısrar,
    reddin kendisinden daha kötü bir izlenim bırakır ve müşteri sohbeti kapatır.

    Ve yeterince tur geçmiş olmalı (`OPT_IN_MIN_TURNS`) — önce yardım, sonra istek.
  */
  const musteriMesaji = context.messages.filter((m) => m.who === 'customer').length;
  const izinSorulacak =
    conversation.source === 'whatsapp' && conversation.optInAskedAt === null && musteriMesaji >= OPT_IN_MIN_TURNS;

  const govde = izinSorulacak ? `${reply}\n\n${OPT_IN_QUESTION}` : reply;
  const outcome = await sendOutboundMessage(db, sender, {
    conversationId: conversation.id,
    text: alreadyDisclosed ? govde : `${AI_DISCLOSURE}\n\n${govde}`,
    /* Yazar `ai` — "bunu kim söyledi" sorusu sonradan da cevaplanabilmeli (talep eşiyle aynı
       karar). Boş bırakılsaydı RPC gideni `admin` sayardı: ekranın AI tonu ve kuyruğun AI süzgeci
       sessizce yanlış kümeyi gösterirdi. */
    author: 'ai',
  });

  if (outcome.status === 'refused') return handOff(`gönderilemedi: ${outcome.reason}`, false);
  if (outcome.status === 'failed') {
    logger.warn(
      { context: 'application/conversation-ai', conversationId: conversation.id, reason: outcome.reason },
      'özerk cevap gönderilemedi — mod DEĞİŞMEDİ, sonraki tur yeniden denenecek',
    );
    return { status: 'failed', reason: outcome.reason === 'not_configured' ? 'send_not_configured' : 'provider_error' };
  }

  /* Damga GÖNDERİM BAŞARILI olduktan SONRA: önce işaretlenseydi, gönderim düşen bir turda soru
     "sorulmuş" sayılır ve müşteriye hiç ulaşmayan bir izin talebi bir daha asla sorulmazdı.
     Koşullu yazım (`markOptInAsked`) ilk anı koruyor — künyesi serviste. */
  if (izinSorulacak) await conversations.markOptInAsked(conversation.id);

  await ringConversationsBell();
  return { status: 'replied' };
}
