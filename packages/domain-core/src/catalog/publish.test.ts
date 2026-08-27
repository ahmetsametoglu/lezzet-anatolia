import { describe, expect, it } from 'vitest';
import { canPublishProduct, productPublishGaps, type PublishCandidate } from './publish';

/**
 * Yayın kapısı (05.36). Korunan şey bir sayı değil, **sessizliğin bitmesi**: Fransızcası olmayan
 * ürün Fransız müşteriye Türkçe gösteriliyordu ve hiçbir yerde işaret yoktu.
 *
 * Motorun kısıtla AYNI cümleyi kurması kritik (`product_publish_requires_all_locales`): ayrışırlarsa
 * ekran "eksik yok" derken veritabanı yayını reddeder ve operatör sebebi hiçbir yerde göremez.
 */
const ucDil = { tr: 'Su böreği', fr: 'Börek à l’eau', de: 'Wasserbörek' };

const tam: PublishCandidate = {
  name: ucDil,
  description: ucDil,
  ingredients: ucDil,
  storageInstructions: ucDil,
  familyId: null,
  familyLabel: null,
};

describe('ürün yayın kapısı', () => {
  it('üç dili tam ürün YAYINLANABİLİR', () => {
    expect(productPublishGaps(tam)).toEqual([]);
    expect(canPublishProduct(tam)).toBe(true);
  });

  it('EKSİK DİLLERİ ADIYLA söyler — "bir şeyler eksik" bir teşhis değildir', () => {
    const gaps = productPublishGaps({ ...tam, description: { tr: 'Yalnız Türkçe' } });
    expect(gaps).toEqual([{ field: 'description', missing: ['fr', 'de'] }]);
  });

  it('BOŞ DİZE dolu sayılmaz — operatörün açıp bıraktığı alan', () => {
    // Arızanın çekirdeği: `{fr: ''}` bir anahtar TAŞIR, yani "var mı" diye soran bir kontrol onu
    // dolu sayar. `resolveLocalizedText` ise onu atlayıp Türkçeye düşer — sessiz sapma buradan.
    expect(productPublishGaps({ ...tam, name: { tr: 'Ad', fr: '   ', de: 'Name' } })).toEqual([
      { field: 'name', missing: ['fr'] },
    ]);
  });

  it('YASAL BEYAN da üç dilde aranır — Fransızcası boş içindekiler listesi yok hükmündedir', () => {
    const gaps = productPublishGaps({ ...tam, ingredients: null, storageInstructions: { tr: 'Dondurucuda saklayın' } });
    expect(gaps.map((g) => g.field)).toEqual(['ingredients', 'storageInstructions']);
    expect(gaps[0]!.missing).toEqual(['tr', 'fr', 'de']); // hiç yazılmamış alan üç dilde de eksiktir
  });

  /**
   * **GÖRSEL ALT METNİ ARANMAZ** (ölçüldü 27.08) — kapsam kararının en kolay yanlış yapılacak yeri.
   *
   * Alan ürün formunda YOK ve bilerek yok: boşsa müşteride ürün ADINA düşüyor. Kısıta konsaydı
   * operatörün dolduramadığı bir alan yüzünden hiçbir ürün yayınlanamazdı — çıkmaz sokak. Ad zaten
   * üç dilde zorunlu, yani yedek de doğru dile düşüyor.
   *
   * Test bunu SABİTLİYOR: bir gün "alt metni de zorunlu yapalım" denirse önce formda alan açılmalı.
   */
  it('görsel ALT METNİ yayına engel DEĞİLDİR — yedeği ürün adıdır', () => {
    const gaps = productPublishGaps({ ...tam, ...({ imageKey: 'urun/kapak.webp', imageAlt: null } as PublishCandidate) });
    expect(gaps).toEqual([]);
  });

  /**
   * **Koşullu alan** — kısıttaki `family_id is null or …` ile birebir. Buradaki asıl iddia "eksik
   * yakalanıyor" değil, **aranmayan yerde ARANMIYOR**.
   */
  it('AİLESİZ üründe etiket ARANMAZ, aile üyesinde aranır', () => {
    expect(productPublishGaps({ ...tam, familyId: null, familyLabel: null })).toEqual([]);
    expect(productPublishGaps({ ...tam, familyId: 'aile-1', familyLabel: { tr: 'Limonlu' } })).toEqual([
      { field: 'familyLabel', missing: ['fr', 'de'] },
    ]);
  });

  it('birden çok eksik SIRAYLA döner — operatör listeyi yukarıdan aşağı doldurur', () => {
    const gaps = productPublishGaps({});
    expect(gaps.map((g) => g.field)).toEqual(['name', 'description', 'ingredients', 'storageInstructions']);
    expect(canPublishProduct(tam)).toBe(true);
  });
});
