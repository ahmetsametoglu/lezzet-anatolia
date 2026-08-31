import { describe, expect, it } from 'vitest';

import { distanceKm } from './distance';
import { orderStops, sortBySequence, type RouteStop } from './route-order';

/**
 * ── U GEOMETRİSİ — bu dosyanın sebebi ───────────────────────────────────────
 * Kullanıcının tarif ettiği gerçek rota: iki paralel hat, aralarında ~1,2 km; hat üzerindeki komşu
 * duraklar arası ~2,2 km. Yani **karşı hattaki durak, kendi hattındaki komşudan YAKIN** — açgözlü
 * "en yakına git" kuralının tam olarak tuzağa düştüğü geometri.
 *
 * Depo (D) güneyde, iki hattın arasında.
 *
 *      A4    B4        (kuzey)
 *      A3    B3
 *      A2    B2
 *      A1    B1
 *          D           (güney — depo)
 */
const DEPOT = { lat: 48.578, lng: 7.742 };
const WEST = [48.6, 48.62, 48.64, 48.66].map((lat, index) => ({
  id: `A${index + 1}`,
  point: { lat, lng: 7.745 },
}));
const EAST = [48.6, 48.62, 48.64, 48.66].map((lat, index) => ({
  id: `B${index + 1}`,
  point: { lat, lng: 7.761 },
}));
const LINES: RouteStop[] = [...WEST, ...EAST];

const idsOf = (result: ReturnType<typeof orderStops>) =>
  result.ok ? result.plan.ordered.map((stop) => stop.id) : [];

/** Tur kaç kez hattan hatta atlıyor. Temiz bir U tam bir kez atlar (tepede döner); zikzak çok. */
const lineSwitches = (ids: readonly string[]) =>
  ids.filter((id, index) => index > 0 && id.charAt(0) !== (ids[index - 1] ?? '').charAt(0)).length;

/** Kimliğe göre durak — dizi indekslemesi yerine, testin okunur kalması için. */
const stopOf = (id: string): RouteStop => {
  const found = LINES.find((stop) => stop.id === id);
  if (!found) throw new Error(`fikstürde yok: ${id}`);
  return found;
};

describe('orderStops — U senaryosu', () => {
  it('geometri gerçekten tuzak: karşı hat, kendi komşusundan yakın', () => {
    // Testin dayandığı varsayım da ölçülüyor — bu satır düşerse aşağıdaki iddiaların anlamı kalmaz.
    const acrossLines = distanceKm(stopOf('A1').point, stopOf('B1').point) as number;
    const alongLine = distanceKm(stopOf('A1').point, stopOf('A2').point) as number;

    expect(acrossLines).toBeLessThan(alongLine);
  });

  it('U çiziyor: bir hattı yukarı, ötekini aşağı — zikzak DEĞİL', () => {
    const result = orderStops({ start: DEPOT, stops: LINES });

    expect(idsOf(result)).toEqual(['A1', 'A2', 'A3', 'A4', 'B4', 'B3', 'B2', 'B1']);
  });

  it('depoya en yakın duraklardan biri EN SON teslim ediliyor', () => {
    // Kullanıcının cümlesinin kendisi (30.08): *"aslında senin depona en yakınlardan bir tanesini
    // en son teslim ediyorsun. Ama en mantıklı rota da bu oluyor."* Bir yorum değil, kırmızıya
    // düşen bir iddia.
    const result = orderStops({ start: DEPOT, stops: LINES });
    if (!result.ok) throw new Error('sıralama yapılamadı');

    const last = result.plan.ordered.at(-1)?.id;
    const byDistanceToDepot = [...LINES]
      .sort((a, b) => (distanceKm(DEPOT, a.point) as number) - (distanceKm(DEPOT, b.point) as number))
      .map((stop) => stop.id);

    expect(last).toBe('B1');
    // Depoya en yakın İKİ duraktan biri — birincisi başlangıç durağı (A1), ikincisi son durak.
    expect(byDistanceToDepot.slice(0, 2)).toContain(last);
  });

  it('iyileştirme gerçekten oldu: toplam, tohum turdan kısa', () => {
    const result = orderStops({ start: DEPOT, stops: LINES });
    if (!result.ok) throw new Error('sıralama yapılamadı');

    expect(result.plan.totalCost).toBeLessThan(result.plan.seedCost);
  });

  it('açgözlü tur bu geometride gerçekten zikzak yapıyor', () => {
    // İddia bir dizi eşitliği DEĞİL, ölçülebilir bir nitelik: kaç kez hat değiştiriliyor.
    // Optimal U tam bir kez değiştirir (tepede döner); NN'in zikzağı çok daha fazla.
    const seed = orderStops({ start: DEPOT, stops: LINES, maxSweeps: 0 });
    const best = orderStops({ start: DEPOT, stops: LINES });

    expect(lineSwitches(idsOf(seed))).toBeGreaterThan(1);
    expect(lineSwitches(idsOf(best))).toBe(1);
  });
});

describe('orderStops — determinizm', () => {
  it('girdi sırası sonucu ETKİLEMEZ', () => {
    // Etkileseydi `createdAt` gizli bir eşitlik bozucu olarak geri sızardı — düzeltmeye çalıştığımız
    // şey arka kapıdan geri gelirdi.
    const shuffled = ['B2', 'A1', 'B4', 'A3', 'B1', 'A2', 'B3', 'A4'].map(stopOf);

    expect(idsOf(orderStops({ start: DEPOT, stops: shuffled }))).toEqual(
      idsOf(orderStops({ start: DEPOT, stops: LINES })),
    );
  });

  it('aynı girdi iki kez, aynı çıktı', () => {
    const first = orderStops({ start: DEPOT, stops: LINES });
    const second = orderStops({ start: DEPOT, stops: LINES });

    expect(first).toEqual(second);
  });

  it('eşit uzaklıkta simetrik geometride yön kuralı sonucu sabitliyor', () => {
    // Depo tam ortada: iki durak eşit uzaklıkta ve tur her iki yönde de aynı maliyette.
    // Kural olmasa hangi yönün döneceği uygulama ayrıntısına kalırdı.
    const symmetric: RouteStop[] = [
      { id: 'batı', point: { lat: 48.6, lng: 7.7 } },
      { id: 'doğu', point: { lat: 48.6, lng: 7.8 } },
    ];
    const center = { lat: 48.6, lng: 7.75 };

    expect(idsOf(orderStops({ start: center, stops: symmetric }))).toEqual(
      idsOf(orderStops({ start: center, stops: [...symmetric].reverse() })),
    );
  });
});

describe('orderStops — ölçülemeyen ve sınır hâlleri', () => {
  it('koordinatsız durak DÜŞMEZ, sırasız kalır', () => {
    const result = orderStops({
      start: DEPOT,
      stops: [...LINES.slice(0, 2), { id: 'Kehl', point: null }],
    });
    if (!result.ok) throw new Error('sıralama yapılamadı');

    expect(result.plan.unplaced).toEqual(['Kehl']);
    expect(result.plan.ordered.map((stop) => stop.id)).not.toContain('Kehl');
  });

  it('depo noktası yoksa REDDEDER — merkez uydurmaz', () => {
    expect(orderStops({ start: null, stops: LINES })).toEqual({ ok: false, reason: 'no_start' });
    expect(orderStops({ start: { lat: Number.NaN, lng: 7.7 }, stops: LINES })).toEqual({
      ok: false,
      reason: 'no_start',
    });
  });

  it('hiçbir durağın noktası yoksa toplam UYDURULMAZ', () => {
    const result = orderStops({ start: DEPOT, stops: [{ id: 'x', point: null }] });

    expect(result).toEqual({ ok: false, reason: 'no_points' });
  });

  it('tavan aşılırsa adlı ret — sessiz KIRPMA yok', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      id: `s${index}`,
      point: { lat: 48.6 + index * 0.01, lng: 7.75 },
    }));

    expect(orderStops({ start: DEPOT, stops: many, maxStops: 4 })).toEqual({
      ok: false,
      reason: 'too_many',
    });
  });

  it('duraklar ayırt edilemiyorsa sıra UYDURULMAZ', () => {
    // Ölçüldü 31.08: GeoNames dökümünde Strasbourg'un 67000/67100/67200 kodları aynı noktayı
    // taşıyor. Posta kodu merkezinden dizilen bir Strasbourg rotasının bütün durakları tek noktaya
    // çöküyor — her sıralama aynı toplamı veriyor ve dönen sıra keyfî oluyor. Keyfî sıra
    // numaralandığı an kurye ona güvenir; doğru cevap "sıralayamadım".
    const sameSpot = ['a', 'b', 'c'].map((id) => ({ id, point: { lat: 48.5839, lng: 7.7455 } }));

    expect(orderStops({ start: DEPOT, stops: sameSpot })).toEqual({
      ok: false,
      reason: 'indistinguishable',
    });
  });

  it('KISMEN çakışık küme sıralanır — kaba sıra da bir sıradır', () => {
    const partly = [
      { id: 'a', point: { lat: 48.5839, lng: 7.7455 } },
      { id: 'b', point: { lat: 48.5839, lng: 7.7455 } },
      { id: 'uzak', point: { lat: 48.66, lng: 7.79 } },
    ];
    const result = orderStops({ start: DEPOT, stops: partly });

    expect(result.ok).toBe(true);
  });

  it('tek durak çakışma sayılmaz', () => {
    const result = orderStops({ start: DEPOT, stops: [{ id: 'tek', point: { lat: 48.6, lng: 7.75 } }] });

    expect(result.ok).toBe(true);
  });

  it('ölçülemeyen bacak varsa tüm hesap reddedilir, sıfır sayılmaz', () => {
    const result = orderStops({
      start: DEPOT,
      stops: LINES.slice(0, 3),
      cost: (from, to) => (from === 0 && to === 2 ? null : 1),
    });

    expect(result).toEqual({ ok: false, reason: 'cost_unavailable' });
  });

  it('tek durak: gidip dönülür', () => {
    const result = orderStops({ start: DEPOT, stops: [stopOf('A1')] });
    if (!result.ok) throw new Error('sıralama yapılamadı');

    expect(result.plan.ordered).toHaveLength(1);
    expect(result.plan.ordered[0]?.seq).toBe(1);
  });
});

describe('orderStops — kesişme ve yanlış kol', () => {
  it('2-opt kesişmeyi söküyor: kare köşeleri sırayla gezilir', () => {
    // Köşeler bilerek çapraz sırayla veriliyor; kesişmesiz tur kareyi çevreleyendir.
    const square: RouteStop[] = [
      { id: 'kuzeydoğu', point: { lat: 48.62, lng: 7.78 } },
      { id: 'güneybatı', point: { lat: 48.58, lng: 7.72 } },
      { id: 'kuzeybatı', point: { lat: 48.62, lng: 7.72 } },
      { id: 'güneydoğu', point: { lat: 48.58, lng: 7.78 } },
    ];
    const ids = idsOf(orderStops({ start: { lat: 48.56, lng: 7.75 }, stops: square }));

    // Komşu köşeler yan yana: çapraz geçiş (kesişme) kalmadı.
    const crossings = ids.filter(
      (id, index) =>
        (id === 'kuzeydoğu' && ids[index + 1] === 'güneybatı') ||
        (id === 'kuzeybatı' && ids[index + 1] === 'güneydoğu'),
    );
    expect(crossings).toHaveLength(0);
  });

  it('araya giren durak kendi koluna yerleşiyor, U bozulmuyor', () => {
    // B0 doğu hattının en güneyi ve depoya EN yakın durak (1,93 km — A1'in 2,46'sından yakın).
    // Doğru tur bu yüzden doğu koldan başlar ve batı kolun en güneyinde biter: yön değişti ama
    // şekil aynı. İddia yön değil ŞEKİL: hat değişimi tek, ve B0 kendi kolunda bitişik duruyor.
    const result = orderStops({ start: DEPOT, stops: [...LINES, { id: 'B0', point: { lat: 48.59, lng: 7.761 } }] });
    const ids = idsOf(result);

    expect(lineSwitches(ids)).toBe(1);
    // B0 batı koluna karışmadı: doğu bloğunun içinde, üstelik en uçta (depoya en yakın kol ucu).
    expect(ids.indexOf('B0')).toBeLessThan(ids.indexOf('B1'));
  });

  it('depoya en yakın durak, tur hangi yönde dönerse dönsün UÇTA kalır', () => {
    // Kullanıcının gözleminin genel hâli: yakınlık durağı başa ya da sona koyar, ORTAYA koymaz —
    // ortaya koymak dönüş bacağını iki katına çıkarırdı.
    const stops = [...LINES, { id: 'B0', point: { lat: 48.59, lng: 7.761 } }];
    const ids = idsOf(orderStops({ start: DEPOT, stops }));
    const nearest = [...stops].sort(
      (a, b) => (distanceKm(DEPOT, a.point) as number) - (distanceKm(DEPOT, b.point) as number),
    )[0]?.id;

    expect([ids[0], ids.at(-1)]).toContain(nearest);
  });

  it('iyileştirme hiçbir geometride turu UZATMAZ', () => {
    // Belirlenimci "rastgele": sabit bir üreteçle 20 geometri; hepsinde toplam ≤ tohum.
    let state = 7;
    const nextUnit = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };

    for (let round = 0; round < 20; round += 1) {
      const stops = Array.from({ length: 9 }, (_, index) => ({
        id: `s${index}`,
        point: { lat: 48.5 + nextUnit() * 0.3, lng: 7.6 + nextUnit() * 0.3 },
      }));
      const result = orderStops({ start: DEPOT, stops });
      if (!result.ok) throw new Error('sıralama yapılamadı');

      expect(result.plan.totalCost).toBeLessThanOrEqual(result.plan.seedCost + 1e-9);
      expect(result.plan.ordered).toHaveLength(9);
    }
  });
});

describe('sortBySequence', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('kayıtlı sıraya göre dizer', () => {
    const sorted = sortBySequence(rows, (row) => row.id, ['c', 'a', 'b']);

    expect(sorted.map((entry) => entry.item.id)).toEqual(['c', 'a', 'b']);
    expect(sorted.map((entry) => entry.seq)).toEqual([1, 2, 3]);
  });

  it('dizide olmayan durak DÜŞMEZ, sırasız olarak sona gider', () => {
    // Bayat bir sıra hiçbir durağı gizleyemesin — `stop_order`ın FK taşımamasının bedeli burada
    // ödeniyor.
    const sorted = sortBySequence(rows, (row) => row.id, ['c']);

    expect(sorted.map((entry) => entry.item.id)).toEqual(['c', 'a', 'b']);
    expect(sorted.map((entry) => entry.seq)).toEqual([1, null, null]);
  });

  it('dizideki yabancı kimlik sessizce yok sayılır', () => {
    const sorted = sortBySequence(rows, (row) => row.id, ['yok', 'b', 'a', 'c']);

    expect(sorted.map((entry) => entry.item.id)).toEqual(['b', 'a', 'c']);
    expect(sorted.map((entry) => entry.seq)).toEqual([1, 2, 3]);
  });

  it('sıra boşsa hepsi sırasız — uydurma numara verilmez', () => {
    const sorted = sortBySequence(rows, (row) => row.id, []);

    expect(sorted.every((entry) => entry.seq === null)).toBe(true);
  });
});
