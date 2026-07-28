import { describe, expect, it } from 'vitest';
import { addVat, removeVat } from '@lezzet/helper';
import { markupPercent, priceForMargin } from './margin';
import { suggestedOfferPriceCents } from '../stock/offer';

/**
 * Teklif fiyatının ÜÇ YÜZÜ arasındaki gidiş-gelişin doğruluğu (09.13).
 *
 * Ekranda tek bir sayı üç kutuda görünüyor: tutar · liste fiyatına göre indirim · alışa göre kâr marjı.
 * Bu testler o dönüşümlerin **kapalı devre** olduğunu sabitler — birinden öbürüne gidip geri dönünce
 * aynı yere çıkılmalı, yoksa operatör yazdığı sayının değiştiğini görür.
 *
 * En kritik kısım KDV: teklif fiyatı b2c tabanında (KDV DAHİL), alış fiyatı hariç. Bunu atlamak marjı
 * KDV oranı kadar şişirir ve zararına satışı kârlı gösterir.
 */

// `vatRate` YÜZDEDİR (5.5 · 20), kesir değil — helper'ın sözleşmesi böyle. Kesir geçmek
// KDV'yi neredeyse hiç düşürmez ve marjı sessizce şişirir.
const VAT = 5.5; // FR gıda oranı — projenin varsayılanı

describe('teklif fiyatı ↔ kâr marjı (KDV dahil taban)', () => {
  it('marjı fiyattan, fiyatı marjdan türetmek aynı yere çıkar', () => {
    const costCents = 1000;
    const target = 40;

    const priceTtc = addVat(priceForMargin(costCents, target), VAT);
    const backToMargin = markupPercent(removeVat(priceTtc, VAT), costCents);

    expect(backToMargin).toBeCloseTo(target, 1);
  });

  it('KDV DÜŞÜLMEZSE marj şişer — hatanın büyüklüğü sabitlensin', () => {
    const costCents = 1000;
    const priceTtc = addVat(1400, VAT); // %40 marj sağlayan HT fiyatın KDV'li hâli

    const correct = markupPercent(removeVat(priceTtc, VAT), costCents)!;
    const naive = markupPercent(priceTtc, costCents)!;

    expect(correct).toBeCloseTo(40, 0);
    // Ham TTC ile hesaplamak kârı ~7,7 puan fazla gösterir: küçük görünen, kararı bozan bir fark.
    expect(naive - correct).toBeGreaterThan(7);
  });

  it('zararına satış NEGATİF marj verir — engel değil, ölçü', () => {
    const costCents = 1000;
    const priceTtc = addVat(900, VAT); // maliyetin altında
    expect(markupPercent(removeVat(priceTtc, VAT), costCents)).toBeLessThan(0);
  });

  it('başa baş satış sıfır marj verir', () => {
    const costCents = 1000;
    const priceTtc = addVat(1000, VAT);
    expect(markupPercent(removeVat(priceTtc, VAT), costCents)).toBeCloseTo(0, 1);
  });

  it('maliyet bilinmiyorsa marj da yoktur — sıfır sayılmaz', () => {
    expect(markupPercent(1000, 0)).toBeNull();
  });
});

describe('önerilen teklif ile kâr ekseni birlikte okunur', () => {
  it('%30 indirim, maliyeti düşük üründe hâlâ kârlı olabilir', () => {
    const listTtc = 1800;
    const costCents = 900;
    const offer = suggestedOfferPriceCents(listTtc, 30)!;
    const margin = markupPercent(removeVat(offer, VAT), costCents)!;
    expect(offer).toBe(1260);
    expect(margin).toBeGreaterThan(0); // 1194 HT vs 900 maliyet → hâlâ kâr
  });

  it('aynı indirim, maliyeti yüksek üründe ZARARA düşer — ekranın söylemesi gereken şey', () => {
    const listTtc = 1800;
    const costCents = 1400;
    const offer = suggestedOfferPriceCents(listTtc, 30)!;
    const margin = markupPercent(removeVat(offer, VAT), costCents)!;
    // Sistemin önerisi tek başına "iyi karar" demek değildir: aynı %30, maliyete göre kâr da zarar da olur.
    expect(margin).toBeLessThan(0);
  });
});
