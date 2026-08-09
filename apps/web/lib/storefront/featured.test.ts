import { describe, expect, it } from 'vitest';
import { pickFeatured, pickRandom, rotateDaily } from './featured';

/**
 * Vitrin seçimi ve günlük rotasyon (08.26) — **saf kurallar, DB'siz.**
 *
 * `apps/web/lib` entegrasyon köküdür (`CLAUDE §4b`) ve bu dosya oraya düşüyor; testin kendisi
 * DB'ye vurmuyor, yalnız proje ayrımı yol tabanlı. Konfigürasyonu tek dosya için esnetmedim.
 *
 * Sınananlar davranışın SÖZÜ, uygulaması değil: "işaretliler varsa yalnız onlar", "hiç işaret
 * yoksa vitrin boş kalmaz", "aynı gün aynı seçim, ertesi gün döner".
 */
const row = (id: string, isFeatured: boolean) => ({ id, isFeatured });

describe('pickFeatured — vitrin işareti', () => {
  it('işaretli varsa YALNIZ onları verir, işaretsizleri karıştırmaz', () => {
    const rows = [row('a', false), row('b', true), row('c', false), row('d', true)];
    expect(pickFeatured(rows, 6).map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('hiç işaret yoksa vitrin BOŞ KALMAZ — sıradan ilk N', () => {
    // Bugünkü gerçek veri hâli: 10 kategori, hiçbiri işaretli değil (ölçüldü 08.08). Boş dönseydik
    // yeni kurulumda ana sayfa kendini kategorisiz açardı.
    const rows = [row('a', false), row('b', false), row('c', false)];
    expect(pickFeatured(rows, 2).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('sırayı DEĞİŞTİRMEZ — sıra `sort_order`dan gelir, ikinci bir vitrin sırası tutulmaz', () => {
    const rows = [row('z', true), row('a', true), row('m', true)];
    expect(pickFeatured(rows, 3).map((r) => r.id)).toEqual(['z', 'a', 'm']);
  });

  it('sınır verilmezse havuzun tamamını verir (koleksiyon bandı kendi sınırını uygular)', () => {
    const rows = [row('a', true), row('b', true), row('c', false)];
    expect(pickFeatured(rows)).toHaveLength(2);
  });

  it('sınır havuzdan büyükse olduğu kadarını verir, doldurmaz', () => {
    expect(pickFeatured([row('a', true)], 6)).toHaveLength(1);
  });
});

describe('rotateDaily — günlük deterministik seçim', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];

  it('AYNI GÜN aynı seçim — sayfa önbelleği kırılmasın', () => {
    const sabah = rotateDaily(pool, 2, new Date('2026-08-08T06:00:00Z'));
    const aksam = rotateDaily(pool, 2, new Date('2026-08-08T21:30:00Z'));
    expect(sabah).toEqual(aksam);
  });

  it('ERTESİ GÜN döner — vitrin tazelenir', () => {
    const bugun = rotateDaily(pool, 2, new Date('2026-08-08T12:00:00Z'));
    const yarin = rotateDaily(pool, 2, new Date('2026-08-09T12:00:00Z'));
    expect(yarin).not.toEqual(bugun);
  });

  it('havuz turlanır — beş günde başa döner, kimse atlanmaz', () => {
    // Tarih GÜN EKLEYEREK kuruluyor, dizeyle değil: ilk sürüm `2026-08-0${8+i}` yazıyordu ve
    // üçüncü turdan sonra `2026-08-010` gibi GEÇERSİZ tarih üretiyordu — `Date` NaN dönüyor,
    // rotasyon `undefined` veriyordu. Test bunu yakaladı; sessiz geçseydi kural sınanmamış olurdu.
    const gunler = Array.from({ length: 5 }, (_, i) => rotateDaily(pool, 1, new Date(Date.UTC(2026, 7, 8 + i, 12)))[0]);
    expect(new Set(gunler).size).toBe(5);
  });

  it('slot sayısı havuzdan büyükse TEKRAR ETMEZ — iki slota aynı koleksiyon konmaz', () => {
    expect(rotateDaily(['tek'], 2, new Date('2026-08-08T12:00:00Z'))).toEqual(['tek']);
  });

  it('boş havuz boş döner — bölüm hiç çizilmez', () => {
    expect(rotateDaily([], 2, new Date('2026-08-08T12:00:00Z'))).toEqual([]);
  });

  it('gün numarası UTC — gece yarısı çevresinde iki istek aynı vitrini görür', () => {
    // Paris'te 08.08 01:00, UTC'de hâlâ 07.08 23:00. Yerel saatle hesaplasaydık aynı anda bakan
    // iki sunucu farklı vitrin gösterirdi.
    const utcGec = rotateDaily(pool, 2, new Date('2026-08-07T23:00:00Z'));
    const utcErken = rotateDaily(pool, 2, new Date('2026-08-07T01:00:00Z'));
    expect(utcGec).toEqual(utcErken);
  });
});

describe('pickRandom — fırsat bandının her istekteki seçimi (09.08)', () => {
  const havuz = ['a', 'b', 'c', 'd', 'e'];

  it('istenen sayıda seçer', () => {
    expect(pickRandom(havuz, 3, () => 0)).toHaveLength(3);
  });

  it('KOPYA ÇIKMAZ — aynı fırsat bantta iki kez görünmez', () => {
    // Karıştırma yerine örnekleme yapıldığının kanıtı: seçilen eleman havuzdan düşüyor.
    for (const p of [() => 0, () => 0.99, () => 0.5]) {
      const secim = pickRandom(havuz, 3, p);
      expect(new Set(secim).size).toBe(3);
    }
  });

  it('havuz sınırdan KÜÇÜKSE olduğu kadarı döner, tekrar etmez', () => {
    expect(pickRandom(['tek'], 3, () => 0)).toEqual(['tek']);
  });

  it('boş havuz boş döner — bant hiç çizilmez', () => {
    expect(pickRandom([], 3, () => 0)).toEqual([]);
  });

  it('seçim GERÇEKTEN havuzdan gelir — uydurma eleman üretmez', () => {
    for (const x of pickRandom(havuz, 3, () => 0.7)) expect(havuz).toContain(x);
  });

  it('farklı rastgelelik farklı seçim verebiliyor — sabit "ilk üç" değil', () => {
    // Kullanıcının istediği davranışın çivisi: ilkinden başlayan ve sonuncudan başlayan iki
    // örnekleme aynı diziyi vermemeli, yoksa öteki fırsatlar hiç görünmezdi.
    expect(pickRandom(havuz, 3, () => 0)).not.toEqual(pickRandom(havuz, 3, () => 0.99));
  });
});
