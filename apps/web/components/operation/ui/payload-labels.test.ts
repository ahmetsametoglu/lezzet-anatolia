import { describe, expect, it } from 'vitest';
import { labelOf, memberLabel } from './payload-labels';

/**
 * Dilekçe künyesinin DİLİ (26.08 · gövde turunun bulgusu).
 *
 * Operasyon yüzeyi Türkçe (`CLAUDE §2`) ama künye bazı satırlarda makine adını basıyordu:
 * Türkçe bir listenin ortasında `Variant id`, `categoryId`, `gluten · sut · sert_kabuklu`,
 * `nutrition · ingredients`. Sebep türetmenin doğasıydı — camelCase'i ayırmak İngilizce bir
 * anahtarı Türkçeleştirmez.
 *
 * Sınanan söz: **künyede makine adı görünmez.** Sözlükte olmayan değer ham kalır ve bu bilinçli
 * (uydurma çeviri, olmayan bir alanı varmış gibi gösterirdi) — test o sınırı da kilitliyor.
 */

describe('labelOf — alan adları', () => {
  it('kimlik alanları Türkçe (türetme İngilizce bırakırdı)', () => {
    expect(labelOf('batchId')).toBe('Parti kimliği');
    expect(labelOf('variantId')).toBe('Varyant kimliği');
    expect(labelOf('warehouseId')).toBe('Depo kimliği');
    expect(labelOf('categoryId')).toBe('Kategori');
  });

  it('hiçbir bilinen alan adı İngilizce türetmeye düşmüyor', () => {
    // Türetmenin imzası: boşluklu, küçük harfle biten İngilizce kalıntı ("Variant id").
    for (const key of ['batchId', 'variantId', 'warehouseId', 'supplierId', 'orderId', 'accountId', 'zoneId', 'productId']) {
      expect(labelOf(key)).not.toMatch(/ id$/);
    }
  });

  it('sözlükte olmayan anahtar yine de okunur hâle getirilir (satır kaybolmaz)', () => {
    expect(labelOf('bilinmeyenAlan')).toBe('Bilinmeyen alan');
  });
});

describe('memberLabel — kapalı kümelerin üyeleri', () => {
  it('alerjen slugları Türkçe okunur', () => {
    expect(memberLabel('allergens', 'sut', 'tr')).toBe('Süt');
    expect(memberLabel('allergens', 'gluten', 'tr')).toBe('Gluten');
    // İz alanı da aynı sözlükten — iki alan, tek kaynak.
    expect(memberLabel('traces', 'sut', 'tr')).toBe('Süt');
  });

  it('alerjen SEÇİLİ DİLDE okunur — künye tek dil gösteriyor', () => {
    expect(memberLabel('allergens', 'sut', 'fr')).not.toBe(memberLabel('allergens', 'sut', 'tr'));
  });

  it('eksik beyan kalemleri Türkçe okunur', () => {
    expect(memberLabel('remainingGaps', 'nutrition', 'tr')).not.toBe('nutrition');
    expect(memberLabel('uncertainFields', 'ingredients', 'tr')).not.toBe('ingredients');
  });

  it('sözlükte olmayan üye HAM kalır — uydurma çeviri yapılmaz', () => {
    expect(memberLabel('allergens', 'boyle_bir_alerjen_yok', 'tr')).toBe('boyle_bir_alerjen_yok');
    expect(memberLabel('remainingGaps', 'olmayan_bosluk', 'tr')).toBe('olmayan_bosluk');
  });

  it('kapalı küme OLMAYAN alanlara dokunulmaz', () => {
    expect(memberLabel('postalCodes', '67300', 'tr')).toBe('67300');
  });
});
