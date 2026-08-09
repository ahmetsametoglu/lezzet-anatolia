/*
  YÖNETİM EKRANLARININ VERİSİ — FIXTURE (v2:331-357 + Y1–Y6 ekran gövdeleri birebir).

  ── NEDEN FIXTURE, VE NE ZAMAN GİDECEK ──────────────────────────────────────
  Bu etap UI-ONLY (yönetici kararı 09.08): karar kutusunun, şikâyet akışının, istisna motorunun,
  teklif onayının ve gün özetinin BESLENECEĞİ uç yok ve bu dilimde YAZILMAYACAK. Ekranlar yine de
  TAM çalışır (liste · seçim · fiyat düzeltme · üstlenme · onay) çünkü durum ekranın kendisinde
  tutuluyor; uç geldiği gün bu dosya silinir, yerine cevap geçer ve ekranların gövdesi değişmez
  (aynı karar: `near-expiry-fixture.ts`, `notifications-fixture.ts`).

  ── ETİKET Mİ VERİ Mİ ───────────────────────────────────────────────────────
  Tutar CENT tutulur ve ekranda `money()` ile yazılır — para biçimi yüzeyin kuralıdır, veri değil.
  Buna karşılık "12 dk", "2 gün", "kaynak: sipariş" gibi alanlar tasarımın CÜMLESİ olarak durur:
  arkalarında bir damga/eşik hesabı var ve o hesabın kapısı yok; uydurma bir zaman aritmetiği
  yazmak, ölçülmemiş bir şeyi ölçülmüş gibi göstermek olurdu (CLAUDE §1 — aynı gerekçe
  `near-expiry-fixture.ts`in `daysLabel`inde).
*/

/**
 * Karar satırının başındaki noktanın ANLAMI (renk değil — token ekranda çözülür, fixture'a hex
 * girmez). v2:332-336 ölçüldü: nokta bölümü değil işin ACİLİYETİNİ söylüyor.
 */
export type DecisionTone = 'alert' | 'attention' | 'go' | 'warehouse' | 'quiet';

/** Satırın açtığı ekran. Adres (rota dizesi) EKRANIN bilgisidir; veri yalnız hedefi adlandırır. */
export type DecisionTarget = 'complaint' | 'exception' | 'offer' | 'supply' | 'intent';

interface DecisionRow {
  id: string;
  title: string;
  subtitle: string;
  tone: DecisionTone;
  /** "top bizde" — cevap sırası bizde (v2:493); yoksa rozet çizilmez. */
  ourTurn?: boolean;
  target: DecisionTarget;
}

/** v2:331-337 — beş satır, sırası dahil. */
export const DECISION_QUEUE: DecisionRow[] = [
  {
    id: 'd1',
    title: 'Şikâyet — Bozuk ürün',
    subtitle: 'LZA-26-7K1A · 12 dk · 2 ek',
    tone: 'alert',
    ourTurn: true,
    target: 'complaint',
  },
  {
    id: 'd2',
    title: 'Sipariş istisnası — eksik toplama',
    subtitle: 'LZA-26-3M8C · motor önerisi hazır',
    tone: 'attention',
    target: 'exception',
  },
  {
    id: 'd3',
    title: 'Yakın-SKT kampanya onayı',
    subtitle: '3 aday parti · D3’ten',
    tone: 'go',
    target: 'offer',
  },
  {
    id: 'd4',
    title: 'Tedarik önerisi',
    subtitle: '2 grup · 1 eşlenmemiş',
    tone: 'warehouse',
    target: 'supply',
  },
  {
    id: 'd5',
    title: 'WhatsApp sipariş niyeti',
    subtitle: '+33 6 12 … 84 · 4 dk',
    tone: 'quiet',
    target: 'intent',
  },
];

/* ── Y5 · GÜN ÖZETİ (v2:664-696) ───────────────────────────────────────────── */

/** Kanal kırılımının satırı. `cents: null` = ÖLÇÜLEMEDİ ve sıfır DEĞİLDİR (v2:673 aynen böyle). */
interface RevenueChannel {
  key: 'web' | 'door' | 'whatsapp';
  cents: number | null;
}

/** YZ içgörüsünün tonu — iyi / izle / kötü (v2:686-688'in üç noktası). */
export type InsightTone = 'good' | 'watch' | 'bad';

interface DayInsight {
  id: string;
  tone: InsightTone;
  text: string;
}

interface DaySummary {
  orderCount: number;
  preparingCount: number;
  awaitingCollectionCount: number;
  revenueCents: number;
  openComplaintCount: number;
  channels: RevenueChannel[];
  doorPending: { count: number; cents: number };
  tomorrow: { orderCount: number; readyCount: number; unassignedCount: number; doorPaymentCents: number };
  insights: DayInsight[];
}

export const DAY_SUMMARY: DaySummary = {
  orderCount: 31,
  preparingCount: 6,
  awaitingCollectionCount: 5,
  revenueCents: 141260,
  openComplaintCount: 3,
  channels: [
    { key: 'web', cents: 108640 },
    { key: 'door', cents: 32620 },
    { key: 'whatsapp', cents: null },
  ],
  doorPending: { count: 5, cents: 17850 },
  tomorrow: { orderCount: 14, readyCount: 9, unassignedCount: 5, doorPaymentCents: 21200 },
  insights: [
    { id: 'i1', tone: 'good', text: 'B2B siparişleri %18 arttı — perşembe yoğunluğu sürüyor.' },
    { id: 'i2', tone: 'watch', text: 'İzle: su böreği eksik toplaması bu hafta 3. kez.' },
    { id: 'i3', tone: 'bad', text: 'Kötü: ulaşılamayan durak oranı %9’a çıktı — sonraki adım boş.' },
  ],
};

/* ── Y1 · ŞİKÂYET (v2:530-579) ─────────────────────────────────────────────── */

/** Baloncuğun sahibi — hizası, zemini ve künyesi bundan çıkar. */
type ComplaintAuthor = 'customer' | 'assistant' | 'operator';

interface ComplaintMessage {
  id: string;
  author: ComplaintAuthor;
  body: string;
  /**
   * Müşterinin KENDİ dilindeki hâli. Ekranda "orijinali gör" bunu açar (v2:546); çeviri hep
   * gösterilir ama aslı saklanmaz — çevirinin yanlış olduğu an operatörün bakacağı yer burasıdır.
   */
  originalBody?: string;
  /** Yalnız operatör baloncuğunda: konuşan personelin adı. */
  operatorName?: string;
}

interface Complaint {
  reference: string;
  /** "sipariş" — şikâyetin doğduğu yer (v2:535). */
  source: string;
  ago: string;
  /** Şikâyetin türü — v2'de kırmızı rozet ("Bozuk"). */
  kind: string;
  attachmentCount: number;
  ourTurn: boolean;
  /** Müşterinin dili ve çevirinin yönü (v2:544, 566) — kod değil, ekranda yazılan etiket. */
  customerLanguage: string;
  surfaceLanguage: string;
  messages: ComplaintMessage[];
  /** YZ önerisinin gönderilmiş hâli (v2:567) — operatörün adına, müşteri dilinde. */
  assistantReply: string;
  operatorName: string;
}

export const COMPLAINT: Complaint = {
  reference: 'LZA-26-7K1A',
  source: 'sipariş',
  ago: '12 dk',
  kind: 'Bozuk',
  attachmentCount: 2,
  ourTurn: true,
  customerLanguage: 'FR',
  surfaceLanguage: 'TR',
  operatorName: 'Selim',
  messages: [
    {
      id: 'm1',
      author: 'customer',
      body: 'Baklava kutusu ezik geldi, şerbet akmış. Fotoğrafları ekledim.',
      originalBody: "Le coffret de baklava est arrivé écrasé, le sirop a coulé. J'ai joint les photos.",
    },
    {
      id: 'm2',
      author: 'assistant',
      body: 'Özür + yeni kutu önerisi: yarınki rotaya değişim ekleyebiliriz.',
    },
    {
      id: 'm3',
      author: 'operator',
      operatorName: 'Selim',
      body: 'Fotoğrafları aldık, hemen bakıyorum.',
    },
  ],
  assistantReply: 'Özür dileriz — yarınki rotaya yeni kutu değişimi ekliyoruz.',
};

/* ── Y2 · SİPARİŞ İSTİSNASI (v2:581-610) ───────────────────────────────────── */

interface ExceptionLine {
  id: string;
  label: string;
  cents: number;
  /** Eksik toplanan kalem: kaç adet toplandığı ayrıca yazılır ve satır kırmızı okunur. */
  pickedQty?: number;
}

interface OrderException {
  reference: string;
  customer: string;
  status: string;
  lines: ExceptionLine[];
  totalCents: number;
  /** Motorun kararı ve gerekçesi — ekran hesaplamaz, MOTORA sorar (CLAUDE §1: domain-core). */
  engine: { decision: string; reason: string; refundCents: number };
}

export const ORDER_EXCEPTION: OrderException = {
  reference: 'LZA-26-3M8C',
  customer: 'Restaurant Bosphore',
  status: 'Hazırlanıyor',
  lines: [
    { id: 'l1', label: '2 × Fıstıklı Baklava · 1 kg', cents: 6400 },
    { id: 'l2', label: '2 × Su Böreği', cents: 2580, pickedQty: 1 },
  ],
  totalCents: 8980,
  engine: {
    decision: 'Kalanı gönder',
    reason: 'Eksik oran %14, tutar 12,90 € — eşiğin altında; B2B müşteride bekletme maliyeti yüksek.',
    refundCents: 1290,
  },
};

/* ── Y3 · YAKIN-SKT TEKLİF ONAYI (v2:338-342) ──────────────────────────────── */

interface OfferCandidate {
  id: string;
  name: string;
  batchCode: string;
  qty: number;
  /** SKT'ye kalan gün. */
  days: number;
  /** Motorun önerdiği teklif fiyatı; operatör düzeltebilir. */
  suggestedCents: number;
}

export const OFFER_CANDIDATES: OfferCandidate[] = [
  { id: 'o1', name: 'Su Böreği · tepsi', batchCode: 'P-0698', qty: 6, days: 2, suggestedCents: 990 },
  { id: 'o2', name: 'Şöbiyet · 500 g', batchCode: 'P-0703', qty: 9, days: 5, suggestedCents: 720 },
  { id: 'o3', name: 'Kadayıf · 500 g', batchCode: 'P-0709', qty: 5, days: 4, suggestedCents: 560 },
];

/* ── Y4 · TEDARİK ÖNERİSİ (v2:354-357) ─────────────────────────────────────── */

interface SupplyLine {
  id: string;
  name: string;
  current: number;
  threshold: number;
  /** Önerilen sipariş adedi — yoldaki düşülmüş, koli katına yuvarlanmış (v2:648). */
  suggested: number;
  lastPurchaseCents: number;
  /** Başka depoda duran adet — transfer seçeneğinin HAM verisi, kararı değil. */
  elsewhere?: string;
}

interface SupplyGroup {
  supplier: string;
  reference: string;
  lines: SupplyLine[];
}

export const SUPPLY_GROUP: SupplyGroup = {
  supplier: 'Gaziantep Gıda',
  reference: 'TED-04',
  lines: [
    {
      id: 's1',
      name: 'Fıstıklı Baklava · 1 kg',
      current: 6,
      threshold: 20,
      suggested: 24,
      lastPurchaseCents: 2140,
      elsewhere: 'KEHL 14',
    },
    { id: 's2', name: 'Su Böreği · tepsi', current: 2, threshold: 10, suggested: 12, lastPurchaseCents: 810 },
  ],
};

/** Tedarikçisi eşlenmemiş grup — sipariş AÇILAMAZ, ekranda soluk durur (v2:657-660). */
export const UNMAPPED_SUPPLY = {
  variantCount: 1,
  line: 'Acılı Ezme · 250 g — mevcut 4 · eşik 12 · tedarikçi eşlemesi yok',
} as const;

/* ── Y6 · WHATSAPP SİPARİŞ NİYETİ (v2:698-714) ─────────────────────────────── */

export const ORDER_INTENT = {
  /** Numara MASKELİ gelir (v2:704) — kimlik değil, hangi konuşma olduğu bilgisi. */
  phoneMasked: '+33 6 12 … 84',
  ago: '4 dk önce',
  message:
    '"Cumartesi için 2 kg fıstıklı baklava, 1 tepsi su böreği alabilir miyim? Illkirch\'e."',
} as const;
