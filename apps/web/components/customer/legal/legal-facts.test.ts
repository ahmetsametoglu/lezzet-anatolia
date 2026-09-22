import { describe, expect, it } from 'vitest';
import { brand, fillBrandFacts } from '@lezzet/brand';
import legal from '@lezzet/i18n/customer/legal';
import { copyForSurface } from '@lezzet/i18n';

/*
  Şirket künyesi yasal metne elle yazılmaz; metin `{siret}` gibi yer tutucu taşır, değer `@lezzet/brand`den dolar. Test iki şeyi
  yakalar: künye değerinin sözlüğe elle yazılması ve yanlış yazılmış bir yer tutucunun (`{Siret}`) iki yüzeyden birinde ham kalması.
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
const WITH_FACTS = ['privacy', 'sales', 'terms'] as const;
const SURFACES = ['web', 'app'] as const;

describe('yasal metinler şirket künyesini brand’den okur', () => {
  it('hiçbir yasal metinde künye değeri elle yazılı değil', () => {
    const text = strings(legal).join('\n');

    for (const fact of RAW_FACTS) expect(text).not.toContain(fact);
  });

  it.each(WITH_FACTS)('%s: doldurulunca yer tutucu kalmaz, unvan metne gelir (üç dil, iki yüzey)', (page) => {
    for (const surface of SURFACES) {
      const pages = copyForSurface(legal, surface);
      for (const locale of LOCALES) {
        const text = strings(fillBrandFacts(pages[locale].pages[page])).join('\n');

        expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
        expect(text).toContain(brand.company.legalName);
      }
    }
  });
});
