import { describe, expect, it } from 'vitest';
import { cheapestVariantId } from '@/lib/storefront/variant-choice';
import type { StorefrontVariant } from '@lezzet/application';

/**
 * Açılışta seçili boy = EN UCUZ (denetim talebi 09.08).
 *
 * Testin çivilediği şey bir sıralama değil bir VAAT: kart bir fiyat gösteriyor ve o fiyatın en ucuz
 * boyunki olduğunu söylüyor; detay başka bir boyu açarsa müşteri gördüğü fiyatı bulamaz. Ölçüm o
 * gün 31 çok boylu üründen 24'ünde sapma buldu (en büyüğü 16,81 €).
 *
 * **Dosya `lib/storefront/` yerine burada**: `apps/web/lib` entegrasyon köküdür (`vitest.config`) ve
 * oradaki her test DB kuyruğunda bekler; bu kural saf ve DB'siz. Aynı gerekçe `elsewhere-reason`
 * testinde de yazılı.
 */
const v = (id: string, priceCents: number | null): StorefrontVariant =>
  ({ id, priceCents }) as StorefrontVariant;

describe('cheapestVariantId', () => {
  it('sıranın ilkini DEĞİL, en ucuzu seçer', () => {
    // Gerçek örnek: Sobiyet Baklava listede 33,82 € (2000 g) görünüyordu, 17,01 €'luk boyu vardı.
    expect(cheapestVariantId([v('2000g', 3382), v('1000g', 1701)])).toBe('1000g');
  });

  it('fiyatsız boy seçilmez — satılamayan bir boyu açmak "sepete ekle"si çalışmayan ekran demektir', () => {
    expect(cheapestVariantId([v('tanıtım', null), v('500g', 1290)])).toBe('500g');
  });

  it('hiçbirinin fiyatı yoksa listenin ilki kalır — seçilecek daha iyi bir boy yok', () => {
    expect(cheapestVariantId([v('a', null), v('b', null)])).toBe('a');
  });

  it('boş listede boş dize — çağıran zaten "boy yok" hâlini ayrıca çiziyor', () => {
    expect(cheapestVariantId([])).toBe('');
  });

  it('eşit fiyatta İLKİ kalır — operatörün sırası, keyfi bir seçim değil', () => {
    expect(cheapestVariantId([v('a', 1290), v('b', 1290)])).toBe('a');
  });
});
