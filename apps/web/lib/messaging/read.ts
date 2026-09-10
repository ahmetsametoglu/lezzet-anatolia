import { resolveOutboundLanguage } from '@lezzet/application';
import { ConversationNoteService, ConversationService, MessageService, TicketService, serviceDb } from '@lezzet/database';
import type { OutboundLanguage } from '@lezzet/domain-core';
import type { Conversation, ConversationNote, Message, Ticket } from '@lezzet/types';

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
/**
 * Mesaj + medya adresi. Adres **imzalı R2 bağlantısı değil, kendi geçidimiz** (`media/[id]/route`).
 *
 * ── NEDEN GEÇİT (07.09, canlı turda ölçüldü) ────────────────────────────────
 * İlk turda buradan imzalı adres dönüyordu ve o adres 15 dakikada ölüyor. Ekran SUNUCUDA çizildiği
 * için adres sayfa yüklendiği an imzalanıyordu: operatör sekmeyi açık bıraktığında fotoğraf kırık
 * kareye, ses `0:00 / 0:00`a döndü. Ölçüm sebebi kesinleştirdi — Origin ile istek 200, süresi
 * geçmiş adres 403.
 *
 * Geçit adresi bayatlatmıyor (tarayıcı her seferinde bize geliyor) ve yetkiyi HER istekte
 * denetliyor; imzalı adres yalnız o anlık yönlendirme için üretiliyor.
 */
export interface MessageWithMedia extends Message {
  /** `null`: mesajın medyası yok — indirme düşmüşse de böyle. Geçit yolu, süreli adres değil. */
  mediaUrl: string | null;
}

/** Medyanın yetkili geçidi — imzalı R2 adresi burada DEĞİL, geçidin arkasında üretilir. */
const MEDIA_GATE = '/operations/social/media';

interface ConversationDetailData {
  conversation: Conversation;
  /** Eskiden yeniye — okunan şey bir sohbet. */
  messages: MessageWithMedia[];
  /** Sohbetin iç notları (15.29) — müşteriye gitmeyen satırlar; ekran mesajlarla zaman sırasında birleştirir. */
  notes: ConversationNote[];
  tickets: Ticket[];
  /**
   * Müşteriye hangi dilde yazılacağı ve dayanağı (15.28) — gönderim kapısıyla AYNI karardan
   * (`resolveOutboundLanguage`). Ekran kendi hesaplasaydı bir gün kapıdan ayrışır ve operatör
   * "Fransızca gönderilir" okurken mesaj Almanca giderdi.
   */
  language: OutboundLanguage;
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

  // Mesajlar, iç notlar ve talepler konuşmanın kendisine bağlı — müşteri çözülmese de okunurlar.
  const [messages, notes, tickets, language] = await Promise.all([
    new MessageService(db).listByConversation(conversationId),
    new ConversationNoteService(db).listByConversation(conversationId),
    new TicketService(db).listByConversation(conversationId),
    resolveOutboundLanguage(db, conversation),
  ]);

  // Adres imzalanmıyor, GEÇİDE işaret ediliyor: imza mesajın açıldığı ana değil, tarayıcının
  // dosyayı istediği ana ait olmalı (künye yukarıda).
  return {
    conversation,
    messages: messages.map((m) => ({ ...m, mediaUrl: m.mediaKey ? `${MEDIA_GATE}/${m.id}` : null })),
    notes,
    tickets,
    language,
  };
}
