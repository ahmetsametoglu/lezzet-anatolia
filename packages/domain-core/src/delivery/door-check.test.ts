import { describe, expect, it } from 'vitest';
import { doorCheckOf } from './door-check';

/**
 * En değerli iddia sonuncusu: hiç sorulmamış adres uyarı üretmez, çünkü ölçülemeyen şeyi kusur gibi göstermek sevkiyat
 * listesini gürültüye boğar ve gerçek uyarıyı okunmaz kılar.
 */
const snapshot = (over: Record<string, unknown> = {}) => ({
  line1: '192c Rue du Maréchal Foch',
  postalCode: '67000',
  city: 'Strasbourg',
  ...over,
});

describe('doorCheckOf', () => {
  it('kapı doğrulandıysa `confirmed`', () => {
    expect(doorCheckOf(snapshot({ geoPrecision: 'housenumber' }))).toBe('confirmed');
  });

  it('kaba eşleşme `unverified` — sokak, semt, belediye', () => {
    for (const precision of ['street', 'locality', 'municipality']) {
      expect(doorCheckOf(snapshot({ geoPrecision: precision }))).toBe('unverified');
    }
  });

  it('DÜZELTME ÖNERİSİ varsa `elsewhere` — en sert hâl', () => {
    /* Kapı 67380 Lingolsheim'de bulundu, müşteri 67000 Strasbourg'u korudu: kurye var olmayan bir kapıya gider ve bunu orada anlar. */
    const check = doorCheckOf(
      snapshot({ geoPrecision: 'street', geoAltLabel: '192c Rue du Maréchal Foch 67380 Lingolsheim' }),
    );

    expect(check).toBe('elsewhere');
  });

  it('öneri kaba eşleşmeyi YENER — daha keskin bilgi olan kazanır', () => {
    // İkisi birlikte olduğunda söylenecek şey "kapı doğrulanmadı" değil, "doğrusunu bulduk ama müşteri kendininkini korudu"dur.
    expect(doorCheckOf(snapshot({ geoPrecision: 'locality', geoAltLabel: 'başka adres' }))).toBe('elsewhere');
  });

  it('HİÇ SORULMAMIŞ adres uyarı üretmez — `unknown`', () => {
    /* "Doğrulanmadı" demek hakkında hiçbir şey bilmediğimiz bir adresi kusurluymuş gibi gösterirdi. */
    expect(doorCheckOf(snapshot())).toBe('unknown');
    expect(doorCheckOf(null)).toBe('unknown');
  });

  it('boş metin "yazılmış" sayılmaz', () => {
    // Sınır: `''` ile `null` iki ayrı hâl olmasın — biri veri, öteki yokluk.
    expect(doorCheckOf(snapshot({ geoPrecision: '  ' }))).toBe('unknown');
    expect(doorCheckOf(snapshot({ geoPrecision: 'street', geoAltLabel: '   ' }))).toBe('unverified');
  });
});
