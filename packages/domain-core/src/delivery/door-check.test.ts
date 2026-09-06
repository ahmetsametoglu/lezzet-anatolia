import { describe, expect, it } from 'vitest';
import { doorCheckOf } from './door-check';

/**
 * Durağın kapı doğrulaması (11.11) — sevkiyat masasının engel şeridini besleyen karar.
 *
 * En değerli iddia sonuncusu: **hiç sorulmamış adres uyarı ÜRETMEZ.** Aksi hâlde bugün Almanya'ya
 * çıkan her sipariş "kapı doğrulanmadı" derdi — orada sağlayıcımız yok, yani hakkında hiçbir şey
 * bilmiyoruz. Ölçemediğimiz şeyi bir kusur gibi göstermek, şeridi gürültüye boğar ve gerçek uyarıyı
 * okunmaz kılar (`CLAUDE §1`).
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
    /* Kullanıcının vakası: kapı 67380 Lingolsheim'de bulundu, müşteri 67000 Strasbourg'u korudu.
       Kurye var olmayan bir kapıya gidiyor ve bunu ancak orada anlayacak. */
    const check = doorCheckOf(
      snapshot({ geoPrecision: 'street', geoAltLabel: '192c Rue du Maréchal Foch 67380 Lingolsheim' }),
    );

    expect(check).toBe('elsewhere');
  });

  it('öneri kaba eşleşmeyi YENER — daha keskin bilgi olan kazanır', () => {
    // İkisi birlikte olduğunda söylenecek şey "kapı doğrulanmadı" değil, "doğrusunu bulduk ama
    // müşteri kendininkini korudu"dur. Şeritte de ayrı satırda ve daha üstte durur.
    expect(doorCheckOf(snapshot({ geoPrecision: 'locality', geoAltLabel: 'başka adres' }))).toBe('elsewhere');
  });

  it('HİÇ SORULMAMIŞ adres uyarı üretmez — `unknown`', () => {
    /* Bugün Almanya kalıcı olarak bu hâlde (sağlayıcı yok). "Doğrulanmadı" demek, hakkında hiçbir
       şey bilmediğimiz bir adresi kusurluymuş gibi göstermek olurdu — ve şerit gürültüye boğulur. */
    expect(doorCheckOf(snapshot())).toBe('unknown');
    expect(doorCheckOf(null)).toBe('unknown');
  });

  it('boş metin "yazılmış" sayılmaz', () => {
    // Sınır: `''` ile `null` iki ayrı hâl olmasın — biri veri, öteki yokluk.
    expect(doorCheckOf(snapshot({ geoPrecision: '  ' }))).toBe('unknown');
    expect(doorCheckOf(snapshot({ geoPrecision: 'street', geoAltLabel: '   ' }))).toBe('unverified');
  });
});
