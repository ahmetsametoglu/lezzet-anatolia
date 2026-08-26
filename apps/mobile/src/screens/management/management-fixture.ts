/*
  YÖNETİM KARAR EKRANLARININ VERİSİ — FIXTURE (Y1 · Y2 · Y6 gövdeleri, v2 birebir).

  ── KALAN SON PARÇA (21.12 Dilim B sonrası) ─────────────────────────────────
  Hub, gün özeti, Para, TEKLİF ONAYI (Y3) ve TEDARİK (Y4) gerçek uca bağlandı; fixture'ları
  silindi. Kalan yalnız Y1 (şikâyet) + Y2 (istisna) + Y6 (niyet) — üçü de talep/mesaj kümesine
  bağlı ve Dilim C'nin işi (web `lib/ticket` personel yolunun terfisiyle). Uç bağlandıkça ilgili
  blok silinir ve bu dosya en sonunda yok olur.

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

/* ── Y6 · WHATSAPP SİPARİŞ NİYETİ (v2:698-714) ─────────────────────────────── */

export const ORDER_INTENT = {
  /** Numara MASKELİ gelir (v2:704) — kimlik değil, hangi konuşma olduğu bilgisi. */
  phoneMasked: '+33 6 12 … 84',
  ago: '4 dk önce',
  message:
    '"Cumartesi için 2 kg fıstıklı baklava, 1 tepsi su böreği alabilir miyim? Illkirch\'e."',
} as const;
