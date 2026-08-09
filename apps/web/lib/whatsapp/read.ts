import { ConversationService, MessageService, TicketService, serviceDb } from '@lezzet/database';
import type { Conversation, Message, Ticket } from '@lezzet/types';

/**
 * Konuşma DETAYININ okuması (15.5) — sohbetin kendi verisi.
 *
 * `lib/` altında, çünkü DB'ye vuran her okuma entegrasyon köküne yazılır (`CLAUDE §4b`) ve sayfa
 * bileşeninin içinde `serviceDb()` çağırmak, o okumayı sınanamaz kılardı.
 *
 * **Müşteri bağlamı BURADA DEĞİL** (`lib/customer/context`): "kim bu, ne aldı, neye izin verdi"
 * sorusunu Talepler ekranı da soruyor ve cevabı tek yerde durmalı. Konuşmanın okumasına gömseydik,
 * iki ekran aynı soruyu iki biçimde cevaplardı — ve biri gün gelip taslak bayrağını unuturdu.
 *
 * Gelen kutusu listesi de burada değil: o tek servis çağrısı (`ConversationInboxService.list`) ve
 * sarmalamak yalnız bir dolaylılık katmanı olurdu.
 */
interface ConversationDetailData {
  conversation: Conversation;
  /** Eskiden yeniye — okunan şey bir sohbet. */
  messages: Message[];
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
 */
export async function readConversationDetail(conversationId: string): Promise<ConversationDetailData | null> {
  const db = serviceDb();
  const conversation = await new ConversationService(db).getById(conversationId);
  if (!conversation) return null;

  // Mesajlar ve talepler konuşmanın kendisine bağlı — müşteri çözülmese de okunurlar.
  const [messages, tickets] = await Promise.all([
    new MessageService(db).listByConversation(conversationId),
    new TicketService(db).listByConversation(conversationId),
  ]);

  return { conversation, messages, tickets };
}
