import { CROP_CENTER } from '@lezzet/types';
import type { PackageDetail, PackageItem } from '@lezzet/types';

/*
  PAKET DETAY TEST VERİSİ — ekran testinin TEL CEVABI (fetch mock'u bu gövdeyi döner). Şekil
  `PackageDetail`den TÜRER: sözleşme bir alan kazandığında bu dosya derlemede kırılır ve test
  güncellenmeden yeşile dönemez (`product-fixture.ts` deseni).
*/

/** İçerik satırı — ürün adı + boy etiketi + adet; slug ürün detayına açılan kapı. */
function packageItem(index: number, overrides: Partial<PackageItem> = {}): PackageItem {
  return {
    slug: `paket-urunu-${index}`,
    name: `Paket Ürünü ${index}`,
    unitLabel: `${index * 250} g`,
    qty: 1,
    image: { url: null, crop: CROP_CENTER },
    ...overrides,
  };
}

/** Kargolanabilen, açıklamalı, dört satırlık paket — sayfanın her bölümünü açan hâl. */
export function packageDetail(overrides: Partial<PackageDetail> = {}): PackageDetail {
  return {
    // Sabit uuid — sepet satırının adresi (`bundleId`). Rastgele üretmek testleri koşudan koşuya
    // değiştirirdi; fixture'ın işi tekrarlanabilir bir dünya kurmak.
    id: '9f1c4a20-6b1e-4d3a-9f2c-0a5b7c8d1e20',
    slug: 'bayram-sofrasi-paketi',
    name: 'Bayram Sofrası Paketi',
    description: 'Bayram sofrasını tek kutuda kurar: baklava, su böreği, fıstık ve künefe.',
    priceCents: 4990,
    shippable: true,
    /* Varsayılan hâl SATILABİLİR ve ROTA İÇİ: sayfanın her bölümü açık olsun. Tükendi ve "bu
       adrese gönderemiyoruz" hâlleri `overrides` ile kurulur — fixture bir dünya kurar, karar
       vermez. */
    soldOut: false,
    route: 'local',
    image: { url: 'https://cdn.test/bayram-sofrasi.jpg', crop: CROP_CENTER },
    items: [
      packageItem(1, { slug: 'fistikli-baklava', name: 'Fıstıklı Baklava', unitLabel: '500 g' }),
      packageItem(2, { slug: 'su-boregi', name: 'Su Böreği', unitLabel: '1 kg' }),
      packageItem(3, { slug: 'antep-fistigi', name: 'Antep Fıstığı', unitLabel: '200 g' }),
      // Tek boylu ürün: etiket BOŞ — satır yalnız adla kurulur (ayraç uydurulmaz).
      packageItem(4, { slug: 'kunefe', name: 'Künefe', unitLabel: '', qty: 2 }),
    ],
    ...overrides,
  };
}
