import type { SourceLanguage, Ticket, TicketMessage, TicketQueueRow } from '@lezzet/types';

/*
  MÜŞTERİ TALEP GÖRÜNÜMÜ — terfi 21.14 (modül 16).

  Kaynağı `apps/web/lib/ticket/ticket-types.ts`in MÜŞTERİ yarısıdır. Ölçüt karşılandı: aynı
  görünümü artık iki yüzey istiyor (web `/support` + mobil `vTalepler`/`vTalepD`) ve kopyalamak
  yasak (CLAUDE §1). Web dosyası bugün hâlâ kendi ekranlarını besliyor (KÖPRÜ); benimsemesi web
  şeridinin işi — `customer/addresses.ts` ve `order/customer-orders.ts` terfilerinin aynı yolu.

  ── PERSONEL YARISI 21.12'DE GELDİ ──────────────────────────────────────────
  ~~`TicketQueueItem` · `StaffTicketDetail` web'de kaldı: operasyon kuyruğunun ikinci yüzeyi yok~~
  — o ölçüt 26.08'de DOLDU: yönetim bölümünün Y1 şikâyet ekranı (mobil) personel detayını okuyor.
  İki tip + `TicketOrderRef` artık burada; web `ticket-types.ts` köprüyle okur (müşteri üçlüsünün
  10.08 yoluyla aynı). Orkestrasyonları `staff-read.ts` / `staff-write.ts`.

  Ayrımın kendisi de korunuyor ve asıl gerekçe o: müşteri ile operasyon aynı talebi okur ama aynı
  şeyi GÖRMEZ. Tek bir "her şeyi taşıyan" tip, bir gün müşteri ekranına iç bilgi sızdırmanın en
  kolay yolu olurdu.

  ── DİL `PreferredLanguage`, `Locale` DEĞİL ─────────────────────────────────
  Web `@lezzet/i18n`in `Locale`ünü kullanıyor; bu paketin bağımlılığı değil (`package.json`) ve
  olmamalı — paket taşıma-bağımsızdır, Next'in dil kabuğunu bilmez. İki tip bugün aynı üç değeri
  taşıyor; `customer-orders.ts` terfisinde verilen kararın aynısı.
*/

/**
 * Yazışmadaki tek mesaj — ekranın gördüğü hâl.
 *
 * **Metin OKUYUCUNUN dilinde gelir** (20.2) ve yazışmada bu iki yönlüdür: müşteri kendi dilinde
 * yazar personel Türkçe okur, personel Türkçe yazar müşteri kendi dilinde okur. Tek yön çevirmek
 * yazışmanın yarısını anlaşılmaz bırakırdı — sorusu okunan ama cevabı okunamayan bir talep.
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
  /** Süreli imzalı okuma URL'leri; anahtar değil (ekran anahtarla bir şey yapamaz). */
  attachmentUrls: string[];
  createdAt: string;
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
 * "Taleplerim" listesinin tek satırı — **taranmaya yetecek kadarı.**
 *
 * Yazışma taşımaz: liste yirmi talebin yirmi mesaj dizisini çekmek zorunda değil, o detayın işi.
 * `lastMessageAt` hem sıralama ölçütü hem ekranın "son mesaj: bugün" satırı.
 */
export interface CustomerTicketSummary {
  id: string;
  type: Ticket['type'];
  status: Ticket['status'];
  subject: string | null;
  createdAt: string;
  /** Son mesajın anı — liste bu sıraya göre gelir (cevaplanan talep başa çıkar). */
  lastMessageAt: string;
  /** Bağlı siparişin müşteri numarası; siparişsiz talepte null. */
  orderReferenceNo: string | null;
}

/**
 * Müşterinin gördüğü talep — liste satırının üstüne yazışmayı ve iade sonucunu ekler.
 *
 * **İç durum adları burada da `status`'tür** — çeviri yüzeyin işi (`messages.json`); veri kapısı iki
 * ayrı durum alanı taşımaz.
 *
 * **İŞARETLİ KALEMLER YOK** ve bu web'den bir sapma değil, ölçüm: `TicketOrderRef.markedItems`i
 * okuyan tek yer operasyon talep detayıdır (`getStaffTicketDetail` — başka kapı, başka tip); web'in
 * MÜŞTERİ sayfası da onu hiç çizmiyor. Taşımak, hiçbir ekranın basmayacağı bir dizi için detay
 * başına üç ek sorgu (kalem → varyant → ürün adı) olurdu. Sipariş bağı geriye numara olarak kalıyor
 * ve o zaten liste satırında var — ayrı bir `order` nesnesi tek alan için ikinci bir kabuk olurdu.
 */
export interface CustomerTicketView extends CustomerTicketSummary {
  messages: TicketMessageView[];
  /** "↩ 5,90 € iade edildi" satırı; iade yoksa null. */
  returnOutcome: TicketReturnOutcome | null;
}

/* ── PERSONEL YARISI (terfi 21.12 — kaynağı web `ticket-types.ts`, birebir) ── */

export interface TicketOrderRef {
  id: string;
  /** Müşterinin bildiği numara ("LZA-2451"). Henüz üretilmemişse null. */
  referenceNo: string | null;
  /** Müşterinin işaretlediği kalemler — şikâyetin somut zemini. */
  markedItems: Array<{ id: string; name: string; qty: number }>;
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
