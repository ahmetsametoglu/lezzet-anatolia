import { describe, expect, it } from 'vitest';
import { elsewhereReasonOf } from '@/lib/delivery/place-types';

/**
 * `elsewhere` hâlinin iki alt sebebi (09.08 · kullanıcı kararı).
 *
 * Testin çivilediği şey bir dallanma değil bir SÖZDÜR: rota dışındaki müşteriye "gelince haber
 * ver" demek, ürün gelse bile ona gidemeyecek olduğu için tutulamayacak bir sözdür. Kural bu
 * klasördeki üç öğenin (işaret · haber düğmesi · teslimat kutusu) ortak kaynağı; kırılırsa üçü
 * birden yanlış konuşur.
 *
 * **Dosya `lib/delivery/` yerine burada** çünkü `apps/web/lib` entegrasyon köküdür (`vitest.config`)
 * ve oradaki her test DB kuyruğunda bekler. Bu kural saf ve DB'siz — ölçtüğü şey de tam olarak bu
 * klasörün ekran dili. Kaynağı `lib`te kalıyor: `DeliveryPlace`'in kendisi orada tanımlı.
 */
describe('elsewhereReasonOf', () => {
  it('rota İÇİNDE stok sebebidir — beklenen şey kalemin gelmesi', () => {
    expect(elsewhereReasonOf({ inRoute: true })).toBe('stock');
  });

  it('rota DIŞINDA sebep kalıcıdır — beklenen şey bölgenin açılması', () => {
    expect(elsewhereReasonOf({ inRoute: false })).toBe('out_of_route');
  });

  it('YER BİLİNMİYORSA stok sebebi kalır — bilinmeyen kalıcı olumsuzluğa çevrilmez', () => {
    // "Bu adrese gönderemiyoruz" demek için rota dışında olduğunu bilmek gerekir; yer yokken o
    // cümleyi kurmak, ölçülmemiş bir şeyi ölçülmüş gibi söylemektir (`CLAUDE §1`).
    expect(elsewhereReasonOf(null)).toBe('stock');
  });
});
