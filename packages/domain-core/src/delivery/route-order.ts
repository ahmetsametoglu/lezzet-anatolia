/**
 * Durak sırası — **kapalı tur** hesabı (11.9). Saf karar, I/O yok.
 *
 * ── NEDEN AÇGÖZLÜ YAKLAŞIM YASAK ────────────────────────────────────────────
 * Kullanıcının tarif ettiği gerçek rota (30.08): *"bir hatta giderken bir kısmı o hattın
 * paralelindeki başka yoldan geri dönerek teslim edilir — U yaparsın, dolayısıyla depona en
 * yakınlardan birini en SON teslim edersin ama en mantıklı rota da bu oluyor."*
 *
 * Bu bir uç durum değil, problemin TANIMI. "Sıradaki durak, bulunduğum yere en yakın olan" kuralı
 * (nearest neighbour) her adımda haklı görünür ve sonda yalnız bırakır: NN yalnız **bir sonraki
 * bacağı** görür, **dönüş bacağını hiç görmez**. İki paralel hat geometrisinde — karşı hattaki
 * durak kendi hattındaki komşudan yakınken — zikzak çizer ve turun sonunda en uzak uçtan depoya
 * uzun bir bacak öder.
 *
 * Amaç fonksiyonu bu yüzden **turun tamamıdır**: depodan çık, hepsini uğra, depoya dön. Depoya en
 * yakın durağın en sona düşmesi bir anomali değil, optimal turun DOĞAL SONUCUDUR — onu erken teslim
 * etmek dönüş bacağını iki katına çıkarır. U şekli buraya bir kural olarak YAZILMADI; doğru amaç
 * fonksiyonundan kendiliğinden çıkıyor ve testi (`route-order.test.ts`) tam olarak bunu çiviliyor.
 *
 * ── İKİ İYİLEŞTİRİCİ, İKİSİ DE GEREKLİ ──────────────────────────────────────
 * **2-opt** iki kenarı söküp aradaki dilimi ters çevirir; kesişen bir tur her zaman kesişmesizden
 * uzundur, yani bu hamle kesişmeleri temizler. Kesişmesiz kapalı tur, iki paralel hat geometrisinde
 * zorunlu olarak git-dön (U) şeklidir.
 *
 * **Or-opt** ayrıca gerekli çünkü 2-opt yalnız TERSLEME yapar: yanlış kola düşmüş TEK bir durağı
 * turun uzak bir yerine taşıyamaz (taşımak için araya giren her şeyi ters çevirmesi gerekirdi, o da
 * maliyeti artırır → hamle reddedilir). Or-opt 1–3 uzunluğunda ardışık dilimi başka yere taşır.
 *
 * ── DETERMİNİZM: SÜRE BÜTÇESİ YOK, ADIM TAVANI VAR ──────────────────────────
 * Duvar saatine bağlı bir bütçe sonucu MAKİNEYE bağlar: aynı girdi hızlı sunucuda başka, yüklü
 * sunucuda başka sıra verir ve test bir gün sebepsiz kırmızıya döner. Bunun yerine tur tavanı
 * (`maxSweeps`), sabit tarama sırası ve adlandırılmış eşitlik bozucular var. **Girdi dizisinin
 * sırası sonucu etkilemez** — etkileseydi `createdAt` gizli bir eşitlik bozucu olarak geri sızardı,
 * yani düzeltmeye çalıştığımız şey arka kapıdan geri gelirdi.
 */

import { distanceKm, type GeoPoint } from './distance';

/** Sıralanacak durak. Noktası olmayan durak elenmez — `unplaced`a gider. */
export interface RouteStop {
  id: string;
  point: GeoPoint | null;
}

/**
 * İndeksten indekse maliyet. `0` = başlangıç, `1..n` = duraklar, `n + 1` = bitiş.
 * Ölçülemeyen çift için **`null`** — sıfır DEĞİL (`CLAUDE §1`): sıfır "aynı yerde" demek olurdu ve
 * ölçülemeyen bacak en ucuz bacak sanılırdı.
 */
export type CostLookup = (from: number, to: number) => number | null;

/** Sıralamanın yapılamama sebepleri — hepsi ADLI; sessiz boş sonuç yok. */
export type StopOrderRefusal =
  | 'no_start'
  | 'no_points'
  | 'too_many'
  | 'cost_unavailable'
  /**
   * Duraklar birbirinden AYIRT EDİLEMİYOR — hepsi tek noktada (ölçüldü 31.08: GeoNames dökümünde
   * Strasbourg'un 67000/67100/67200 kodlarının üçü de şehrin aynı merkezini taşıyor, yani posta
   * kodu düzeyinde bir rota sıralaması o şehirde SIFIR bilgi üretir).
   *
   * Bu hâlde her sıralama aynı toplamı verir ve dönen sıra keyfîdir. **Keyfî bir sıra, sıra
   * yokluğundan kötüdür**: numaralanmış liste kuryeye "bu hesaplandı" der ve kurye ona güvenir
   * (`CLAUDE §1` — ölçülemeyen değer uydurulmaz). Cevap "sıralayamadım"dır.
   */
  | 'indistinguishable';

export interface OrderedStop {
  id: string;
  /** 1'den başlar. Ekrandaki numara budur. */
  seq: number;
  /** Bir öncekinden (ilkte: başlangıçtan) buraya olan maliyet. */
  legCost: number;
}

export interface StopOrderPlan {
  ordered: readonly OrderedStop[];
  /** Noktası olmayan duraklar — "sona atıldı" DEĞİL, **sırasız**. Ekran onları numarasız gösterir. */
  unplaced: readonly string[];
  /** Turun toplam maliyeti (bitişe dönüş dahil), matrisin birimiyle. */
  totalCost: number;
  /** NN tohum turunun maliyeti — iyileşme ÖLÇÜLEBİLSİN diye saklanıyor, süs değil. */
  seedCost: number;
  /** Kaç iyileştirme turu döndü (teşhis). Tavanı bulduysa hesap erken kesilmiş olabilir. */
  sweeps: number;
}

export type StopOrderResult =
  | { ok: true; plan: StopOrderPlan }
  | { ok: false; reason: StopOrderRefusal };

export interface StopOrderInput {
  /** Turun başlangıcı — depo. Yoksa hesap yapılmaz (`no_start`); merkez uydurulmaz. */
  start: GeoPoint | null | undefined;
  /**
   * Turun bitişi. Verilmezse `start` — yani **kapalı tur**, günün normal hâli. Gün ortasında
   * yeniden hesapta başlangıç son teslim noktası, bitiş depo olur: tur artık AÇIK bir yoldur.
   */
  end?: GeoPoint | null;
  stops: readonly RouteStop[];
  /** Verilmezse kuş uçuşu (haversine). Gerçek yol süresi bir port arkasından takılır. */
  cost?: CostLookup;
  /** Bir günün bir aracı. Aşılırsa **adlı ret** — sessiz kırpma yok. */
  maxStops?: number;
  maxSweeps?: number;
}

const DEFAULT_MAX_STOPS = 60;
const DEFAULT_MAX_SWEEPS = 50;
/** Kayan nokta gürültüsü bir "iyileşme" sayılmasın — yoksa döngü tavana kadar boşa döner. */
const EPSILON = 1e-9;

export function orderStops(input: StopOrderInput): StopOrderResult {
  const start = input.start;
  if (!start || !Number.isFinite(start.lat) || !Number.isFinite(start.lng)) {
    return { ok: false, reason: 'no_start' };
  }

  const placed: RouteStop[] = [];
  const unplaced: string[] = [];
  for (const stop of input.stops) {
    const point = stop.point;
    if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) placed.push(stop);
    else unplaced.push(stop.id);
  }

  if (placed.length === 0) return { ok: false, reason: 'no_points' };
  if (placed.length > (input.maxStops ?? DEFAULT_MAX_STOPS)) return { ok: false, reason: 'too_many' };

  // Düğüm dizilimi: [başlangıç, ...duraklar, bitiş]. Bitiş verilmezse başlangıcın kendisi — kapalı tur.
  const end = input.end ?? start;
  const nodes: GeoPoint[] = [start, ...placed.map((stop) => stop.point as GeoPoint), end];
  const cost = input.cost ?? ((from: number, to: number) => distanceKm(nodes[from], nodes[to]));

  const legs = costTable(nodes.length, cost);
  if (!legs) return { ok: false, reason: 'cost_unavailable' };

  // Duraklar ayırt edilemiyorsa (birden çok durak, ama aralarındaki her bacak sıfır) sıralama bir
  // bilgi üretmez — yalnız keyfî bir dizi üretir. Ölçülemeyen şey uydurulmaz.
  if (placed.length > 1 && indistinguishable(placed.length, legs)) {
    return { ok: false, reason: 'indistinguishable' };
  }

  const idOf = (node: number) => placed[node - 1]?.id ?? '';
  const seed = nearestNeighbourTour(placed.length, legs, idOf);
  const seedCost = tourCost(seed, legs, placed.length);

  const { tour, sweeps } = improve(seed, legs, placed.length, input.maxSweeps ?? DEFAULT_MAX_SWEEPS);
  const oriented = orient(tour, legs, placed.length);

  const ordered: OrderedStop[] = [];
  let previous = 0;
  for (const [index, node] of oriented.entries()) {
    ordered.push({ id: idOf(node), seq: index + 1, legCost: legs(previous, node) });
    previous = node;
  }

  return {
    ok: true,
    plan: {
      ordered,
      unplaced,
      totalCost: tourCost(oriented, legs, placed.length),
      seedCost,
      sweeps,
    },
  };
}

/**
 * Tüm çiftlerin maliyeti önden hesaplanır: 2-opt aynı bacağı binlerce kez sorar ve her seferinde
 * yeniden hesaplamak (ya da uzak bir servise sormak) israf olurdu.
 *
 * **Tek bir ölçülemeyen çift bile tüm tabloyu reddeder** (`null` dönüş). Eksik hücreyi "çok pahalı"
 * sayıp devam etmek, ölçülemeyen bir şeye sayı uydurmak olurdu; sıfır saymak daha da kötü.
 */
function costTable(size: number, cost: CostLookup): Legs | null {
  const table = new Float64Array(size * size);
  for (let from = 0; from < size; from += 1) {
    for (let to = 0; to < size; to += 1) {
      if (from === to) continue;
      const value = cost(from, to);
      if (value === null || !Number.isFinite(value)) return null;
      table[from * size + to] = value;
    }
  }
  // Düz dizi + kapatılmış erişim: iç içe dizi indekslemesi her çağrıda bir "belki tanımsız" üretirdi
  // ve tablo tam dolu olduğu hâlde okuma yerlerine savunma kodu serpiştirmek gerekirdi.
  return (from, to) => table[from * size + to] ?? 0;
}

/** Hazır maliyet erişimi — tablo kapatılmış, her çağrı bir sayı döner. */
type Legs = (from: number, to: number) => number;

/**
 * Duraklar arası HER bacak sıfır mı — yani hepsi aynı noktada mı.
 *
 * Yalnız durak-durak bacaklarına bakılıyor; depoya olan uzaklık ilgisiz (hepsi aynı yerdeyse tur
 * zaten tek gidiş-dönüştür). Kısmi hâl (bazı duraklar çakışık, bazıları ayrı) **sıralanabilir** ve
 * sıralanır: kaba bir sıra da bir sıradır, yeter ki neyin kaba olduğu söylensin (`precision`).
 */
function indistinguishable(count: number, legs: Legs): boolean {
  for (let from = 1; from <= count; from += 1) {
    for (let to = from + 1; to <= count; to += 1) {
      if (legs(from, to) > EPSILON) return false;
    }
  }
  return true;
}

/**
 * Tohum tur. **Tek başına asla kullanılmaz** — çıktısı 2-opt'un girdisi ve `seedCost` olarak
 * saklanıyor ki iyileşmenin gerçekten olduğu ölçülebilsin.
 *
 * Eşit mesafede kimlik küçük olan seçilir: girdi dizisinin sırasının sonuca sızmasını engelleyen
 * eşitlik bozucu budur.
 */
function nearestNeighbourTour(count: number, legs: Legs, idOf: (node: number) => string): number[] {
  const remaining = new Set(Array.from({ length: count }, (_, index) => index + 1));
  const tour: number[] = [];
  let current = 0;

  while (remaining.size > 0) {
    let best = -1;
    for (const node of remaining) {
      if (best < 0) {
        best = node;
        continue;
      }
      const delta = legs(current, node) - legs(current, best);
      if (delta < -EPSILON || (Math.abs(delta) <= EPSILON && idOf(node) < idOf(best))) best = node;
    }
    tour.push(best);
    remaining.delete(best);
    current = best;
  }

  return tour;
}

/**
 * 2-opt + Or-opt, iyileşme kalmayana ya da tavana kadar. Tarama sırası sabit (`i` artan, `j` artan)
 * ve **ilk iyileştirme** kabul ediliyor: "en iyi iyileştirmeyi ara" biraz daha iyi tur bulur ama
 * eşitliklerde seçim kuralı gerektirir ve karmaşıklığı artırır — bu ölçekte kazancı yok.
 */
function improve(seed: readonly number[], legs: Legs, count: number, maxSweeps: number) {
  let tour = [...seed];
  let sweeps = 0;

  while (sweeps < maxSweeps) {
    sweeps += 1;
    if (twoOptSweep(tour, legs, count)) continue;
    const moved = orOptSweep(tour, legs, count);
    if (!moved) break;
    tour = moved;
  }

  return { tour, sweeps };
}

/**
 * Bir 2-opt turu: `i..j` dilimini ters çevirmek turu kısaltıyorsa çevir. Yerinde değiştirir,
 * iyileşme olduysa `true` döner.
 *
 * Kenar hesabı **bitişi de içeriyor** (`nodeAt` `count + 1` dönebiliyor) — dönüş bacağını hesaba
 * katmayan bir 2-opt, NN'in tam da göremediği şeyi göremezdi.
 */
function twoOptSweep(tour: number[], legs: Legs, count: number): boolean {
  let improved = false;

  for (let i = 0; i < tour.length - 1; i += 1) {
    for (let j = i + 1; j < tour.length; j += 1) {
      const before = nodeAt(tour, i - 1, count);
      const after = nodeAt(tour, j + 1, count);
      const first = nodeAt(tour, i, count);
      const last = nodeAt(tour, j, count);
      const current = legs(before, first) + legs(last, after);
      const swapped = legs(before, last) + legs(first, after);
      if (swapped < current - EPSILON) {
        reverse(tour, i, j);
        improved = true;
      }
    }
  }

  return improved;
}

/**
 * Or-opt: 1–3 uzunluğunda ardışık dilimi başka bir yere taşır (her iki yönde de dener).
 *
 * 2-opt'un ulaşamadığı hamle budur — yanlış kola düşmüş tek durak. Yeni dizi döndürür (`splice`
 * tabanlı), yerinde değiştirmez; `null` = iyileşme yok.
 */
function orOptSweep(tour: readonly number[], legs: Legs, count: number): number[] | null {
  for (let length = 1; length <= 3; length += 1) {
    for (let start = 0; start + length <= tour.length; start += 1) {
      const segment = tour.slice(start, start + length);
      const rest = [...tour.slice(0, start), ...tour.slice(start + length)];
      const base = tourCost(tour, legs, count);

      for (let at = 0; at <= rest.length; at += 1) {
        if (at === start) continue;
        for (const piece of [segment, [...segment].reverse()]) {
          const candidate = [...rest.slice(0, at), ...piece, ...rest.slice(at)];
          if (tourCost(candidate, legs, count) < base - EPSILON) return candidate;
        }
      }
    }
  }

  return null;
}

/**
 * **Yön kuralı.** Simetrik maliyette kapalı bir turu ters yönde sürmek AYNI toplamı verir — yani
 * hesap iki geçerli cevap üretir ve hangisinin döneceği uygulama ayrıntısına kalır. Bu yazılmazsa
 * test bir refactor'da sebepsiz sallanır.
 *
 * Kural: **ilk bacağı ucuz olan yön**; eşitse ilk durağın kimliği küçük olan. (Açık yolda —
 * `start ≠ end` — ters çevirmek maliyeti değiştirir, o yüzden yalnız gerçekten eşit olduğunda
 * seçim yapılıyor.)
 */
function orient(tour: readonly number[], legs: Legs, count: number): number[] {
  if (tour.length < 2) return [...tour];

  const reversed = [...tour].reverse();
  const delta = tourCost(reversed, legs, count) - tourCost(tour, legs, count);
  if (delta < -EPSILON) return reversed;
  if (delta > EPSILON) return [...tour];

  const firstOfReversed = nodeAt(reversed, 0, count);
  const firstOfTour = nodeAt(tour, 0, count);
  return legs(0, firstOfReversed) < legs(0, firstOfTour) - EPSILON ? reversed : [...tour];
}

/** Başlangıçtan bitişe, bütün bacaklar. Dönüş bacağı DAHİL — amaç fonksiyonunun kendisi. */
function tourCost(tour: readonly number[], legs: Legs, count: number): number {
  let total = 0;
  let previous = 0;
  for (const node of tour) {
    total += legs(previous, node);
    previous = node;
  }
  return total + legs(previous, count + 1);
}

/** Tur dışına taşan indeks: −1 → başlangıç (0), son → bitiş (count + 1). */
function nodeAt(tour: readonly number[], index: number, count: number): number {
  if (index < 0) return 0;
  if (index >= tour.length) return count + 1;
  return tour[index] ?? count + 1;
}

function reverse(tour: number[], from: number, to: number): void {
  let left = from;
  let right = to;
  while (left < right) {
    const a = tour[left];
    const b = tour[right];
    if (a === undefined || b === undefined) return;
    tour[left] = b;
    tour[right] = a;
    left += 1;
    right -= 1;
  }
}

/**
 * Kayıtlı sırayı bugünkü duraklara uygular.
 *
 * **Dizide olmayan durak DÜŞMEZ**, `seq: null` ile sona gider — bayat bir sıra hiçbir durağı
 * gizleyemesin (`delivery_run.stop_order` künyesindeki kuralın okuma tarafı). Aynı sebeple dizideki
 * yabancı kimlik sessizce yok sayılır: dizi bir sıralamadır, üyelik listesi değil.
 */
export function sortBySequence<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  order: readonly string[],
): { item: T; seq: number | null }[] {
  const rank = new Map(order.map((id, index) => [id, index]));

  return items
    .map((item) => ({ item, rank: rank.get(idOf(item)) }))
    .sort((a, b) => {
      if (a.rank === undefined && b.rank === undefined) return 0;
      if (a.rank === undefined) return 1;
      if (b.rank === undefined) return -1;
      return a.rank - b.rank;
    })
    .map(({ item, rank: position }, index) => ({
      item,
      // Numara dizideki yerden değil, SIRALANMIŞ listedeki yerden gelir: dizide 5. olan durak
      // aradakiler sonuçlandığı için bugün 3. olabilir ve kurye 3 görmeli.
      seq: position === undefined ? null : index + 1,
    }));
}
