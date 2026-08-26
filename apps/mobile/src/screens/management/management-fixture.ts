/*
  YÖNETİM KARAR EKRANLARININ VERİSİ — FIXTURE (Y1 · Y2 · Y3 · Y4 · Y6 gövdeleri, v2 birebir).

  ── KALAN SON PARÇA (21.12 Dilim A sonrası) ─────────────────────────────────
  Hub'ın karar kutusu, gün özeti ve Para ekranları GERÇEK uca bağlandı ve o fixture'lar silindi
  (`money-fixture.ts` tamamen; buradan `DECISION_QUEUE` + `DAY_SUMMARY`). Bu dosyada yalnız beş
  KARAR ekranının gövdesi kaldı — aksiyon uçları (Y1 cevap/üstlen · Y2 karar · Y3 teklif ·
  Y4 taslak TS · Y6 not) sonraki dilimlerin işi; uç bağlandıkça ilgili blok silinir ve bu dosya
  en sonunda yok olur.

  ── ETİKET Mİ VERİ Mİ ───────────────────────────────────────────────────────
  Tutar CENT tutulur ve ekranda `money()` ile yazılır — para biçimi yüzeyin kuralıdır, veri değil.
  Buna karşılık "12 dk", "2 gün" gibi alanlar tasarımın CÜMLESİ olarak durur: arkalarında bir
  damga/eşik hesabı var ve o hesabın kapısı yok; uydurma bir zaman aritmetiği yazmak, ölçülmemiş
  bir şeyi ölçülmüş gibi göstermek olurdu (CLAUDE §1).
*/

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
