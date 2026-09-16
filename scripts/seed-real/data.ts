// Gerçek başlangıç verisi: değerler işletmeden ve tedarikçi faturalarından gelir, hiçbiri üretilmez. Test
// sunucusu ve üretimin ilk kurulumu aynı dosyadan beslenir (`scripts/seed-real.ts`).

// Adres künyeden okunur (`@lezzet/brand`); nokta, adresin BAN karşılığı ve işletmeci onayladı.
export const WAREHOUSE = {
  code: 'STR',
  name: 'Strasbourg',
  lat: 48.55644,
  lng: 7.688881,
  shipsOnline: true,
} as const;

export const STORAGE_AREAS = [
  { name: 'Dondurucu 1', kind: 'frozen', targetMinC: -22, targetMaxC: -18, expectedDailyChecks: 1 },
  { name: 'Dondurucu 2', kind: 'frozen', targetMinC: -22, targetMaxC: -18, expectedDailyChecks: 1 },
  { name: 'Soğutucu', kind: 'chilled', targetMinC: 0, targetMaxC: 4, expectedDailyChecks: 1 },
  { name: 'Raf', kind: 'ambient', targetMinC: null, targetMaxC: null, expectedDailyChecks: 0 },
] as const;

// Araç iki kayıttır: künye (plaka, soğuk zincir ölçümü) ve üzerindeki stoğu taşıyan araç türü depo.
export const VEHICLE = {
  code: 'STR-V1',
  name: 'Araç 1',
  // BEKLEYEN(K.14): geçici plaka; gerçek plaka girilecek.
  plate: 'AA-000-AA',
  expectedDailyChecks: 1,
} as const;

// Günler ISO (Pazartesi 1). 67120 bilerek yok: Kolbsheim bu kodu Molsheim ve Eurométropole dışındaki on
// beldeyle paylaşıyor, eklenirse teslimat Molsheim'a kadar açılır.
export const ZONES = [
  {
    name: 'Eurométropole',
    weekdays: [2, 5],
    postalCodes: [
      '67000', '67100', '67200', '67112', '67113', '67114', '67115', '67116', '67118', '67201',
      '67202', '67203', '67204', '67205', '67206', '67207', '67300', '67380', '67400', '67450',
      '67460', '67540', '67550', '67610', '67640', '67800', '67810', '67960', '67980',
    ],
  },
] as const;

// `from` migration'ın varsayılanıdır: ayar yalnız hâlâ o değerdeyse yazılır, panelden değişmişse korunur.
export const SETTINGS = [
  { key: 'free_shipping_threshold_cents', from: 10000, to: 12500 },
  { key: 'prep_cutoff_time', from: '11:00', to: '08:00' },
  { key: 'route_departure_time', from: '14:00', to: '09:00' },
  { key: 'courier_close_time', from: '18:00', to: '17:00' },
] as const;

// Künye faturalardan: Lezza INV/2026/0729 (45 gün vade), Behotrade 2026-0224 (10 gün vade).
export const SUPPLIERS = [
  {
    name: 'Lezza Foods BV',
    vatNumber: 'BE0756472118',
    country: 'BE',
    paymentTermDays: 45,
    contact: { line1: 'Zandvoortstraat 10', postalCode: '2800', city: 'Mechelen' },
    note: 'IBAN BE74 0018 9568 1407 · BNP Paribas Fortis (GEBABEBB)',
  },
  {
    name: 'Behotrade BV',
    vatNumber: 'BE1012906167',
    country: 'BE',
    paymentTermDays: 10,
    contact: {
      line1: 'Dokter Haubenlaan 85',
      postalCode: '3630',
      city: 'Maasmechelen',
      email: 'behotrade@gmail.com',
      phone: '+32466190451',
    },
    note: 'IBAN BE12 1431 2930 9892',
  },
] as const;

/**
 * Test kabulü — ARAYÜZ DENEMESİ İÇİNDİR, gerçek veri değildir: lot ve son kullanma uydurmadır ve mal
 * fiilen sayılmamıştır. Yalnız `--with-intake` ile yazılır; üretim kurulumundan önce bu blok silinir.
 */
export const TEST_INTAKE = {
  lotNumber: 'TEST-001',
  expiryDate: '2026-12-31',
  /** Tedarikçiye göre saklama alanı: Lezza donuk, Behotrade kuru. */
  areaBySupplier: { 'Lezza Foods BV': 'Dondurucu 1', 'Behotrade BV': 'Raf' } as Record<string, string>,
};

interface PurchaseLine {
  /** Faturadaki ad; tedarikçi siparişinde ve eşlemede tedarikçinin diliyle görünür. */
  nameAtSupplier: string;
  qty: number;
  /** Faturadaki birim alış fiyatı, KDV hariç. */
  unitCost: number;
  supplierCode?: string;
  /** Perakende KDV dahil, toptan KDV hariç; işletmecinin onayladığı fiyat politikası hesabı. */
  b2c?: number;
  b2b?: number;
}

interface CatalogLine extends PurchaseLine {
  /** Katalog kaynağındaki varyant kodu; ürün, görsel ve metin oradan gelir. */
  sku: string;
  /** Satış birimi katalogdakinden farklıysa faturadaki birim. */
  unit?: { label: string; netWeightG: number; piecesCount: number };
}

interface DraftVariant extends PurchaseLine {
  label?: string;
  netWeightG?: number;
  sku?: string;
}

interface Purchase {
  supplier: (typeof SUPPLIERS)[number]['name'];
  invoice: string;
  /** Verilirse kalemlerin toplamı faturayla karşılaştırılır; tutmazsa hiçbir şey yazılmaz. */
  invoiceTotal?: number;
  catalog: CatalogLine[];
  /** Bilgisi olmayan ürünler aday açılır; işletmeci panelden tamamlar. */
  drafts: { name: string; variants: DraftVariant[] }[];
}

const behotrade = (name: string, label: string | undefined, netWeightG: number | undefined, nameAtSupplier: string, qty: number, unitCost: number) => ({
  name,
  variants: [{ label, netWeightG, nameAtSupplier, qty, unitCost }],
});

// Lezza'dan her kalemden bir kutu alındı: adet kutudaki parça sayısıdır. Kekler tek 90 g satılır (fatura
// kodu 9'lu paketin, birim fiyat tek kekin); künefe faturadaki 2 × 145 g paket olarak satılır.
export const PURCHASES: Purchase[] = [
  {
    supplier: 'Lezza Foods BV',
    invoice: 'INV/2026/0729',
    catalog: [
      { sku: '700904', supplierCode: '700904', nameAtSupplier: 'LEZZA Kol Borek with Cheese Uncooked (Peynirli) 200 gr', qty: 40, unitCost: 0.52, b2c: 1.35, b2b: 0.68 },
      { sku: '700905', supplierCode: '700905', nameAtSupplier: 'LEZZA Kol Borek with Spinach & Cheese Uncooked (Ispanakli Peynirli) 200 gr', qty: 40, unitCost: 0.52, b2c: 1.35, b2b: 0.68 },
      { sku: '700914', supplierCode: '700914', nameAtSupplier: 'LEZZA Kol Borek with Minced Meat Uncooked (Kiymali) 200 gr', qty: 40, unitCost: 0.65, b2c: 1.54, b2b: 0.84 },
      { sku: '700911', supplierCode: '700911', nameAtSupplier: 'LEZZA Kol Borek with Potato Uncooked (Patatesli) 200 gr', qty: 40, unitCost: 0.52, b2c: 1.35, b2b: 0.68 },
      { sku: '201301', supplierCode: '201301', nameAtSupplier: 'LEZZA Vegan Cig kofte 16x1000 gr', qty: 16, unitCost: 3.5, b2c: 8.06, b2b: 4.49 },
      {
        sku: '500103',
        supplierCode: '500103',
        nameAtSupplier: 'LEZZA Kunefah (Included plate and syrup) 2*145 gr– 420g',
        qty: 12,
        unitCost: 3.05,
        b2c: 4.55,
        b2b: 3.75,
        unit: { label: '2 × 145 g', netWeightG: 290, piecesCount: 2 },
      },
      { sku: '700101', supplierCode: '700101', nameAtSupplier: 'LEZZA Turkish Bagel-Simit (% 80 Cooked) 4x105 gr', qty: 12, unitCost: 1.75, b2c: 3.76, b2b: 2.23 },
      { sku: '700402', supplierCode: '700402', nameAtSupplier: 'LEZZA Cheese Pastry Rond (Peynirli Su Boregi Yuvarlak Tepsi) 800 gr', qty: 12, unitCost: 4.5, b2c: 8.57, b2b: 5.67 },
      { sku: '700501', supplierCode: '700501', nameAtSupplier: 'LEZZA Spiral Pie Cheese (Peynirli Tepsi Boregi) 800 gr', qty: 6, unitCost: 2.7, b2c: 6.31, b2b: 3.47 },
      { sku: '700301', supplierCode: '700301', nameAtSupplier: 'LEZZA Acma Plain Cooked (Sade Acma) 4x80 gr', qty: 12, unitCost: 2.15, b2c: 3.81, b2b: 2.69 },
      { sku: '700201', supplierCode: '700201', nameAtSupplier: 'LEZZA Stuffed Pastry (%80 Cooked) (%80 Pismis Sade Pogaca) 4x80 gr', qty: 24, unitCost: 1.8, b2c: 3.43, b2b: 2.27 },
      { sku: '312241', supplierCode: '312241', nameAtSupplier: 'LEZITA Tender Fillet 700 gr', qty: 12, unitCost: 3.65, b2c: 7.16, b2b: 4.62 },
      { sku: '312341', supplierCode: '312341', nameAtSupplier: 'LEZITA Spicy Tender Fillet 700 gr', qty: 12, unitCost: 3.6, b2c: 7.1, b2b: 4.56 },
      { sku: '312442', supplierCode: '312442', nameAtSupplier: 'LEZITA Spicy Chicken Wings 700 gr', qty: 14, unitCost: 3.5, b2c: 6.99, b2b: 4.43 },
      { sku: '901028B', supplierCode: '901015', nameAtSupplier: 'Lamour Artisan Pistachio Cake (90g) 1x9', qty: 36, unitCost: 2.3, b2c: 3.35, b2b: 2.76 },
      { sku: '901025B', supplierCode: '901023B', nameAtSupplier: 'Lamour Artisan Mango Cake (90g) 1x9', qty: 36, unitCost: 1.99, b2c: 2.9, b2b: 2.39 },
      { sku: '901026B', supplierCode: '901016B', nameAtSupplier: 'Lamour Artisan Lemon Cake (90g) 1x9', qty: 36, unitCost: 1.99, b2c: 2.9, b2b: 2.39 },
      { sku: '901027B', supplierCode: '901024B', nameAtSupplier: 'Lamour Artisan Strawberry Cake (90g) 1x9', qty: 36, unitCost: 1.99, b2c: 2.9, b2b: 2.39 },
    ],
    drafts: [
      {
        name: 'LEZZA Traditional Meet Doner',
        variants: [{ label: '700 g', netWeightG: 700, sku: '312701', supplierCode: '312701', nameAtSupplier: 'LEZZA Traditional Meet Doner 10x700gr', qty: 10, unitCost: 8, b2c: 11.91, b2b: 9.82 }],
      },
      {
        name: 'LEZZA Traditional Chicken Doner',
        variants: [{ label: '700 g', netWeightG: 700, sku: '312702', supplierCode: '312702', nameAtSupplier: 'LEZZA Traditional Chicken Doner 10x700gr', qty: 10, unitCost: 6.1, b2c: 9.75, b2b: 7.56 }],
      },
      {
        name: 'LEZZA Manti with Minced Meat (Kiymali)',
        variants: [{ label: '1000 g', netWeightG: 1000, sku: '200503', supplierCode: '200503', nameAtSupplier: 'LEZZA Manti with Minced Meat (Kiymali )1000 gr', qty: 10, unitCost: 5.15, b2c: 10.16, b2b: 6.52 }],
      },
    ],
  },
  {
    supplier: 'Behotrade BV',
    invoice: '2026-0224',
    invoiceTotal: 1802.07,
    catalog: [],
    drafts: [
      behotrade('Druivenmelasse', '650 g', 650, 'Druivenmelasse 650gr', 12, 5.5),
      behotrade('Johannesbroodmelasse', '650 g', 650, 'Johannesbroodmelasse 650gr', 12, 5.5),
      behotrade('Tahini', '500 g', 500, 'Tahini 500gr', 12, 4.75),
      behotrade('Meidoorn azijn', '500 ml', undefined, 'Meidoorn azijn 500ml', 12, 3),
      behotrade('Ananas azijn', '500 ml', undefined, 'Ananas azijn 500ml', 12, 3),
      behotrade('Enginar azijn', '500 ml', undefined, 'Enginar azijn 500ml', 12, 3),
      behotrade('Appel azijn', '500 ml', undefined, 'Appel azijn 500ml', 12, 3),
      behotrade('Isgin azijn', '500 ml', undefined, 'Isgin azijn 500ml', 12, 3),
      behotrade('Granaatappelextraat', '250 ml', undefined, 'Granaatappelextraat 250ml', 12, 3.45),
      behotrade('Sifamix Kozalak extract', '670 g', 670, 'Sifamix Kozalak extract 670gr', 12, 4.25),
      behotrade('Sifamix Johannesbrood extract', '700 ml', undefined, 'Sifamix Johannesbrood extract 700ml', 12, 3.75),
      behotrade('Sifamix Andiz extract', '350 g', 350, 'Sifamix Andiz extract 350gr', 12, 3.99),
      behotrade('Coconut mix', '250 ml', undefined, 'Coconut mix 250ml', 12, 4.95),
      behotrade('Honing azijn', '500 ml', undefined, 'Honing azijn 500ml', 12, 3),
      {
        name: 'Olijfolie',
        variants: [
          { label: '5 l', nameAtSupplier: 'Olijfolie 5lt', qty: 4, unitCost: 29.9 },
          { label: '750 ml', nameAtSupplier: 'Olijfolie 750ml', qty: 12, unitCost: 5.5 },
        ],
      },
      behotrade('Pistache', '700 g', 700, 'Pistache 700gr', 20, 16.5),
      behotrade('Bromelain siroop', '250 ml', undefined, 'Bromelain siroop 250ml', 18, 8),
      behotrade('Zuhre Ana Kekre', '250 ml', undefined, 'Zuhre Ana Kekre 250ml', 18, 8.45),
      behotrade('Propolis pasta', '240 g', 240, 'Propolis pasta 240gr', 2, 8.5),
      behotrade('Form pasta', '240 g', 240, 'Form pasta 240gr', 2, 8),
      behotrade('Dennenappel pasta', '240 g', 240, 'Dennenappel pasta 240gr', 2, 8),
      behotrade('Igde cekirdegi pasta', '240 g', 240, 'Igde cekirdegi pasta 240gr', 2, 8),
      behotrade('Zwarte moerbei extrat', '670 g', 670, 'Zwarte moerbei extrat 670gr', 12, 7.25),
      behotrade('Pestil met Hazinoten Muska', '300 g', 300, 'Pestil met Hazinoten Muska 300gr', 25, 3.95),
      behotrade('Gedroogde aronya', '150 g', 150, 'Gedroogde aronya 150gr', 6, 3.99),
      behotrade('Gedroogde appel', '180 g', 180, 'Gedroogde appel 180gr', 6, 2.75),
      behotrade('Gedroogde Kaki cips', '180 g', 180, 'Gedroogde Kaki cips 180gr', 6, 2),
      // Faturada gramaj yazmıyor.
      behotrade('Gedroogde perzik', undefined, undefined, 'Gedroogde perzik', 6, 4),
      behotrade('Gedroogde meloen', '100 g', 100, 'Gedroogde meloen 100gr', 6, 2.25),
    ],
  },
];
