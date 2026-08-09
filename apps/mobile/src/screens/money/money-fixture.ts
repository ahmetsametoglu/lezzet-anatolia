/*
  PARA EKRANLARININ VERİSİ — FIXTURE (v2:358-363 + M1/M2 gövdeleri birebir).

  Bu etap UI-ONLY (yönetici kararı 09.08): tahsilat izleme ve gün sonu okumalarının ucu bu dilimde
  YAZILMIYOR. Ekranlar tam çizilir, veri buradan gelir; uç bağlandığı gün bu dosya silinir
  (aynı karar: `screens/management/management-fixture.ts`).

  PARA EKRANLARI SALT OKUNURDUR — tasarımın altın kuralı: "'bakiye düzeltme' diye bir kavram yok —
  hiçbir yazma aksiyonu çizilmez." Bu yüzden fixture'da da bir "hâl" yok: değiştirilecek bir durum
  olmadığı için ekranların yerel durumu da yok.

  Tutarlar CENT; biçim ekranda `money()` ile çözülür. "Vade 12.08" gibi bir alan ise tasarımın
  CÜMLESİ olarak durur (`dueLabel`): vade tarihini biçimleyen bir kapı yok ve uydurma bir tarih
  aritmetiği yazmak, ölçülmemiş bir şeyi ölçülmüş gibi göstermek olurdu (CLAUDE §1 — aynı gerekçe
  `near-expiry-fixture.ts`in `daysLabel`inde).
*/

/** Bekleyen tahsilatın CİNSİ — cümlenin şeklini bu belirler (v2:358-362). */
type PendingKind = 'door' | 'term' | 'partial';

interface PendingCollection {
  id: string;
  reference: string;
  /** Kim ve hangi hâlde — "Restaurant Bosphore · rotada". */
  who: string;
  kind: PendingKind;
  /** Tahsil EDİLECEK tutar; vadeli satırda yoktur (rakam tekrarlanmaz — v2:735). */
  cents?: number;
  method?: 'cash' | 'card';
  /** Yalnız vadeli satırda: "12.08" (uçtan gelecek tarihin bugünkü metin karşılığı). */
  dueLabel?: string;
}

export const PENDING_COLLECTIONS: PendingCollection[] = [
  {
    id: 'p1',
    reference: 'LZA-26-3M8C',
    who: 'Restaurant Bosphore · rotada',
    kind: 'door',
    cents: 4200,
    method: 'cash',
  },
  {
    id: 'p2',
    reference: 'LZA-26-8R4E',
    who: 'Pastane Merve · rotada',
    kind: 'door',
    cents: 124000,
    method: 'cash',
  },
  { id: 'p3', reference: 'LZA-26-4H7G', who: 'C. Acar · vade', kind: 'term', dueLabel: '12.08' },
  { id: 'p4', reference: 'LZA-26-1B2K', who: 'L. Petit · kısmi', kind: 'partial', cents: 1290, method: 'card' },
];

/** Bugün gerçekleşen tahsilatın yöntem kırılımı (v2:738-740). */
export const TODAY_BY_METHOD = [
  { method: 'cash', cents: 8650 },
  { method: 'card', cents: 4050 },
  { method: 'online', cents: 61280 },
] as const satisfies readonly { method: 'cash' | 'card' | 'online'; cents: number }[];

/** Kuryenin üstündeki para — K7'ye dek; online/havale bu dökümde YOKTUR (v2:744). */
export const COURIER_FLOAT = { cashCents: 7800, cardCents: 2250 } as const;

/** Defterden toplanan hesap bakiyeleri (v2:748-750). */
export const ACCOUNT_BALANCES = [
  { account: 'cash', cents: 41230 },
  { account: 'bank', cents: 821477 },
] as const satisfies readonly { account: 'cash' | 'bank'; cents: number }[];

/* ── M2 · GÜN SONU (v2:758-779) ────────────────────────────────────────────── */

interface DayEndSummary {
  collectedCents: number;
  /** İadeler NEGATİF tutulur: işaret veridedir, ekranda uydurulmaz. */
  refundCents: number;
  courierHandoverCents: number;
  /** Beklenen ↔ teslim edilen nakit farkı; `0` = uyuşmazlık yok. */
  discrepancy: { expectedCents: number; deliveredCents: number };
  /**
   * Eşleşmemiş hareket sayısı. `null` = SAYILAMADI ve sıfır DEĞİLDİR (v2:775 bunu ekrana da
   * yazıyor: "sayaç yok (null ≠ 0)") — sıfıra düşürmek, bakılmamış bir defteri "temiz" göstermekti.
   */
  unmatchedMovementCount: number | null;
}

export const DAY_END: DayEndSummary = {
  collectedCents: 73980,
  refundCents: -1290,
  courierHandoverCents: 6800,
  discrepancy: { expectedCents: 7800, deliveredCents: 6800 },
  unmatchedMovementCount: null,
};
