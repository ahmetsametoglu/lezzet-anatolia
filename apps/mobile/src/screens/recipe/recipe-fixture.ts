import { CROP_CENTER } from '@lezzet/types';
import type { RecipeDetail, RecipeRow } from '@lezzet/types';

/*
  TARİF DETAY TEST VERİSİ — ekran testinin TEL CEVABI (fetch mock'u bu gövdeyi döner; ürün
  fixture'ının deseni). Şekil `RecipeDetail`den TÜRER: sözleşme bir alan kazandığında bu dosya
  derlemede kırılır ve test güncellenmeden yeşile dönemez.

  Veri seed'in "Çıtır Pazar Kahvaltısı" tarifinin küçültülmüşü — uydurma bir dünya değil,
  gerçek verinin test boyu. Kimlikler UUID biçiminde (şema istiyor); sonları sayaçlı.
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Satılabilir, fiyatlı satır — testlerin "normal" hâli. */
export function recipeRow(index: number, overrides: Partial<RecipeRow> = {}): RecipeRow {
  return {
    productSlug: `fikstur-urun-${index}`,
    variantId: uuid(2100 + index),
    name: `Fikstür Ürün ${index}`,
    variantLabel: `${index * 500} g tepsi`,
    qty: 1,
    priceCents: 450 * index,
    image: { url: null, crop: CROP_CENTER },
    soldOut: false,
    ...overrides,
  };
}

/** Üç satırlı (biri 2 adetli, biri tükenmiş), evinizden ve hazırlanışı DOLU tarif — her bölümü açan hâl. */
export function recipeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    slug: 'citir-pazar-kahvaltisi',
    name: 'Çıtır Pazar Kahvaltısı',
    description: 'El açması börek, mini pide ve su böreğiyle kalabalık bir pazar sofrası.',
    duration: '35 dk',
    serves: '4–5 kişilik',
    image: { url: 'https://cdn.test/kahvalti.jpg', crop: CROP_CENTER },
    rows: [
      recipeRow(1, { productSlug: 'el-acmasi-kol-boregi', name: 'El Açması Kol Böreği', priceCents: 890 }),
      // Tarif iki adet istiyor (veri modeli: toplam = Σ qty × fiyat) — barın toplamı bunu kanıtlar.
      recipeRow(2, { productSlug: 'mini-pide', name: 'Mini Pide', qty: 2, priceCents: 450 }),
      recipeRow(3, { productSlug: 'su-boregi', name: 'Su Böreği', priceCents: 1250, soldOut: true }),
    ],
    pantry: ['Siyah ve yeşil zeytin', 'Domates, salatalık', 'Demlik çay'],
    steps: ['Fırını 180 °C\'ye ısıtın.', 'Börekleri 20–25 dakika pişirin.', 'Sofrayı kurun, sıcak servis edin.'],
    ...overrides,
  };
}
