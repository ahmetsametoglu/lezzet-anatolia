import { describe, expect, it } from 'vitest';
import { variantNameOf } from './variant-name';

/**
 * Boyun müşteriye görünen adı saf türetmedir (DB yok) → birim test. Önemi: kelimeyi porsiyon TÜRÜ
 * seçiyor ve yanlış seçilirse müşteri aldığı şeyi yanlış okur — "12 adet cheesecake" 12 pasta
 * demektir. Kümeye yeni bir tür eklenip eşleme güncellenmezse bu testler kırmızıya döner.
 */
const t = {
  pieces: '{n} adet',
  piecesOf: '{n} adet · {weight}',
  slices: '{n} dilim',
  slicesOf: '{n} dilim · {weight}',
  packs: '{n} paket',
  packsOf: '{n} paket · {weight}',
};

const boy = (portionKind: 'item' | 'slice' | 'package' | null, piecesCount: number | null) => ({
  piecesCount,
  portionKind,
  netQuantity: 1400,
  netUnit: 'g' as const,
  label: 'ham etiket',
});

describe('variantNameOf · porsiyon türü kelimeyi seçer', () => {
  it('ayrı parçalar ADET yazar', () => {
    expect(variantNameOf(boy('item', 4), t, 'tr')).toBe('4 adet · 1,4 kg');
  });

  it('tek gövdenin dilimleri DİLİM yazar — adet deseydi 12 pasta satmış olurduk', () => {
    expect(variantNameOf(boy('slice', 12), t, 'tr')).toBe('12 dilim · 1,4 kg');
  });

  it('paketlenmiş birimler PAKET yazar', () => {
    expect(variantNameOf(boy('package', 2), t, 'tr')).toBe('2 paket · 1,4 kg');
  });

  it('türü bilinmeyen çoklu boy adete düşer — kelimesiz kalmaz', () => {
    expect(variantNameOf(boy(null, 3), t, 'tr')).toBe('3 adet · 1,4 kg');
  });

  it('tek parçada sayı hiç yazılmaz, miktar tek başına konuşur', () => {
    expect(variantNameOf(boy('package', 1), t, 'tr')).toBe('1,4 kg');
  });
});
