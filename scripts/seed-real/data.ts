// Gerçek başlangıç verisi; test sunucusu ve üretimin ilk kurulumu bu dosyadan beslenir.
//
// **Ürünün KÜNYESİ burada DEĞİL** (işletmeci kararı 19.09): ad, beyan, boy, barkod ve ambalaj ölçüsü
// `data/urun-kunyeleri.json`da, yani TEST VERİTABANININ aynasındadır — o kayıtlar etiket fotoğrafıyla
// girildi ve çelişkide kazanan onlardır (`kunye.ts`). Bu dosya faturanın söylediğini (kalem, adet, alış
// fiyatı), işletmecinin kararlarını (kategori, koleksiyon, paket, tarif, satış fiyatı) ve kapakları taşır.
//
// `--layers` yalnız TEST verisini açar ve ölçüt ürünün BEYANINA dokunup dokunmadığıdır: 2 = test mal
// kabulü (lot, SKT) — stok açar, beyana dokunmaz; 3 = katalog kaynağının beyan türetmesi. Bizim
// ürünlerimizde beyan uydurması KALKTI; eksik beyan eksik kalır.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Test kabulü: lot ve son kullanma uydurmadır, mal fiilen sayılmamıştır. Yalnız `--layers=2` ile yazılır ki arayüz
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
  unit?: { label: string; netQuantity: number; piecesCount: number };
}

/** Taslağın fatura satırı — boy, barkod ve ambalaj ölçüsü künye aynasından gelir (`kunye.ts`). */
type DraftVariant = PurchaseLine;

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
  /**
   * Faturada yazan ad — eşleştirme, koleksiyon, kategori ve fiyat sözlüğü bu anahtarı kullanır.
   * Taslağın KÜNYESİ burada değil `data/urun-kunyeleri.json`da (veritabanı aynası); bu dosya
   * yalnız faturanın söylediğini ve kapağı taşır.
   */
  name: string;
  /** Katalogdaki Türkçe ad; künye aynasının anahtarı da budur. Yazılmazsa `name` kullanılır. */
  nameTr?: string;
  /** Gerçek ürün çekimi: tedarikçinin gönderdiği usta, markanın mağazası ya da stüdyo karesi. */
  image?: DraftImage;
  /** Kapak dışındaki kareler; sırayla galeriye girer, tavanı uygulamanın sabiti (`PRODUCT_GALLERY_MAX`). */
  gallery?: DraftImage[];
  /** Faturadaki satır(lar) — boyla eşleşmesi künyedeki SIRAYA göredir. */
  variants: DraftVariant[];
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
  nameAtSupplier: string,
  qty: number,
  unitCost: number,
  /** Katalogdaki Türkçe ad = künye aynasının anahtarı. */
  nameTr: string,
  /** Kapak ve galeri; künyede olmayan tek şey görseldir, o yüzden burada durur. */
  gorsel: Pick<Draft, 'image' | 'gallery'> = {},
): Draft => ({ name, nameTr, ...gorsel, variants: [{ nameAtSupplier, qty, unitCost }] });

/** Ürünün görsel klasörü: `images/<ürün slug'ı>/`. Klasör adı ÜRÜNÜN slug'ı, tedarikçinin adı değil. */
const GORSEL_KOKU = join(dirname(fileURLToPath(import.meta.url)), 'images');

/** Klasördeki tek kare. `ad` kapakta ürünün slug'ı, galeride `<slug>-<n>` — CDN anahtarı bu. */
const studyo = (slug: string, dosya: string): DraftImage => ({
  slug: dosya.startsWith('0.') ? slug : `${slug}-${dosya.replace(/\.[^.]+$/, '')}`,
  file: `scripts/seed-real/images/${slug}/${dosya}`,
  source: 'İşletmecinin ürün çekimi',
});

/**
 * Bir ürünün görsel takımı — KLASÖRDEN okunur, burada sayı yazılmaz.
 *
 * **Kapak `0` adlı karedir** (işletmeci kararı, 19.09): hangi karenin kapak olacağını işletmeci
 * dosyayı `0` diye adlandırarak söyler, kodda bir yeri değiştirmesi gerekmez. Kalanlar ada göre
 * sırayla galeriye girer. Kapaksız klasör beslemeyi DURDURUR: sessizce rastgele bir kare seçmek,
 * işletmecinin seçmediği bir kareyi vitrine koymak olurdu.
 */
const studyoSeti = (slug: string): Pick<Draft, 'image' | 'gallery'> => {
  const kareler = readdirSync(join(GORSEL_KOKU, slug))
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .sort();
  const kapak = kareler.find((f) => f.startsWith('0.'));
  if (!kapak) throw new Error(`${slug}: kapak yok — klasördeki bir kareyi "0" diye adlandır`);
  return { image: studyo(slug, kapak), gallery: kareler.filter((f) => f !== kapak).map((f) => studyo(slug, f)) };
};

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
        unit: { label: '2 × 145 g', netQuantity: 290, piecesCount: 2 },
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
      // Faturadaki döner ve mantı katalog kaynağında YOK; künyeleri veritabanı aynasından gelir.
      behotrade('LEZZA Traditional Meet Doner', 'LEZZA Traditional Meet Doner 10x700gr', 10, 8, 'LEZZA Geleneksel Et Döner'),
      behotrade('LEZZA Traditional Chicken Doner', 'LEZZA Traditional Chicken Doner 10x700gr', 10, 6.1, 'LEZZA Geleneksel Tavuk Döner'),
      behotrade(
        'LEZZA Manti with Minced Meat (Kiymali)',
        'LEZZA Manti with Minced Meat (Kiymali )1000 gr',
        10,
        5.15,
        'LEZZA Kıymalı Mantı',
        studyoSeti('lezza-kiymali-manti'),
      ),
    ],
  },
  {
    supplier: 'Behotrade BV',
    invoice: '2026-0224',
    invoiceTotal: 1802.07,
    catalog: [],
    drafts: [
      behotrade('Druivenmelasse', 'Druivenmelasse 650gr', 12, 5.5, 'Üzüm Pekmezi', studyoSeti('uzum-pekmezi')),
      behotrade('Johannesbroodmelasse', 'Johannesbroodmelasse 650gr', 12, 5.5, 'Keçiboynuzu Pekmezi', studyoSeti('keciboynuzu-pekmezi')),
      behotrade('Tahini', 'Tahini 500gr', 12, 4.75, 'Tahin', studyoSeti('tahin')),
      behotrade('Meidoorn azijn', 'Meidoorn azijn 500ml', 12, 3, 'Alıç Sirkesi', studyoSeti('alic-sirkesi')),
      behotrade('Ananas azijn', 'Ananas azijn 500ml', 12, 3, 'Ananas Sirkesi', studyoSeti('ananas-sirkesi')),
      behotrade('Enginar azijn', 'Enginar azijn 500ml', 12, 3, 'Enginar Sirkesi'),
      behotrade('Appel azijn', 'Appel azijn 500ml', 12, 3, 'Elma Sirkesi', studyoSeti('elma-sirkesi')),
      behotrade('Isgin azijn', 'Isgin azijn 500ml', 12, 3, 'Işkın Kökü Sirkesi', studyoSeti('iskin-koku-sirkesi')),
      behotrade('Granaatappelextraat', 'Granaatappelextraat 250ml', 12, 3.45, 'Nar Ekşisi', studyoSeti('nar-eksisi')),
      behotrade('Sifamix Kozalak extract', 'Sifamix Kozalak extract 670gr', 12, 4.25, 'Şifamix Kozalak Özü', studyoSeti('sifamix-kozalak-ozu')),
      behotrade(
        'Sifamix Johannesbrood extract',
        'Sifamix Johannesbrood extract 700ml',
        12,
        3.75,
        'Şifamix Keçiboynuzu Özü',
        studyoSeti('sifamix-keciboynuzu-ozu'),
      ),
      behotrade('Sifamix Andiz extract', 'Sifamix Andiz extract 350gr', 12, 3.99, 'Şifamix Andız Özü', studyoSeti('sifamix-andiz-ozu')),
      behotrade('Coconut mix', 'Coconut mix 250ml', 12, 4.95, 'Coconut Mix', studyoSeti('coconut-mix')),
      behotrade('Honing azijn', 'Honing azijn 500ml', 12, 3, 'Bal Sirkesi', studyoSeti('bal-sirkesi')),
      {
        // Elle yazılmış kayıt: iki boy da aynı faturadan geliyor ve sıraları künyedeki sırayla aynıdır.
        name: 'Olijfolie',
        nameTr: 'Natürel Sızma Zeytinyağı',
        ...studyoSeti('naturel-sizma-zeytinyagi'),
        variants: [
          { nameAtSupplier: 'Olijfolie 5lt', qty: 4, unitCost: 29.9 },
          { nameAtSupplier: 'Olijfolie 750ml', qty: 12, unitCost: 5.5 },
        ],
      },
      behotrade('Pistache', 'Pistache 700gr', 20, 16.5, 'Antep Fıstığı', studyoSeti('antep-fistigi')),
      behotrade('Bromelain siroop', 'Bromelain siroop 250ml', 18, 8, 'Bromelain Şurubu', studyoSeti('bromelain-surubu')),
      behotrade('Zuhre Ana Kekre', 'Zuhre Ana Kekre 250ml', 18, 8.45, 'Zühre Ana Kekre Termojenik Mix', studyoSeti('zuhre-ana-kekre-termojenik-mix')),
      behotrade('Propolis pasta', 'Propolis pasta 240gr', 2, 8.5, 'Propolis Macunu', studyoSeti('propolis-macunu')),
      behotrade('Form pasta', 'Form pasta 240gr', 2, 8, 'Form Macunu', studyoSeti('form-macunu')),
      behotrade('Dennenappel pasta', 'Dennenappel pasta 240gr', 2, 8, 'Kozalak Macunu', studyoSeti('kozalak-macunu')),
      behotrade('Igde cekirdegi pasta', 'Igde cekirdegi pasta 240gr', 2, 8, 'İğde Çekirdeği Macunu', studyoSeti('igde-cekirdegi-macunu')),
      behotrade('Zwarte moerbei extrat', 'Zwarte moerbei extrat 670gr', 12, 7.25, 'Karadut Özü', studyoSeti('karadut-ozu')),
      behotrade('Pestil met Hazinoten Muska', 'Pestil met Hazinoten Muska 300gr', 25, 3.95, 'Fındıklı Muska Pestil', studyoSeti('findikli-muska-pestil')),
      behotrade('Gedroogde aronya', 'Gedroogde aronya 150gr', 6, 3.99, 'Kurutulmuş Aronya', studyoSeti('kurutulmus-aronya')),
      behotrade('Gedroogde appel', 'Gedroogde appel 180gr', 6, 2.75, 'Kurutulmuş Elma', studyoSeti('kurutulmus-elma')),
      behotrade('Gedroogde Kaki cips', 'Gedroogde Kaki cips 180gr', 6, 2, 'Kurutulmuş Trabzon Hurması Cipsi', studyoSeti('kurutulmus-trabzon-hurmasi-cipsi')),
      // Şeftalinin İKİ takımı var (ham paket çekimi + kurgulu kare): altı karenin beşi galeriye sığıyor.
      behotrade('Gedroogde perzik', 'Gedroogde perzik', 6, 4, 'Kurutulmuş Şeftali', studyoSeti('kurutulmus-seftali')),
      behotrade('Gedroogde meloen', 'Gedroogde meloen 100gr', 6, 2.25, 'Kurutulmuş Kavun', studyoSeti('kurutulmus-kavun')),
    ],
  },
];

/** Faturasız taslak: aynı beyanları taşır, varyantında fatura satırı (adet, alış fiyatı) yoktur. */
type LooseDraft = Omit<Draft, 'variants'>;

/**
 * FATURASIZ taslaklar — ambalajı ve barkodu elimizde olan, ama alış kaydına bağlayamadığımız ürünler.
 * `Purchase`e konulamazlar: fatura satırı adet ve alış fiyatı ister, ikisi de yok. Aday doğarlar;
 * fiyat ve maliyet alış faturası gelince yazılır, o gün kalem faturasının altına taşınır.
 */
export const EK_TASLAKLAR: LooseDraft[] = [
  { name: 'Lychnos Natürel Sızma Zeytinyağı' },
  { name: 'Böreklik Yufka', ...studyoSeti('boreklik-yufka') },
  { name: 'Lahmacun', ...studyoSeti('lahmacun') },
  { name: 'Cevizli Pestil Tatlısı', ...studyoSeti('cevizli-pestil-tatlisi') },
  { name: 'Rulo Fındıklı Pestil', ...studyoSeti('rulo-findikli-pestil') },
  { name: 'Fındıklı Kadayıf Rulo Pestil', ...studyoSeti('findikli-kadayif-rulo-pestil') },
  { name: 'Fındıklı Sultan Sarma', ...studyoSeti('findikli-sultan-sarma') },
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
    // Kapak, kuruyemiş rafının stüdyo karesinden: depodaki ustaların hiçbiri kuru meyve ya da fıstık değil.
    image: { file: 'scripts/seed-real/images/pistache.webp' },
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
  'Lychnos Natürel Sızma Zeytinyağı': 'dogal-geleneksel',
  'Böreklik Yufka': 'firin',
  Lahmacun: 'firin',
  // Pestil ailesi muska pestille aynı rafta: tatlı olarak yenir ama raf ürünüdür.
  'Cevizli Pestil Tatlısı': 'dogal-geleneksel',
  'Rulo Fındıklı Pestil': 'dogal-geleneksel',
  'Fındıklı Kadayıf Rulo Pestil': 'dogal-geleneksel',
  'Fındıklı Sultan Sarma': 'dogal-geleneksel',
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

/**
 * Paket ve tarif kalemi — koleksiyon üyesi gibi Lezza ürünü varyant koduyla, taslak faturadaki adla bağlanır.
 * Birden çok boyu olan taslakta `label` hangi boyun alındığını söyler; tek boylu taslakta gerekmez.
 */
type SeedLine = { qty: number } & ({ sku: string } | { draft: string; label?: string });

/** Paket fiyatı liste toplamının bu oranda altıdır ve 90 kuruşa yuvarlanır; fiyat değişince besleme yeniden hesaplar. */
export const BUNDLE_DISCOUNT = 0.1;

/** Paketler müşterinin gündelik anlarına göre kuruldu: kahvaltı, çay saati, maç akşamı, bayram, yılbaşı hediyesi, iftar. */
interface SeedBundle {
  name: UcDil;
  description: UcDil;
  serves?: number;
  /** Ana sayfanın paket bandında iki yuva var. */
  isFeatured?: boolean;
  items: SeedLine[];
}

export const BUNDLES: SeedBundle[] = [
  {
    name: { tr: 'Pazar Kahvaltısı', fr: 'Petit-déjeuner du dimanche', de: 'Sonntagsfrühstück' },
    description: {
      tr: 'Fırından simit ve açma, peynirli kol böreği, yanında tahin ve üzüm pekmezi: dört kişilik bir pazar sofrası.',
      fr: 'Simits et açmas tout juste sortis du four, börek roulé au fromage, tahin et mélasse de raisin : une table du dimanche pour quatre.',
      de: 'Simit und Açma frisch aus dem Ofen, Käse-Börekschnecke, dazu Tahin und Traubenmelasse: ein Sonntagstisch für vier.',
    },
    serves: 4,
    isFeatured: true,
    items: [
      { sku: '700101', qty: 1 },
      { sku: '700301', qty: 1 },
      { sku: '700501', qty: 1 },
      { draft: 'Tahini', qty: 1 },
      { draft: 'Druivenmelasse', qty: 1 },
    ],
  },
  {
    name: { tr: 'Çay Saati', fr: 'L’heure du goûter', de: 'Kaffee und Kuchen' },
    description: {
      tr: 'Dört çeşit artisan kek, poğaça ve Trabzon hurması cipsi: öğleden sonra çayının yanına hazır bir tabak.',
      fr: 'Quatre cakes artisanaux, des poğaças et des chips de kaki : de quoi garnir le goûter de l’après-midi.',
      de: 'Vier Artisan-Kuchen, Poğaça und Kaki-Chips: alles für die Kaffeetafel am Nachmittag.',
    },
    serves: 4,
    items: [
      { sku: '901027B', qty: 1 },
      { sku: '901028B', qty: 1 },
      { sku: '901026B', qty: 1 },
      { sku: '901025B', qty: 1 },
      { sku: '700201', qty: 1 },
      { draft: 'Gedroogde Kaki cips', qty: 1 },
    ],
  },
  {
    name: { tr: 'Döner Akşamı', fr: 'Soirée döner', de: 'Döner-Abend' },
    description: {
      tr: 'Et ve tavuk döner, yanında acılı kanat: maç ya da dost akşamı için çabucak kurulan bir sofra.',
      fr: 'Döner à la viande et au poulet, avec des ailes épicées : une table vite dressée pour un match ou une soirée entre amis.',
      de: 'Fleisch- und Hähnchendöner, dazu scharfe Chicken Wings: schnell gedeckt für den Fußballabend oder Freunde.',
    },
    serves: 5,
    isFeatured: true,
    items: [
      { draft: 'LEZZA Traditional Meet Doner', qty: 1 },
      { draft: 'LEZZA Traditional Chicken Doner', qty: 1 },
      { sku: '312442', qty: 1 },
    ],
  },
  {
    name: { tr: 'Hafta İçi Dondurucu Paketi', fr: 'Box congélateur de la semaine', de: 'Tiefkühlbox für die Woche' },
    description: {
      tr: 'Kıymalı mantı, tavuk fileto ve dört börek: yoğun hafta içi akşamlarında dondurucudan çıkıp yarım saatte sofraya.',
      fr: 'Mantı à la viande, filets de poulet et quatre böreks : du congélateur à la table en une demi-heure, les soirs de semaine chargés.',
      de: 'Mantı mit Hackfleisch, Hähnchenfilets und vier Börek: an vollen Wochentagen in einer halben Stunde vom Gefrierfach auf den Tisch.',
    },
    serves: 4,
    items: [
      { draft: 'LEZZA Manti with Minced Meat (Kiymali)', qty: 1 },
      { sku: '312241', qty: 1 },
      { sku: '700911', qty: 2 },
      { sku: '700904', qty: 2 },
    ],
  },
  {
    name: { tr: 'Bayram İkramı', fr: 'Coffret de l’Aïd', de: 'Bayram-Box für Gäste' },
    description: {
      tr: 'Antep fıstığı, fındıklı muska pestil ve üç kurutulmuş meyve: bayram ziyaretinde misafire çayın yanında ikram için.',
      fr: 'Pistaches, pestil en triangles aux noisettes et trois fruits séchés : à offrir aux invités avec le thé pendant les visites de l’Aïd.',
      de: 'Pistazien, Pestil-Dreiecke mit Haselnüssen und drei Trockenfrüchte: für Gäste zum Tee bei den Bayram-Besuchen.',
    },
    serves: 8,
    items: [
      { draft: 'Pistache', qty: 1 },
      { draft: 'Pestil met Hazinoten Muska', qty: 1 },
      { draft: 'Gedroogde meloen', qty: 1 },
      { draft: 'Gedroogde perzik', qty: 1 },
      { draft: 'Gedroogde appel', qty: 1 },
    ],
  },
  {
    name: { tr: 'Anadolu Kiler Kutusu', fr: 'Coffret garde-manger d’Anatolie', de: 'Anatolische Vorratsbox' },
    description: {
      tr: 'Üzüm ve keçiboynuzu pekmezi, tahin, pestil ve iki kurutulmuş meyve: yılbaşı ve özel günler için oda sıcaklığında saklanan bir hediye kutusu.',
      fr: 'Mélasses de raisin et de caroube, tahin, pestil et deux fruits séchés : un coffret cadeau pour les fêtes, qui se conserve à température ambiante.',
      de: 'Trauben- und Johannisbrotmelasse, Tahin, Pestil und zwei Trockenfrüchte: eine Geschenkbox für die Feiertage, die bei Zimmertemperatur hält.',
    },
    items: [
      { draft: 'Druivenmelasse', qty: 1 },
      { draft: 'Johannesbroodmelasse', qty: 1 },
      { draft: 'Tahini', qty: 1 },
      { draft: 'Pestil met Hazinoten Muska', qty: 1 },
      { draft: 'Gedroogde aronya', qty: 1 },
      { draft: 'Gedroogde Kaki cips', qty: 1 },
    ],
  },
  {
    name: { tr: 'Sirke Tadım Seti', fr: 'Coffret dégustation de vinaigres', de: 'Essig-Probierset' },
    description: {
      tr: 'Altı meyve sirkesi: elma, alıç, ananas, bal, enginar ve ışkın kökü. Salata sosunda ya da suyla seyreltilerek denemek için.',
      fr: 'Six vinaigres de fruits : pomme, aubépine, ananas, miel, artichaut et racine de rhubarbe. À goûter en vinaigrette ou dilués dans l’eau.',
      de: 'Sechs Fruchtessige: Apfel, Weißdorn, Ananas, Honig, Artischocke und Rhabarberwurzel. Zum Probieren im Dressing oder mit Wasser verdünnt.',
    },
    items: [
      { draft: 'Appel azijn', qty: 1 },
      { draft: 'Meidoorn azijn', qty: 1 },
      { draft: 'Ananas azijn', qty: 1 },
      { draft: 'Honing azijn', qty: 1 },
      { draft: 'Enginar azijn', qty: 1 },
      { draft: 'Isgin azijn', qty: 1 },
    ],
  },
  {
    // Metin sağlık beyanı taşımaz (AB 1924/2006): ürünler tat ve gelenek üzerinden anlatılır.
    name: { tr: 'Kış Kilerinden', fr: 'Le garde-manger d’hiver', de: 'Aus der Wintervorratskammer' },
    description: {
      tr: 'Karadut özü, propolis ve kozalak macunu, keçiboynuzu pekmezi: kış akşamlarında kaşıkla ya da sıcak suyla tüketilen Anadolu tatları.',
      fr: 'Extrait de mûre noire, pâtes au propolis et aux pommes de pin, mélasse de caroube : les saveurs anatoliennes des soirs d’hiver, à la cuillère ou dans l’eau chaude.',
      de: 'Schwarzer Maulbeerextrakt, Propolis- und Kiefernzapfenpaste, Johannisbrotmelasse: anatolische Aromen für Winterabende, löffelweise oder in warmem Wasser.',
    },
    items: [
      { draft: 'Zwarte moerbei extrat', qty: 1 },
      { draft: 'Propolis pasta', qty: 1 },
      { draft: 'Dennenappel pasta', qty: 1 },
      { draft: 'Johannesbroodmelasse', qty: 1 },
    ],
  },
  {
    name: { tr: 'Çiğ Köfte Sofrası', fr: 'Table de çiğ köfte', de: 'Çiğ-Köfte-Tafel' },
    description: {
      tr: 'Bir kilo vegan çiğ köfte ve nar özü: marul yaprağına ya da lavaşa sarıp limonla, altı kişilik bir akşam.',
      fr: 'Un kilo de çiğ köfte vegan et de l’extrait de grenade : à rouler dans une feuille de laitue ou un lavash avec du citron, pour six personnes.',
      de: 'Ein Kilo veganes Çiğ Köfte und Granatapfelextrakt: in Salatblätter oder Lavash gerollt, mit Zitrone – ein Abend für sechs.',
    },
    serves: 6,
    items: [
      { sku: '201301', qty: 1 },
      { draft: 'Granaatappelextraat', qty: 1 },
    ],
  },
  {
    name: { tr: 'İftar Sofrası', fr: 'Table d’iftar', de: 'Iftar-Tafel' },
    description: {
      tr: 'Su böreği, iki kutu künefe ve hoşaf için kurutulmuş şeftali ile elma: Ramazan akşamlarında altı kişilik bir sofra.',
      fr: 'Su börek, deux künefe, et des pêches et pommes séchées pour la compote hoşaf : une table pour six, les soirs de Ramadan.',
      de: 'Su Börek, zwei Künefe sowie getrocknete Pfirsiche und Äpfel für Hoşaf: ein Tisch für sechs an Ramadan-Abenden.',
    },
    serves: 6,
    items: [
      { sku: '700402', qty: 1 },
      { sku: '500103', qty: 2 },
      { draft: 'Gedroogde perzik', qty: 1 },
      { draft: 'Gedroogde appel', qty: 1 },
    ],
  },
];

/**
 * Tarif sıfırdan pişirme değil sofra fikridir: hangi ürünümüz bir araya gelip nasıl servis edilir, yanına evden ne konur.
 * Ürünlerimizin pişirme süresi uydurulmaz, adım paketteki talimata yönlendirir.
 */
interface SeedRecipe {
  name: UcDil;
  description: UcDil;
  duration: UcDil;
  serves: UcDil;
  meal: UcDil;
  /** Satır = adım; numarayı ekran verir, biçim işareti çizilmez. */
  steps: UcDil;
  /** Satır = madde; bizim ürünümüz değildir, sepete eklenmez. */
  pantry: UcDil;
  items: SeedLine[];
}

const OGUN = {
  kahvalti: { tr: 'Kahvaltı', fr: 'Petit-déjeuner', de: 'Frühstück' },
  aksam: { tr: 'Akşam yemeği', fr: 'Dîner', de: 'Abendessen' },
  meze: { tr: 'Meze', fr: 'Mezze', de: 'Meze' },
  iftar: { tr: 'İftar', fr: 'Iftar', de: 'Iftar' },
  tatli: { tr: 'Tatlı', fr: 'Dessert', de: 'Dessert' },
  herOgun: { tr: 'Her öğün', fr: 'À chaque repas', de: 'Zu jeder Mahlzeit' },
  paylasim: { tr: 'Paylaşımlık', fr: 'À partager', de: 'Zum Teilen' },
} satisfies Record<string, UcDil>;

const sure = (dk: number): UcDil => ({ tr: `${dk} dk`, fr: `${dk} min`, de: `${dk} Min.` });
const kisilik = (n: number): UcDil => ({ tr: `${n} kişilik`, fr: `Pour ${n} personnes`, de: `Für ${n} Personen` });

export const RECIPES: SeedRecipe[] = [
  {
    name: { tr: 'Tahin-Pekmezli Kahvaltı', fr: 'Petit-déjeuner tahin et mélasse', de: 'Frühstück mit Tahin und Melasse' },
    description: {
      tr: 'Anadolu kahvaltısının kaşıkla yenen tatlısı: tahin ile üzüm pekmezi, yanında sıcak simit.',
      fr: 'La douceur du petit-déjeuner anatolien, qui se mange à la cuillère : tahin et mélasse de raisin, avec un simit chaud.',
      de: 'Die süße Seite des anatolischen Frühstücks, die man löffelt: Tahin und Traubenmelasse, dazu ein warmer Simit.',
    },
    duration: sure(15),
    serves: kisilik(4),
    meal: OGUN.kahvalti,
    steps: {
      tr: 'Simitleri paketteki talimata göre, dondurucudan çıktığı gibi fırında pişirin.\nTahin ile pekmezi eşit ölçüde küçük bir kaseye koyun.\nKarıştırmadan kaşıkla bir iki kez çevirin; iki renk ayrı kalsın, her lokmada ikisi birden gelsin.\nSimitleri sıcak servis edin; tahin-pekmezi kaşıkla ya da simite sürerek yiyin.',
      fr: 'Faites cuire les simits au four, directement sortis du congélateur, selon les indications de l’emballage.\nVersez le tahin et la mélasse à parts égales dans un petit bol.\nTournez une ou deux fois à la cuillère sans mélanger : les deux couleurs restent séparées et chaque bouchée a les deux.\nServez les simits chauds ; le tahin-mélasse se mange à la cuillère ou tartiné sur le simit.',
      de: 'Backen Sie die Simit direkt aus dem Gefrierfach nach der Anleitung auf der Packung im Ofen.\nGeben Sie Tahin und Melasse zu gleichen Teilen in eine kleine Schale.\nEin- bis zweimal mit dem Löffel durchziehen, nicht verrühren: Die Farben bleiben getrennt, jeder Bissen hat beides.\nServieren Sie die Simit warm; Tahin-Melasse löffeln oder auf den Simit streichen.',
    },
    pantry: {
      tr: 'Tereyağı\nCeviz içi (isteğe bağlı)\nDemlik çay',
      fr: 'Beurre\nCerneaux de noix (facultatif)\nThé en théière',
      de: 'Butter\nWalnusskerne (nach Belieben)\nTee aus der Kanne',
    },
    items: [
      { sku: '700101', qty: 1 },
      { draft: 'Tahini', qty: 1 },
      { draft: 'Druivenmelasse', qty: 1 },
    ],
  },
  {
    name: { tr: 'Yoğurtlu Mantı', fr: 'Mantı au yaourt à l’ail', de: 'Mantı mit Knoblauchjoghurt' },
    description: {
      tr: 'Kayseri usulü sunum: sarımsaklı yoğurt, pul biberli tereyağı, üstüne nane ve sumak.',
      fr: 'Servi à la mode de Kayseri : yaourt à l’ail, beurre au piment, menthe séchée et sumac.',
      de: 'Nach Kayseri-Art serviert: Knoblauchjoghurt, Butter mit Paprikaflocken, getrocknete Minze und Sumach.',
    },
    duration: sure(25),
    serves: kisilik(4),
    meal: OGUN.aksam,
    steps: {
      tr: 'Mantıyı çözdürmeden, paketteki süreye göre bol tuzlu suda haşlayın.\nBu sırada yoğurdu ezilmiş sarımsak ve bir tutam tuzla çırpın; oda sıcaklığında kalsın.\nTavada tereyağını eritin; köpürünce pul biber ve kuru naneyi ekleyip ocaktan alın.\nSüzülen mantıyı tabaklara alın; üzerine yoğurdu, en son sıcak tereyağını gezdirin ve sumak serpin.',
      fr: 'Faites cuire les mantı sans les décongeler dans beaucoup d’eau salée, le temps indiqué sur l’emballage.\nPendant ce temps, fouettez le yaourt avec l’ail écrasé et une pincée de sel ; laissez-le à température ambiante.\nFaites fondre le beurre dans une poêle ; quand il mousse, ajoutez le piment et la menthe séchée, puis retirez du feu.\nDressez les mantı égouttés, nappez de yaourt, versez le beurre chaud en dernier et parsemez de sumac.',
      de: 'Kochen Sie die Mantı ungetaut in reichlich Salzwasser nach der Zeit auf der Packung.\nVerquirlen Sie inzwischen den Joghurt mit zerdrücktem Knoblauch und einer Prise Salz; bei Zimmertemperatur stehen lassen.\nButter in einer Pfanne schmelzen; wenn sie schäumt, Paprikaflocken und getrocknete Minze zugeben und vom Herd nehmen.\nDie abgetropften Mantı anrichten, mit Joghurt bedecken, zuletzt die heiße Butter darübergeben und mit Sumach bestreuen.',
    },
    pantry: {
      tr: 'Süzme yoğurt\nSarımsak\nTereyağı\nPul biber\nKuru nane\nSumak',
      fr: 'Yaourt égoutté\nAil\nBeurre\nPiment en flocons\nMenthe séchée\nSumac',
      de: 'Abgetropfter Joghurt\nKnoblauch\nButter\nPaprikaflocken\nGetrocknete Minze\nSumach',
    },
    items: [{ draft: 'LEZZA Manti with Minced Meat (Kiymali)', qty: 1 }],
  },
  {
    name: { tr: 'Evde Döner Dürüm', fr: 'Dürüm au döner maison', de: 'Döner-Dürüm zu Hause' },
    description: {
      tr: 'Dilimlenmiş döner tavada çıtırlanır, sumaklı soğan ve domatesle lavaşa sarılır.',
      fr: 'Le döner tranché est saisi à la poêle, puis roulé dans un lavash avec des oignons au sumac et des tomates.',
      de: 'Der geschnittene Döner wird in der Pfanne knusprig gebraten und mit Sumach-Zwiebeln und Tomaten in Lavash gerollt.',
    },
    duration: sure(20),
    serves: kisilik(4),
    meal: OGUN.aksam,
    steps: {
      tr: 'Döneri paketteki talimata göre ısıtın; kızgın tavada parti parti, kenarları çıtırlaşana dek çevirin.\nSoğanı ince doğrayın; sumak ve bir tutam tuzla ovup maydanozla karıştırın.\nLavaşı kuru tavada birkaç saniye ısıtıp yumuşatın.\nLavaşa döner, sumaklı soğan, domates ve marul dizin; isterseniz yoğurt gezdirip sıkıca sarın.',
      fr: 'Réchauffez le döner selon l’emballage, puis saisissez-le par petites quantités dans une poêle très chaude jusqu’à ce que les bords croustillent.\nÉmincez l’oignon, frottez-le avec le sumac et une pincée de sel, puis mélangez au persil.\nRéchauffez le lavash quelques secondes à la poêle sèche pour l’assouplir.\nGarnissez le lavash de döner, d’oignons au sumac, de tomate et de laitue ; ajoutez du yaourt si vous le souhaitez et roulez bien serré.',
      de: 'Erwärmen Sie den Döner nach der Packungsanleitung und braten Sie ihn portionsweise in einer heißen Pfanne, bis die Ränder knusprig sind.\nZwiebel fein schneiden, mit Sumach und einer Prise Salz einreiben und mit Petersilie mischen.\nLavash einige Sekunden in der trockenen Pfanne erwärmen, damit es geschmeidig wird.\nLavash mit Döner, Sumach-Zwiebeln, Tomate und Salat belegen, nach Belieben Joghurt darübergeben und fest aufrollen.',
    },
    pantry: {
      tr: 'Lavaş ya da tortilla\nSoğan, domates, marul\nSumak, maydanoz\nYoğurt',
      fr: 'Lavash ou tortillas\nOignon, tomate, laitue\nSumac, persil\nYaourt',
      de: 'Lavash oder Tortillas\nZwiebel, Tomate, Salat\nSumach, Petersilie\nJoghurt',
    },
    items: [{ draft: 'LEZZA Traditional Meet Doner', qty: 1 }],
  },
  {
    name: { tr: 'İskender Usulü Döner', fr: 'Döner façon İskender', de: 'Döner nach İskender-Art' },
    description: {
      tr: 'Bursa’nın ünlü tabağının ev hâli: kızarmış pide, döner, domates sosu, yoğurt ve kızgın tereyağı.',
      fr: 'La version maison du célèbre plat de Bursa : pain pide grillé, döner, sauce tomate, yaourt et beurre grésillant.',
      de: 'Die Hausvariante des berühmten Tellers aus Bursa: geröstetes Pide, Döner, Tomatensauce, Joghurt und heiße Butter.',
    },
    duration: sure(25),
    serves: kisilik(3),
    meal: OGUN.aksam,
    steps: {
      tr: 'Pideyi küp doğrayın, fırında ya da tavada hafifçe kızartıp tabağın dibine yayın.\nDöneri paketteki talimata göre ısıtın, tavada çıtırlatıp pidelerin üzerine dizin.\nTereyağında salçayı biraz suyla açıp iki dakika pişirin; döner ve pidenin üzerine gezdirin.\nYanına yoğurt koyun; en son köpürene dek ısıttığınız tereyağını döküp hemen servis edin.',
      fr: 'Coupez le pide en cubes, faites-les dorer au four ou à la poêle et étalez-les au fond de l’assiette.\nRéchauffez le döner selon l’emballage, faites-le croustiller à la poêle et disposez-le sur le pain.\nDiluez le concentré de tomate dans un peu d’eau avec du beurre et laissez cuire deux minutes ; nappez le döner et le pain.\nAjoutez le yaourt à côté, versez en dernier le beurre chauffé jusqu’à ce qu’il mousse et servez aussitôt.',
      de: 'Pide in Würfel schneiden, im Ofen oder in der Pfanne leicht rösten und auf dem Teller verteilen.\nDöner nach der Packungsanleitung erwärmen, in der Pfanne knusprig braten und auf das Brot legen.\nTomatenmark mit etwas Wasser in Butter zwei Minuten köcheln lassen und über Döner und Brot geben.\nJoghurt danebengeben, zuletzt die bis zum Schäumen erhitzte Butter darübergießen und sofort servieren.',
    },
    pantry: {
      tr: 'Pide ya da bayat ekmek\nDomates salçası\nTereyağı\nSüzme yoğurt\nSivri biber (isteğe bağlı)',
      fr: 'Pain pide ou pain rassis\nConcentré de tomate\nBeurre\nYaourt égoutté\nPiments verts (facultatif)',
      de: 'Pide oder altbackenes Brot\nTomatenmark\nButter\nAbgetropfter Joghurt\nGrüne Spitzpaprika (nach Belieben)',
    },
    items: [{ draft: 'LEZZA Traditional Meet Doner', qty: 1 }],
  },
  {
    name: { tr: 'Nar Ekşili Gavurdağı Salatası', fr: 'Salade Gavurdağı à la grenade', de: 'Gavurdağı-Salat mit Granatapfel' },
    description: {
      tr: 'Gaziantep’in ince kıyılmış salatası: domates, soğan, ceviz ve maydanoz, nar özü ve zeytinyağıyla.',
      fr: 'La salade finement hachée de Gaziantep : tomates, oignon, noix et persil, avec extrait de grenade et huile d’olive.',
      de: 'Der fein gehackte Salat aus Gaziantep: Tomaten, Zwiebel, Walnüsse und Petersilie mit Granatapfelextrakt und Olivenöl.',
    },
    duration: sure(15),
    serves: kisilik(4),
    meal: OGUN.meze,
    steps: {
      tr: 'Domatesleri, soğanı ve yeşil biberi çok küçük doğrayın; soğanı tuzla ovup suyunu süzün.\nCevizi iri kırın, maydanozu ince kıyın.\nZeytinyağı, nar özü, limon suyu, sumak ve tuzu bir kasede çırpın.\nHepsini karıştırıp sosu gezdirin; on dakika bekletip servis edin.',
      fr: 'Coupez les tomates, l’oignon et le poivron vert en tout petits dés ; frottez l’oignon avec du sel et égouttez-le.\nConcassez grossièrement les noix et hachez finement le persil.\nFouettez dans un bol l’huile d’olive, l’extrait de grenade, le jus de citron, le sumac et le sel.\nMélangez le tout, arrosez de sauce, laissez reposer dix minutes et servez.',
      de: 'Tomaten, Zwiebel und grüne Paprika sehr fein würfeln; die Zwiebel mit Salz einreiben und abtropfen lassen.\nWalnüsse grob hacken, Petersilie fein schneiden.\nOlivenöl, Granatapfelextrakt, Zitronensaft, Sumach und Salz in einer Schüssel verquirlen.\nAlles mischen, das Dressing darübergeben, zehn Minuten ziehen lassen und servieren.',
    },
    pantry: {
      tr: 'Domates, soğan, yeşil biber\nCeviz içi\nMaydanoz\nLimon, sumak, tuz',
      fr: 'Tomates, oignon, poivron vert\nCerneaux de noix\nPersil\nCitron, sumac, sel',
      de: 'Tomaten, Zwiebel, grüne Paprika\nWalnusskerne\nPetersilie\nZitrone, Sumach, Salz',
    },
    items: [
      { draft: 'Granaatappelextraat', qty: 1 },
      { draft: 'Olijfolie', label: '750 ml', qty: 1 },
    ],
  },
  {
    name: {
      tr: 'Çiğ Köfte Dürüm ve Marul Sarma',
      fr: 'Çiğ köfte en wrap et en feuilles de laitue',
      de: 'Çiğ Köfte im Wrap und im Salatblatt',
    },
    description: {
      tr: 'Vegan çiğ köfte, nar özü ve limonla: bir kısmı lavaşa, bir kısmı marul yaprağına.',
      fr: 'Çiğ köfte vegan, extrait de grenade et citron : une partie roulée dans un lavash, l’autre dans des feuilles de laitue.',
      de: 'Veganes Çiğ Köfte mit Granatapfelextrakt und Zitrone: teils im Lavash, teils im Salatblatt.',
    },
    duration: sure(10),
    serves: kisilik(6),
    meal: OGUN.aksam,
    steps: {
      tr: 'Çiğ köfteyi paketteki talimata göre çözdürün; avucunuzda sıkarak parmak biçiminde köfteler yapın.\nMarul yapraklarını yıkayıp kurulayın, lavaşları hazırlayın.\nMarul yaprağına köfte koyun, limon sıkıp nar özü gezdirin, nane ekleyip sarın.\nLavaşa marul, turşu ve köfte dizin; nar özü gezdirip sıkıca sarın ve soğuk ayranla servis edin.',
      fr: 'Décongelez le çiğ köfte selon l’emballage, puis façonnez des boulettes allongées en le serrant dans la main.\nLavez et séchez les feuilles de laitue, préparez les lavashs.\nPosez une boulette sur une feuille de laitue, pressez du citron, ajoutez de l’extrait de grenade et de la menthe, puis roulez.\nGarnissez un lavash de laitue, de pickles et de çiğ köfte, arrosez d’extrait de grenade, roulez serré et servez avec un ayran bien frais.',
      de: 'Çiğ Köfte nach der Packungsanleitung auftauen und in der Hand zu länglichen Bällchen drücken.\nSalatblätter waschen und trocknen, Lavash bereitlegen.\nEin Bällchen auf ein Salatblatt legen, Zitrone darüberpressen, Granatapfelextrakt und Minze zugeben und einrollen.\nLavash mit Salat, eingelegtem Gemüse und Çiğ Köfte belegen, mit Granatapfelextrakt beträufeln, fest rollen und mit kaltem Ayran servieren.',
    },
    pantry: {
      tr: 'Marul\nLavaş\nLimon\nTaze nane\nTurşu\nAyran',
      fr: 'Laitue\nLavash\nCitron\nMenthe fraîche\nPickles\nAyran',
      de: 'Salat\nLavash\nZitrone\nFrische Minze\nEingelegtes Gemüse\nAyran',
    },
    items: [
      { sku: '201301', qty: 1 },
      { draft: 'Granaatappelextraat', qty: 1 },
    ],
  },
  {
    name: { tr: 'Pekmezli Hoşaf', fr: 'Compote hoşaf à la mélasse', de: 'Hoşaf mit Traubenmelasse' },
    description: {
      tr: 'Ramazan sofralarının soğuk kuru meyve kompostosu; şeker yerine üzüm pekmeziyle tatlandırılır.',
      fr: 'La compote froide de fruits séchés des tables de Ramadan, sucrée à la mélasse de raisin plutôt qu’au sucre.',
      de: 'Das kalte Trockenfrüchte-Kompott der Ramadan-Tafeln, mit Traubenmelasse statt Zucker gesüßt.',
    },
    duration: { tr: '15 dk + bir gece bekleme', fr: '15 min + une nuit de repos', de: '15 Min. + eine Nacht Ruhezeit' },
    serves: kisilik(6),
    meal: OGUN.iftar,
    steps: {
      tr: 'Kuru meyveleri yıkayın, büyük olanları ikiye bölün.\nBir buçuk litre suyu tarçın ve karanfille kaynatın.\nMeyveleri ekleyip beş dakika pişirin; ocaktan alıp üç yemek kaşığı pekmezi karıştırın.\nSoğuyunca buzdolabına koyun; bir gece bekletip soğuk servis edin.',
      fr: 'Rincez les fruits séchés et coupez les plus gros en deux.\nPortez à ébullition un litre et demi d’eau avec la cannelle et les clous de girofle.\nAjoutez les fruits et laissez cuire cinq minutes ; hors du feu, incorporez trois cuillères à soupe de mélasse.\nUne fois refroidie, placez la compote au réfrigérateur ; laissez reposer une nuit et servez froid.',
      de: 'Trockenfrüchte waschen und größere Stücke halbieren.\nAnderthalb Liter Wasser mit Zimt und Nelken aufkochen.\nFrüchte zugeben und fünf Minuten köcheln lassen; vom Herd nehmen und drei Esslöffel Melasse einrühren.\nAbgekühlt in den Kühlschrank stellen, über Nacht ziehen lassen und kalt servieren.',
    },
    pantry: {
      tr: 'Su\nTarçın çubuğu\nKaranfil',
      fr: 'Eau\nBâton de cannelle\nClous de girofle',
      de: 'Wasser\nZimtstange\nGewürznelken',
    },
    items: [
      { draft: 'Gedroogde perzik', qty: 1 },
      { draft: 'Gedroogde appel', qty: 1 },
      { draft: 'Gedroogde aronya', qty: 1 },
      { draft: 'Druivenmelasse', qty: 1 },
    ],
  },
  {
    name: { tr: 'Künefe Keyfi', fr: 'Künefe à la glace et aux pistaches', de: 'Künefe mit Eis und Pistazien' },
    description: {
      tr: 'Sıcak künefe, üstünde dondurma ya da kaymak ve dövülmüş antep fıstığı.',
      fr: 'Un künefe brûlant, surmonté de glace ou de kaymak et de pistaches concassées.',
      de: 'Heißes Künefe mit Eis oder Kaymak und gehackten Pistazien.',
    },
    duration: sure(20),
    serves: kisilik(2),
    meal: OGUN.tatli,
    steps: {
      tr: 'Künefeyi paketteki talimata göre tepsisiyle fırında pişirin.\nBu sırada bir avuç antep fıstığını dövün.\nKutudaki şerbeti sıcak künefenin üzerine gezdirin ve birkaç dakika çekmesini bekleyin.\nÜzerine bir top dondurma ya da kaymak koyun, fıstık serpip sıcak servis edin.',
      fr: 'Faites cuire le künefe au four dans son plat, selon les indications de l’emballage.\nPendant ce temps, concassez une poignée de pistaches.\nVersez le sirop fourni sur le künefe brûlant et laissez-le s’imbiber quelques minutes.\nAjoutez une boule de glace ou du kaymak, parsemez de pistaches et servez chaud.',
      de: 'Backen Sie das Künefe in seiner Form nach der Packungsanleitung im Ofen.\nInzwischen eine Handvoll Pistazien hacken.\nDen beiliegenden Sirup über das heiße Künefe gießen und einige Minuten einziehen lassen.\nEine Kugel Eis oder Kaymak daraufsetzen, mit Pistazien bestreuen und heiß servieren.',
    },
    pantry: {
      tr: 'Vanilyalı dondurma ya da kaymak',
      fr: 'Glace à la vanille ou kaymak',
      de: 'Vanilleeis oder Kaymak',
    },
    items: [
      { sku: '500103', qty: 1 },
      { draft: 'Pistache', qty: 1 },
    ],
  },
  {
    name: {
      tr: 'Pekmezli Tahinli Yulaf Kasesi',
      fr: 'Bol d’avoine au tahin et à la caroube',
      de: 'Haferbowl mit Tahin und Johannisbrotmelasse',
    },
    description: {
      tr: 'Sıcak yulaf, keçiboynuzu pekmezi, tahin ve kurutulmuş elma: kahvaltıya ya da okul çıkışına.',
      fr: 'Des flocons d’avoine chauds, de la mélasse de caroube, du tahin et de la pomme séchée : pour le petit-déjeuner ou le goûter.',
      de: 'Warmer Haferbrei mit Johannisbrotmelasse, Tahin und getrockneten Äpfeln: zum Frühstück oder nach der Schule.',
    },
    duration: sure(10),
    serves: kisilik(2),
    meal: OGUN.kahvalti,
    steps: {
      tr: 'Yulafı sütle orta ateşte, kıvam alana dek pişirin.\nKurutulmuş elmayı küçük doğrayıp son dakikada ekleyin.\nKaselere paylaştırın; üzerine birer kaşık tahin ve keçiboynuzu pekmezi gezdirin.\nDilimlenmiş muzla sıcak servis edin.',
      fr: 'Faites cuire les flocons d’avoine dans le lait à feu moyen jusqu’à ce qu’ils épaississent.\nCoupez la pomme séchée en petits morceaux et ajoutez-la à la dernière minute.\nRépartissez dans les bols ; arrosez chacun d’une cuillère de tahin et de mélasse de caroube.\nServez chaud avec des rondelles de banane.',
      de: 'Haferflocken mit Milch bei mittlerer Hitze köcheln, bis der Brei eindickt.\nGetrocknete Äpfel klein schneiden und in der letzten Minute zugeben.\nAuf Schalen verteilen und je einen Löffel Tahin und Johannisbrotmelasse darüberträufeln.\nMit Bananenscheiben warm servieren.',
    },
    pantry: {
      tr: 'Yulaf ezmesi\nSüt ya da bitkisel içecek\nMuz',
      fr: 'Flocons d’avoine\nLait ou boisson végétale\nBanane',
      de: 'Haferflocken\nMilch oder Pflanzendrink\nBanane',
    },
    items: [
      { draft: 'Johannesbroodmelasse', qty: 1 },
      { draft: 'Tahini', qty: 1 },
      { draft: 'Gedroogde appel', qty: 1 },
    ],
  },
  {
    name: { tr: 'Kalabalık Pazar Sofrası', fr: 'Grand brunch du dimanche', de: 'Großer Sonntagsbrunch' },
    description: {
      tr: 'Su böreği, peynirli kol böreği, E börekleri ve poğaça aynı fırında: sekiz kişilik bir pazar kahvaltısı.',
      fr: 'Su börek, börek roulé au fromage, petits böreks et poğaças dans le même four : un brunch du dimanche pour huit.',
      de: 'Su Börek, Käse-Börekschnecke, kleine Börek und Poğaça im selben Ofen: ein Sonntagsbrunch für acht.',
    },
    duration: sure(40),
    serves: kisilik(8),
    meal: OGUN.kahvalti,
    steps: {
      tr: 'Börekleri ve poğaçaları dondurucudan çıktığı gibi, paketlerindeki talimata göre tepsilere dizin.\nPişme süresi en uzun olanı önce fırına verin, ötekileri sırayla ekleyin ki hepsi birlikte çıksın.\nBu sırada sofrayı kurun: peynir, zeytin, domates, salatalık ve demlik çay.\nBörekleri dilimleyip sıcak servis edin.',
      fr: 'Disposez les böreks et les poğaças sur les plaques, directement sortis du congélateur, selon leurs emballages.\nEnfournez d’abord celui qui cuit le plus longtemps et ajoutez les autres au fur et à mesure pour que tout sorte ensemble.\nPendant ce temps, dressez la table : fromage, olives, tomates, concombre et thé en théière.\nCoupez les böreks et servez-les chauds.',
      de: 'Börek und Poğaça direkt aus dem Gefrierfach nach den Packungsanleitungen auf die Bleche legen.\nDas mit der längsten Backzeit zuerst in den Ofen schieben und die anderen nacheinander dazugeben, damit alles gleichzeitig fertig ist.\nInzwischen den Tisch decken: Käse, Oliven, Tomaten, Gurke und Tee aus der Kanne.\nBörek aufschneiden und heiß servieren.',
    },
    pantry: {
      tr: 'Beyaz peynir\nSiyah ve yeşil zeytin\nDomates, salatalık\nDemlik çay',
      fr: 'Fromage blanc en saumure\nOlives noires et vertes\nTomates, concombre\nThé en théière',
      de: 'Weißer Salzlakenkäse\nSchwarze und grüne Oliven\nTomaten, Gurke\nTee aus der Kanne',
    },
    items: [
      { sku: '700402', qty: 1 },
      { sku: '700501', qty: 1 },
      { sku: '700904', qty: 2 },
      { sku: '700905', qty: 2 },
      { sku: '700201', qty: 1 },
    ],
  },
  {
    name: { tr: 'Sirkeli Ev Salata Sosu', fr: 'Vinaigrette maison', de: 'Hausgemachtes Essig-Dressing' },
    description: {
      tr: 'Üç ölçü zeytinyağına bir ölçü meyve sirkesi: her salataya uyan temel sos.',
      fr: 'Trois mesures d’huile d’olive pour une de vinaigre de fruit : la vinaigrette de base de toutes les salades.',
      de: 'Drei Teile Olivenöl auf einen Teil Fruchtessig: das Grunddressing für jeden Salat.',
    },
    duration: sure(5),
    serves: kisilik(4),
    meal: OGUN.herOgun,
    steps: {
      tr: 'Bir kavanoza bir ölçü sirke, birer çay kaşığı hardal ve bal, bir tutam tuz koyun.\nÜç ölçü zeytinyağı ekleyin.\nKapağı kapatıp kıvam alana dek sallayın.\nSalatayı servis etmeden hemen önce soslayın; kalan sosu buzdolabında saklayın.',
      fr: 'Dans un bocal, mettez une mesure de vinaigre, une cuillère à café de moutarde, une cuillère à café de miel et une pincée de sel.\nAjoutez trois mesures d’huile d’olive.\nFermez et secouez jusqu’à ce que la sauce émulsionne.\nAssaisonnez la salade juste avant de servir ; gardez le reste au réfrigérateur.',
      de: 'In ein Schraubglas einen Teil Essig, je einen Teelöffel Senf und Honig und eine Prise Salz geben.\nDrei Teile Olivenöl dazugeben.\nVerschließen und schütteln, bis das Dressing bindet.\nDen Salat erst kurz vor dem Servieren anmachen; den Rest im Kühlschrank aufbewahren.',
    },
    pantry: {
      tr: 'Hardal\nBal\nTuz',
      fr: 'Moutarde\nMiel\nSel',
      de: 'Senf\nHonig\nSalz',
    },
    items: [
      { draft: 'Olijfolie', label: '750 ml', qty: 1 },
      { draft: 'Meidoorn azijn', qty: 1 },
    ],
  },
  {
    name: { tr: 'Fırında Acılı Kanat Tabağı', fr: 'Plateau d’ailes épicées au four', de: 'Scharfe Chicken Wings aus dem Ofen' },
    description: {
      tr: 'Acılı kanat ve fileto, yanında sarımsaklı yoğurt ve çıtır patates: maç akşamı için paylaşımlık tabak.',
      fr: 'Ailes et filets épicés, sauce yaourt à l’ail et pommes de terre croustillantes : le plateau à partager des soirs de match.',
      de: 'Scharfe Wings und Filets mit Knoblauchjoghurt und knusprigen Kartoffeln: die Teilplatte für den Fußballabend.',
    },
    duration: sure(30),
    serves: kisilik(4),
    meal: OGUN.paylasim,
    steps: {
      tr: 'Kanatları ve filetoları paketlerindeki talimata göre fırında ya da hava fritözünde pişirin.\nPatatesleri elma dilimi kesip zeytinyağı ve tuzla ayrı bir tepside kızartın.\nYoğurdu ezilmiş sarımsak ve tuzla çırpın.\nHepsini büyük bir tabağa dizip sosla birlikte sıcak servis edin.',
      fr: 'Faites cuire les ailes et les filets au four ou à la friteuse à air, selon leurs emballages.\nCoupez les pommes de terre en quartiers et faites-les rôtir sur une autre plaque avec huile d’olive et sel.\nFouettez le yaourt avec l’ail écrasé et du sel.\nDressez le tout sur un grand plateau et servez chaud avec la sauce.',
      de: 'Wings und Filets nach den Packungsanleitungen im Ofen oder in der Heißluftfritteuse zubereiten.\nKartoffeln in Spalten schneiden und auf einem zweiten Blech mit Olivenöl und Salz rösten.\nJoghurt mit zerdrücktem Knoblauch und Salz verquirlen.\nAlles auf einer großen Platte anrichten und heiß mit der Sauce servieren.',
    },
    pantry: {
      tr: 'Patates\nSüzme yoğurt\nSarımsak\nZeytinyağı, tuz',
      fr: 'Pommes de terre\nYaourt égoutté\nAil\nHuile d’olive, sel',
      de: 'Kartoffeln\nAbgetropfter Joghurt\nKnoblauch\nOlivenöl, Salz',
    },
    items: [
      { sku: '312442', qty: 1 },
      { sku: '312341', qty: 1 },
    ],
  },
];

/* ─── KATMAN 2 · UYDURMA ─────────────────────────────────────────────────────────────────────────
 * Bu bloklar yalnız test sunucusunun ekranlarını doldurur: `--layers=2` olmadan yazılmaz, gerçek değerler
 * tedarikçinin künyesinden gelir ve üretim kurulumundan önce blok bütün hâlinde silinir. Anahtar faturadaki addır
 * (`Draft.name`) ki katalog adı düzeltilse de eşleşme kaymasın.
 */
