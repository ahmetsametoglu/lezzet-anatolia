import { CROP_CENTER } from '@lezzet/types';
import type { CatalogProductDetail, CatalogVariant } from '@lezzet/types';

import { catalogProduct } from '@/screens/catalog/catalog-fixture';

/*
  ÜRÜN DETAY TEST VERİSİ — ekran testinin TEL CEVABI (fetch mock'u bu gövdeyi döner). Şekil
  `CatalogProductDetail`den TÜRER: sözleşme bir alan kazandığında bu dosya derlemede kırılır ve
  test güncellenmeden yeşile dönemez.

  "Benzer ürünler" kartları katalog fixture'ından gelir (`catalogProduct`) — kart sözleşmesi ortak
  (`CatalogProductSchema`) ve iki yerde iki yer tutucu yazmak birinin eskimesi demekti (CLAUDE §1).

  Kimlikler UUID biçiminde (şema istiyor); okunur olsunlar diye sonları sayaçlı.
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Satılabilir, fiyatlı boy — testlerin "normal" satırı. */
export function productVariant(index: number, overrides: Partial<CatalogVariant> = {}): CatalogVariant {
  return {
    id: uuid(1100 + index),
    label: `${index * 500} g tepsi`,
    netWeightG: index * 500,
    priceCents: 890 * index,
    comparisonCents: 1780,
    limitLabel: null,
    stockId: uuid(1200 + index),
    stockStatus: 'available',
    soldOut: false,
    ...overrides,
  };
}

/** İki boylu, aileli, benzerli, beyanı TAM ürün — sayfanın her bölümünü açan hâl. */
export function productDetail(overrides: Partial<CatalogProductDetail> = {}): CatalogProductDetail {
  return {
    id: uuid(1),
    slug: 'el-acmasi-kol-boregi',
    // Paylaşım adresi (08.45) — gerçek uçta `localizedUrl` üretir; fixture yalnız aynı ŞEKLİ taşır.
    shareUrl: 'https://www.lezzetanatolia.fr/tr/urun/el-acmasi-kol-boregi',
    name: 'El Açması Kol Böreği',
    description: 'El açması yufka, taş fırında günlük pişer; peynirli iç harcı Anadolu tulumuyla yoğrulur.',
    shippable: true,
    image: { url: 'https://cdn.test/kol-boregi.jpg', crop: CROP_CENTER },
    gallery: [],
    category: {
      id: uuid(9),
      slug: 'borekler',
      name: 'Börekler',
      image: { url: null, crop: CROP_CENTER },
    },
    variants: [productVariant(1), productVariant(2)],
    /* Fiyatı olan EN UCUZ boy — burada 1. boy (890 vs 1780). Sunucu bu ölçütü kendisi uygular
       (`primaryVariantOf`); fikstür yalnız sonucunu taşır, kuralı tekrar etmez. */
    primaryVariantId: uuid(1101),
    declaration: {
      ingredients: [
        { text: 'Buğday unu ', strong: false },
        { text: '(gluten)', strong: true },
        { text: ', tereyağı, yumurta, tulum peyniri, tuz.', strong: false },
      ],
      allergens: ['gluten', 'sut', 'yumurta'],
      traces: ['sert_kabuklu'],
      nutrition: {
        energyKj: 1180,
        energyKcal: 282,
        fatG: 14,
        saturatedFatG: 6,
        carbohydrateG: 30,
        sugarsG: 2,
        proteinG: 9,
        saltG: 1.1,
      },
      storage: [
        { text: 'Buzdolabında ', strong: false },
        { text: '3 gün', strong: true },
        { text: ' taze kalır; fırında 180°C’de 10 dakikada canlanır.', strong: false },
      ],
    },
    family: [
      { slug: 'el-acmasi-kol-boregi', label: 'Peynirli', image: { url: null, crop: CROP_CENTER }, fromPriceCents: 890, isCurrent: true },
      { slug: 'ispanakli-kol-boregi', label: 'Ispanaklı', image: { url: null, crop: CROP_CENTER }, fromPriceCents: 950, isCurrent: false },
    ],
    similar: [catalogProduct(21, { slug: 'su-boregi', name: 'Su Böreği' }), catalogProduct(22, { slug: 'sigara-boregi', name: 'Sigara Böreği' })],
    ...overrides,
  };
}
