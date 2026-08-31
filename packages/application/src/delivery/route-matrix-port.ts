/**
 * Yol süresi matrisi portu (11.9 · Aşama 4) — **arayüz; sağlayıcı sonradan takılır.**
 *
 * Desen `shipping/port.ts` ve `geocode-port.ts` ile aynı: bu dosya hiçbir sağlayıcı paketini ithal
 * etmez, fabrika (`route-matrix-provider.ts`) env'i tek yerden okur.
 *
 * ── NEDEN BUGÜN GEREKLİ: KUŞ UÇUŞUNUN SINIRI ÖLÇÜLÜ ─────────────────────────
 * Sıra bugün haversine ile diziliyor ve turun MAKRO şeklini doğru kuruyor (git-dön). Yanıldığı yer
 * mikro sıra: U'yu YARATAN şey yol ağıdır — gidiş yolu ile paralel dönüş yolu arasındaki bariyer
 * (nehir, demiryolu, çift şeritli yolda sola dönüş yasağı, tek yön). Kuş uçuşu bariyerin iki
 * yakasını "200 m" sayar, araç 4 km sürer; kâğıt üstünde kusursuz görünen, bariyer atlayan bir tur
 * çıkar.
 *
 * ── MOTOR DEĞİŞMEDEN TAKILIR ────────────────────────────────────────────────
 * `orderStops` bir `cost(from, to)` fonksiyonu alıyor ve o fonksiyonun kuş uçuşu mu gerçek süre mi
 * olduğunu BİLMİYOR. Değişecek tek şey `stop_order_metric` alanına yazılan kelime.
 */

import type { GeoPoint } from '@lezzet/domain-core';

export interface RouteMatrix {
  /**
   * `durationsSec[i][j]` — `points[i]`den `points[j]`ye sürüş süresi (saniye).
   * Ölçülemeyen çift **`null`** (sıfır DEĞİL): sıfır "aynı yerde" demek olurdu ve ölçülemeyen bacak
   * en ucuz bacak sanılırdı.
   */
  durationsSec: readonly (readonly (number | null)[])[];
  source: RouteMatrixProviderName;
}

export type RouteMatrixProviderName = 'osrm' | 'google' | 'here';

export type RouteMatrixOutcome =
  | { status: 'ok'; matrix: RouteMatrix }
  /** Nokta sayısı sağlayıcının tavanını aşıyor — çağıran kuş uçuşuna düşer ve bunu SÖYLER. */
  | { status: 'too_many_points'; limit: number }
  | { status: 'rate_limited'; retryAfterMs: number }
  | { status: 'unavailable' }
  | { status: 'invalid_response' };

export interface RouteMatrixProvider {
  readonly name: RouteMatrixProviderName;
  /** `points[0]` başlangıçtır (depo); kalanı duraklar. */
  matrix(input: { points: readonly GeoPoint[] }): Promise<RouteMatrixOutcome>;
}

/**
 * Matrisi motorun beklediği `cost` fonksiyonuna çevirir — **ve iki kuralı burada uygular.**
 *
 * **① Ya hep ya hiç:** matriste tek bir `null` hücre varsa `null` döner ve çağıran kuş uçuşuna
 * düşer. Eksik hücreyi "çok pahalı" saymak ölçülemeyen bir şeye sayı uydurmak, sıfır saymak daha
 * da kötüsü olurdu; karışık birim (bir bacak saniye, öteki km) ise sessiz bir saçmalıktır.
 *
 * **② Simetrikleştirme — ve bu bir düzeltme değil, ZORUNLULUK.** Gerçek yol matrisinde A→B ≠ B→A
 * (tek yön, orta refüj). 2-opt bir dilimi TERS ÇEVİRİR, yani ters çevrilen kenarların YÖNÜNÜ
 * değiştirir — asimetrik maliyette hesabı geçersizdir ve bunu hiçbir test yakalamaz, tur yalnız
 * sessizce yanlış olur. Ortalama alarak simetrikleştirmek, hesabı geçerli kılan tek yol.
 * Bedeli kayda geçsin: tek yönlü bir sokakta gerçek süre ile hesaba giren süre farklıdır.
 */
export function costOfMatrix(matrix: RouteMatrix): ((from: number, to: number) => number | null) | null {
  const rows = matrix.durationsSec;
  for (const row of rows) for (const cell of row) if (cell === null) return null;

  return (from, to) => {
    const forward = rows[from]?.[to];
    const backward = rows[to]?.[from];
    if (forward === undefined || forward === null) return null;
    if (backward === undefined || backward === null) return forward;
    return (forward + backward) / 2;
  };
}
