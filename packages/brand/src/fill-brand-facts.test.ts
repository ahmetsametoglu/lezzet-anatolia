import { describe, expect, it } from 'vitest';

import { brand, companyAddressLine, fillBrandFacts } from './index';

/*
  Yasal metinler şirket künyesini ELLE yazmıyor, `{siret}` gibi yer tutucu taşıyor (15.09); değeri bu
  fonksiyon doldurur. Sınanan iki şey: belgenin YAPISI korunarak her metin dolar ve sayfanın kendi yer
  tutucusu (teslimat sayfasının `{amount}`u gibi) künye sanılıp ezilmez.
*/

describe('fillBrandFacts', () => {
  it('iç içe belgede her metindeki künye yer tutucusunu doldurur; yapıya ve metin olmayan alana dokunmaz', () => {
    const doc = {
      title: 'Yasal bilgiler',
      sections: [{ id: 'editor', body: ['{legalName} · SIRET {siret}', '{address}, Fransa'], bullets: ['{email} · {phone}'] }],
      version: 2,
    };

    expect(fillBrandFacts(doc)).toEqual({
      title: 'Yasal bilgiler',
      sections: [
        {
          id: 'editor',
          body: [`${brand.company.legalName} · SIRET ${brand.company.siret}`, `${companyAddressLine}, Fransa`],
          bullets: [`${brand.contact.email} · ${brand.contact.phoneDisplay}`],
        },
      ],
      version: 2,
    });
  });

  it('tanımadığı yer tutucuya dokunmaz — sayfanın kendi yer tutucusu onu çizen bileşenin işi', () => {
    expect(fillBrandFacts('{amount} € · {date} · SIREN {siren}')).toBe(`{amount} € · {date} · SIREN ${brand.company.siren}`);
  });
});
