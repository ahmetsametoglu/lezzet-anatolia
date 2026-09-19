// Gerçek başlangıç verisi; test sunucusu ve üretimin ilk kurulumu bu dosyadan beslenir, katmanı `--layers` seçer:
// 1 kesin (fatura, üreticinin künyesi, `SALE_PRICES`; üretim bayraksız koşar), 2 dayanaklı (ürün sayfasına dayanan
// açıklama), 3 uydurma (kaynağı olmayan beyan ve test mal kabulü). Katman 3 blokları ayrı durur ki üretime geçerken
// tek parça silinebilsin; hangi alanın hangi katmana ait olduğu `Draft` tipinde yazılı.

// Beyanlar şemanın tipleriyle yazılır: besin tablosunun sekiz kalemi ve alerjenin kapalı kümesi
// orada tanımlı — yazım hatası derlenme anında patlasın, koşuda sessizce düşmesin.
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
  unit?: { label: string; netQuantity: number; piecesCount: number };
}

/** Faturadan gelmeyen, ambalajın kendisinden okunan/ölçülen boy künyesi. */
interface DraftSize {
  label?: string;
  /** Ambalajdaki net miktar; BİRİMİ etiketten okunur ("500 ml" → ml, "240 g" → g). */
  netQuantity?: number;
  sku?: string;
  /** Ambalajın üstündeki EAN — mal kabulünde okutulan kod; küresel tekil. */
  barcode?: string;
  /** TARTILMIŞ brüt ağırlık ve ÖLÇÜLMÜŞ kutu: kargo teklifi bunlara bakar, net miktara değil. */
  packedWeightG?: number;
  packedLengthMm?: number;
  packedWidthMm?: number;
  packedHeightMm?: number;
}

interface DraftVariant extends DraftSize, PurchaseLine {}

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
  /** Ambalajdaki besin künyesi (100 g/ml) — okunamayan tek kalem varsa künye hiç yazılmaz, yarısı yazılmaz. */
  nutrition?: Nutrition;
  /** Künyede vurgulanan alerjenler; BOŞ dizi "içermez" beyanıdır, alan yokluğu "beyan girilmedi". */
  allergens?: ProductAllergen[];
  traces?: ProductAllergen[];
  /**
   * Açıklama ambalajın üstünden okunduysa işaretlenir ve KATMAN 1'de yazılır; işaretsiz açıklama
   * markanın ürün sayfasından derlenmiştir ve katman 2'yi bekler.
   */
  descriptionFromLabel?: boolean;
  /** Gerçek ürün çekimi: tedarikçinin gönderdiği usta ya da markanın mağazası. */
  image?: DraftImage;
  /** Kapak dışındaki kareler; sırayla galeriye girer, tavanı uygulamanın sabiti (`PRODUCT_GALLERY_MAX`). */
  gallery?: DraftImage[];
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

/** Türkçe harflerin ASCII karşılığı — `toLowerCase` kullanılmaz: "İ" onda noktayı ayrı bir imle taşır. */
const ASCII: Record<string, string> = {
  ı: 'i',
  İ: 'I',
  ş: 's',
  Ş: 'S',
  ğ: 'g',
  Ğ: 'G',
  ü: 'u',
  Ü: 'U',
  ö: 'o',
  Ö: 'O',
  ç: 'c',
  Ç: 'C',
  â: 'a',
  î: 'i',
  û: 'u',
};

/**
 * SKU tedarikçinin ürün kodudur; Lezza kataloğu kod veriyor, Behotrade faturası VERMİYOR ve kodsuz
 * varyant aramanın ikinci kapısını kapatıyor (`findByCode`: barkod → sku → tedarikçi kodu). Kod bu
 * yüzden FATURADAKİ KALEM ADINDAN türetilir: katalogdaki Türkçe addan değil, çünkü kod tedarikçiyle
 * konuşurken kullanılır ve katalog adı düzeltilince kaymamalı. Boy zaten fatura adının içinde
 * ("Olijfolie 5lt" ↔ "Olijfolie 750ml"), ayrıca eklenmez.
 */
export function draftSku(nameAtSupplier: string): string {
  return nameAtSupplier
    .replace(/[ıİşŞğĞüÜöÖçÇâîû]/g, (harf) => ASCII[harf] ?? harf)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ambalajda yazan besin künyesi (100 g/ml). kJ ve kcal İKİSİ DE etiketten okunur — katman 3'teki
 * `besin()` kJ'yi kcal'den türetir, burada türetme YASAK: etiket neyse o yazılır, yuvarlaması dâhil.
 */
const kunye = (
  energyKj: number,
  energyKcal: number,
  fatG: number,
  saturatedFatG: number,
  carbohydrateG: number,
  sugarsG: number,
  proteinG: number,
  saltG: number,
): Nutrition => ({ energyKj, energyKcal, fatG, saturatedFatG, carbohydrateG, sugarsG, proteinG, saltG });

/**
 * Şifamix sirke şişelerinin ORTAK uyarıları — altı üründe kelimesi kelimesine aynı; ürüne özgü olan
 * yalnız ilk cümle. Altı kez yazılsaydı biri düzelince beşi eskirdi.
 */
const sirkeMetni = (ilk: UcDil, sekersiz = false): UcDil => ({
  tr: `${ilk.tr} ${sekersiz ? 'Şeker ilavesi, katkı' : 'Katkı'} maddesi ve koruyucu içermez. Açıldıktan sonra doğal tortu, renk değişimi veya "sirke anası" oluşabilir; bunlar bozulma belirtisi değildir. Hamile ve emziren kadınların tüketmeden önce doktora danışması tavsiye edilir.`,
  fr: `${ilk.fr} ${sekersiz ? 'Sans sucres ajoutés, sans' : 'Sans'} additifs ni conservateurs. Après ouverture, un dépôt naturel, un changement de couleur ou une « mère de vinaigre » peuvent apparaître : ce ne sont pas des signes d'altération. Il est conseillé aux femmes enceintes et allaitantes de consulter un médecin avant consommation.`,
  de: `${ilk.de} ${sekersiz ? 'Ohne Zuckerzusatz, ohne' : 'Ohne'} Zusatz- und Konservierungsstoffe. Nach dem Öffnen können natürliche Ablagerungen, Farbveränderungen oder eine „Essigmutter“ auftreten – kein Zeichen von Verderb. Schwangeren und stillenden Frauen wird empfohlen, vor dem Verzehr einen Arzt zu konsultieren.`,
});

/** Şişelerin çoğunda yazan saklama cümlesi; alıç, elma ve enginarın ambalajı başka yazdığı için onlar kendi metnini taşır. */
const SIRKE_SAKLAMA: UcDil = {
  tr: 'Serin ve kuru yerde, kapağı kapalı ve güneş ışığından korunarak saklayınız.',
  fr: "À conserver dans un endroit frais et sec, couvercle fermé, à l'abri de la lumière.",
  de: 'Kühl, trocken und mit geschlossenem Deckel lagern und vor Sonnenlicht schützen.',
};

/** Şifamix özlerinin ortak saklama cümlesi. */
const OZ_SAKLAMA: UcDil = {
  tr: 'Serin ve kuru yerde bulundurunuz.',
  fr: 'Conserver dans un endroit frais et sec.',
  de: 'Kühl und trocken lagern.',
};

const behotrade = (
  name: string,
  label: string | undefined,
  netQuantity: number | undefined,
  nameAtSupplier: string,
  qty: number,
  unitCost: number,
  // Faturadan gelmeyen her alan: ad çevirileri, metinler, beyanlar ve kapak. `Omit` ile yazıldı ki
  // `Draft`e alan eklendiğinde burası da kendiliğinden kabul etsin — liste iki yerde tutulmaz.
  // `boy` ise varyantın kendi künyesi (barkod, tartım, ölçü): tek boylu kalemde ayrı satır açmaya değmez.
  { boy, ...ek }: Omit<Draft, 'name' | 'variants'> & { boy?: Omit<DraftSize, 'label' | 'netQuantity'> } = {},
): Draft => ({
  name,
  // Behotrade'in faturasında donuk kalem YOK: pekmez, sirke, öz, macun ve kuru meyve rafta durur ve
  // kargolanır. `ek` sonra geldiği için istisna gerekirse kalem kendi rejimini yazabilir.
  rejim: 'raf',
  ...ek,
  variants: [{ label, netQuantity, ...boy, nameAtSupplier, qty, unitCost }],
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

/**
 * YAPAY ZEKÂ ile üretilmiş stüdyo karesi (`temp/Resim Calismalari`, işletmecinin çalışması). Ambalajın
 * ön yüzü gerçek etiketi izler, küçük yazıları izlemez — kaynak alanı bunu kayda geçirir ki gerçek
 * çekim geldiğinde hangi kapakların değişeceği tek sorguyla bulunsun.
 */
const studyo = (slug: string): DraftImage => ({
  slug,
  file: `scripts/seed-real/images/${slug}.webp`,
  source: 'Yapay zekâ stüdyo karesi — gerçek ürün çekimi bekleniyor',
});

/**
 * Bir ürünün stüdyo takımı: KAPAK klasörün ikinci karesidir (işletmeci kararı), kalanlar galeriye
 * `-2`, `-3` … diye girer — katalogdaki adlandırmanın aynısı. Sayı dosya sayısından okunmaz, burada
 * yazılır: eksik kalan kare beslemede sessizce atlanmasın, eksikliği dosyada görünsün.
 */
const studyoSeti = (slug: string, galeri: number): Pick<Draft, 'image' | 'gallery'> => ({
  image: studyo(slug),
  gallery: Array.from({ length: galeri }, (_, i) => studyo(`${slug}-${i + 2}`)),
});

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
        variants: [{ label: '700 g', netQuantity: 700, sku: '312701', supplierCode: '312701', nameAtSupplier: 'LEZZA Traditional Meet Doner 10x700gr', qty: 10, unitCost: 8 }],
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
        variants: [{ label: '700 g', netQuantity: 700, sku: '312702', supplierCode: '312702', nameAtSupplier: 'LEZZA Traditional Chicken Doner 10x700gr', qty: 10, unitCost: 6.1 }],
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
        variants: [{ label: '1000 g', netQuantity: 1000, sku: '200503', supplierCode: '200503', nameAtSupplier: 'LEZZA Manti with Minced Meat (Kiymali )1000 gr', qty: 10, unitCost: 5.15 }],
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
        descriptionFromLabel: true,
        description: {
          tr: 'Beşe "Eski Usül" üzüm pekmezi, geleneksel yöntemle hazırlanır. Şeker ilavesizdir; doğal olarak şeker içerir. 650 g.',
          fr: 'Mélasse de raisin Beşe « Eski Usül », préparée selon la méthode traditionnelle. Sans sucres ajoutés – contient des sucres naturellement présents. 650 g.',
          de: 'Beşe Traubenmelasse „Eski Usül“, nach traditioneller Art hergestellt. Ohne Zuckerzusatz – enthält von Natur aus Zucker. 650 g.',
        },
        ingredients: { tr: 'Üzüm pekmezi.', fr: 'Mélasse de raisin.', de: 'Traubenmelasse.' },
        nutrition: kunye(1225, 293, 0, 0, 70.6, 69.9, 0.6, 0),
        allergens: [],
        storage: { tr: 'Kuru ve serin yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Trocken und kühl lagern.' },
        shelfLifeDays: 730,
        ...studyoSeti('druivenmelasse', 2),
        boy: { barcode: '8681910226456', packedWeightG: 920, packedLengthMm: 165, packedWidthMm: 70, packedHeightMm: 70 },
      }),
      behotrade('Johannesbroodmelasse', '650 g', 650, 'Johannesbroodmelasse 650gr', 12, 5.5, {
        nameTr: 'Keçiboynuzu Pekmezi',
        nameFr: 'Mélasse de caroube',
        nameDe: 'Johannisbrotmelasse',
        descriptionFromLabel: true,
        description: {
          tr: 'Beşe "Eski Usül" keçiboynuzu pekmezi, geleneksel yöntemle hazırlanır. Şeker ilavesizdir; doğal olarak şeker içerir. 650 g.',
          fr: 'Mélasse de caroube Beşe « Eski Usül », préparée selon la méthode traditionnelle. Sans sucres ajoutés – contient des sucres naturellement présents. 650 g.',
          de: 'Beşe Johannisbrotsirup „Eski Usül“, nach traditioneller Art hergestellt. Ohne Zuckerzusatz – enthält von Natur aus Zucker. 650 g.',
        },
        ingredients: { tr: 'Keçiboynuzu (harnup) pekmezi.', fr: 'Sirop de caroube.', de: 'Johannisbrotsirup.' },
        nutrition: kunye(1184, 283, 0, 0, 69.3, 69.3, 1.4, 0),
        allergens: [],
        storage: { tr: 'Kuru ve serin yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Trocken und kühl lagern.' },
        shelfLifeDays: 730,
        ...studyoSeti('johannesbroodmelasse', 2),
        boy: { barcode: '8681910226654', packedWeightG: 900, packedLengthMm: 165, packedWidthMm: 70, packedHeightMm: 70 },
      }),
      behotrade('Tahini', '500 g', 500, 'Tahini 500gr', 12, 4.75, {
        nameTr: 'Tahin',
        nameFr: 'Tahin (purée de sésame)',
        nameDe: 'Tahin (Sesampaste)',
        descriptionFromLabel: true,
        description: {
          tr: 'Beşe "Eski Usül" tahin, susam ezmesi. Glutensiz ve vegan. Susam içerir.',
          fr: 'Tahin Beşe « Eski Usül », pâte de sésame. Sans gluten et vegan. Contient du sésame.',
          de: 'Beşe Tahin „Eski Usül“, Sesampaste. Glutenfrei und vegan. Enthält Sesam.',
        },
        // Alerjen İÇİNDEKİLER LİSTESİNDE yazıldığı hâliyle vurgulanır (INCO); künyedeki büyük harf
        // yerine deponun işareti kullanılır (`parseEmphasis`).
        ingredients: { tr: '**Susam** ezmesi (tahin).', fr: 'Pâte de **sésame**.', de: '**Sesam**paste.' },
        nutrition: kunye(2816, 674, 58, 10.8, 10.5, 0, 22.7, 0.4),
        allergens: ['susam'],
        storage: { tr: 'Kuru ve serin yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Trocken und kühl lagern.' },
        shelfLifeDays: 730,
        ...studyoSeti('tahini', 2),
        boy: { barcode: '8681910226319', packedWeightG: 780, packedLengthMm: 165, packedWidthMm: 75, packedHeightMm: 75 },
      }),
      // Sirkelerin ortak künyesi: doğal fermantasyon, katkı ve koruyucu içermez — ambalajın ön yüzünde
      // yazılı (`temp/beho` ustaları). Saklama, içindekiler ve besin değeri hiçbir kaynakta YOK.
      behotrade('Meidoorn azijn', '500 ml', 500, 'Meidoorn azijn 500ml', 12, 3, {
        nameTr: 'Alıç Sirkesi',
        nameFr: "Vinaigre d'aubépine",
        nameDe: 'Weißdornessig',
        descriptionFromLabel: true,
        description: sirkeMetni({
          tr: 'Şifamix alıç sirkesi, geleneksel doğal fermantasyonla üretilmiştir.',
          fr: "Vinaigre d'aubépine Şifamix, obtenu par fermentation naturelle traditionnelle.",
          de: 'Şifamix Weißdorn-Essig, durch traditionelle natürliche Fermentation hergestellt.',
        }),
        ingredients: { tr: 'Alıç sirkesi.', fr: "Vinaigre d'aubépine.", de: 'Weißdorn-Essig.' },
        nutrition: kunye(50, 12, 0, 0, 3.1, 0, 0, 0),
        allergens: [],
        storage: { ...SIRKE_SAKLAMA, tr: 'Serin yerde kapak kapalı olarak muhafaza ediniz.' },
        ...studyoSeti('meidoorn-azijn', 2),
        boy: { barcode: '8683649156806', packedWeightG: 945, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      behotrade('Ananas azijn', '500 ml', 500, 'Ananas azijn 500ml', 12, 3, {
        nameTr: 'Ananas Sirkesi',
        nameFr: "Vinaigre d'ananas",
        nameDe: 'Ananasessig',
        descriptionFromLabel: true,
        description: sirkeMetni({
          tr: 'Şifamix ananas sirkesi, geleneksel doğal fermantasyonla üretilmiştir.',
          fr: "Vinaigre d'ananas Şifamix, obtenu par fermentation naturelle traditionnelle.",
          de: 'Şifamix Ananas-Essig, durch traditionelle natürliche Fermentation hergestellt.',
        }),
        ingredients: { tr: 'Ananas sirkesi.', fr: "Vinaigre d'ananas.", de: 'Ananas-Essig.' },
        nutrition: kunye(18, 4.3, 0.02, 0.02, 1.2, 0.1, 0, 0.03),
        allergens: [],
        storage: SIRKE_SAKLAMA,
        shelfLifeDays: 1096,
        ...studyoSeti('ananas-azijn', 2),
        boy: { barcode: '8683649157070', packedWeightG: 880, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      behotrade('Enginar azijn', '500 ml', 500, 'Enginar azijn 500ml', 12, 3, {
        nameTr: 'Enginar Sirkesi',
        nameFr: "Vinaigre d'artichaut",
        nameDe: 'Artischockenessig',
        descriptionFromLabel: true,
        description: sirkeMetni(
          {
            tr: 'Şifamix enginar sirkesi, geleneksel doğal fermantasyonla üretilmiştir.',
            fr: "Vinaigre d'artichaut Şifamix, obtenu par fermentation naturelle traditionnelle.",
            de: 'Şifamix Artischockenessig, durch traditionelle natürliche Fermentation hergestellt.',
          },
          true,
        ),
        // Künye "enginar elma sirkesi" diyor: taban elma sirkesi, enginar aromalandırıcı.
        ingredients: { tr: 'Enginar elma sirkesi.', fr: "Vinaigre de cidre de pomme à l'artichaut.", de: 'Artischocken-Apfelessig.' },
        nutrition: kunye(79.5, 19, 0, 0, 4.8, 0, 0, 0),
        allergens: [],
        storage: {
          tr: 'Serin ve kuru bir yerde, kapağı sıkıca kapalı olarak muhafaza ediniz. Doğrudan güneş ışığından koruyunuz.',
          fr: "À conserver dans un endroit frais et sec, bien fermé et à l'abri de la lumière directe du soleil.",
          de: 'Kühl und trocken lagern, gut verschlossen aufbewahren und vor direkter Sonneneinstrahlung schützen.',
        },
        shelfLifeDays: 1826,
        boy: { barcode: '8683649157803', packedWeightG: 930, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      behotrade('Appel azijn', '500 ml', 500, 'Appel azijn 500ml', 12, 3, {
        nameTr: 'Elma Sirkesi',
        nameFr: 'Vinaigre de cidre',
        nameDe: 'Apfelessig',
        descriptionFromLabel: true,
        description: sirkeMetni({
          tr: 'Şifamix elma sirkesi, geleneksel doğal fermantasyonla üretilmiştir.',
          fr: 'Vinaigre de cidre de pomme Şifamix, obtenu par fermentation naturelle traditionnelle.',
          de: 'Şifamix Apfelessig, durch traditionelle natürliche Fermentation hergestellt.',
        }),
        ingredients: { tr: 'Elma sirkesi.', fr: 'Vinaigre de cidre de pomme.', de: 'Apfelessig.' },
        nutrition: kunye(59, 14, 0.09, 0.09, 3.6, 0, 0, 0),
        allergens: [],
        storage: { ...SIRKE_SAKLAMA, tr: 'Serin yerde kapak kapalı olarak muhafaza ediniz.' },
        image: usta('appel-azijn', 'elma_y02.jpg'),
        boy: { barcode: '8683649156790', packedWeightG: 900, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      behotrade('Isgin azijn', '500 ml', 500, 'Isgin azijn 500ml', 12, 3, {
        nameTr: 'Işkın Kökü Sirkesi',
        nameFr: 'Vinaigre de racine de rhubarbe',
        nameDe: 'Rhabarberwurzelessig',
        descriptionFromLabel: true,
        description: sirkeMetni({
          tr: 'Şifamix ışkın kökü sirkesi; elma sirkesi ve ışkın köküyle, geleneksel doğal fermantasyonla üretilmiştir.',
          fr: 'Vinaigre de cidre de pomme Şifamix à la racine de rhubarbe, obtenu par fermentation naturelle traditionnelle.',
          de: 'Şifamix Apfelessig mit Rhabarberwurzel, durch traditionelle natürliche Fermentation hergestellt.',
        }),
        ingredients: {
          tr: 'Elma sirkesi, ışkın kökü.',
          fr: 'Vinaigre de cidre de pomme, racine de rhubarbe.',
          de: 'Apfelessig, Rhabarberwurzel.',
        },
        nutrition: kunye(13, 3, 0.04, 0.04, 0.5, 0.01, 0, 0.1),
        allergens: [],
        storage: SIRKE_SAKLAMA,
        shelfLifeDays: 1461,
        ...studyoSeti('isgin-azijn', 2),
        boy: { barcode: '8683649157063', packedWeightG: 950, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      // Fatura "extraat" (öz) diyordu, ambalaj "Nar Ekşisi / Sirop de grenade" yazıyor: ad künyeden
      // düzeltildi ve depoda bekleyen kapak bağlandı.
      behotrade('Granaatappelextraat', '250 ml', 250, 'Granaatappelextraat 250ml', 12, 3.45, {
        nameTr: 'Nar Ekşisi',
        nameFr: 'Sirop de grenade',
        nameDe: 'Granatapfelsirup',
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix nar ekşisi. Katkı maddesi ve koruyucu içermez. Hamile ve emziren kadınların tüketmeden önce doktora danışması tavsiye edilir.',
          fr: 'Sirop de grenade Şifamix. Sans additifs ni conservateurs. Il est conseillé aux femmes enceintes et allaitantes de consulter un médecin avant consommation.',
          de: 'Şifamix Granatapfelsirup. Ohne Zusatz- und Konservierungsstoffe. Schwangeren und stillenden Müttern wird empfohlen, vor dem Verzehr einen Arzt zu konsultieren.',
        },
        ingredients: { tr: 'Nar ekşisi.', fr: 'Sirop de grenade.', de: 'Granatapfelsirup.' },
        nutrition: kunye(1174, 273, 0, 0, 66.9, 64.9, 1, 0.1),
        allergens: [],
        storage: SIRKE_SAKLAMA,
        ...studyoSeti('nar-eksisi', 2),
        boy: { barcode: '8683649156813', packedWeightG: 605, packedLengthMm: 45, packedWidthMm: 45, packedHeightMm: 230 },
      }),
      behotrade('Sifamix Kozalak extract', '670 g', 670, 'Sifamix Kozalak extract 670gr', 12, 4.25, {
        nameTr: 'Şifamix Kozalak Özü',
        nameFr: 'Extrait de pomme de pin Şifamix',
        nameDe: 'Şifamix Kiefernzapfenextrakt',
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix kozalak özü; kozalak özü, keçiboynuzu pekmezi ve andız pekmezinden hazırlanır. İnfüzyon ve soğuk pres yöntemiyle üretilmiştir. Katkı maddesi ve koruyucu içermez.',
          fr: "Extrait de pomme de pin Şifamix, préparé à partir d'extrait de pomme de pin, de mélasse de caroube et de mélasse de genévrier. Obtenu par infusion et pressage à froid. Sans additifs ni conservateurs.",
          de: 'Şifamix Kiefernzapfenextrakt aus Kiefernzapfenextrakt, Johannisbrotmelasse und Wacholdermelasse. Durch Infusion und Kaltpressung hergestellt. Ohne Zusatz- und Konservierungsstoffe.',
        },
        ingredients: {
          tr: 'Kozalak özü, keçiboynuzu pekmezi, andız pekmezi.',
          fr: 'Extrait de pomme de pin, mélasse de caroube, mélasse de genévrier.',
          de: 'Kiefernzapfenextrakt, Johannisbrotmelasse, Wacholdermelasse.',
        },
        nutrition: kunye(1352, 318, 0.01, 0, 78.81, 44.61, 0.69, 0),
        allergens: [],
        storage: { ...OZ_SAKLAMA, tr: 'Serin ve kuru yerde bulundurunuz. Serin ve güneş görmeyen yerde saklayınız.' },
        boy: { barcode: '8683649157735', packedWeightG: 1095, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      // Fatura "700ml" yazıyor ama ambalajda GRAM yazılı: boy etiketi künyeden düzeltildi (birim etiketten okunur).
      behotrade('Sifamix Johannesbrood extract', '700 g', 700, 'Sifamix Johannesbrood extract 700ml', 12, 3.75, {
        nameTr: 'Şifamix Keçiboynuzu Özü',
        nameFr: 'Extrait de caroube Şifamix',
        nameDe: 'Şifamix Johannisbrotextrakt',
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix keçiboynuzu özü, doğal keçiboynuzu meyvesinden infüzyon ve soğuk pres yöntemiyle elde edilir. Şeker ilavesizdir; doğal olarak şeker içerir. Katkı maddesi ve koruyucu içermez.',
          fr: 'Extrait de caroube Şifamix, obtenu à partir de gousses de caroube naturelles par infusion et pressage à froid. Sans sucres ajoutés – contient des sucres naturellement présents. Sans additifs ni conservateurs.',
          de: 'Şifamix Johannisbrot-Extrakt aus natürlichen Johannisbrotschoten, durch Infusion und Kaltpressung gewonnen. Ohne Zuckerzusatz – enthält von Natur aus Zucker. Ohne Zusatz- und Konservierungsstoffe.',
        },
        ingredients: {
          tr: 'Doğal keçiboynuzu meyvesinin özü.',
          fr: 'Extrait de gousses de caroube.',
          de: 'Extrakt aus Johannisbrotschoten.',
        },
        nutrition: kunye(1360, 320, 0, 0, 79.31, 44, 0.68, 0),
        allergens: [],
        storage: OZ_SAKLAMA,
        shelfLifeDays: 730,
        image: usta('sifamix-johannesbrood-extract', 'keçiboynuzu.zip/keçiboynuzu_01.jpg'),
        boy: { barcode: '8683649157292', packedWeightG: 1120, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      behotrade('Sifamix Andiz extract', '350 g', 350, 'Sifamix Andiz extract 350gr', 12, 3.99, {
        nameTr: 'Şifamix Andız Özü',
        nameFr: 'Extrait de genévrier Şifamix',
        nameDe: 'Şifamix Wacholderextrakt',
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix andız özü, doğal andız meyvesinden infüzyon ve soğuk pres yöntemiyle elde edilir. Şeker ilavesizdir; doğal olarak şeker içerir. Katkı maddesi ve koruyucu içermez.',
          fr: 'Extrait de genièvre Şifamix, obtenu à partir de baies de genévrier par infusion et pressage à froid. Sans sucres ajoutés – contient des sucres naturellement présents. Sans additifs ni conservateurs.',
          de: 'Şifamix Wacholderextrakt aus Wacholderbeeren, durch Infusion und Kaltpressung gewonnen. Ohne Zuckerzusatz – enthält von Natur aus Zucker. Ohne Zusatz- und Konservierungsstoffe.',
        },
        ingredients: { tr: 'Doğal andız meyvesinin özü.', fr: 'Extrait de baies de genévrier.', de: 'Extrakt aus Wacholderbeeren.' },
        nutrition: kunye(1279.7, 301.1, 0.1, 0, 74.29, 50.13, 0.77, 0.014),
        allergens: [],
        storage: OZ_SAKLAMA,
        shelfLifeDays: 730,
        ...studyoSeti('sifamix-andiz-extract', 2),
        boy: { barcode: '8683649157285', packedWeightG: 620, packedLengthMm: 45, packedWidthMm: 45, packedHeightMm: 230 },
      }),
      behotrade('Coconut mix', '250 ml', 250, 'Coconut mix 250ml', 12, 4.95, {
        nameTr: 'Coconut Mix',
        nameFr: 'Coconut Mix',
        nameDe: 'Coconut Mix',
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix Coconut Mix – hindistan cevizi sirkesi ve şurubu bazlı konsantre içecek; yeşil çay, biberiye, chia ve kinoa tohumu içerir. İçmeden önce çalkalayınız, soğuk içiniz. Açıldıktan sonra buzdolabında saklayıp 1 ay içinde tüketiniz.',
          fr: "Şifamix Coconut Mix – boisson concentrée à base de vinaigre et de sirop de coco, avec thé vert, romarin, graines de chia et de quinoa. Bien agiter avant de boire, boire froid. Après ouverture, conserver au réfrigérateur et consommer dans un délai d'un mois.",
          de: 'Şifamix Coconut Mix – Getränkekonzentrat auf Basis von Kokosnussessig und Kokosnusssirup, mit grünem Tee, Rosmarin, Chia- und Quinoasamen. Vor dem Trinken gut schütteln, kalt trinken. Nach dem Öffnen im Kühlschrank aufbewahren und innerhalb von 1 Monat verbrauchen.',
        },
        ingredients: {
          tr: 'Hindistan cevizi sirkesi, hindistan cevizi şurubu, sandaloz sakızı, yeşil çay, biberiye, chia tohumu, kinoa tohumu, kitre sakızı, funda yaprağı, L-karnitin, potasyum sorbat, sodyum benzoat, akasya gamı.',
          fr: 'Vinaigre de coco, sirop de coco, résine de sandaraque, thé vert, romarin, graines de chia (Salvia hispanica), graines de quinoa, gomme adragante, feuille de bruyère, L-carnitine, sorbate de potassium, benzoate de sodium, gomme arabique.',
          de: 'Kokosnussessig, Kokosnusssirup, Sandarakharz, Grüner Tee, Rosmarin, Chia-Samen (Salvia hispanica), Quinoasamen, Tragantgummi, Heidekrautblatt, L-Carnitin, Kaliumsorbat, Natriumbenzoat, Gummi Arabicum.',
        },
        nutrition: kunye(77.7, 18.6, 0, 0, 4.3, 2.6, 0.32, 0.37),
        allergens: [],
        storage: {
          tr: 'Çocukların ulaşamayacağı, serin ve kuru bir yerde muhafaza ediniz. Açıldıktan sonra buzdolabında muhafaza edilmeli ve 1 ay içerisinde tüketilmelidir.',
          fr: "Conserver dans un endroit frais et sec, hors de portée des enfants. Après ouverture, conserver au réfrigérateur et consommer dans un délai d'un mois.",
          de: 'Außerhalb der Reichweite von Kindern an einem kühlen und trockenen Ort aufbewahren. Nach dem Öffnen im Kühlschrank aufbewahren und innerhalb von 1 Monat verbrauchen.',
        },
        image: usta('coconut-mix', 'coconut_trendyol.zip/coconut_01.jpg'),
        boy: { barcode: '8683649157537', packedWeightG: 525, packedLengthMm: 45, packedWidthMm: 45, packedHeightMm: 230 },
      }),
      behotrade('Honing azijn', '500 ml', 500, 'Honing azijn 500ml', 12, 3, {
        nameTr: 'Bal Sirkesi',
        nameFr: 'Vinaigre de miel',
        nameDe: 'Honigessig',
        descriptionFromLabel: true,
        description: sirkeMetni({
          tr: 'Şifamix bal sirkesi, tarçınlı; geleneksel doğal fermantasyonla üretilmiştir.',
          fr: 'Vinaigre de miel Şifamix à la cannelle, obtenu par fermentation naturelle traditionnelle.',
          de: 'Şifamix Honigessig mit Zimt, durch traditionelle natürliche Fermentation hergestellt.',
        }),
        ingredients: { tr: 'Bal sirkesi, tarçın.', fr: 'Vinaigre de miel, cannelle.', de: 'Honigessig, Zimt.' },
        nutrition: kunye(25.14, 6, 0.02, 0.02, 1.58, 0.12, 0, 0.06),
        allergens: [],
        storage: SIRKE_SAKLAMA,
        ...studyoSeti('honing-azijn', 2),
        boy: { barcode: '8683649157056', packedWeightG: 880, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
      }),
      {
        name: 'Olijfolie',
        // Elle yazılmış kayıt: `behotrade()`ın raf varsayılanı buraya uğramaz.
        rejim: 'raf',
        // Fatura yalnız "Olijfolie" diyor; ambalaj sınıfı yazıyor ve sınıf ADIN PARÇASI: "natürel sızma"
        // hukuken ayrı bir kalite (AB 2022/2104), rafta yanındaki riviera ile aynı ürün değil.
        nameTr: 'Natürel Sızma Zeytinyağı',
        nameFr: "Huile d'olive vierge extra",
        nameDe: 'Natives Olivenöl extra',
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix natürel sızma zeytinyağı, Yunanistan ürünü. Soğuk sıkım. Doğrudan zeytinden, yalnızca mekanik yöntemlerle elde edilen üstün kalite zeytinyağı.',
          fr: "Huile d'olive vierge extra Şifamix, produit de Grèce. Extraction à froid. Huile d'olive de catégorie supérieure obtenue directement des olives et uniquement par des procédés mécaniques.",
          de: 'Natives Olivenöl extra von Şifamix, Erzeugnis aus Griechenland. Kaltextraktion. Olivenöl der höchsten Güteklasse, direkt aus Oliven ausschließlich mit mechanischen Verfahren gewonnen.',
        },
        ingredients: { tr: 'Natürel sızma zeytinyağı.', fr: "Huile d'olive vierge extra.", de: 'Natives Olivenöl extra.' },
        nutrition: kunye(3470.6, 837.5, 93.8, 13.4, 0, 0, 0, 0),
        allergens: [],
        storage: {
          tr: 'Serin ve karanlık bir yerde saklayınız.',
          fr: 'Conserver dans un endroit sombre et frais.',
          de: 'An einem dunklen und kühlen Ort aufbewahren.',
        },
        ...studyoSeti('olijfolie', 5),
        variants: [
          {
            label: '5 l',
            netQuantity: 5000,
            nameAtSupplier: 'Olijfolie 5lt',
            qty: 4,
            unitCost: 29.9,
            barcode: '5205657007524',
            packedWeightG: 5000,
            packedLengthMm: 330,
            packedWidthMm: 120,
            packedHeightMm: 150,
          },
          {
            label: '750 ml',
            netQuantity: 750,
            nameAtSupplier: 'Olijfolie 750ml',
            qty: 12,
            unitCost: 5.5,
            barcode: '5205657007531',
            packedWeightG: 1125,
            packedLengthMm: 290,
            packedWidthMm: 70,
            packedHeightMm: 70,
          },
        ],
      },
      behotrade('Pistache', '700 g', 700, 'Pistache 700gr', 20, 16.5, {
        nameTr: 'Antep Fıstığı',
        nameFr: 'Pistaches',
        nameDe: 'Pistazien',
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix kabuklu Antep fıstığı, tuzlu. Dikkat: Küçük çocuklar taneleri yutarak boğulabilir.',
          fr: "Pistaches Şifamix en coque, salées. Attention : les enfants en bas âge peuvent s'étouffer avec les graines.",
          de: 'Şifamix Pistazien in der Schale, gesalzen. Achtung: Kleine Kinder können an Kernen ersticken.',
        },
        ingredients: { tr: '**Antep fıstığı**, tuz.', fr: '**Pistache**, sel.', de: '**Pistazien**, Salz.' },
        // Besin künyesi YAZILMADI: elimizdeki okumada doymuş yağ 51,02 g görünüyor ve 58,69 g yağın
        // neredeyse tamamı demek — fıstıkta yağın büyük kısmı doymamıştır, yani satır yanlış okunmuş.
        // Künye yarım yazılmaz; doğrusu ambalajdan yeniden okunacak.
        allergens: ['sert_kabuklu'],
        traces: ['yer_fistigi', 'sert_kabuklu', 'susam'],
        storage: {
          tr: 'Kuru yerde, sıcaktan koruyarak saklayınız.',
          fr: "Conserver au sec et à l'abri de la chaleur.",
          de: 'Trocken lagern und vor Wärme schützen.',
        },
        ...studyoSeti('pistache', 2),
        boy: { barcode: '8699237145442', packedWeightG: 710, packedLengthMm: 50, packedWidthMm: 150, packedHeightMm: 230 },
      }),
      // Faturada "250ml", ambalajda GRAM yazılı (keçiboynuzu özüyle aynı durum): boy etiketi künyeden düzeltildi.
      behotrade('Bromelain siroop', '250 g', 250, 'Bromelain siroop 250ml', 18, 8, {
        nameTr: 'Bromelain Şurubu',
        nameFr: 'Sirop de broméline',
        nameDe: 'Bromelain-Sirup',
        descriptionFromLabel: true,
        description: {
          tr: 'Ananas ve bromelain içeren şurup formunda gıda takviyesi (Zühre Ana). 1 porsiyonda: bromelain 350 mg, koenzim Q10 100 mg, mate yaprağı ekstresi 100 mg, L-karnitin 100 mg, C vitamini 80 mg (%100 BRD), ananas ekstresi 50 mg. Kullanım: yetişkinler ve 11 yaş üzeri için sabah 1, akşam 1 doz olmak üzere günde toplam 2 doz (10 ml). Kullanmadan önce çalkalayınız. İlaç değildir; hastalıkları önleme veya tedavi amacıyla kullanılamaz. Gıda takviyeleri normal beslenmenin yerine geçemez. Hastalık veya ilaç kullanımı durumunda doktorunuza danışınız. Çocukların ulaşamayacağı yerde saklayınız.',
          fr: "Complément alimentaire au sirop contenant de l'ananas et de la bromélaïne (Zühre Ana). Pour 1 portion : bromélaïne 350 mg, coenzyme Q10 100 mg, extrait de feuille de maté 100 mg, L-carnitine 100 mg, vitamine C 80 mg (100 % VNR), extrait d'ananas 50 mg. Portion journalière : adultes et personnes de 11 ans et plus, 1 dose le matin et 1 dose le soir, soit 2 doses (10 ml) par jour. Bien agiter avant utilisation. Ce n'est pas un médicament ; il ne peut pas être utilisé pour prévenir ou traiter des maladies. Les compléments alimentaires ne peuvent pas remplacer une alimentation normale. Consultez votre médecin en cas de maladie ou de prise de médicaments. Tenir hors de portée des enfants.",
          de: 'Nahrungsergänzungsmittel in Sirupform mit Ananas und Bromelain (Zühre Ana). Pro Portion: Bromelain 350 mg, Coenzym Q10 100 mg, Mate-Blattextrakt 100 mg, L-Carnitin 100 mg, Vitamin C 80 mg (100 % NRV), Ananasextrakt 50 mg. Verzehrempfehlung: Erwachsene und Personen ab 11 Jahren 1 Dosis morgens und 1 Dosis abends, insgesamt 2 Dosen (10 ml) pro Tag. Vor Gebrauch gut schütteln. Es ist kein Arzneimittel und kann nicht zur Vorbeugung oder Behandlung von Krankheiten eingesetzt werden. Nahrungsergänzungsmittel können die normale Ernährung nicht ersetzen. Bei Krankheit oder Medikamenteneinnahme Arzt konsultieren. Außerhalb der Reichweite von Kindern aufbewahren.',
        },
        ingredients: {
          tr: 'Deiyonize su, bromelain, koenzim Q10, mate yaprağı ekstresi, L-karnitin, arap zamkı (E414), L-askorbik asit (C vitamini), ananas ekstresi, doğal ananas aroması, stevya (Stevia rebaudiana).',
          fr: "Eau désionisée, bromélaïne, coenzyme Q10, extrait de feuille de maté, L-carnitine, gomme arabique (E414), acide L-ascorbique (vitamine C), extrait d'ananas, arôme naturel d'ananas, stévia (Stevia Rebaudiana).",
          de: 'Entionisiertes Wasser, Bromelain, Coenzym Q10, Mate-Blattextrakt, L-Carnitin, Gummi Arabicum (E414), L-Ascorbinsäure (Vitamin C), Ananasextrakt, natürliches Ananasaroma, Stevia (Stevia Rebaudiana).',
        },
        // Besin künyesi ambalajda YOK: gıda takviyesi porsiyon başına etkin madde yazar, 100 ml künyesi vermez.
        allergens: [],
        storage: {
          tr: "25 °C'nin altında oda sıcaklığında, nem ve ışıktan korunarak saklayınız. Çocukların ulaşamayacağı yerde saklayınız.",
          fr: "Conserver à température ambiante inférieure à 25 °C, à l'abri de l'humidité et de la lumière. Tenir hors de portée des enfants.",
          de: 'Bei Raumtemperatur unter 25 °C, vor Feuchtigkeit und Licht geschützt lagern. Außerhalb der Reichweite von Kindern aufbewahren.',
        },
        image: magaza(
          'bromelain-siroop',
          'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/ZuhreAnaBromelainSurubu250ml_587ebfd0-bba8-42f4-9145-3df204a028ca.webp',
          'Zühre Ana',
        ),
        boy: { barcode: '8683655363212', packedWeightG: 460, packedLengthMm: 45, packedWidthMm: 45, packedHeightMm: 230 },
      }),
      // Kekre ve Propolis: içindekiler listesi markanın kendi mağazasında YAZILI, olduğu gibi alındı.
      // Sağlık iddiası taşıyan cümleler (bağışıklık, iltihap, ağrı) bilerek taşınmadı — AB'de beyan
      // düzenlemeye tabi (1924/2006) ve kaynağı bir satış sayfası.
      behotrade('Zuhre Ana Kekre', '250 ml', 250, 'Zuhre Ana Kekre 250ml', 18, 8.45, {
        nameTr: 'Zühre Ana Kekre Termojenik Mix',
        nameFr: 'Zühre Ana Kekre, concentré aux fruits',
        nameDe: 'Zühre Ana Kekre, Fruchtkonzentrat',
        descriptionFromLabel: true,
        description: {
          tr: "Zühre Ana Kekre Mix, hibisküs ve papayalı; bitki ekstreleri içeren içecek konsantresi. Hazırlanışı: bardağın 1/4'üne kadar doldurup üzerine su ekleyerek iyice karıştırınız. Tüketmeden önce çalkalayınız. Koruyucu ve renklendirici içermez.",
          fr: "Zühre Ana Kekre Mix à l'hibiscus et à la papaye – concentré de boisson aux extraits de plantes. Préparation : remplir un verre au quart, compléter avec de l'eau et bien mélanger. Agiter avant utilisation. Sans conservateurs ni colorants.",
          de: 'Zühre Ana Kekre Mix mit Hibiskus und Papaya – Getränkekonzentrat mit Pflanzenextrakten. Zubereitung: ein Glas zu 1/4 füllen, mit Wasser auffüllen und gut umrühren. Vor Gebrauch schütteln. Ohne Konservierungs- und Farbstoffe.',
        },
        nutrition: kunye(753, 180, 3, 1.5, 32.5, 17, 6, 0.05),
        allergens: [],
        boy: { barcode: '8683655363984', packedWeightG: 513, packedLengthMm: 45, packedWidthMm: 45, packedHeightMm: 230 },
        ingredients: {
          tr: 'Yaban mersini, su, mate, zencefil, papaya, mango, açai, sandaloz sakızı, hindistan cevizi, hibiskus, avokado, ananas, tarçın, L-karnitin, stevia, ksantan gam.',
          fr: 'Myrtille, eau, maté, gingembre, papaye, mangue, açaï, gomme de sandaraque, noix de coco, hibiscus, avocat, ananas, cannelle, L-carnitine, stévia, gomme xanthane.',
          de: 'Heidelbeere, Wasser, Mate, Ingwer, Papaya, Mango, Açaí, Sandarakharz, Kokosnuss, Hibiskus, Avocado, Ananas, Zimt, L-Carnitin, Stevia, Xanthan.',
        },
        storage: {
          tr: 'Güneş ışığından uzak, serin ve kuru, kendi ambalajı içerisinde saklayınız. Açıldıktan sonra buzdolabında muhafaza ediniz.',
          fr: "À conserver à l'abri de la lumière du soleil, dans un endroit frais et sec, dans son emballage d'origine. Après ouverture, conserver au réfrigérateur.",
          de: 'Vor Sonnenlicht geschützt, kühl und trocken in der Originalverpackung aufbewahren. Nach dem Öffnen im Kühlschrank aufbewahren.',
        },
        ...studyoSeti('zuhre-ana-kekre', 2),
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
        descriptionFromLabel: true,
        description: {
          tr: 'Zühre Ana L-karnitin içeren macun. Meyve ve bitki karışımı; L-karnitin (%4,16) ve krom pikolinat içerir. Türkiye ürünü. Hamile kadınlar ve çocuklar için uygun değildir.',
          fr: 'Pâte Zühre Ana contenant de la L-carnitine. Mélange de fruits et de plantes, avec L-carnitine (4,16 %) et picolinate de chrome. Produit de Turquie. Ne convient pas aux femmes enceintes ni aux enfants.',
          de: 'Zühre Ana Paste mit L-Carnitin. Mischung aus Früchten und Kräutern, mit L-Carnitin (4,16 %) und Chrompicolinat. Hergestellt in der Türkei. Für Schwangere und Kinder nicht geeignet.',
        },
        ingredients: {
          tr: 'Yaban mersini, biberiye, funda, kiraz meyve sapı, mısır püskülü, akdiken, enginar, L-karnitin (%4,16), sandaloz sakızı, kitre, tarçın, krom pikolinat, yeşil çay, nar ekşisi, kayısı aroması.',
          fr: 'Myrtille, romarin, bruyère, queue de cerise, barbe de maïs, nerprun, artichaut, L-carnitine (4,16 %), gomme de sandaraque, gomme adragante, cannelle, picolinate de chrome, thé vert, mélasse de grenade, arôme abricot.',
          de: 'Heidelbeere, Rosmarin, Heidekraut, Kirschstiel, Maisseide, Weissdorn, Artischocke, L-Carnitin (4,16 %), Sandarak, Traganth, Zimt, Chrompicolinat, Grüner Tee, Granatapfelsirup, Aprikosenaroma.',
        },
        nutrition: kunye(1395, 334, 0.3, 0.1, 82.8, 51.6, 0, 0),
        allergens: [],
        storage: {
          tr: 'Güneş ışığından uzak, serin ve kuru yerde saklayınız.',
          fr: 'À conserver à l’abri du soleil, au sec et au frais.',
          de: 'Vor Sonnenlicht geschützt, kühl und trocken lagern.',
        },
        image: magaza('form-pasta', 'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/ZuhreAnaFormMacunu240Gram.webp', 'Zühre Ana'),
        boy: { barcode: '8683655363014', packedWeightG: 423, packedLengthMm: 100, packedWidthMm: 80, packedHeightMm: 80 },
      }),
      behotrade('Dennenappel pasta', '240 g', 240, 'Dennenappel pasta 240gr', 2, 8, {
        nameTr: 'Kozalak Macunu',
        nameFr: 'Pâte de pomme de pin',
        nameDe: 'Kiefernzapfen-Paste',
        descriptionFromLabel: true,
        description: {
          tr: 'Zühre Ana kozalak macunu. Keçiboynuzu ve andız pekmezi bazlı; servi kozağı (%24), reçine, baharatlar, çinko, C ve D3 vitamini içerir. Türkiye ürünü.',
          fr: 'Pâte Zühre Ana à base de mélasse de caroube et de genévrier, avec cônes de cyprès (24 %), résine, épices, zinc et vitamines C et D3. Produit de Turquie.',
          de: 'Zühre Ana Paste auf Basis von Johannisbrot- und Wacholdermelasse, mit Zypressenzapfen (24 %), Harz, Gewürzen, Zink sowie Vitamin C und D3. Hergestellt in der Türkei.',
        },
        ingredients: {
          tr: 'Keçiboynuzu pekmezi, servi kozağı (%24), andız pekmezi, nane, zencefil, günlük (boswellia), çam sakızı (%2), zerdeçal, havlıcan, beta-glukan, çinko glukonat (%2), askorbik asit (C vitamini), kübabe, karanfil, keçiboynuzu tozu, kolekalsiferol (D3 vitamini) (%0,006).',
          fr: 'Mélasse de caroube, cônes de cyprès (24 %), mélasse de genévrier de Syrie, menthe poivrée, gingembre, encens (boswellia), résine de pin (2 %), curcuma, galanga, bêta-glucane, gluconate de zinc (2 %), acide ascorbique (vitamine C), cubèbe, clou de girofle, poudre de caroube, cholécalciférol (vitamine D3) (0,006 %).',
          de: 'Johannesbrotmelasse, Zypressenzapfen (24 %), Syrische Wacholdermelasse, Pfefferminz, Ingwer, Weihrauch, Tannenharz (Mastix) (2 %), Kurkuma, Galgant, Beta-Glucan, Zinkgluconat (2 %), Ascorbinsäure (Vitamin C), Kubebe, Nelke, Johannisbrotpulver, Cholecalciferol (Vitamin D3) (0,006 %).',
        },
        nutrition: kunye(1463, 350, 0.3, 0, 86.8, 60.5, 0, 0),
        storage: { tr: 'Serin ve kuru yerde saklayınız.', fr: 'À conserver au sec et au frais.', de: 'Kühl und trocken lagern.' },
        image: magaza(
          'dennenappel-pasta',
          'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/Zuhre_Ana_Kozalak_Macunu.webp',
          'Zühre Ana',
        ),
        boy: { barcode: '8681144604990', packedWeightG: 435, packedLengthMm: 80, packedWidthMm: 80, packedHeightMm: 105 },
      }),
      behotrade('Igde cekirdegi pasta', '240 g', 240, 'Igde cekirdegi pasta 240gr', 2, 8, {
        nameTr: 'İğde Çekirdeği Macunu',
        nameFr: 'Pâte aux noyaux d’olivier de Bohême',
        nameDe: 'Paste aus Ölweidenkernen',
        descriptionFromLabel: true,
        description: {
          tr: 'Zühre Ana iğde çekirdeği macunu. Keçiboynuzu pekmezi ve bal katkılı; iğde çekirdeği tozu (%32), kalsiyum ve D3 vitamini içerir. Tavuk kaynaklı kolajen ve yumurta kabuğu tozu içerir. Türkiye ürünü. Ürün içeriğine alerjisi olanlar doktora danışmalıdır.',
          fr: "Pâte Zühre Ana aux noyaux d'olivier de Bohême, avec mélasse de caroube et miel ; contient de la poudre de noyaux d'olivier de Bohême (32 %), du calcium et de la vitamine D3. Contient du collagène de poulet et de la poudre de coquille d'œuf. Produit de Turquie. Les personnes allergiques à l'un des ingrédients doivent consulter un médecin.",
          de: 'Zühre Ana Ölweidenkern-Paste mit Johannisbrotmelasse und Honig; enthält Ölweidenkernpulver (32 %), Calcium und Vitamin D3. Enthält Kollagen aus Huhn und Eierschalenpulver. Hergestellt in der Türkei. Personen mit Allergien gegen einen der Inhaltsstoffe sollten einen Arzt konsultieren.',
        },
        ingredients: {
          tr: 'Keçiboynuzu pekmezi, iğde çekirdeği tozu (%32), akgünlük, kalsiyum glukonat, **yumurta** kabuğu tozu, çiçek balı, kolajen peptit (tip 2, tavuk kaynaklı), D3 vitamini preparatı (maltodekstrin, kolekalsiferol).',
          fr: "Mélasse de caroube, poudre de noyaux d'olivier de Bohême (32 %), encens (oliban), gluconate de calcium, poudre de coquille d'**œuf**, miel de fleurs, peptides de collagène (type 2, d'origine poulet), préparation de vitamine D3 (maltodextrine, cholécalciférol).",
          de: 'Johannisbrotmelasse, Ölweidenkernpulver (32 %), Weihrauch, Calciumgluconat, **Eier**schalenpulver, Blütenhonig, Kollagenpeptide (Typ 2, aus Huhn), Vitamin-D3-Zubereitung (Maltodextrin, Cholecalciferol).',
        },
        nutrition: kunye(1490, 350, 0.24, 0.16, 88.59, 40.92, 0, 0),
        allergens: ['yumurta'],
        storage: {
          tr: 'Güneş ışığından uzak tutunuz. Serin ve kuru yerde muhafaza ediniz. Çocukların ulaşamayacağı yerde ve kendi ambalajı içerisinde saklayınız.',
          fr: "Tenir à l'abri de la lumière du soleil. Conserver dans un endroit frais et sec. Conserver hors de portée des enfants et dans son emballage d'origine.",
          de: 'Vor Sonnenlicht schützen. Kühl und trocken lagern. Außerhalb der Reichweite von Kindern und in der Originalverpackung aufbewahren.',
        },
        image: magaza(
          'igde-cekirdegi-pasta',
          'https://cdn.shopify.com/s/files/1/0851/8153/0446/files/ZuhreAnaIgdeCekirdegiMacunu.webp',
          'Zühre Ana',
        ),
        boy: { barcode: '8683655363427', packedWeightG: 420, packedLengthMm: 105, packedWidthMm: 75, packedHeightMm: 75 },
      }),
      behotrade('Zwarte moerbei extrat', '670 g', 670, 'Zwarte moerbei extrat 670gr', 12, 7.25, {
        nameTr: 'Karadut Özü',
        nameFr: 'Extrait de mûrier noir',
        nameDe: 'Schwarzer Maulbeerextrakt',
        descriptionFromLabel: true,
        description: {
          tr: 'Zühre Ana karadut özü. 1+5 oranında suyla sulanabilir (damak tadına göre artırılıp azaltılabilir). Şeker meyvenin kendi şekeridir, ilave şeker eklenmemiştir. Kıvam artırıcı içermez.',
          fr: "Extrait de mûrier noir Zühre Ana. Peut être dilué dans un rapport de 1+5 avec de l'eau (selon votre goût). Le sucre contenu provient du fruit lui-même, aucun sucre n'est ajouté. Ne contient pas d'épaississants.",
          de: 'Zühre Ana Schwarzer Maulbeer-Extrakt. Kann im Verhältnis 1+5 mit Wasser verdünnt werden (je nach Geschmack mehr oder weniger). Der Zucker stammt aus der Frucht selbst, es wird kein zusätzlicher Zucker zugesetzt. Enthält keine Verdickungsmittel.',
        },
        ingredients: { tr: 'Karadut özü.', fr: 'Extrait de mûrier noir.', de: 'Schwarzer Maulbeer Extrakt.' },
        nutrition: kunye(896, 214.1, 0.3, 0.12, 51.2, 37.16, 1.92, 0.03),
        allergens: [],
        storage: {
          tr: 'Güneş ışığından uzak, serin ve kuru, kendi ambalajı içerisinde saklayınız.',
          fr: "Conserver dans son emballage d'origine, dans un endroit frais et sec, à l'abri de la lumière du soleil.",
          de: 'In der Originalverpackung an einem kühlen, trockenen und vor Sonnenlicht geschützten Ort aufbewahren.',
        },
        ...studyoSeti('zwarte-moerbei-extrat', 2),
        boy: { barcode: '8683655363151', packedWeightG: 1040, packedLengthMm: 290, packedWidthMm: 60, packedHeightMm: 60 },
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
        ...studyoSeti('pestil-muska', 2),
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
        descriptionFromLabel: true,
        description: {
          tr: 'Şifamix kurutulmuş elma dilimleri.',
          fr: 'Rondelles de pommes séchées Şifamix.',
          de: 'Şifamix getrocknete Apfelringe.',
        },
        ingredients: { tr: 'Kurutulmuş elma.', fr: 'Pomme séchée.', de: 'Getrockneter Apfel.' },
        nutrition: kunye(1736, 415, 0.3, 0, 65.3, 57.2, 1.3, 0),
        // Saklama ve alerjen beyanı ambalajdan HENÜZ okunmadı; yazılmadan ürün satışa çıkamaz.
        boy: { barcode: '8699237145527', packedWeightG: 210, packedLengthMm: 190, packedWidthMm: 130, packedHeightMm: 75 },
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
        ...studyoSeti('gedroogde-meloen', 2),
      }),
    ],
  },
];

/**
 * FATURASIZ taslaklar — ambalajı ve barkodu elimizde olan, ama alış kaydına bağlayamadığımız ürünler.
 * `Purchase`e konulamazlar: fatura satırı adet ve alış fiyatı ister, ikisi de yok. Aday doğarlar;
 * fiyat ve maliyet alış faturası gelince yazılır, o gün kalem faturasının altına taşınır.
 */
export const EK_TASLAKLAR: Array<Omit<Draft, 'variants'> & { variants: DraftSize[] }> = [
  {
    name: 'Lychnos Natürel Sızma Zeytinyağı',
    nameFr: "Huile d'olive vierge extra Lychnos",
    nameDe: 'Lychnos Natives Olivenöl extra',
    rejim: 'raf',
    descriptionFromLabel: true,
    description: {
      tr: "Lychnos natürel sızma zeytinyağı, Koroneiki çeşidi zeytinlerden. Yunanistan'da (Kandiye, Girit) üretilip paketlenmiştir. Doğrudan zeytinden, yalnızca mekanik yöntemlerle elde edilen üstün kalite zeytinyağı.",
      fr: "Huile d'olive vierge extra Lychnos, variété Koroneiki. Produite et conditionnée en Grèce (Héraklion, Crète). Huile d'olive de catégorie supérieure obtenue directement des olives et uniquement par des procédés mécaniques.",
      de: 'Lychnos Natives Olivenöl extra aus der Sorte Koroneiki. In Griechenland hergestellt und abgefüllt (Heraklion, Kreta). Olivenöl der höchsten Güteklasse, direkt aus Oliven ausschließlich mit mechanischen Verfahren gewonnen.',
    },
    ingredients: { tr: 'Natürel sızma zeytinyağı.', fr: "Huile d'olive vierge extra.", de: 'Natives Olivenöl extra.' },
    nutrition: kunye(3700, 900, 92, 13, 0, 0, 0, 0),
    allergens: [],
    storage: {
      tr: 'Serin (en fazla 25 °C) ve ışıktan korunan bir yerde saklayınız. Buzdolabına koymayınız.',
      fr: "À conserver au frais (max. 25 °C) et à l'abri de la lumière. Ne pas réfrigérer.",
      de: 'Bitte kühl (max. 25 °C) und lichtgeschützt aufbewahren. Nicht kühlen.',
    },
    variants: [{ label: '5 l', netQuantity: 5000, barcode: '5200106450180' }],
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

/* ─── KATMAN 3 · UYDURMA ─────────────────────────────────────────────────────────────────────────
 * Bu bloklar yalnız test sunucusunun ekranlarını doldurur: `--layers=3` olmadan yazılmaz, gerçek değerler
 * tedarikçinin künyesinden gelir ve üretim kurulumundan önce blok bütün hâlinde silinir. Anahtar faturadaki addır
 * (`Draft.name`) ki katalog adı düzeltilse de eşleşme kaymasın.
 */

/** UYDURMA boy — faturası gramaj yazmayan tek boylu taslağın; boysuz ürün müşteriye miktarsız görünür. */
export const FICTION_SIZES: Record<string, { label: string; netQuantity: number }> = {
  'Gedroogde perzik': { label: '200 g', netQuantity: 200 },
};

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
  Pistache: besin(562, 45, 5.6, 16, 7.7, 20, 0.01),
  'Propolis pasta': besin(330, 1.5, 0.4, 74, 65, 2.5, 0.05),
  'Pestil met Hazinoten Muska': besin(390, 12, 1.2, 62, 48, 6, 0.05),
  'Gedroogde aronya': besin(320, 1.5, 0.2, 66, 48, 3, 0.02),
  'Gedroogde Kaki cips': besin(290, 0.5, 0.1, 68, 55, 1.5, 0.02),
  'Gedroogde perzik': besin(240, 0.6, 0.1, 55, 42, 3, 0.02),
  'Gedroogde meloen': besin(310, 0.3, 0.1, 74, 66, 1, 0.05),
};

/**
 * UYDURMA alerjen beyanı — beyansız ürün satışa çıkamadığı için katman 3'te satışa çıkan her taslağın kaydı var; boş liste
 * "alerjen içermez" beyanıdır. Değer içindekiler metnindeki alerjenden türer (sirke ve kuru meyvede sülfit), metinde olmayan yazılmaz.
 */
export const FICTION_ALLERGENS: Record<string, ProductAllergen[]> = {
  'Pestil met Hazinoten Muska': ['sert_kabuklu', 'gluten'],
  'LEZZA Manti with Minced Meat (Kiymali)': ['gluten', 'yumurta'],
  'LEZZA Traditional Meet Doner': ['hardal'],
  'LEZZA Traditional Chicken Doner': ['hardal'],
  'Propolis pasta': [],
  'Dennenappel pasta': [],
  'Gedroogde aronya': ['sulfit'],
  'Gedroogde appel': ['sulfit'],
  'Gedroogde Kaki cips': ['sulfit'],
  'Gedroogde perzik': ['sulfit'],
  'Gedroogde meloen': ['sulfit'],
};

/**
 * UYDURMA içindekiler; ölçülmüş listesi olan iki ürün (Kekre, Propolis) burada yok, katman 1 kazanır.
 * Alerjen `**…**` ile vurgulanır: INCO ister ve ürün sayfası yalnız bu işareti çizer.
 */
export const FICTION_INGREDIENTS: Record<string, UcDil> = {
  'Pestil met Hazinoten Muska': {
    tr: 'Dut pestili (dut, su, **buğday nişastası**), **fındık ezmesi**.',
    fr: 'Pâte de mûre (mûre, eau, **amidon de blé**), **pâte de noisette**.',
    de: 'Maulbeer-Fruchtleder (Maulbeere, Wasser, **Weizenstärke**), **Haselnussmus**.',
  },
  'Gedroogde aronya': { tr: 'Kurutulmuş aronya, **sülfit**.', fr: 'Aronia séchée, **sulfites**.', de: 'Getrocknete Aronia, **Sulfite**.' },
  'Gedroogde Kaki cips': {
    tr: 'Kurutulmuş Trabzon hurması, **sülfit**.',
    fr: 'Kaki séché, **sulfites**.',
    de: 'Getrocknete Kaki, **Sulfite**.',
  },
  'Gedroogde perzik': {
    tr: 'Kurutulmuş şeftali, **sülfit**.',
    fr: 'Pêche séchée, **sulfites**.',
    de: 'Getrockneter Pfirsich, **Sulfite**.',
  },
  'Gedroogde meloen': { tr: 'Kurutulmuş kavun, **sülfit**.', fr: 'Melon séché, **sulfites**.', de: 'Getrocknete Melone, **Sulfite**.' },
  'LEZZA Traditional Meet Doner': {
    tr: 'Dana eti, soğan, baharat karışımı (**hardal**), tuz.',
    fr: 'Viande de bœuf, oignon, mélange d’épices (**moutarde**), sel.',
    de: 'Rindfleisch, Zwiebel, Gewürzmischung (**Senf**), Salz.',
  },
  'LEZZA Traditional Chicken Doner': {
    tr: 'Tavuk eti, soğan, baharat karışımı (**hardal**), tuz.',
    fr: 'Viande de poulet, oignon, mélange d’épices (**moutarde**), sel.',
    de: 'Hähnchenfleisch, Zwiebel, Gewürzmischung (**Senf**), Salz.',
  },
  'LEZZA Manti with Minced Meat (Kiymali)': {
    tr: '**Buğday unu**, su, kıyma, soğan, **yumurta**, tuz.',
    fr: '**Farine de blé**, eau, viande hachée, oignon, **œuf**, sel.',
    de: '**Weizenmehl**, Wasser, Hackfleisch, Zwiebel, **Ei**, Salz.',
  },
};

/** UYDURMA saklama koşulu. Üreticinin künyesinden ölçülmüş olan yedi ürün burada YOK — katman 1 kazanır. */
const KURU_SERIN: UcDil = {
  tr: 'Kuru ve serin yerde, güneş ışığından uzakta saklayınız.',
  fr: 'À conserver au sec et au frais, à l’abri du soleil.',
  de: 'Trocken, kühl und vor Sonnenlicht geschützt lagern.',
};
const DONMUS: UcDil = {
  tr: '-18 °C’de saklayınız; **çözülmüş ürünü yeniden dondurmayınız**.',
  fr: 'À conserver à -18 °C ; **ne pas recongeler après décongélation**.',
  de: 'Bei -18 °C lagern; **nach dem Auftauen nicht wieder einfrieren**.',
};

export const FICTION_STORAGE: Record<string, UcDil> = {
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
