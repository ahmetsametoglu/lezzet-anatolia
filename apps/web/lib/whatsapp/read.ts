import {
  ConversationService,
  MessageService,
  OrderService,
  TicketService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import type { Conversation, Message, Order, Ticket, UserProfile } from '@lezzet/types';

/**
 * Konuşma DETAYININ okuması (15.5) — üç panelin tek turu.
 *
 * `lib/` altında, çünkü DB'ye vuran her okuma entegrasyon köküne yazılır (`CLAUDE §4b`) ve sayfa
 * bileşeninin içinde `serviceDb()` çağırmak, o okumayı sınanamaz kılardı. Gelen kutusu listesi
 * BURADA DEĞİL: o tek servis çağrısı (`ConversationInboxService.list`) ve sarmalamak yalnız bir
 * dolaylılık katmanı olurdu.
 */
interface ConversationDetailData {
  conversation: Conversation;
  /** Eskiden yeniye — okunan şey bir sohbet. */
  messages: Message[];
  /** Kimlik çözülmemiş konuşmada `null`; eksik değil, tasarımın bir hâli. */
  customer: UserProfile | null;
  orders: Order[];
  tickets: Ticket[];
}

/**
 * **Mesaj geçmişi bugün TAMAMIYLA okunuyor** (`listByConversation`) ve bu bilinçli.
 *
 * Sayfalı okuma var (`MessageService.listPage`) ama YÖNÜ bu ekranın işine yaramıyor: artan sırada,
 * imleç ileri gidiyor — yani ilk sayfa sohbetin EN ESKİ mesajlarıdır. Sohbet penceresi ise en
 * yenisiyle açılır ve geriye doğru okur; artan sayfalama uzun bir sohbeti aylar öncesinden
 * göstermeye başlardı. Ters yönlü sayfa istendi (talep açık); geldiği gün burası tek satırda geçer.
 *
 * Bugün tamamını okumak DOĞRU ve 15.5'in kendi satırı da bunu yazıyor: adım 1'de mesajlar elle
 * işleniyor, bir avuç satır var. Sınırsız büyüme canlı kanalla başlar → BEKLEYEN(15.7).
 *
 * Sipariş sayısı SINIRLI ve sınır çağırandan gelir (`CONTEXT_ORDER_LIMIT`): sağ panel bir sipariş
 * listesi değil, "bu müşteri kim" bağlamıdır.
 */
export async function readConversationDetail(conversationId: string, orderLimit: number): Promise<ConversationDetailData | null> {
  const db = serviceDb();
  const conversation = await new ConversationService(db).getById(conversationId);
  if (!conversation) return null;

  // Mesajlar ve talepler konuşmanın kendisine bağlı — müşteri çözülmese de okunurlar.
  const [messages, tickets] = await Promise.all([
    new MessageService(db).listByConversation(conversationId),
    new TicketService(db).listByConversation(conversationId),
  ]);

  if (!conversation.customerId) {
    return { conversation, messages, customer: null, orders: [], tickets };
  }

  const [customer, orders] = await Promise.all([
    new UserProfileService(db).getById(conversation.customerId),
    new OrderService(db).listByCustomer(conversation.customerId, { limit: orderLimit }),
  ]);

  return { conversation, messages, customer, orders: orders.rows, tickets };
}
