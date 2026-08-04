import type { SourceLanguage, Ticket, TicketMessage, TicketQueueRow } from '@lezzet/types';

/**
 * Talep görünüm sözleşmesi (16.1) — **iki yüzeyin ortak veri kapısı.**
 *
 * Müşteri ve operasyon aynı talebi okur ama aynı şeyi GÖRMEZ: müşteri kendi anlatımını ve
 * cevapları görür, operasyon ayrıca müşterinin geçmişini ve iade zeminini görür. Bu yüzden iki
 * ayrı görünüm tipi vardır — tek bir "her şeyi taşıyan" tip, bir gün müşteri ekranına iç bilgi
 * sızdırmanın en kolay yolu olurdu.
 *
 * `design/pages/musteri-talep.md` + `design/pages/admin-talepler.md` bağlayıcı.
 */

/**
 * Yazışmadaki tek mesaj — ekranın gördüğü hâl.
 *
 * **Metin OKUYUCUNUN dilinde gelir** (20.2) ve yazışmada bu iki yönlüdür: müşteri kendi dilinde
 * yazar personel Türkçe okur, personel Türkçe yazar müşteri kendi dilinde okur. Tek yön çevirmek
 * yazışmanın yarısını anlaşılmaz bırakırdı — sorusu okunan ama cevabı okunamayan bir talep.
 *
 * Alan üçlüsü ürün yorumundakiyle (`PublishedReview`) BİLEREK aynı: iki ekran aynı rozeti ve aynı
 * "orijinali göster" bağını çiziyor, iki ayrı adlandırma ikisini iki ayrı komponente zorlardı.
 */
export interface TicketMessageView {
  id: string;
  sender: TicketMessage['sender'];
  /** Okuyucunun dilinde gösterilecek metin; o dile çeviri yoksa orijinalin kendisi. */
  body: string;
  /** Gösterilen metin makine çevirisi mi — ekran bunu işaretlemeli ("otomatik çevrildi"). */
  bodyTranslated: boolean;
  /** ORİJİNALİN dili — `lang` özniteliği ve "orijinali göster" için. `null` = tespit koşmadı. */
  language: SourceLanguage | null;
  /** Orijinal metin — ekran "orijinali göster" derse bunu basar; çeviri onun yerine GEÇMEZ. */
  originalBody: string;
  /** Public okuma URL'leri; anahtar değil (ekran anahtarla bir şey yapamaz). */
  attachmentUrls: string[];
  createdAt: string;
}

/** Talebe bağlı siparişin künyesi — tam sipariş değil, tanınmasına yetecek kadarı. */
export interface TicketOrderRef {
  id: string;
  /** Müşterinin bildiği numara ("LZA-2451"). Henüz üretilmemişse null. */
  referenceNo: string | null;
  /** Müşterinin işaretlediği kalemler — şikâyetin somut zemini. */
  markedItems: Array<{ id: string; name: string; qty: number }>;
}

/**
 * İadenin sonucu — **siparişten türetilir**, talepte saklanmaz (DOMAIN §8).
 *
 * `triggeredAt` talebin kendi damgasıdır (iadeyi bu talep doğurdu); `refundedCents` siparişin para
 * hareketlerinden gelir. İkisi ayrı kaynaklardan geldiği için "tetiklendi ama henüz ödenmedi" hâli
 * kendiliğinden görünür — tek bir alan olsaydı o ara hâl kaybolurdu.
 */
export interface TicketReturnOutcome {
  triggeredAt: string;
  refundedCents: number;
}

/**
 * "Taleplerim" listesinin tek satırı (08.6) — **taranmaya yetecek kadarı.**
 *
 * Yazışma taşımaz: liste yirmi talebin yirmi mesaj dizisini çekmek zorunda değil, o detayın işi.
 * `lastMessageAt` hem sıralama ölçütü hem ekranın "son mesaj: bugün" satırı — tasarımın kartta
 * gösterdiği iki bağlam (o an ve siparişin numarası) `ticket_queue` görünümünde zaten türetilmiş
 * durumda; ham talep satırından okumak sayfa başına iki ek tur olurdu.
 */
export interface CustomerTicketSummary {
  id: string;
  type: Ticket['type'];
  status: Ticket['status'];
  subject: string | null;
  createdAt: string;
  /** Son mesajın anı — liste bu sıraya göre gelir (cevaplanan talep başa çıkar). */
  lastMessageAt: string;
  /** Bağlı siparişin müşteri numarası ("LZA-2451"); siparişsiz talepte null. */
  orderReferenceNo: string | null;
}

/**
 * Müşterinin gördüğü talep. **İç durum adları burada da `status`'tür** — çeviri yüzeyin işi
 * (messages.json); veri kapısı iki ayrı durum alanı taşımaz.
 */
export interface CustomerTicketView {
  id: string;
  type: Ticket['type'];
  status: Ticket['status'];
  subject: string | null;
  createdAt: string;
  order: TicketOrderRef | null;
  messages: TicketMessageView[];
  /** "↩ 5,90 € iade edildi" satırı; iade yoksa null. */
  returnOutcome: TicketReturnOutcome | null;
  /** Müşterinin şu an yapabileceği durum değişiklikleri (pratikte yalnız "yeniden aç"). */
  allowedTransitions: readonly Ticket['status'][];
}

/** Kuyruk satırı — tarama için gereken her şey, tek turda. */
export interface TicketQueueItem {
  id: string;
  customerName: string;
  type: Ticket['type'];
  status: Ticket['status'];
  /** Talebi ŞU AN kim yürütüyor — satır rozeti ("AI yürütüyor"). */
  handledBy: Ticket['handledBy'];
  /**
   * AI bu talepte HİÇ konuştu mu — rozetten AYRI bir bilgi (16.5): devralınan talep "AI yürütüyor"
   * değildir ama "AI yanıtladı"dır. Kalite denetimi tam da o kümeye bakar.
   */
  answeredByAi: boolean;
  source: Ticket['source'];
  /** Son mesajın ilk satırı, okuyucunun dilinde — kuyrukta okunan önizleme. */
  preview: string;
  /** Önizleme makine çevirisi mi — ekran isterse küçük bir işaret koyar. */
  previewTranslated: boolean;
  lastMessageAt: string;
  /** Son sözü müşteri söyledi: top bizde. */
  awaitingReply: boolean;
  hasAttachment: boolean;
  orderReferenceNo: string | null;
  /** Bozuk/eksik — kuyruğun "bu iş para işi" işareti. */
  returnBound: boolean;
}

/**
 * Operasyonun gördüğü talep detayı. Kuyruk satırının üstüne yazışmayı, sipariş zeminini ve
 * **müşteri bağlamını** ekler: sürekli şikâyet eden mi, ilk kez mi — karar verirken görülmeli.
 */
export interface StaffTicketDetail {
  ticket: TicketQueueRow;
  customer: { id: string; name: string; email: string | null; phone: string | null; totalTickets: number };
  order: TicketOrderRef | null;
  messages: TicketMessageView[];
  returnOutcome: TicketReturnOutcome | null;
  /** Ekran yalnız bunları sunar — yasak geçiş hiç gösterilmez. */
  allowedTransitions: readonly Ticket['status'][];
  /** İade tetikleme düğmesi açık mı; kapalıysa sebebiyle. */
  returnTrigger: { allowed: true } | { allowed: false; reason: 'no_order' | 'already_triggered' };
}
