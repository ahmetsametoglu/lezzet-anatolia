import { describe, expect, it } from 'vitest';
import { brand, fillBrandFacts } from '@lezzet/brand';
import legal from '@lezzet/i18n/customer/legal';
import delivery from '../../../app/(customer)/[locale]/legal/delivery/content.json';
import faq from '../../../app/(customer)/[locale]/legal/faq/content.json';
import privacy from '../../../app/(customer)/[locale]/legal/privacy/content.json';
import sales from '../../../app/(customer)/[locale]/legal/sales/content.json';
import terms from '../../../app/(customer)/[locale]/legal/terms/content.json';

/*
  ŞİRKET KÜNYESİ YASAL METNE ELLE YAZILMAZ (15.09). Unvan, SIREN/SIRET, KDV no, adres, e-posta ve
  telefon üç dilde ve İKİ kopyada duruyordu — web'in sayfaları (`content.json`) ve native'in ortak
  sözlüğü (`@lezzet/i18n/customer/legal`); künye değiştiği gün birinin unutulması yeterdi. Metin artık
  `{siret}` gibi yer tutucu taşır, değer `@lezzet/brand`den `fillBrandFacts` ile dolar.

  Sınanan iki şey: (1) hiçbir yasal metinde künye değeri ELLE yazılı değil; (2) künye taşıyan üç
  sayfa, iki kopyada ve üç dilde, doldurulunca yer tutucu bırakmıyor — yanlış yazılmış bir yer
  tutucu (`{Siret}`) ekranda ham hâliyle görünürdü, burada yakalanır.
*/

/** Elle yazılmaması gereken değerler — unvanın adı unvanı, SIREN SIRET'i de kapsar. */
const RAW_FACTS = [
  brand.company.denomination,
  brand.company.siren,
  brand.company.vatId,
  brand.company.address.street,
  brand.company.address.city,
  brand.contact.email,
  brand.contact.phoneDisplay,
];

/** Belgenin bütün metinleri — yapıdan bağımsız. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

const LOCALES = ['tr', 'fr', 'de'] as const;
const WITH_FACTS = { privacy, sales, terms } as const;

describe('yasal metinler şirket künyesini brand’den okur', () => {
  it('hiçbir yasal metinde künye değeri elle yazılı değil — web beş sayfa + native sözlük', () => {
    const text = strings([delivery, faq, privacy, sales, terms, legal]).join('\n');

    for (const fact of RAW_FACTS) expect(text).not.toContain(fact);
  });

  it.each(Object.keys(WITH_FACTS) as (keyof typeof WITH_FACTS)[])(
    '%s: doldurulunca yer tutucu kalmaz, unvan metne gelir (üç dil, iki kopya)',
    (page) => {
      for (const locale of LOCALES) {
        for (const doc of [WITH_FACTS[page][locale], legal[locale].pages[page]]) {
          const text = strings(fillBrandFacts(doc)).join('\n');

          expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
          expect(text).toContain(brand.company.legalName);
        }
      }
    },
  );
});
