// Gerçek başlangıç verisi; test sunucusu ve üretimin ilk kurulumu bu dosyadan beslenir, katmanı `--layers` seçer:
// 1 kesin (fatura, üreticinin künyesi, `SALE_PRICES`; üretim bayraksız koşar), 2 dayanaklı (ürün sayfasına dayanan
// açıklama), 3 uydurma (kaynağı olmayan beyan ve test mal kabulü). Katman 3 blokları ayrı durur ki üretime geçerken
// tek parça silinebilsin; hangi alanın hangi katmana ait olduğu `Draft` tipinde yazılı.

// Katman 3 blokları şemanın tipleriyle yazılır: besin tablosunun sekiz kalemi ve alerjenin kapalı
// kümesi orada tanımlı — yazım hatası derlenme anında patlasın, koşuda sessizce düşmesin.
import type { Nutrition, ProductAllergen } from '@lezzet/types';
import type { SaklamaRejimi } from '../seed/storage-regime';

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
 * Test kabulü: lot ve son kullanma uydurmadır, mal fiilen sayılmamıştır. Yalnız `--layers=3` ile yazılır ki arayüz
 * denenebilsin; üretim kurulumundan önce bu blok silinir.
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

/**
 * Anahtar tabanı (`slug`) ürünün slug'ından ayrı tutulur: ürün slug'ı addan türer ve ad düzeltilince kayar, görselin
 * adresi kaymamalı. `file` depodaki usta, `url` uzak kaynaktır ve biri verilir; `source` görselin kaynağını kayıtta tutar.
 */
interface DraftImage {
  slug: string;
  file?: string;
  url?: string;
  source: string;
}

/** Üç dil birden — yayın ölçütü `hasAllLocales` üçünü de arar, eksiği olan ürün aday kalır. */
interface UcDil {
  tr: string;
  fr: string;
  de: string;
}

interface Draft {
  // ── KATMAN 1 · kesin ────────────────────────────────────────────────────────────────────────
  /** Faturada yazan ad — eşleştirme ve tedarikçi yazışması bunun üstünden yürür. */
  name: string;
  /** Faturadaki ad tedarikçinin dilinde; katalogda görünecek Türkçe karşılığı budur. */
  nameTr?: string;
  nameFr?: string;
  nameDe?: string;
  /**
   * Saklama rejimi — `storage_type` ve `shippable` kolonlarının İKİSİNİ BİRDEN belirler
   * (`seed/storage-regime.ts`). Yazılmazsa kolonların varsayılanı kalır ve o varsayılan DONUK:
   * pekmez dondurucuya yazılır, hiçbir ürün kargoya çıkamaz.
   */
  rejim?: SaklamaRejimi;
  /** Üreticinin kendi künyesinden okunan beyanlar; kaynağı olmayan alan hiç yazılmaz. */
  ingredients?: UcDil;
  storage?: UcDil;
  shelfLifeDays?: number;
  /** Gerçek ürün çekimi: tedarikçinin gönderdiği usta ya da markanın mağazası. */
  image?: DraftImage;
  variants: DraftVariant[];

  // ── KATMAN 2 · dayanaklı ────────────────────────────────────────────────────────────────────
  /**
   * Gerçek ürün sayfasına dayanan açıklama — resmî belge DEĞİL, o yüzden katman 1'de yazılmaz.
   * Sağlık iddiası taşıyan cümleler bilerek dışarıda bırakıldı (AB 1924/2006).
   */
  description?: UcDil;
}

interface Purchase {
  supplier: (typeof SUPPLIERS)[number]['name'];
  invoice: string;
  /** Verilirse kalemlerin toplamı faturayla karşılaştırılır; tutmazsa hiçbir şey yazılmaz. */
  invoiceTotal?: number;
  catalog: CatalogLine[];
  /** Bilgisi olmayan ürünler aday açılır; işletmeci panelden tamamlar. */
  drafts: Draft[];
}

const behotrade = (
  name: string,
  label: string | undefined,
  netWeightG: number | undefined,
  nameAtSupplier: string,
  qty: number,
  unitCost: number,
  // Faturadan gelmeyen her alan: ad çevirileri, metinler, beyanlar ve kapak. `Omit` ile yazıldı ki
  // `Draft`e alan eklendiğinde burası da kendiliğinden kabul etsin — liste iki yerde tutulmaz.
  ek: Omit<Draft, 'name' | 'variants'> = {},
): Draft => ({
  name,
  // Behotrade'in faturasında donuk kalem YOK: pekmez, sirke, öz, macun ve kuru meyve rafta durur ve
  // kargolanır. `ek` sonra geldiği için istisna gerekirse kalem kendi rejimini yazabilir.
  rejim: 'raf',
  ...ek,
  variants: [{ label, netWeightG, nameAtSupplier, qty, unitCost }],
});

/** Tedarikçinin gönderdiği ambalaj ustaları (`temp/beho`) — depoya küçültülmüş kopyaları girdi. */
const usta = (slug: string, kaynak: string): DraftImage => ({
  slug,
  file: `scripts/seed-real/images/${slug}.webp`,
  source: `Şifamix ambalaj ustası — tedarikçi klasörü (${kaynak})`,
});

/**
 * Markanın kendi mağazasındaki ürün çekimi. Adres SORGUSUZ yazılır: `?v=…` eki hem önbellek dosya
 * adına hem `extOf` uzantı tespitine karışır ve anahtar `…webp?v=123` olur.
 */
const magaza = (slug: string, url: string, kaynak: string): DraftImage => ({ slug, url, source: `${kaynak} ürün çekimi` });

// Lezza'dan her kalemden bir kutu alındı: adet kutudaki parça sayısıdır. Kekler tek 90 g satılır (fatura
// kodu 9'lu paketin, birim fiyat tek kekin); künefe faturadaki 2 × 145 g paket olarak satılır.
export const PURCHASES: Purchase[] = [
  {
    supplier: 'Lezza Foods BV',
    invoice: 'INV/2026/0729',
    catalog: [
      { sku: '700904', supplierCode: '700904', nameAtSupplier: 'LEZZA Kol Borek with Cheese Uncooked (Peynirli) 200 gr', qty: 40, unitCost: 0.52 },
      { sku: '700905', supplierCode: '700905', nameAtSupplier: 'LEZZA Kol Borek with Spinach & Cheese Uncooked (Ispanakli Peynirli) 200 gr', qty: 40, unitCost: 0.52 },
      { sku: '700914', supplierCode: '700914', nameAtSupplier: 'LEZZA Kol Borek with Minced Meat Uncooked (Kiymali) 200 gr', qty: 40, unitCost: 0.65 },
      { sku: '700911', supplierCode: '700911', nameAtSupplier: 'LEZZA Kol Borek with Potato Uncooked (Patatesli) 200 gr', qty: 40, unitCost: 0.52 },
      { sku: '201301', supplierCode: '201301', nameAtSupplier: 'LEZZA Vegan Cig kofte 16x1000 gr', qty: 16, unitCost: 3.5 },
      {
        sku: '500103',
        supplierCode: '500103',
        nameAtSupplier: 'LEZZA Kunefah (Included plate and syrup) 2*145 gr– 420g',
        qty: 12,
        unitCost: 3.05,
        unit: { label: '2 × 145 g', netWeightG: 290, piecesCount: 2 },
      },
      { sku: '700101', supplierCode: '700101', nameAtSupplier: 'LEZZA Turkish Bagel-Simit (% 80 Cooked) 4x105 gr', qty: 12, unitCost: 1.75 },
      { sku: '700402', supplierCode: '700402', nameAtSupplier: 'LEZZA Cheese Pastry Rond (Peynirli Su Boregi Yuvarlak Tepsi) 800 gr', qty: 12, unitCost: 4.5 },
      { sku: '700501', supplierCode: '700501', nameAtSupplier: 'LEZZA Spiral Pie Cheese (Peynirli Tepsi Boregi) 800 gr', qty: 6, unitCost: 2.7 },
      { sku: '700301', supplierCode: '700301', nameAtSupplier: 'LEZZA Acma Plain Cooked (Sade Acma) 4x80 gr', qty: 12, unitCost: 2.15 },
      { sku: '700201', supplierCode: '700201', nameAtSupplier: 'LEZZA Stuffed Pastry (%80 Cooked) (%80 Pismis Sade Pogaca) 4x80 gr', qty: 24, unitCost: 1.8 },
      { sku: '312241', supplierCode: '312241', nameAtSupplier: 'LEZITA Tender Fillet 700 gr', qty: 12, unitCost: 3.65 },
      { sku: '312341', supplierCode: '312341', nameAtSupplier: 'LEZITA Spicy Tender Fillet 700 gr', qty: 12, unitCost: 3.6 },
      { sku: '312442', supplierCode: '312442', nameAtSupplier: 'LEZITA Spicy Chicken Wings 700 gr', qty: 14, unitCost: 3.5 },
      { sku: '901028B', supplierCode: '901015', nameAtSupplier: 'Lamour Artisan Pistachio Cake (90g) 1x9', qty: 36, unitCost: 2.3 },
      { sku: '901025B', supplierCode: '901023B', nameAtSupplier: 'Lamour Artisan Mango Cake (90g) 1x9', qty: 36, unitCost: 1.99 },
      { sku: '901026B', supplierCode: '901016B', nameAtSupplier: 'Lamour Artisan Lemon Cake (90g) 1x9', qty: 36, unitCost: 1.99 },
      { sku: '901027B', supplierCode: '901024B', nameAtSupplier: 'Lamour Artisan Strawberry Cake (90g) 1x9', qty: 36, unitCost: 1.99 },
    ],
    drafts: [
      // Üçünün de kapağı YOK: iki döner Lezza'nın 144 ürünlük kataloğunda hiç geçmiyor, mantının
      // elimizdeki tek karesi ambalaj değil tabakta servis çekimi.
      {
        name: 'LEZZA Traditional Meet Doner',
        rejim: 'donuk',
        nameTr: 'LEZZA Geleneksel Et Döner',
        nameFr: 'LEZZA döner de viande traditionnel',
        nameDe: 'LEZZA traditioneller Fleischdöner',
        description: {
          tr: 'Dondurulmuş geleneksel et döner; tavada ya da fırında pişirilir.',
          fr: 'Döner de viande traditionnel surgelé ; à cuire à la poêle ou au four.',
          de: 'Tiefgekühlter traditioneller Fleischdöner; in der Pfanne oder im Ofen zuzubereiten.',
        },
        variants: [{ label: '700 g', netWeightG: 700, sku: '312701', supplierCode: '312701', nameAtSupplier: 'LEZZA Traditional Meet Doner 10x700gr', qty: 10, unitCost: 8 }],
      },
      {
        name: 'LEZZA Traditional Chicken Doner',
        rejim: 'donuk',
        nameTr: 'LEZZA Geleneksel Tavuk Döner',
        nameFr: 'LEZZA döner de poulet traditionnel',
        nameDe: 'LEZZA traditioneller Hähnchendöner',
        description: {
          tr: 'Dondurulmuş geleneksel tavuk döner; tavada ya da fırında pişirilir.',
          fr: 'Döner de poulet traditionnel surgelé ; à cuire à la poêle ou au four.',
          de: 'Tiefgekühlter traditioneller Hähnchendöner; in der Pfanne oder im Ofen zuzubereiten.',
        },
        variants: [{ label: '700 g', netWeightG: 700, sku: '312702', supplierCode: '312702', nameAtSupplier: 'LEZZA Traditional Chicken Doner 10x700gr', qty: 10, unitCost: 6.1 }],
      },
      {
        name: 'LEZZA Manti with Minced Meat (Kiymali)',
        rejim: 'donuk',
        nameTr: 'LEZZA Kıymalı Mantı',
        nameFr: 'LEZZA mantı à la viande hachée',
        nameDe: 'LEZZA Mantı mit Hackfleisch',
        description: {
          tr: 'Kıyma dolgulu mantı; haşlandıktan sonra yoğurt ve sosla servis edilir.',
          fr: 'Mantı farcis à la viande hachée ; à pocher, servis avec du yaourt et une sauce.',
          de: 'Mantı mit Hackfleischfüllung; nach dem Garen mit Joghurt und Sauce serviert.',
        },
        variants: [{ label: '1000 g', netWeightG: 1000, sku: '200503', supplierCode: '200503', nameAtSupplier: 'LEZZA Manti with Minced Meat (Kiymali )1000 gr', qty: 10, unitCost: 5.15 }],
      },
    ],
  },
  {
    supplier: 'Behotrade BV',
    invoice: '2026-0224',
    invoiceTotal: 1802.07,
    catalog: [],
    drafts: [
      // Beşe üçlüsünün saklama koşulu ve raf ömrü üreticinin kendi künyesinden (12/12/24 ay).
      behotrade('Druivenmelasse', '650 g', 650, 'Druivenmelasse 650gr', 12, 5.5, {
        nameTr: 'Üzüm Pekmezi',
        nameFr: 'Mélasse de raisin',
        nameDe: 'Traubenmelasse',
        description: {
          tr: 'Koyu kıvamlı geleneksel üzüm pekmezi; kahvaltıda tahinle, tatlı ve hamur işlerinde kullanılır.',
          fr: 'Mélasse de raisin traditionnelle et épaisse ; au petit-déjeuner avec du tahin, en pâtisserie et en dessert.',
          de: 'Traditionelle, dickflüssige Traubenmelasse; zum Frühstück mit Tahin, für Gebäck und Desserts.',
        },
        storage: { tr: 'Kuru ve serin yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Trocken und kühl lagern.' },
        shelfLifeDays: 365,
        image: magaza('druivenmelasse', 'https://www.besegida.com/wp-content/uploads/2025/04/Bese-Helva-Pekmez-650.jpg', 'Beşe 1885'),
      }),
      behotrade('Johannesbroodmelasse', '650 g', 650, 'Johannesbroodmelasse 650gr', 12, 5.5, {
        nameTr: 'Keçiboynuzu Pekmezi',
        nameFr: 'Mélasse de caroube',
        nameDe: 'Johannisbrotmelasse',
        description: {
          tr: 'Keçiboynuzundan elde edilen koyu pekmez; kendine has karamelimsi tadıyla kahvaltıda ve tatlılarda.',
          fr: 'Mélasse foncée de caroube, au goût caramélisé caractéristique, pour le petit-déjeuner et les desserts.',
          de: 'Dunkle Johannisbrotmelasse mit typischem Karamellgeschmack, für Frühstück und Desserts.',
        },
        storage: { tr: 'Kuru ve serin yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Trocken und kühl lagern.' },
        shelfLifeDays: 365,
        image: magaza(
          'johannesbroodmelasse',
          'https://www.besegida.com/wp-content/uploads/2025/04/Bese-Helva-Harput-Pekmezi-650.jpg',
          'Beşe 1885',
        ),
      }),
      behotrade('Tahini', '500 g', 500, 'Tahini 500gr', 12, 4.75, {
        nameTr: 'Tahin',
        nameFr: 'Tahin (purée de sésame)',
        nameDe: 'Tahin (Sesampaste)',
        description: {
          tr: 'Sade susam ezmesi; pekmezle kahvaltıda, tatlılarda ve soslarda kullanılır.',
          fr: 'Purée de sésame nature ; avec de la mélasse au petit-déjeuner, en pâtisserie et dans les sauces.',
          de: 'Reine Sesampaste; mit Melasse zum Frühstück, für Desserts und Saucen.',
        },
        storage: { tr: 'Kuru ve serin yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Trocken und kühl lagern.' },
        shelfLifeDays: 730,
        image: magaza('tahini', 'https://www.besegida.com/wp-content/uploads/2025/04/Bese-Helva-Tahin-Susam-650.jpg', 'Beşe 1885'),
      }),
      // Sirkelerin ortak künyesi: doğal fermantasyon, katkı ve koruyucu içermez — ambalajın ön yüzünde
      // yazılı (`temp/beho` ustaları). Saklama, içindekiler ve besin değeri hiçbir kaynakta YOK.
      behotrade('Meidoorn azijn', '500 ml', undefined, 'Meidoorn azijn 500ml', 12, 3, {
        nameTr: 'Alıç Sirkesi',
        nameFr: "Vinaigre d'aubépine",
        nameDe: 'Weißdornessig',
        description: {
          tr: 'Doğal fermantasyonla üretilmiş alıç sirkesi; katkı ve koruyucu içermez.',
          fr: "Vinaigre d'aubépine issu d'une fermentation naturelle, sans additif ni conservateur.",
          de: 'Weißdornessig aus natürlicher Gärung, ohne Zusatz- und Konservierungsstoffe.',
        },
        image: usta('meidoorn-azijn', 'alıç.jpg'),
      }),
      behotrade('Ananas azijn', '500 ml', undefined, 'Ananas azijn 500ml', 12, 3, {
        nameTr: 'Ananas Sirkesi',
        nameFr: "Vinaigre d'ananas",
        nameDe: 'Ananasessig',
        description: {
          tr: 'Doğal fermantasyonla üretilmiş ananas sirkesi; katkı ve koruyucu içermez.',
          fr: "Vinaigre d'ananas issu d'une fermentation naturelle, sans additif ni conservateur.",
          de: 'Ananasessig aus natürlicher Gärung, ohne Zusatz- und Konservierungsstoffe.',
        },
        image: usta('ananas-azijn', 'ananas_sirkesi_şifamix_G03.pdf'),
      }),
      behotrade('Enginar azijn', '500 ml', undefined, 'Enginar azijn 500ml', 12, 3, {
        nameTr: 'Enginar Sirkesi',
        nameFr: "Vinaigre d'artichaut",
        nameDe: 'Artischockenessig',
        description: {
          tr: 'Doğal fermantasyonla üretilmiş enginar sirkesi; katkı ve koruyucu içermez.',
          fr: "Vinaigre d'artichaut issu d'une fermentation naturelle, sans additif ni conservateur.",
          de: 'Artischockenessig aus natürlicher Gärung, ohne Zusatz- und Konservierungsstoffe.',
        },
      }),
      behotrade('Appel azijn', '500 ml', undefined, 'Appel azijn 500ml', 12, 3, {
        nameTr: 'Elma Sirkesi',
        nameFr: 'Vinaigre de cidre',
        nameDe: 'Apfelessig',
        description: {
          tr: 'Doğal fermantasyonla üretilmiş elma sirkesi; katkı ve koruyucu içermez.',
          fr: "Vinaigre de cidre issu d'une fermentation naturelle, sans additif ni conservateur.",
          de: 'Apfelessig aus natürlicher Gärung, ohne Zusatz- und Konservierungsstoffe.',
        },
        image: usta('appel-azijn', 'elma_y02.jpg'),
      }),
      behotrade('Isgin azijn', '500 ml', undefined, 'Isgin azijn 500ml', 12, 3, {
        nameTr: 'Işkın Kökü Sirkesi',
        nameFr: 'Vinaigre de racine de rhubarbe',
        nameDe: 'Rhabarberwurzelessig',
        description: {
          tr: 'Işkın kökünden doğal fermantasyonla üretilmiş sirke; katkı ve koruyucu içermez.',
          fr: "Vinaigre de racine de rhubarbe issu d'une fermentation naturelle, sans additif ni conservateur.",
          de: 'Rhabarberwurzelessig aus natürlicher Gärung, ohne Zusatz- und Konservierungsstoffe.',
        },
        image: usta('isgin-azijn', 'ışkın_sirkesi_şifamix_G03.pdf'),
      }),
      // Elimizdeki Şifamix ustası "Nar Ekşisi (Granaatappelsiroop)" diyor, fatura "extraat" — şurup mu öz
      // mü belirsiz olduğu için kapak BAĞLANMADI (`nar-eksisi.webp` depoda hazır bekliyor).
      behotrade('Granaatappelextraat', '250 ml', undefined, 'Granaatappelextraat 250ml', 12, 3.45, {
        nameTr: 'Nar Özü',
        nameFr: 'Extrait de grenade',
        nameDe: 'Granatapfelextrakt',
        description: {
          tr: 'Nardan elde edilen yoğun öz; suyla seyreltilerek ya da salata ve tatlılarda kullanılır.',
          fr: 'Extrait concentré de grenade ; à diluer dans l’eau ou à utiliser en salade et en dessert.',
          de: 'Konzentrierter Granatapfelextrakt; mit Wasser verdünnt oder für Salate und Desserts.',
        },
      }),
      behotrade('Sifamix Kozalak extract', '670 g', 670, 'Sifamix Kozalak extract 670gr', 12, 4.25, {
        nameTr: 'Şifamix Kozalak Özü',
        nameFr: 'Extrait de pomme de pin Şifamix',
        nameDe: 'Şifamix Kiefernzapfenextrakt',
        description: {
          tr: 'Çam kozalağından elde edilen koyu kıvamlı öz; kaşıkla ya da suyla seyreltilerek.',
          fr: 'Extrait épais de pomme de pin ; à la cuillère ou dilué dans l’eau.',
          de: 'Dickflüssiger Kiefernzapfenextrakt; löffelweise oder mit Wasser verdünnt.',
        },
      }),
      behotrade('Sifamix Johannesbrood extract', '700 ml', undefined, 'Sifamix Johannesbrood extract 700ml', 12, 3.75, {
        nameTr: 'Şifamix Keçiboynuzu Özü',
        nameFr: 'Extrait de caroube Şifamix',
        nameDe: 'Şifamix Johannisbrotextrakt',
        description: {
          tr: 'Soğuk pres infüzyonla üretilen keçiboynuzu özü; şeker ilavesi içermez.',
          fr: 'Extrait de caroube obtenu par infusion à froid, sans sucre ajouté.',
          de: 'Johannisbrotextrakt aus Kaltpress-Infusion, ohne Zuckerzusatz.',
        },
        image: usta('sifamix-johannesbrood-extract', 'keçiboynuzu.zip/keçiboynuzu_01.jpg'),
      }),
      behotrade('Sifamix Andiz extract', '350 g', 350, 'Sifamix Andiz extract 350gr', 12, 3.99, {
        nameTr: 'Şifamix Andız Özü',
        nameFr: 'Extrait de genévrier Şifamix',
        nameDe: 'Şifamix Wacholderextrakt',
        description: {
          tr: 'Soğuk pres infüzyonla üretilen andız özü; şeker ilavesi içermez.',
          fr: 'Extrait de genévrier obtenu par infusion à froid, sans sucre ajouté.',
          de: 'Wacholderextrakt aus Kaltpress-Infusion, ohne Zuckerzusatz.',
        },
        image: usta('sifamix-andiz-extract', 'andız.zip/andız_01.jpg'),
      }),
      behotrade('Coconut mix', '250 ml', undefined, 'Coconut mix 250ml', 12, 4.95, {
        nameTr: 'Coconut Mix',
        nameFr: 'Coconut Mix',
        nameDe: 'Coconut Mix',
        // Bileşenler ambalajın ön yüzünde yazılı; yasal içindekiler beyanı değil, o yüzden açıklamada.
        description: {
          tr: 'Hindistan cevizi, kinoa, sandaloz sakızı, biberiye, yeşil çay ve chia içeren karışım; suyla seyreltilerek içilir.',
          fr: 'Mélange à la noix de coco, quinoa, gomme de sandaraque, romarin, thé vert et chia ; à diluer dans l’eau.',
          de: 'Mischung aus Kokosnuss, Quinoa, Sandarakharz, Rosmarin, Grüntee und Chia; mit Wasser verdünnt zu trinken.',
        },
        image: usta('coconut-mix', 'coconut_trendyol.zip/coconut_01.jpg'),
      }),
      behotrade('Honing azijn', '500 ml', undefined, 'Honing azijn 500ml', 12, 3, {
        nameTr: 'Bal Sirkesi',
        nameFr: 'Vinaigre de miel',
        nameDe: 'Honigessig',
        description: {
          tr: 'Doğal fermantasyonla üretilmiş bal sirkesi; katkı ve koruyucu içermez.',
          fr: 'Vinaigre de miel issu d’une fermentation naturelle, sans additif ni conservateur.',
          de: 'Honigessig aus natürlicher Gärung, ohne Zusatz- und Konservierungsstoffe.',
        },
        image: usta('honing-azijn', 'bal_sirkesi_şifamix_G03.pdf'),
      }),
      {
        name: 'Olijfolie',
        // Elle yazılmış kayıt: `behotrade()`ın raf varsayılanı buraya uğramaz.
        rejim: 'raf',
        nameTr: 'Zeytinyağı',
        nameFr: 'Huile d’olive',
        nameDe: 'Olivenöl',
        description: {
          tr: 'Yemeklik zeytinyağı; salatada, kızartmada ve pişirmede kullanılır.',
          fr: 'Huile d’olive de table ; pour les salades, les fritures et la cuisson.',
          de: 'Speiseolivenöl; für Salate, zum Braten und Kochen.',
        },
        variants: [
          { label: '5 l', nameAtSupplier: 'Olijfolie 5lt', qty: 4, unitCost: 29.9 },
          { label: '750 ml', nameAtSupplier: 'Olijfolie 750ml', qty: 12, unitCost: 5.5 },
        ],
      },
      behotrade('Pistache', '700 g', 700, 'Pistache 700gr', 20, 16.5, {
        nameTr: 'Antep Fıstığı',
        nameFr: 'Pistaches',
        nameDe: 'Pistazien',
        description: {
          tr: 'Antep fıstığı; atıştırmalık olarak ve tatlı yapımında kullanılır.',
          fr: 'Pistaches ; à grignoter ou à utiliser en pâtisserie.',
          de: 'Pistazien; als Snack oder zum Backen.',
        },
      }),
      behotrade('Bromelain siroop', '250 ml', undefined, 'Bromelain siroop 250ml', 18, 8, {
        nameTr: 'Bromelain Şurubu',
        nameFr: 'Sirop de broméline',
        nameDe: 'Bromelain-Sirup',
        description: {
          tr: 'Ananastan elde edilen bromelain içeren şurup; suyla seyreltilerek ya da doğrudan alınır.',
          fr: 'Sirop à la broméline issue de l’ananas ; à diluer dans l’eau ou à prendre tel quel.',
          de: 'Sirup mit Bromelain aus Ananas; mit Wasser verdünnt oder pur einzunehmen.',
        },
        image: magaza(
          'bromelain-siroop',
          'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/ZuhreAnaBromelainSurubu250ml_587ebfd0-bba8-42f4-9145-3df204a028ca.webp',
          'Zühre Ana',
        ),
      }),
      // Kekre ve Propolis: içindekiler listesi markanın kendi mağazasında YAZILI, olduğu gibi alındı.
      // Sağlık iddiası taşıyan cümleler (bağışıklık, iltihap, ağrı) bilerek taşınmadı — AB'de beyan
      // düzenlemeye tabi (1924/2006) ve kaynağı bir satış sayfası.
      behotrade('Zuhre Ana Kekre', '250 ml', undefined, 'Zuhre Ana Kekre 250ml', 18, 8.45, {
        nameTr: 'Zühre Ana Kekre Termojenik Mix',
        nameFr: 'Zühre Ana Kekre, concentré aux fruits',
        nameDe: 'Zühre Ana Kekre, Fruchtkonzentrat',
        description: {
          tr: 'Meyve ve bitki özlerinden hazırlanmış içecek konsantresi; suyla seyreltilerek içilir.',
          fr: 'Concentré de boisson aux extraits de fruits et de plantes ; à diluer dans l’eau.',
          de: 'Getränkekonzentrat aus Frucht- und Pflanzenauszügen; mit Wasser verdünnt zu trinken.',
        },
        ingredients: {
          tr: 'Yaban mersini, su, mate, zencefil, papaya, mango, açai, sandaloz sakızı, hindistan cevizi, hibiskus, avokado, ananas, tarçın, L-karnitin, stevia, ksantan gam.',
          fr: 'Myrtille, eau, maté, gingembre, papaye, mangue, açaï, gomme de sandaraque, noix de coco, hibiscus, avocat, ananas, cannelle, L-carnitine, stévia, gomme xanthane.',
          de: 'Heidelbeere, Wasser, Mate, Ingwer, Papaya, Mango, Açaí, Sandarakharz, Kokosnuss, Hibiskus, Avocado, Ananas, Zimt, L-Carnitin, Stevia, Xanthan.',
        },
        storage: {
          tr: 'Güneş ışığından uzak, serin ve kuru yerde saklayınız.',
          fr: 'À conserver à l’abri du soleil, au sec et au frais.',
          de: 'Vor Sonnenlicht geschützt, kühl und trocken lagern.',
        },
        image: magaza('zuhre-ana-kekre', 'https://cdn.shopify.com/s/files/1/0631/1326/5378/files/zuhre-ana-kekre-mix.png', 'Zühre Ana'),
      }),
      behotrade('Propolis pasta', '240 g', 240, 'Propolis pasta 240gr', 2, 8.5, {
        nameTr: 'Propolis Macunu',
        nameFr: 'Pâte au propolis',
        nameDe: 'Propolis-Paste',
        description: {
          tr: 'Çiçek balı ve keçiboynuzu pekmezi ile hazırlanmış, propolis içeren macun; kaşıkla tüketilir.',
          fr: 'Pâte au propolis préparée avec du miel de fleurs et de la mélasse de caroube ; à la cuillère.',
          de: 'Propolis-Paste aus Blütenhonig und Johannisbrotmelasse; löffelweise zu genießen.',
        },
        ingredients: {
          tr: 'Çiçek balı, keçiboynuzu pekmezi, polen, arı sütü, propolis, Kore ginsengi, damla sakızı, beta glukan.',
          fr: 'Miel de fleurs, mélasse de caroube, pollen, gelée royale, propolis, ginseng coréen, mastic, bêta-glucane.',
          de: 'Blütenhonig, Johannisbrotmelasse, Pollen, Gelée Royale, Propolis, koreanischer Ginseng, Mastix, Beta-Glucan.',
        },
        storage: { tr: 'Serin ve kuru yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Kühl und trocken lagern.' },
        image: magaza('propolis-pasta', 'https://cdn.shopify.com/s/files/1/0631/1326/5378/products/Propolis-min.jpg', 'Zühre Ana'),
      }),
      behotrade('Form pasta', '240 g', 240, 'Form pasta 240gr', 2, 8, {
        nameTr: 'Form Macunu',
        nameFr: 'Pâte Form (à la L-carnitine)',
        nameDe: 'Form-Paste (mit L-Carnitin)',
        description: {
          tr: 'L-karnitin destekli bitkisel macun; kaşıkla tüketilir.',
          fr: 'Pâte végétale enrichie en L-carnitine ; à la cuillère.',
          de: 'Pflanzliche Paste mit L-Carnitin; löffelweise zu genießen.',
        },
        storage: {
          tr: 'Güneş ışığından uzak, serin ve kuru yerde saklayınız.',
          fr: 'À conserver à l’abri du soleil, au sec et au frais.',
          de: 'Vor Sonnenlicht geschützt, kühl und trocken lagern.',
        },
        image: magaza('form-pasta', 'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/ZuhreAnaFormMacunu240Gram.webp', 'Zühre Ana'),
      }),
      behotrade('Dennenappel pasta', '240 g', 240, 'Dennenappel pasta 240gr', 2, 8, {
        nameTr: 'Kozalak Macunu',
        nameFr: 'Pâte de pomme de pin',
        nameDe: 'Kiefernzapfen-Paste',
        description: {
          tr: 'Çam kozalağı ve bitki özlerinden hazırlanmış macun; kaşıkla tüketilir.',
          fr: 'Pâte préparée à partir de pomme de pin et d’extraits de plantes ; à la cuillère.',
          de: 'Paste aus Kiefernzapfen und Pflanzenauszügen; löffelweise zu genießen.',
        },
        storage: { tr: 'Serin ve kuru yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Kühl und trocken lagern.' },
        image: magaza(
          'dennenappel-pasta',
          'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/Zuhre_Ana_Kozalak_Macunu.webp',
          'Zühre Ana',
        ),
      }),
      behotrade('Igde cekirdegi pasta', '240 g', 240, 'Igde cekirdegi pasta 240gr', 2, 8, {
        nameTr: 'İğde Çekirdeği Macunu',
        nameFr: 'Pâte aux noyaux d’olivier de Bohême',
        nameDe: 'Paste aus Ölweidenkernen',
        // Künye ambalajın üstünde yazılı: bal + pekmez katkılı, iğde çekirdeği tozu, kalsiyum, D3.
        description: {
          tr: 'İğde çekirdeği tozundan, bal ve pekmez katkısıyla hazırlanmış macun; kaşıkla tüketilir.',
          fr: 'Pâte aux noyaux d’olivier de Bohême, additionnée de miel et de mélasse ; à la cuillère.',
          de: 'Paste aus Ölweidenkernen mit Honig und Melasse; löffelweise zu genießen.',
        },
        image: magaza(
          'igde-cekirdegi-pasta',
          'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/ZuhreAnaIgdeCekirdegiMacunu.webp',
          'Zühre Ana',
        ),
      }),
      behotrade('Zwarte moerbei extrat', '670 g', 670, 'Zwarte moerbei extrat 670gr', 12, 7.25, {
        nameTr: 'Karadut Özü',
        nameFr: 'Extrait de mûre noire',
        nameDe: 'Schwarzer Maulbeerextrakt',
        description: {
          tr: 'Karadutan elde edilen yoğun öz; bir ölçü öze beş ölçü su eklenerek içilir.',
          fr: 'Extrait concentré de mûre noire ; une mesure d’extrait pour cinq mesures d’eau.',
          de: 'Konzentrierter schwarzer Maulbeerextrakt; ein Teil Extrakt auf fünf Teile Wasser.',
        },
        image: magaza(
          'zwarte-moerbei-extrat',
          'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/ZuhreAnaKaradutOzu.webp',
          'Zühre Ana',
        ),
      }),
      behotrade('Pestil met Hazinoten Muska', '300 g', 300, 'Pestil met Hazinoten Muska 300gr', 25, 3.95, {
        nameTr: 'Fındıklı Muska Pestil',
        nameFr: 'Muska pestil aux noisettes',
        nameDe: 'Muska-Pestil mit Haselnüssen',
        description: {
          tr: 'Meyve pestilinin içine fındık sarılıp üçgen katlanmış geleneksel atıştırmalık.',
          fr: 'En-cas traditionnel : pâte de fruits pliée en triangle et garnie de noisettes.',
          de: 'Traditioneller Snack: Fruchtleder mit Haselnüssen, dreieckig gefaltet.',
        },
      }),
      behotrade('Gedroogde aronya', '150 g', 150, 'Gedroogde aronya 150gr', 6, 3.99, {
        nameTr: 'Kurutulmuş Aronya',
        nameFr: 'Aronia séchée',
        nameDe: 'Getrocknete Aronia',
        description: {
          tr: 'Kurutulmuş aronya; atıştırmalık olarak, yoğurt ve müsliyle.',
          fr: 'Aronia séchée ; à grignoter, avec du yaourt ou du muesli.',
          de: 'Getrocknete Aronia; als Snack, zu Joghurt und Müsli.',
        },
      }),
      behotrade('Gedroogde appel', '180 g', 180, 'Gedroogde appel 180gr', 6, 2.75, {
        nameTr: 'Kurutulmuş Elma',
        nameFr: 'Pommes séchées',
        nameDe: 'Getrocknete Äpfel',
        description: {
          tr: 'Dilimlenip kurutulmuş elma; atıştırmalık olarak ve kompostoda.',
          fr: 'Pommes séchées en tranches ; à grignoter ou en compote.',
          de: 'In Scheiben getrocknete Äpfel; als Snack oder für Kompott.',
        },
      }),
      behotrade('Gedroogde Kaki cips', '180 g', 180, 'Gedroogde Kaki cips 180gr', 6, 2, {
        nameTr: 'Kurutulmuş Trabzon Hurması Cipsi',
        nameFr: 'Chips de kaki séché',
        nameDe: 'Kaki-Chips',
        description: {
          tr: 'İnce dilimlenip kurutulmuş Trabzon hurması; atıştırmalık.',
          fr: 'Kaki séché en fines tranches ; à grignoter.',
          de: 'Dünn geschnittene, getrocknete Kaki; als Snack.',
        },
      }),
      // Faturada gramaj yazmıyor.
      behotrade('Gedroogde perzik', undefined, undefined, 'Gedroogde perzik', 6, 4, {
        nameTr: 'Kurutulmuş Şeftali',
        nameFr: 'Pêches séchées',
        nameDe: 'Getrocknete Pfirsiche',
        description: {
          tr: 'Kurutulmuş şeftali; atıştırmalık olarak ve tatlılarda.',
          fr: 'Pêches séchées ; à grignoter ou en dessert.',
          de: 'Getrocknete Pfirsiche; als Snack und für Desserts.',
        },
      }),
      behotrade('Gedroogde meloen', '100 g', 100, 'Gedroogde meloen 100gr', 6, 2.25, {
        nameTr: 'Kurutulmuş Kavun',
        nameFr: 'Melon séché',
        nameDe: 'Getrocknete Melone',
        description: {
          tr: 'Kurutulmuş kavun; atıştırmalık olarak ve kuruyemiş karışımlarında.',
          fr: 'Melon séché ; à grignoter ou dans les mélanges de fruits secs.',
          de: 'Getrocknete Melone; als Snack oder in Trockenfruchtmischungen.',
        },
      }),
    ],
  },
];

/**
 * Anahtar tedarikçideki ad, çünkü fiyat varyanta bağlıdır (zeytinyağının iki boyu iki fiyat). Yöntem
 * `docs/architecture/COMPETITORS.md`'de; `taban` işaretli kalemde piyasa fiyatı profesyonel fiyatın KDV'li hâlinin
 * altında kaldığı için son tüketici fiyatı tabana çekildi.
 */
export const SALE_PRICES: Record<string, { b2c: number; b2b: number }> = {
  'LEZZA Kol Borek with Cheese Uncooked (Peynirli) 200 gr': { b2c: 0.99, b2b: 0.73 },
  'LEZZA Kol Borek with Spinach & Cheese Uncooked (Ispanakli Peynirli) 200 gr': { b2c: 0.99, b2b: 0.73 },
  'LEZZA Kol Borek with Minced Meat Uncooked (Kiymali) 200 gr': { b2c: 1.23, b2b: 0.91 },
  'LEZZA Kol Borek with Potato Uncooked (Patatesli) 200 gr': { b2c: 0.99, b2b: 0.73 },
  'LEZZA Vegan Cig kofte 16x1000 gr': { b2c: 14.97, b2b: 4.9 },
  'LEZZA Kunefah (Included plate and syrup) 2*145 gr– 420g': { b2c: 5.87, b2b: 4.27 },
  'LEZZA Turkish Bagel-Simit (% 80 Cooked) 4x105 gr': { b2c: 3.7, b2b: 2.45 },
  'LEZZA Cheese Pastry Rond (Peynirli Su Boregi Yuvarlak Tepsi) 800 gr': { b2c: 8.22, b2b: 6.3 },
  'LEZZA Spiral Pie Cheese (Peynirli Tepsi Boregi) 800 gr': { b2c: 5.27, b2b: 3.78 },
  'LEZZA Acma Plain Cooked (Sade Acma) 4x80 gr': { b2c: 3.95, b2b: 3.01 },
  'LEZZA Stuffed Pastry (%80 Cooked) (%80 Pismis Sade Pogaca) 4x80 gr': { b2c: 3.41, b2b: 2.52 },
  'LEZITA Tender Fillet 700 gr': { b2c: 7.29, b2b: 5.11 },
  'LEZITA Spicy Tender Fillet 700 gr': { b2c: 7.19, b2b: 5.04 },
  'LEZITA Spicy Chicken Wings 700 gr': { b2c: 6.17, b2b: 4.9 },
  'Lamour Artisan Pistachio Cake (90g) 1x9': { b2c: 4.43, b2b: 3.22 },
  'Lamour Artisan Mango Cake (90g) 1x9': { b2c: 3.83, b2b: 2.79 },
  'Lamour Artisan Lemon Cake (90g) 1x9': { b2c: 3.83, b2b: 2.79 },
  'Lamour Artisan Strawberry Cake (90g) 1x9': { b2c: 3.83, b2b: 2.79 },
  'LEZZA Traditional Meet Doner 10x700gr': { b2c: 11.82, b2b: 11.2 }, // taban
  'LEZZA Traditional Chicken Doner 10x700gr': { b2c: 9.45, b2b: 8.54 },
  'LEZZA Manti with Minced Meat (Kiymali )1000 gr': { b2c: 9.49, b2b: 7.21 },
  'Druivenmelasse 650gr': { b2c: 8.12, b2b: 7.7 }, // taban
  'Johannesbroodmelasse 650gr': { b2c: 8.12, b2b: 7.7 }, // taban
  'Tahini 500gr': { b2c: 7.02, b2b: 6.65 }, // taban
  'Meidoorn azijn 500ml': { b2c: 9.49, b2b: 4.2 },
  'Ananas azijn 500ml': { b2c: 10.45, b2b: 4.2 },
  'Enginar azijn 500ml': { b2c: 8.99, b2b: 4.2 },
  'Appel azijn 500ml': { b2c: 5.95, b2b: 4.2 },
  'Isgin azijn 500ml': { b2c: 9.45, b2b: 4.2 },
  'Granaatappelextraat 250ml': { b2c: 7.51, b2b: 4.83 },
  'Sifamix Kozalak extract 670gr': { b2c: 9.25, b2b: 5.95 },
  'Sifamix Johannesbrood extract 700ml': { b2c: 10.43, b2b: 5.25 },
  'Sifamix Andiz extract 350gr': { b2c: 8.68, b2b: 5.59 },
  'Coconut mix 250ml': { b2c: 15.9, b2b: 6.93 },
  'Honing azijn 500ml': { b2c: 9.45, b2b: 4.2 },
  'Olijfolie 5lt': { b2c: 55, b2b: 41.86 },
  'Olijfolie 750ml': { b2c: 12.82, b2b: 7.7 },
  'Pistache 700gr': { b2c: 24.37, b2b: 23.1 }, // taban
  'Bromelain siroop 250ml': { b2c: 14.99, b2b: 11.2 },
  'Zuhre Ana Kekre 250ml': { b2c: 17.62, b2b: 11.83 },
  'Propolis pasta 240gr': { b2c: 14.6, b2b: 11.9 },
  'Form pasta 240gr': { b2c: 17.49, b2b: 11.2 },
  'Dennenappel pasta 240gr': { b2c: 11.82, b2b: 11.2 }, // taban
  'Igde cekirdegi pasta 240gr': { b2c: 13.74, b2b: 11.2 },
  'Zwarte moerbei extrat 670gr': { b2c: 11.39, b2b: 10.15 },
  'Pestil met Hazinoten Muska 300gr': { b2c: 8.23, b2b: 5.53 },
  'Gedroogde aronya 150gr': { b2c: 13.15, b2b: 5.59 },
  'Gedroogde appel 180gr': { b2c: 9.06, b2b: 3.85 },
  'Gedroogde Kaki cips 180gr': { b2c: 6.59, b2b: 2.8 },
  'Gedroogde perzik': { b2c: 13.18, b2b: 5.6 },
  'Gedroogde meloen 100gr': { b2c: 7.41, b2b: 3.15 },
};

/**
 * İyileştirme çağrışımlı sözcük ("şifa") AB 1169/2011 madde 7/3 gereği kategori adına girmez; "Doğadan" bir çay
 * markası olduğu için kullanılmaz. `lezza` kaynağın kategori anahtarlarını buraya bağlar, yoksa `seedLezzaProducts`
 * kaynağın altı kategorisini ikinci bir sıra olarak açardı.
 */
interface SeedCategory {
  key: string;
  name: UcDil;
  tagline: UcDil;
  /** Ana sayfa vitrini altı kart çiziyor; yedincisi katalogda kalır, vitrine girmez. */
  featured: boolean;
  /** Kapak: katalogdaki dosya adı (`lezza`) · depodaki usta (`file`) · markanın mağazası (`url`). */
  image?: { lezza?: string; file?: string; url?: string };
  lezza?: string[];
}

export const CATEGORIES: SeedCategory[] = [
  {
    key: 'firin',
    name: { tr: 'Fırın', fr: 'Boulangerie', de: 'Backwaren' },
    tagline: { tr: 'Börek, poğaça ve simit', fr: 'Böreks, pogaças et simits', de: 'Börek, Pogaça und Simit' },
    featured: true,
    image: { lezza: 'Cheese-Pastry-Su-Borek-2500g.webp' },
    lezza: ['bakery'],
  },
  {
    key: 'tatli',
    name: { tr: 'Tatlı', fr: 'Desserts', de: 'Süßes' },
    tagline: { tr: 'Baklava, künefe, pasta ve dondurma', fr: 'Baklava, künefe, gâteaux et glaces', de: 'Baklava, Künefe, Torten und Eis' },
    featured: true,
    image: { lezza: 'Baklava-with-Pistachio-225g.webp' },
    lezza: ['cake', 'dessert', 'ice-cream'],
  },
  {
    key: 'et-tavuk',
    name: { tr: 'Et & Tavuk', fr: 'Viande & volaille', de: 'Fleisch & Geflügel' },
    tagline: { tr: 'Döner, mantı ve tavuk', fr: 'Döner, mantı et volaille', de: 'Döner, Mantı und Geflügel' },
    featured: true,
    image: { lezza: 'Chicken-Tender-Fillet-700g.webp' },
    lezza: ['chicken'],
  },
  {
    key: 'meze',
    name: { tr: 'Meze', fr: 'Mezze', de: 'Meze' },
    tagline: { tr: 'Çiğ köfte, humus ve falafel', fr: 'Çiğ köfte, houmous et falafels', de: 'Çiğ Köfte, Hummus und Falafel' },
    featured: true,
    image: { lezza: 'Vegan-Raw-Meatballs-1000g.webp' },
    // Kaynağın bu kategorisinde kıymalı mantı da var; o kalem seçime girerse buraya düşer, oysa rafı
    // Et & Tavuk'tur (faturadaki mantı taslak olarak oraya yazılıyor).
    lezza: ['anatolian'],
  },
  {
    key: 'dogal-geleneksel',
    name: { tr: 'Doğal & Geleneksel', fr: 'Nature & tradition', de: 'Natur & Tradition' },
    tagline: { tr: 'Pekmez, sirke, öz ve macun', fr: 'Mélasse, vinaigres, extraits et pâtes', de: 'Melasse, Essig, Extrakte und Pasten' },
    featured: true,
    image: { url: 'https://www.besegida.com/wp-content/uploads/2025/04/Bese-Helva-Pekmez-650.jpg' },
  },
  {
    key: 'kuru-meyve-kuruyemis',
    // "Fruits secs" Fransızcada yemişi de kapsar; Almancada iki sözcük gerekir.
    name: { tr: 'Kuru Meyve & Kuruyemiş', fr: 'Fruits secs', de: 'Nüsse & Trockenfrüchte' },
    tagline: { tr: 'Kuru meyve ve Antep fıstığı', fr: 'Fruits séchés et pistaches', de: 'Trockenfrüchte und Pistazien' },
    featured: true,
    // Kapak yok: depodaki ustaların hiçbiri kuru meyve ya da fıstık değil ve yapay zekâ üretimi görsel
    // kullanılmaz. Kart kapak gelene kadar baş harfle çizilir.
  },
];

/**
 * Faturada olmayan katalog kalemleri aday kurulur ve fiyatsız kalır: alış maliyeti olmayan ürüne satış fiyatı yazmak
 * uydurma olurdu. Tatlıda ailenin iki üyesi birden gelir ki çeşit bloğu kurulabilsin (`ELLE_AILELER`); mezede
 * kaynağın bütün rafı gelir ki satıştaki tek meze olan çiğ köfte kategori sayfasında yalnız kalmasın.
 */
export const ADAY_SKULARI: string[] = [
  // Bütün pastalar ve cheesecake'ler → Tatlı
  '900401',
  '900201',
  '902301',
  '900801',
  '900901',
  '900105',
  '900808',
  '900308',
  '901813',
  '901809',
  '901804',
  '901807',
  // Baklava çeşitleri → Tatlı
  '601201',
  '600101',
  '600201',
  '600903',
  '601402',
  '600802',
  '600601',
  '601102',
  '600807',
  '600402',
  // Maraş dondurmaları → Tatlı
  '111107',
  '111112',
  '111106',
  '111141',
  '111131',
  '111121',
  '111113',
  // Mezeler → Meze; iki boylu kalemlerde perakende boyu (500 g · 20 × 25 g · 5 × 70 g)
  '200412',
  '200411',
  '200413',
  '200414',
  '200410',
  '200201',
  '201302',
  '200702',
  '201401',
  '200301',
];

/**
 * Tek üyeli aile kurulmaz (`ELLE_AILELER` ile aynı kural), çünkü çeşit bloğu en az iki kart ister. Anahtar
 * faturadaki addır (`Draft.name`); etiket yalnız çeşidi söyler, çünkü blok aile adını zaten yazıyor.
 */
export const DRAFT_FAMILIES: Array<{ ad: string; uyeler: Array<{ draft: string; etiket: UcDil }> }> = [
  {
    ad: 'Sirke',
    uyeler: [
      { draft: 'Appel azijn', etiket: { tr: 'Elma', fr: 'Pomme', de: 'Apfel' } },
      { draft: 'Ananas azijn', etiket: { tr: 'Ananas', fr: 'Ananas', de: 'Ananas' } },
      { draft: 'Meidoorn azijn', etiket: { tr: 'Alıç', fr: 'Aubépine', de: 'Weißdorn' } },
      { draft: 'Enginar azijn', etiket: { tr: 'Enginar', fr: 'Artichaut', de: 'Artischocke' } },
      { draft: 'Isgin azijn', etiket: { tr: 'Işkın', fr: 'Rhubarbe', de: 'Rhabarber' } },
      { draft: 'Honing azijn', etiket: { tr: 'Bal', fr: 'Miel', de: 'Honig' } },
    ],
  },
  {
    ad: 'Pekmez',
    uyeler: [
      { draft: 'Druivenmelasse', etiket: { tr: 'Üzüm', fr: 'Raisin', de: 'Traube' } },
      { draft: 'Johannesbroodmelasse', etiket: { tr: 'Keçiboynuzu', fr: 'Caroube', de: 'Johannisbrot' } },
    ],
  },
  {
    ad: 'Bitki Özü',
    uyeler: [
      { draft: 'Sifamix Kozalak extract', etiket: { tr: 'Kozalak', fr: 'Pomme de pin', de: 'Kiefernzapfen' } },
      { draft: 'Sifamix Johannesbrood extract', etiket: { tr: 'Keçiboynuzu', fr: 'Caroube', de: 'Johannisbrot' } },
      { draft: 'Sifamix Andiz extract', etiket: { tr: 'Andız', fr: 'Genévrier', de: 'Wacholder' } },
      { draft: 'Granaatappelextraat', etiket: { tr: 'Nar', fr: 'Grenade', de: 'Granatapfel' } },
      { draft: 'Zwarte moerbei extrat', etiket: { tr: 'Karadut', fr: 'Mûre noire', de: 'Maulbeere' } },
    ],
  },
  {
    ad: 'Macun',
    uyeler: [
      { draft: 'Propolis pasta', etiket: { tr: 'Propolis', fr: 'Propolis', de: 'Propolis' } },
      { draft: 'Dennenappel pasta', etiket: { tr: 'Kozalak', fr: 'Pomme de pin', de: 'Kiefernzapfen' } },
      { draft: 'Igde cekirdegi pasta', etiket: { tr: 'İğde çekirdeği', fr: 'Noyau de chalef', de: 'Ölweidenkern' } },
      { draft: 'Form pasta', etiket: { tr: 'L-karnitinli', fr: 'À la L-carnitine', de: 'Mit L-Carnitin' } },
    ],
  },
  {
    ad: 'Kuru Meyve',
    uyeler: [
      { draft: 'Gedroogde appel', etiket: { tr: 'Elma', fr: 'Pomme', de: 'Apfel' } },
      { draft: 'Gedroogde aronya', etiket: { tr: 'Aronya', fr: 'Aronia', de: 'Aronia' } },
      { draft: 'Gedroogde Kaki cips', etiket: { tr: 'Trabzon hurması', fr: 'Kaki', de: 'Kaki' } },
      { draft: 'Gedroogde perzik', etiket: { tr: 'Şeftali', fr: 'Pêche', de: 'Pfirsich' } },
      { draft: 'Gedroogde meloen', etiket: { tr: 'Kavun', fr: 'Melon', de: 'Melone' } },
    ],
  },
];

/**
 * Anahtar faturadaki addır (`Draft.name`) ki katalog adı düzeltilse de eşleşme kaymasın. Eksik taslak beslemeyi
 * durdurur (`checkDraftCategories`): kategorisiz ürün vitrinde hiçbir kategorinin altında görünmez ve eksiklik ancak
 * siteye bakınca fark edilirdi.
 */
export const DRAFT_CATEGORY: Record<string, string> = {
  'LEZZA Traditional Meet Doner': 'et-tavuk',
  'LEZZA Traditional Chicken Doner': 'et-tavuk',
  'LEZZA Manti with Minced Meat (Kiymali)': 'et-tavuk',
  Druivenmelasse: 'dogal-geleneksel',
  Johannesbroodmelasse: 'dogal-geleneksel',
  Tahini: 'dogal-geleneksel',
  Olijfolie: 'dogal-geleneksel',
  'Meidoorn azijn': 'dogal-geleneksel',
  'Ananas azijn': 'dogal-geleneksel',
  'Enginar azijn': 'dogal-geleneksel',
  'Appel azijn': 'dogal-geleneksel',
  'Isgin azijn': 'dogal-geleneksel',
  'Honing azijn': 'dogal-geleneksel',
  Granaatappelextraat: 'dogal-geleneksel',
  'Sifamix Kozalak extract': 'dogal-geleneksel',
  'Sifamix Johannesbrood extract': 'dogal-geleneksel',
  'Sifamix Andiz extract': 'dogal-geleneksel',
  'Coconut mix': 'dogal-geleneksel',
  'Bromelain siroop': 'dogal-geleneksel',
  'Zuhre Ana Kekre': 'dogal-geleneksel',
  'Propolis pasta': 'dogal-geleneksel',
  'Form pasta': 'dogal-geleneksel',
  'Dennenappel pasta': 'dogal-geleneksel',
  'Igde cekirdegi pasta': 'dogal-geleneksel',
  'Zwarte moerbei extrat': 'dogal-geleneksel',
  // Pestil tatlı olarak yenir ama raf ürünüdür; Tatlı'nın geri kalanı donuk.
  'Pestil met Hazinoten Muska': 'dogal-geleneksel',
  Pistache: 'kuru-meyve-kuruyemis',
  'Gedroogde aronya': 'kuru-meyve-kuruyemis',
  'Gedroogde appel': 'kuru-meyve-kuruyemis',
  'Gedroogde Kaki cips': 'kuru-meyve-kuruyemis',
  'Gedroogde perzik': 'kuru-meyve-kuruyemis',
  'Gedroogde meloen': 'kuru-meyve-kuruyemis',
};

/**
 * Koleksiyon = editoryal seçki; kategoriden farkı ürünün bir RAFTA değil bir FİKİRDE toplanması,
 * o yüzden bir ürün birden çok seçkide durabilir.
 *
 * Üyeler kataloğun kendi kimlikleriyle yazılır — Lezza ürünü varyant koduyla, taslak faturadaki
 * adla; ikisi de ad düzeltmelerinden etkilenmez.
 */
interface SeedCollection {
  name: UcDil;
  description: UcDil;
  skus: string[];
  drafts: string[];
}

export const COLLECTIONS: SeedCollection[] = [
  {
    name: { tr: 'Kahvaltılık', fr: 'Petit-déjeuner', de: 'Frühstück' },
    description: {
      tr: 'Sabah sofrasının tamamı: fırından çıkanlar, pekmez, tahin ve zeytinyağı.',
      fr: 'Toute la table du matin : le sorti du four, la mélasse, le tahin et l’huile d’olive.',
      de: 'Der ganze Frühstückstisch: Gebäck, Melasse, Tahin und Olivenöl.',
    },
    skus: ['700101', '700301', '700201', '700402'],
    drafts: ['Druivenmelasse', 'Johannesbroodmelasse', 'Tahini', 'Olijfolie'],
  },
  {
    name: { tr: 'Bitki Rafı', fr: 'Herboristerie', de: 'Kräuterregal' },
    description: {
      tr: 'Bitki özleri, macunlar ve sirkeler; kaşıkla ya da suyla seyreltilerek.',
      fr: 'Extraits de plantes, pâtes et vinaigres ; à la cuillère ou dilués dans l’eau.',
      de: 'Pflanzenextrakte, Pasten und Essige; löffelweise oder mit Wasser verdünnt.',
    },
    skus: [],
    drafts: [
      'Sifamix Kozalak extract',
      'Sifamix Johannesbrood extract',
      'Sifamix Andiz extract',
      'Granaatappelextraat',
      'Zwarte moerbei extrat',
      'Bromelain siroop',
      'Coconut mix',
      'Zuhre Ana Kekre',
      'Propolis pasta',
      'Form pasta',
      'Dennenappel pasta',
      'Igde cekirdegi pasta',
      'Meidoorn azijn',
      'Appel azijn',
      'Honing azijn',
    ],
  },
];

/* ─── KATMAN 3 · UYDURMA ─────────────────────────────────────────────────────────────────────────
 * Bu bloklar yalnız test sunucusunun ekranlarını doldurur: `--layers=3` olmadan yazılmaz, gerçek değerler
 * tedarikçinin künyesinden gelir ve üretim kurulumundan önce blok bütün hâlinde silinir. Anahtar faturadaki addır
 * (`Draft.name`) ki katalog adı düzeltilse de eşleşme kaymasın.
 */

/** kJ, kcal'den türer: iki kalemin birbiriyle çelişmesi imkânsız olsun (INCO ikisini birden ister). */
const besin = (
  energyKcal: number,
  fatG: number,
  saturatedFatG: number,
  carbohydrateG: number,
  sugarsG: number,
  proteinG: number,
  saltG: number,
): Nutrition => ({ energyKj: Math.round(energyKcal * 4.184), energyKcal, fatG, saturatedFatG, carbohydrateG, sugarsG, proteinG, saltG });

/** 100 g başına — UYDURMA. */
export const FICTION_NUTRITION: Record<string, Nutrition> = {
  'LEZZA Traditional Meet Doner': besin(250, 18, 7.5, 3, 0.5, 19, 1.6),
  'LEZZA Traditional Chicken Doner': besin(190, 11, 3.2, 3.5, 0.6, 20, 1.4),
  'LEZZA Manti with Minced Meat (Kiymali)': besin(245, 6.5, 2.4, 34, 1.5, 11, 0.9),
  Druivenmelasse: besin(293, 0.2, 0.1, 70, 65, 1.2, 0.05),
  Johannesbroodmelasse: besin(285, 0.3, 0.1, 68, 60, 1.5, 0.1),
  Tahini: besin(595, 53, 7.5, 10, 0.5, 17, 0.02),
  'Meidoorn azijn': besin(20, 0, 0, 4.5, 3.5, 0.1, 0.01),
  'Ananas azijn': besin(21, 0, 0, 4.8, 3.8, 0.1, 0.01),
  'Enginar azijn': besin(19, 0, 0, 4.2, 3.2, 0.1, 0.01),
  'Appel azijn': besin(21, 0, 0, 4.6, 3.6, 0.1, 0.01),
  'Isgin azijn': besin(18, 0, 0, 4, 3, 0.1, 0.01),
  Granaatappelextraat: besin(280, 0.1, 0, 68, 62, 1, 0.03),
  'Sifamix Kozalak extract': besin(300, 0.2, 0.1, 73, 60, 0.8, 0.04),
  'Sifamix Johannesbrood extract': besin(290, 0.2, 0.1, 70, 58, 1, 0.04),
  'Sifamix Andiz extract': besin(305, 0.2, 0.1, 74, 62, 0.7, 0.04),
  'Coconut mix': besin(45, 1.2, 1, 7.5, 5, 0.3, 0.02),
  'Honing azijn': besin(26, 0, 0, 6, 5, 0.1, 0.01),
  Olijfolie: besin(824, 91.6, 13.5, 0, 0, 0, 0),
  Pistache: besin(562, 45, 5.6, 16, 7.7, 20, 0.01),
  'Bromelain siroop': besin(120, 0, 0, 29, 26, 0.2, 0.02),
  'Zuhre Ana Kekre': besin(95, 0.1, 0, 22, 18, 0.3, 0.03),
  'Propolis pasta': besin(330, 1.5, 0.4, 74, 65, 2.5, 0.05),
  'Form pasta': besin(315, 1.2, 0.3, 72, 60, 2, 0.05),
  'Dennenappel pasta': besin(320, 1.4, 0.4, 73, 62, 2.2, 0.05),
  'Igde cekirdegi pasta': besin(325, 2, 0.5, 72, 58, 3, 0.05),
  'Zwarte moerbei extrat': besin(290, 0.2, 0.1, 70, 63, 1, 0.03),
  'Pestil met Hazinoten Muska': besin(390, 12, 1.2, 62, 48, 6, 0.05),
  'Gedroogde aronya': besin(320, 1.5, 0.2, 66, 48, 3, 0.02),
  'Gedroogde appel': besin(245, 0.3, 0.1, 57, 49, 1, 0.03),
  'Gedroogde Kaki cips': besin(290, 0.5, 0.1, 68, 55, 1.5, 0.02),
  'Gedroogde perzik': besin(240, 0.6, 0.1, 55, 42, 3, 0.02),
  'Gedroogde meloen': besin(310, 0.3, 0.1, 74, 66, 1, 0.05),
};

/**
 * UYDURMA alerjen beyanı — beyansız ürün satışa çıkamadığı için katman 3'te satışa çıkan her taslağın kaydı var; boş liste
 * "alerjen içermez" beyanıdır. Değer içindekiler metnindeki alerjenden türer (sirke ve kuru meyvede sülfit), metinde olmayan yazılmaz.
 */
export const FICTION_ALLERGENS: Record<string, ProductAllergen[]> = {
  Tahini: ['susam'],
  Pistache: ['sert_kabuklu'],
  'Pestil met Hazinoten Muska': ['sert_kabuklu', 'gluten'],
  'LEZZA Manti with Minced Meat (Kiymali)': ['gluten', 'yumurta'],
  'LEZZA Traditional Meet Doner': ['hardal'],
  'LEZZA Traditional Chicken Doner': ['hardal'],
  Druivenmelasse: [],
  Johannesbroodmelasse: [],
  'Meidoorn azijn': ['sulfit'],
  'Ananas azijn': ['sulfit'],
  'Enginar azijn': ['sulfit'],
  'Appel azijn': ['sulfit'],
  'Isgin azijn': ['sulfit'],
  'Honing azijn': ['sulfit'],
  Granaatappelextraat: [],
  'Sifamix Kozalak extract': [],
  'Sifamix Johannesbrood extract': [],
  'Sifamix Andiz extract': [],
  'Coconut mix': [],
  Olijfolie: [],
  'Bromelain siroop': [],
  'Zuhre Ana Kekre': [],
  'Propolis pasta': [],
  'Form pasta': [],
  'Dennenappel pasta': [],
  'Igde cekirdegi pasta': [],
  'Zwarte moerbei extrat': [],
  'Gedroogde aronya': ['sulfit'],
  'Gedroogde appel': ['sulfit'],
  'Gedroogde Kaki cips': ['sulfit'],
  'Gedroogde perzik': ['sulfit'],
  'Gedroogde meloen': ['sulfit'],
};

/** UYDURMA içindekiler. Ölçülmüş listesi olan iki ürün (Kekre, Propolis) burada YOK — katman 1 kazanır. */
export const FICTION_INGREDIENTS: Record<string, UcDil> = {
  Druivenmelasse: { tr: 'Üzüm şırası.', fr: 'Moût de raisin.', de: 'Traubenmost.' },
  Johannesbroodmelasse: { tr: 'Keçiboynuzu özütü, su.', fr: 'Extrait de caroube, eau.', de: 'Johannisbrotextrakt, Wasser.' },
  Tahini: { tr: 'Kabuğu soyulmuş susam (%100).', fr: 'Sésame décortiqué (100 %).', de: 'Geschälter Sesam (100 %).' },
  'Meidoorn azijn': { tr: 'Alıç, su, sülfit.', fr: 'Aubépine, eau, sulfites.', de: 'Weißdorn, Wasser, Sulfite.' },
  'Ananas azijn': { tr: 'Ananas, su, sülfit.', fr: 'Ananas, eau, sulfites.', de: 'Ananas, Wasser, Sulfite.' },
  'Enginar azijn': { tr: 'Enginar, su, sülfit.', fr: 'Artichaut, eau, sulfites.', de: 'Artischocke, Wasser, Sulfite.' },
  'Appel azijn': { tr: 'Elma, su, sülfit.', fr: 'Pomme, eau, sulfites.', de: 'Apfel, Wasser, Sulfite.' },
  'Isgin azijn': { tr: 'Işkın kökü, su, sülfit.', fr: 'Racine de rhubarbe, eau, sulfites.', de: 'Rhabarberwurzel, Wasser, Sulfite.' },
  'Honing azijn': { tr: 'Bal, su, sülfit.', fr: 'Miel, eau, sulfites.', de: 'Honig, Wasser, Sulfite.' },
  Granaatappelextraat: { tr: 'Nar suyu konsantresi.', fr: 'Concentré de jus de grenade.', de: 'Granatapfelsaftkonzentrat.' },
  'Sifamix Kozalak extract': {
    tr: 'Çam kozalağı özütü, üzüm pekmezi.',
    fr: 'Extrait de pomme de pin, mélasse de raisin.',
    de: 'Kiefernzapfenextrakt, Traubenmelasse.',
  },
  'Sifamix Johannesbrood extract': { tr: 'Keçiboynuzu özütü, su.', fr: 'Extrait de caroube, eau.', de: 'Johannisbrotextrakt, Wasser.' },
  'Sifamix Andiz extract': { tr: 'Andız özütü, su.', fr: 'Extrait de genévrier, eau.', de: 'Wacholderextrakt, Wasser.' },
  'Coconut mix': {
    tr: 'Hindistan cevizi, kinoa, sandaloz sakızı, biberiye, yeşil çay, chia, su.',
    fr: 'Noix de coco, quinoa, gomme de sandaraque, romarin, thé vert, chia, eau.',
    de: 'Kokosnuss, Quinoa, Sandarakharz, Rosmarin, Grüntee, Chia, Wasser.',
  },
  Olijfolie: { tr: 'Naturel sızma zeytinyağı (%100).', fr: 'Huile d’olive vierge extra (100 %).', de: 'Natives Olivenöl extra (100 %).' },
  Pistache: { tr: 'Antep fıstığı (%100).', fr: 'Pistaches (100 %).', de: 'Pistazien (100 %).' },
  'Bromelain siroop': {
    tr: 'Ananas suyu konsantresi, bromelain, akasya gamı, su.',
    fr: 'Concentré de jus d’ananas, broméline, gomme d’acacia, eau.',
    de: 'Ananassaftkonzentrat, Bromelain, Akaziengummi, Wasser.',
  },
  'Form pasta': {
    tr: 'Bal, keçiboynuzu pekmezi, L-karnitin, yeşil çay özütü.',
    fr: 'Miel, mélasse de caroube, L-carnitine, extrait de thé vert.',
    de: 'Honig, Johannisbrotmelasse, L-Carnitin, Grüntee-Extrakt.',
  },
  'Dennenappel pasta': {
    tr: 'Çam kozalağı, çam sakızı, zerdeçal, zencefil, keçiboynuzu tozu, bal.',
    fr: 'Pomme de pin, résine de pin, curcuma, gingembre, poudre de caroube, miel.',
    de: 'Kiefernzapfen, Kiefernharz, Kurkuma, Ingwer, Johannisbrotpulver, Honig.',
  },
  'Igde cekirdegi pasta': {
    tr: 'İğde çekirdeği tozu, bal, üzüm pekmezi, kalsiyum, D3 vitamini.',
    fr: 'Poudre de noyaux d’olivier de Bohême, miel, mélasse de raisin, calcium, vitamine D3.',
    de: 'Ölweidenkernpulver, Honig, Traubenmelasse, Kalzium, Vitamin D3.',
  },
  'Zwarte moerbei extrat': {
    tr: 'Karadut suyu konsantresi.',
    fr: 'Concentré de jus de mûre noire.',
    de: 'Schwarzer Maulbeersaftkonzentrat.',
  },
  'Pestil met Hazinoten Muska': {
    tr: 'Dut pestili (dut, su, buğday nişastası), fındık ezmesi.',
    fr: 'Pâte de mûre (mûre, eau, amidon de blé), pâte de noisette.',
    de: 'Maulbeer-Fruchtleder (Maulbeere, Wasser, Weizenstärke), Haselnussmus.',
  },
  'Gedroogde aronya': { tr: 'Kurutulmuş aronya, sülfit.', fr: 'Aronia séchée, sulfites.', de: 'Getrocknete Aronia, Sulfite.' },
  'Gedroogde appel': { tr: 'Kurutulmuş elma, sülfit.', fr: 'Pomme séchée, sulfites.', de: 'Getrockneter Apfel, Sulfite.' },
  'Gedroogde Kaki cips': { tr: 'Kurutulmuş Trabzon hurması, sülfit.', fr: 'Kaki séché, sulfites.', de: 'Getrocknete Kaki, Sulfite.' },
  'Gedroogde perzik': { tr: 'Kurutulmuş şeftali, sülfit.', fr: 'Pêche séchée, sulfites.', de: 'Getrockneter Pfirsich, Sulfite.' },
  'Gedroogde meloen': { tr: 'Kurutulmuş kavun, sülfit.', fr: 'Melon séché, sulfites.', de: 'Getrocknete Melone, Sulfite.' },
  'LEZZA Traditional Meet Doner': {
    tr: 'Dana eti, soğan, baharat karışımı (hardal), tuz.',
    fr: 'Viande de bœuf, oignon, mélange d’épices (moutarde), sel.',
    de: 'Rindfleisch, Zwiebel, Gewürzmischung (Senf), Salz.',
  },
  'LEZZA Traditional Chicken Doner': {
    tr: 'Tavuk eti, soğan, baharat karışımı (hardal), tuz.',
    fr: 'Viande de poulet, oignon, mélange d’épices (moutarde), sel.',
    de: 'Hähnchenfleisch, Zwiebel, Gewürzmischung (Senf), Salz.',
  },
  'LEZZA Manti with Minced Meat (Kiymali)': {
    tr: 'Buğday unu, su, kıyma, soğan, yumurta, tuz.',
    fr: 'Farine de blé, eau, viande hachée, oignon, œuf, sel.',
    de: 'Weizenmehl, Wasser, Hackfleisch, Zwiebel, Ei, Salz.',
  },
};

/** UYDURMA saklama koşulu. Üreticinin künyesinden ölçülmüş olan yedi ürün burada YOK — katman 1 kazanır. */
const KURU_SERIN: UcDil = {
  tr: 'Kuru ve serin yerde, güneş ışığından uzakta saklayınız.',
  fr: 'À conserver au sec et au frais, à l’abri du soleil.',
  de: 'Trocken, kühl und vor Sonnenlicht geschützt lagern.',
};
const DONMUS: UcDil = {
  tr: '-18 °C’de saklayınız; çözülmüş ürünü yeniden dondurmayınız.',
  fr: 'À conserver à -18 °C ; ne pas recongeler après décongélation.',
  de: 'Bei -18 °C lagern; nach dem Auftauen nicht wieder einfrieren.',
};

export const FICTION_STORAGE: Record<string, UcDil> = {
  'Meidoorn azijn': KURU_SERIN,
  'Ananas azijn': KURU_SERIN,
  'Enginar azijn': KURU_SERIN,
  'Appel azijn': KURU_SERIN,
  'Isgin azijn': KURU_SERIN,
  'Honing azijn': KURU_SERIN,
  Granaatappelextraat: KURU_SERIN,
  'Sifamix Kozalak extract': KURU_SERIN,
  'Sifamix Johannesbrood extract': KURU_SERIN,
  'Sifamix Andiz extract': KURU_SERIN,
  'Coconut mix': KURU_SERIN,
  Olijfolie: KURU_SERIN,
  Pistache: KURU_SERIN,
  'Bromelain siroop': KURU_SERIN,
  'Igde cekirdegi pasta': KURU_SERIN,
  'Zwarte moerbei extrat': KURU_SERIN,
  'Pestil met Hazinoten Muska': KURU_SERIN,
  'Gedroogde aronya': KURU_SERIN,
  'Gedroogde appel': KURU_SERIN,
  'Gedroogde Kaki cips': KURU_SERIN,
  'Gedroogde perzik': KURU_SERIN,
  'Gedroogde meloen': KURU_SERIN,
  'LEZZA Traditional Meet Doner': DONMUS,
  'LEZZA Traditional Chicken Doner': DONMUS,
  'LEZZA Manti with Minced Meat (Kiymali)': DONMUS,
};
