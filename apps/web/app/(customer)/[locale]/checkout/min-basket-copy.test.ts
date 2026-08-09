import { describe, expect, it } from 'vitest';
import { LOCALES } from '@lezzet/i18n';
import messages from './messages.json';

/**
 * Alt sınır cümlesinin ÜÇ yer tutucusu da üç dilde durmalı (08.13).
 *
 * Testin sebebi mekanik ve ölçülebilir: cümle `replace` ile dolduruluyor, yani bir dilde yer
 * tutucu unutulursa **hata çıkmaz** — o dildeki müşteri eksik bir cümle okur (ya da ham `{place}`
 * görür) ve bunu ancak o dili konuşan biri fark eder. Üç dil tek testte çivileniyor.
 *
 * `{place}` özellikle önemli: alt sınır bir sistem sabiti değil, SEÇİLEN ADRESİN bölgesinin
 * ayarıdır. Sepet bu sayıyı çerezdeki koda göre gösterir, checkout adrese göre hesaplar; ikisi
 * ayrı bölgeye düşen müşteride sayı değişir ve yeri söylemeyen bir cümle farkı açıklamaz.
 */
describe('summary.minBasket — üç dil, üç yer tutucu', () => {
  for (const locale of LOCALES) {
    it(`${locale}: {place} · {min} · {missing} üçü de var`, () => {
      const copy = messages[locale].summary.minBasket;
      expect(copy).toContain('{place}');
      expect(copy).toContain('{min}');
      expect(copy).toContain('{missing}');
    });
  }
});
