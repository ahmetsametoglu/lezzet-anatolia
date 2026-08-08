import { describe, expect, it } from 'vitest';
import { shippableChipOf, shippableFilterApplies } from './place-filter';

/**
 * "Adresime gönderilebilir" çipinin yere bağlanması (08.27) — saf kurallar, DB'siz.
 *
 * Testler DAVRANIŞIN SÖZÜNÜ tutuyor, uygulamasını değil. İkisi de bir kullanıcı bulgusundan doğdu
 * (08.08): posta kodu girilmemişken çip duruyor, tıklanıyor ve hiçbir şey değişmiyordu.
 */
describe('shippableFilterApplies — süzgeç gerçekten uygulanır mı', () => {
  it('BÖLGE DIŞINDA uygulanır — yalnız kargolanabilirler adrese ulaşır', () => {
    expect(shippableFilterApplies(true, 'shipping')).toBe(true);
  });

  it('BÖLGE İÇİNDE uygulanmaz — rota soğuk zinciri de götürüyor, eleyecek şey yok', () => {
    // Ölçüldü (08.08): katalogda 6 `shippable=false` ürün var ve çip açıkken altısı da düşüyordu.
    // Hepsi bölge içindeki adrese rota aracıyla ulaşabiliyordu — çip ulaşabileni gizliyordu.
    expect(shippableFilterApplies(true, 'route')).toBe(false);
  });

  it('YER BİLİNMİYORSA uygulanmaz — cevabı olmayan soruya süzgeçle cevap verilmez', () => {
    expect(shippableFilterApplies(true, 'unknown')).toBe(false);
  });

  it('istenmediyse hiçbir kipte uygulanmaz', () => {
    for (const mode of ['route', 'shipping', 'unknown'] as const) {
      expect(shippableFilterApplies(false, mode)).toBe(false);
    }
  });

  it('ESKİ BAĞLANTI bölge içindeki müşteriye ürün gizleyemez', () => {
    // `?shippable=1` taşıyan paylaşılmış bir adres, bölge içinde açıldığında listeyi daraltmamalı:
    // çip o kipte çizilmediği için geri almanın görünür bir yolu da olmazdı.
    expect(shippableFilterApplies(true, 'route')).toBe(false);
  });
});

describe('shippableChipOf — çip ekranda ne olur', () => {
  it('bölge dışında GERÇEK süzgeç', () => {
    expect(shippableChipOf('shipping')).toBe('filter');
  });

  it('yer bilinmiyorsa ADRES SORAR — süzmez', () => {
    expect(shippableChipOf('unknown')).toBe('ask');
  });

  it('bölge içinde HİÇ ÇİZİLMEZ — işe yaramayan düğme sunulmaz', () => {
    expect(shippableChipOf('route')).toBe('hidden');
  });

  it('sunucunun süzgeci ile ekranın çipi AYNI gerçeği söyler', () => {
    // İkisi ayrı fonksiyon ama çelişemezler: süzgecin uygulandığı tek kip, çipin süzgeç olduğu kip.
    for (const mode of ['route', 'shipping', 'unknown'] as const) {
      expect(shippableFilterApplies(true, mode)).toBe(shippableChipOf(mode) === 'filter');
    }
  });
});
