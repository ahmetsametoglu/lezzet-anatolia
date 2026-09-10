import { describe, expect, it } from 'vitest';
import type { StockStatus } from '@lezzet/types';
import { gitmeyenAlani, kargoYalniz, stokCumlesi, yereGider, yereGoreAyir } from './product-reach';

/**
 * ÜRÜN BU YERE GİDER Mİ (10.09) — ajanın ürün araçlarının yere göre ayıklaması, saf kararlar.
 *
 * Kargo bölgesi entegrasyonda KURULAMIYOR: kargo deposu ülkenin ilk aktif, çevrimiçi satan tesisidir
 * ve paylaşılan DB'de onun var olup olmadığı küresel bir durumdur (`delivery/place.test.ts` künyesi).
 * Dalların kilidi burada; rota bölgesindeki uçtan uca hâl `support-tools.test.ts`te.
 */
const ROTA = { warehouseId: 'rota-deposu', shippingWarehouseId: 'kargo-deposu' };
const KARGO = { warehouseId: null, shippingWarehouseId: 'kargo-deposu' };
const YERSIZ = { warehouseId: null, shippingWarehouseId: null };
const HALLER: StockStatus[] = ['available', 'shipping', 'elsewhere', 'out_of_stock'];

const urun = (name: string, stockStatus: StockStatus, shippable = true) => ({ name, stockStatus, shippable });

describe('yereGider — bilinen yerde yalnız yerel stok ve kargo', () => {
  it('bilinen yerde available ve shipping gider; elsewhere ve out_of_stock gitmez', () => {
    expect(HALLER.filter((h) => yereGider(h, { durum: 'biliniyor' }))).toEqual(['available', 'shipping']);
  });

  it('yer bilinmiyorsa AYIKLANMAZ — kod yok, yazım hatası, iki ülkeli kod', () => {
    // Stok depo-üstü okundu: "hiç var mı"nın cevabı ayıklama gerekçesi olamaz; sepete yazmak zaten kod ister.
    for (const durum of ['bilinmiyor', 'gecersiz', 'belirsiz'] as const) {
      expect(HALLER.every((h) => yereGider(h, { durum }))).toBe(true);
    }
  });

  it('koda hizmet yoksa HİÇBİR şey gitmez', () => {
    expect(HALLER.some((h) => yereGider(h, { durum: 'hizmet-yok' }))).toBe(false);
  });
});

describe('yereGoreAyir — gidemeyen adı ve SEBEBİYLE ayrılır, "yok" denmez', () => {
  it('kargo bölgesinde soğuk zincir ürünü "soğuk zincir" der; kargolanabilen listede kalır', () => {
    // Kullanıcının sorusu tam bu ayrımdı: "soğuk teslimat değil de kargoyla gönderilebilenleri bulabiliyor mu?"
    const { gidenler, gitmeyenler } = yereGoreAyir(
      [urun('Dondurma', 'elsewhere', false), urun('Baklava', 'shipping'), urun('Kadayıf', 'out_of_stock')],
      { durum: 'biliniyor', place: KARGO },
    );
    expect(gidenler.map((u) => u.name)).toEqual(['Baklava']);
    expect(gitmeyenler).toEqual([
      'Dondurma — soğuk zincir — kargoya verilemez, bu adres kapıya teslim bölgemizin dışında',
      'Kadayıf — tükendi',
    ]);
  });

  it('rota bölgesinde başka depodaki soğuk zincir ürünü "başka depoda" der — soğuk zincir orada engel değil', () => {
    const { gitmeyenler } = yereGoreAyir([urun('Dondurma', 'elsewhere', false)], { durum: 'biliniyor', place: ROTA });
    expect(gitmeyenler).toEqual(['Dondurma — başka depoda var; bu adrese bugün verilemiyor']);
  });

  it('hizmet olmayan kodda sebep kodun kendisi — stok ne olursa olsun', () => {
    const { gidenler, gitmeyenler } = yereGoreAyir([urun('Baklava', 'available')], { durum: 'hizmet-yok', place: YERSIZ });
    expect(gidenler).toEqual([]);
    expect(gitmeyenler).toEqual(['Baklava — bu posta koduna teslimat yok']);
  });

  it('yer bilinmiyorsa liste olduğu gibi kalır, sıra korunur', () => {
    const liste = [urun('A', 'out_of_stock'), urun('B', 'available')];
    const { gidenler, gitmeyenler } = yereGoreAyir(liste, { durum: 'bilinmiyor', place: YERSIZ });
    expect(gidenler).toEqual(liste);
    expect(gitmeyenler).toEqual([]);
  });
});

describe('stokCumlesi — "bu adrese" yalnız yer biliniyorsa', () => {
  it('bilinen yerde adrese göre konuşur, bilinmeyen yerde depo-üstü', () => {
    expect(stokCumlesi('available', { durum: 'biliniyor' })).toBe('stokta — bu adrese teslim edilebilir');
    expect(stokCumlesi('shipping', { durum: 'biliniyor' })).toBe('stokta — bu adrese kargoyla gider');
    // Hizmet vermediğimiz koda da "bu adrese teslim edilebilir" deniyordu: depo çözülmeden adres cümlesi yok.
    for (const durum of ['bilinmiyor', 'gecersiz', 'belirsiz', 'hizmet-yok'] as const) {
      expect(stokCumlesi('available', { durum })).toBe('stokta');
      expect(stokCumlesi('out_of_stock', { durum })).toBe('tükendi');
    }
  });
});

describe('kargoYalniz — rota deposu yok, kargo deposu var', () => {
  it('yalnız kargo çözülmüş yer kargo bölgesidir; rota yeri ve bilinmeyen yer değil', () => {
    expect(kargoYalniz(KARGO)).toBe(true);
    expect(kargoYalniz(ROTA)).toBe(false);
    expect(kargoYalniz(YERSIZ)).toBe(false);
  });
});

describe('gitmeyenAlani — sayı tam, ad listesi tavanlı, boşsa alan YOK', () => {
  it('boş liste alan üretmez — boş dizi modelce "önemsiz" okunur', () => {
    expect(gitmeyenAlani([], 5)).toEqual({});
  });

  it('tavan adları keser, sayıyı kesmez', () => {
    const alan = gitmeyenAlani(
      Array.from({ length: 7 }, (_, i) => `Ürün ${i} — tükendi`),
      5,
    ).buAdreseGitmeyenler as { sayi: number; urunler: string[]; not: string };
    expect(alan.sayi).toBe(7);
    expect(alan.urunler).toHaveLength(5);
    expect(alan.not).toContain('ÖNERME');
  });
});
