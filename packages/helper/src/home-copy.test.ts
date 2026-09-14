import homeMessages from '@lezzet/i18n/customer/home';
import { describe, expect, it } from 'vitest';
import { formatPrice } from './format';
import { bandCountLabel, greetingOf, LAST_FEW_THRESHOLD, offerDiscountLabel, offerLimitOf } from './home-copy';

/*
  Vitrin cümlelerinin kuralları — native vitrinden taşındılar (14.09) ve iki yüzey onları okuyor.
  Beklenen metin sözlüğün KENDİSİNDEN türetilir; test cümle yazmaz, cümlenin hangi dalına
  düşüldüğünü sınar.
*/
const tr = homeMessages.tr;

describe('offerDiscountLabel', () => {
  it('oran kartın iki fiyatından türer ve tam sayıya yuvarlanır', () => {
    // 0,77 → %23 (kayan nokta 23,000000000000004 verir; yuvarlama onu yutmalı) · 0,666 → %33.
    expect(offerDiscountLabel(770, 1000, tr.offers)).toBe(tr.offers.discount.replace('{n}', '23'));
    expect(offerDiscountLabel(666, 1000, tr.offers)).toBe(tr.offers.discount.replace('{n}', '33'));
  });
});

describe('greetingOf', () => {
  it('ad yoksa hitap yoktur — misafire saat sorulmaz', () => {
    expect(greetingOf(tr.greeting, 9, null)).toBe(tr.greeting.guest);
    expect(greetingOf(tr.greeting, 21, null)).toBe(tr.greeting.guest);
  });

  it('eşikler 11 ve 18 — sınırın kendisi sonraki dilime aittir', () => {
    const say = (part: string) => tr.greeting.withName.replace('{greeting}', part).replace('{name}', 'Ayşe');
    expect(greetingOf(tr.greeting, 10, 'Ayşe')).toBe(say(tr.greeting.morning));
    expect(greetingOf(tr.greeting, 11, 'Ayşe')).toBe(say(tr.greeting.afternoon));
    expect(greetingOf(tr.greeting, 17, 'Ayşe')).toBe(say(tr.greeting.afternoon));
    expect(greetingOf(tr.greeting, 18, 'Ayşe')).toBe(say(tr.greeting.evening));
  });
});

describe('offerLimitOf', () => {
  it('sınır yoksa satır da yok — sıfır değil, YOK', () => {
    expect(offerLimitOf(null, tr.offers)).toBeNull();
  });

  it('eşik ve altı sayıyı söyler, üstü "stokla sınırlı" der', () => {
    expect(offerLimitOf(String(LAST_FEW_THRESHOLD), tr.offers)).toBe(tr.offers.lastFew.replace('{n}', String(LAST_FEW_THRESHOLD)));
    expect(offerLimitOf('1', tr.offers)).toBe(tr.offers.lastFew.replace('{n}', '1'));
    expect(offerLimitOf(String(LAST_FEW_THRESHOLD + 1), tr.offers)).toBe(tr.offers.limited);
  });

  it('sayıya çevrilemeyen değer uydurma bir sayı üretmez', () => {
    expect(offerLimitOf('çok', tr.offers)).toBe(tr.offers.limited);
  });
});

describe('bandCountLabel', () => {
  const percent = { label: null, percent: 15, amountCents: null, minBasketCents: null };

  it('kampanyasız bant yalnız sayar', () => {
    expect(bandCountLabel({ productCount: 12, campaign: null }, tr, 'tr')).toBe(tr.collections.count.replace('{n}', '12'));
  });

  it('eşiksiz kampanya satıra girmez — yeri dairenin rozeti', () => {
    expect(bandCountLabel({ productCount: 12, campaign: percent }, tr, 'tr')).toBe(tr.collections.count.replace('{n}', '12'));
  });

  it('eşikli kampanya satırda koşuluyla birlikte, tam cümle', () => {
    const campaign = { ...percent, minBasketCents: 6000 };
    const value = tr.campaign.withMinimum
      .replace('{minimum}', formatPrice(6000, 'tr'))
      .replace('{value}', tr.campaign.percent.replace('{n}', '15'));
    expect(bandCountLabel({ productCount: 12, campaign }, tr, 'tr')).toBe(
      tr.collections.countWithCampaign.replace('{n}', '12').replace('{campaign}', value),
    );
  });
});
