import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryImageService, CategoryService, ProductFamilyService, ProductImageService, ProductService } from '@lezzet/database';
import { PRODUCT_GALLERY_MAX, hasAllLocales } from '@lezzet/types';
import type { LocalizedText, Nutrition, ProductAllergen, ProductStatus } from '@lezzet/types';
import { ambalajAlanlari, olcuHali } from './packing';
import { r2Keys, uploadImageFromUrl } from './shared';
import { BEYAN_DONUK, SAKLAMA, type SaklamaRejimi } from './storage-regime';
import { teklifSkulari } from './supplier-prices';
import { enAz, type Katman } from './tier';

/**
 * Gerçek Lezza kataloğu (`data/lezza-catalog.json`, kaynağın aynası) üzerine kaynakta olmayan alanları
 * (beyan, KDV, raf ömrü, durum) ekleyen sahne. Türetilen her alan addan ve tek yerde çıkar; `extend`
 * katmanı süzgeçler sonuç versin diye seyrek boşluklar serpiştirir.
 */

interface LezzaVariant {
  label: LocalizedText | null;
  netWeightG: number | null;
  portionKind?: 'item' | 'slice' | null;
  /** Paket içi adet (`(12 Pieces)` · `4x80g`). `null` = bildirilmemiş — sıfır DEĞİL. */
  piecesCount: number | null;
  sku: string | null;
  /** Kaynağı API olmayan kalemlerde (basılı katalogdan gelenler) `null`. */
  sourceId: number | null;
  sourceSlug: string | null;
}
/**
 * Üretici spesifikasyonundan GERÇEK yasal beyan — yalnız 6 üründe dolu, ötekilerde `null`.
 * Alanların künyesi ve belgelerin kendi çelişkileri `data/sources/README.md`'de.
 */
interface LezzaDeclarations {
  specDoc: string;
  ingredientsEU: string | null;
  allergens: string[];
  traces: string[];
  nutritionPer100g: Nutrition | null;
  storage: string | null;
  shelfLifeMonths: number | null;
  cookingTips: string | null;
}
interface LezzaProduct {
  slug: string;
  name: LocalizedText;
  sourceLanguage: string;
  category: string | null;
  brand: string | null;
  /** Basılı katalogdan gelen kalemlerde `null` — açıklamanın kaynağı API'ydi, uydurulmaz. */
  description: string | null;
  imageUrls: string[];
  channels: string[];
  declarations: LezzaDeclarations | null;
  variants: LezzaVariant[];
}
interface LezzaCatalog {
  categories: Array<{ key: string; name: LocalizedText; imageUrl: string | null }>;
  products: LezzaProduct[];
}

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data/lezza-catalog.json');
const CEVIRI = join(dirname(fileURLToPath(import.meta.url)), 'data/translations.json');

function readLezzaCatalog(): LezzaCatalog {
  return JSON.parse(readFileSync(DATA, 'utf8')) as LezzaCatalog;
}


/**
 * Ürün adı ve açıklamasının elle yazılmış üç dilli karşılığı (`data/translations.json`); kaynak yalnız
 * İngilizce. Alerjen ve KDV desenleri yine kaynağın İngilizce adına bakar, çevrilmiş ada değil.
 */
interface LezzaCeviri {
  name: LocalizedText;
  description?: LocalizedText;
}

function readCeviriler(): Record<string, LezzaCeviri> {
  const ham = JSON.parse(readFileSync(CEVIRI, 'utf8')) as Record<string, LezzaCeviri | string>;
  // `_not` / `_kapsam` gibi künye alanları veri değil; ayıklanır ki "çevirisi yok" uyarısı onları saymasın.
  return Object.fromEntries(Object.entries(ham).filter(([k, v]) => !k.startsWith('_') && typeof v === 'object')) as Record<string, LezzaCeviri>;
}

/** Addan alerjen tahmini, beyan değil; bir ad birden çok desene uyabilir ve alerjenler birikir. */
const ALERJEN_IPUCLARI: Array<[RegExp, ProductAllergen[]]> = [
  [/b[öo]rek|bagel|pastry|bun|cake|baklava|kunefe|k[üu]nefe|calzone|simit|croissant|pide|lahmacun|pizza|donut|profiterol|tiramisu|cheesecake|waffle|kadayif|kaday[ıi]f|nugget|burger|fillet|wings|crispy|breaded/i, ['gluten']],
  [/cheese|milk|cream|yogurt|yoghurt|butter|latte|tiramisu|cheesecake|ice cream|dondurma|kaymak|mara[şs]|profiterol|s[üu]tla[çc]|tres leches|mousse/i, ['sut']],
  [/walnut|pistachio|hazelnut|almond|nut(?!ella)|f[ıi]st[ıi]k|nutella/i, ['sert_kabuklu']],
  [/egg|yumurta|mayonnaise|tiramisu|profiterol|cake|waffle/i, ['yumurta']],
  [/sesame|simit|tahini|susam/i, ['susam']],
  [/soy|soya|vegan/i, ['soya']],
  [/fish|bal[ıi]k|anchovy|tuna/i, ['balik']],
];

function alerjenTuret(ad: string): ProductAllergen[] {
  const bulunan = new Set<ProductAllergen>();
  for (const [desen, alerjenler] of ALERJEN_IPUCLARI) if (desen.test(ad)) alerjenler.forEach((a) => bulunan.add(a));
  return [...bulunan];
}

/**
 * Spek belgesindeki alerjen adı → yasal enum (çeviri, tahmin değil). Ceviz ve antep fıstığı AB
 * listesinde tek başlıktır (sert kabuklu); yer fıstığı ayrı kalemdir, birleştirilmez.
 */
const SPEK_ALERJEN: Record<string, ProductAllergen> = {
  gluten: 'gluten',
  sut: 'sut',
  yumurta: 'yumurta',
  soya: 'soya',
  susam: 'susam',
  kereviz: 'kereviz',
  ceviz: 'sert_kabuklu',
  'antep fistigi': 'sert_kabuklu',
};

/** Tanınmayan ad beslemeyi durdurur: sessizce düşen bir alerjen, "beyanı tam" görünen eksik bir beyandır. */
function spekAlerjen(liste: string[]): ProductAllergen[] {
  return [
    ...new Set(
      liste.map((a) => {
        const enumDegeri = SPEK_ALERJEN[a.toLowerCase()];
        if (!enumDegeri) throw new Error(`spek alerjeni tanınmadı: "${a}" — SPEK_ALERJEN sözlüğüne ekle`);
        return enumDegeri;
      }),
    ),
  ];
}

/** Spek metni üç dile kopyalanır; makine çevirisi belgenin kendi cümlesi gibi görünmesin diye gömülmez. */
const ucDile = (metin: string): LocalizedText => ({ tr: metin, fr: metin, de: metin });

/**
 * Addan türeyemeyen nadir alerjenler iz (`traces`) olarak dağıtılır ki alerjen süzgeci on dördünde de
 * sonuç versin; "içerir" yazmak gerçek ürüne yanlış beyan olurdu, "bulunabilir" savunulabilir.
 */
const NADIR_IZLER: ProductAllergen[][] = [
  ['yer_fistigi'],
  ['kabuklu'],
  ['sulfit'],
  ['hardal'],
  ['kereviz'],
  ['aci_bakla'],
  ['yumusaka'],
  // Balık addan türemiyor; listede olmasa on dört alerjenden biri veride hiç geçmez.
  ['balik'],
  ['yer_fistigi', 'sert_kabuklu'],
  ['sulfit', 'hardal'],
];

/** Fransa gıda KDV'si %5,5, hazır tüketime yakın kalemler %10; kaynakta oran yok, tahmin yalnız `extend`te. */
const KDV_HAZIR = 10;
const KDV_GIDA = 5.5;
const HAZIR_TUKETIM = /ice cream|dondurma|cup|slice|mono pack/i;

/** Raf ömrü — dondurulmuş ürün uzun, fırın kısa. Kaynakta yok; kategoriden türetiliyor. */
const RAF_OMRU: Record<string, number> = { bakery: 120, dessert: 365, cake: 270, chicken: 365, 'ice-cream': 540, anatolian: 300 };

function besinDegeri(kategori: string | null, i: number): Nutrition {
  // Kategorinin tipik profili + indise bağlı küçük sapma: iki ürün birebir aynı tabloyu
  // göstermesin (ekranda kopyala-yapıştır izlenimi verirdi).
  const taban: Record<string, [number, number, number, number, number]> = {
    // [kcal, yağ, doymuş, karbonhidrat, protein]
    bakery: [285, 12, 5, 35, 8],
    dessert: [420, 21, 8, 52, 6],
    cake: [365, 19, 9, 44, 5],
    chicken: [215, 11, 2, 14, 16],
    'ice-cream': [230, 13, 8, 25, 4],
    anatolian: [180, 9, 2, 20, 5],
  };
  const [kcal, fat, sat, carb, prot] = taban[kategori ?? ''] ?? [300, 14, 6, 38, 7];
  const sapma = (i % 7) - 3; // −3 … +3
  return {
    energyKcal: kcal + sapma * 4,
    energyKj: Math.round((kcal + sapma * 4) * 4.184),
    fatG: Math.max(0, fat + sapma * 0.4),
    saturatedFatG: Math.max(0, sat + sapma * 0.2),
    carbohydrateG: Math.max(0, carb + sapma),
    sugarsG: Math.max(0, Math.round(carb * 0.45)),
    proteinG: Math.max(0, prot + sapma * 0.2),
    saltG: kategori === 'chicken' || kategori === 'bakery' ? 1.1 : 0.25,
  };
}

/** İçindekiler metni — alerjen listesiyle TUTARLI kurulur; `**vurgu**` alerjeni işaretler. */
function icindekiler(alerjenler: ProductAllergen[]): LocalizedText {
  const tr = ['Un', 'su', 'tuz'];
  const fr = ['Farine', 'eau', 'sel'];
  const de = ['Mehl', 'Wasser', 'Salz'];
  if (alerjenler.includes('gluten')) {
    tr[0] = '**Buğday unu**';
    fr[0] = '**Farine de blé**';
    de[0] = '**Weizenmehl**';
  }
  if (alerjenler.includes('sut')) {
    tr.push('**süt**');
    fr.push('**lait**');
    de.push('**Milch**');
  }
  if (alerjenler.includes('yumurta')) {
    tr.push('**yumurta**');
    fr.push('**œuf**');
    de.push('**Ei**');
  }
  if (alerjenler.includes('sert_kabuklu')) {
    tr.push('**sert kabuklu meyve**');
    fr.push('**fruits à coque**');
    de.push('**Schalenfrüchte**');
  }
  if (alerjenler.includes('susam')) {
    tr.push('**susam**');
    fr.push('**sésame**');
    de.push('**Sesam**');
  }
  return { tr: `${tr.join(', ')}, şeker.`, fr: `${fr.join(', ')}, sucre.`, de: `${de.join(', ')}, Zucker.` };
}

/**
 * Kategori fotoğrafları elle seçildi: ilki kapak, kalanı günlük döndürülen havuz. Seçim üreteçte değil
 * burada, çünkü `pnpm lezza:catalog` üretecin çıktısını her koşuda yeniden yazar.
 */
const KATEGORI_GORSELLERI: Record<string, string[]> = {
  bakery: [
    'Cheese-Pastry-Su-Borek-2500g.webp',
    'Cheese-Rolls-Handmade-40g.webp',
    'Kumru-Bagel-140g.webp',
    'Lahmacun-3x180g-01.webp',
    'Mini-Pide-with-Cheese-250g-01.webp',
  ],
  dessert: [
    'Baklava-with-Pistachio-225g.webp',
    'Carrot-Slice-Baklava-1350g.webp',
    'Pistachio-Rolls-Baklava-2000g.webp',
    'Tres-Leches-Raspberry-2000g.webp',
    'Tulumba-Dessert-5000g.webp',
  ],
  cake: [
    'Artisan-Lemon-Cake-90g.webp',
    'Dark-Chocolate-Profiterol-Whole-Cake.webp',
    'Rasperry-CheesCake-165g.webp',
    'Special-Pistachio-Garden-Whole-Cake.webp',
    'tiramisu-145g.webp',
  ],
  anatolian: [
    'Turkish-Ravioli-with-Meat-Manti-1000g.webp',
    'Stuffed-Vine-Leaves-1000g.webp',
    'Vegan-Kibbeh-10-x-70-g.webp',
    'Vegan-Raw-Meatballs-1000g.webp',
    'Spicy-Turkish-Tomato-Dip-1000g.webp',
  ],
  chicken: [
    'Chicken-Tender-Fillet-700g.webp',
    'Crispy-Chicken-Burger-720g.webp',
    'Crispy-Chicken-Nugget-720g.webp',
    'Spicy-Chicken-Tender-Fillet-700g.webp',
    'Spicy-Chicken-Wings-700g.webp',
  ],
  'ice-cream': [
    'MARAS-ICE-CREAM-slice-plain-70g.webp',
    'Maras-Ice-Cream-Cocoa.webp',
    'Maras-Ice-Cream-Pistachio.webp',
    'Maras-Ice-Cream-Plain.webp',
    'Maras-Ice-Cream-Trio-Mix.webp',
  ],
};

/** Seçimler dosya adıyla yazılı, indirme adres ister; harita katalogdan kurulur ki adres değişince seçim tutsun. */
export function lezzaGorselUrlByDosya(): Map<string, string> {
  const harita = new Map<string, string>();
  for (const p of readLezzaCatalog().products) {
    for (const url of p.imageUrls) {
      const ad = url.split('/').pop();
      if (ad && !harita.has(ad)) harita.set(ad, url);
    }
  }
  return harita;
}

/** Kategori altyazıları ilk kurulumun cümlesidir; operatör Katalog ekranından değiştirir, boş olan altyazısız çizilir. */
const KATEGORI_TAGLINE: Record<string, LocalizedText> = {
  bakery: { tr: 'Börekler ve hamur işleri', fr: 'Böreks et pâtisseries', de: 'Börek und Gebäck' },
  dessert: { tr: 'Baklava ve şerbetli tatlılar', fr: 'Baklava et desserts', de: 'Baklava und Süßspeisen' },
  cake: { tr: 'Dilim ve bütün pastalar', fr: 'Gâteaux entiers et parts', de: 'Torten und Stücke' },
  chicken: { tr: 'Pişirmeye hazır tavuk', fr: 'Volaille prête à cuire', de: 'Küchenfertiges Geflügel' },
  'ice-cream': { tr: 'Maraş usulü dondurma', fr: 'Glace façon Maraş', de: 'Eis nach Maraş-Art' },
  anatolian: { tr: 'Sofraya hazır yemekler', fr: 'Plats prêts à servir', de: 'Servierfertige Gerichte' },
};

/**
 * Dondurma her zaman soğuk zincirdir (iş kuralı); öteki kategorilerde `i` ile deterministik dağıtılır ki
 * her kategoride kargolanan ve kargolanmayan kalem bulunsun.
 */
function saklamaRejimi(kategori: string | null, i: number, serpistir: boolean): SaklamaRejimi {
  if (kategori === 'ice-cream') return 'soguk-zincir';
  // Serpiştirme bir sahnedir; gerçek katalogda Lezza'nın ürünleri donuk gelir ve donuk kalır.
  if (!serpistir) return 'donuk';
  // Bölenler kargo dışı payı ~%36'da tutar ve her kategoride iki yönü de doğurur.
  if (i % 7 === 0) return 'soguk-zincir';
  if (i % 8 === 3) return 'sogutulmus';
  if (i % 5 === 2) return 'raf';
  return 'donuk';
}

/**
 * Ürünün satış durumuna tek yerde karar verilir: önce satılabilir olmayı gerektiren sebepler, sonra
 * katman, sonra kusurlar. Aile üyesi aday olamaz: yarım çeşit bloğu bozuk raftır.
 */
function satilabilirDurum(o: {
  /** Seçimle aday işaretlenmiş: teklif de aile üyeliği de bu kararı ezmez. */
  aday: boolean;
  teklifli: boolean;
  kurguda: boolean;
  zayifVeri: boolean;
  aileli: boolean;
  kusurlu: boolean;
  /** Üç dil ya da yasal beyan eksikse ürün yayınlanamaz (`product_publish_requires_all_locales`). */
  yayinaHazirDegil: boolean;
  i: number;
}): ProductStatus {
  if (o.aday) return 'candidate';
  // Alış fiyatı olan ya da satış kurgusuna giren ürün satıştadır; metni eksikse kısıt reddettiği için aday kalır.
  if (o.teklifli || o.kurguda) return o.yayinaHazirDegil ? 'candidate' : 'active';
  // Görseli, açıklaması ya da çevirisi olmayan ürün satışa sunulamaz: pasiftir, aday değil. Yayın
  // kontrolünden önce durur ki pasif hâli yutulmasın.
  if (o.zayifVeri) return 'passive';
  // Metinleri/beyanı eksik olan aday kalır — kısıt onu yayına almazdı zaten.
  if (o.yayinaHazirDegil) return 'candidate';
  // `base`: alış fiyatı olmayan her ürün ADAY. Bitmiş parti ve geri çekme kararı zamanla doğar —
  // ama eksik künye kurulum gününde de eksiktir, o yüzden `passive` yukarıda katmandan bağımsız.
  if (!o.kusurlu) return 'candidate';
  // Aile üyesi satıştadır — künyesi yukarıda. `base`te buraya hiç gelinmiyor (üstteki satır döndü).
  if (o.aileli) return 'active';
  // Ailesiz ürünlerin 7'de biri yine satışta: aday olmak ailesizliğin ZORUNLU sonucu değil, bir
  // assortiman kararı. Hepsi aday olsaydı "ailesiz = satılmıyor" gibi okunan sahte bir kural doğardı.
  if (o.i % 7 === 0) return 'active';
  return 'candidate';
}

/** Faturadaki varyantlar; değer, satış biriminin faturaya göre düzeltilmiş etiketi ve gramajıdır. */
export interface LezzaSecim {
  variants: ReadonlyMap<string, { label?: LocalizedText; netWeightG?: number; piecesCount?: number }>;
  /**
   * Belgesiz ürünün beyanı türetilsin mi — `extend`in türetmesi, ama onun sahnelediği kusurlar (aday ve
   * pasif sahnesi, serpiştirilmiş saklama rejimi, eksik dil) olmadan: gerçek kataloğa kusur yazılmaz.
   */
  derive?: boolean;
  /** Bu kodları taşıyan ürün, teklifte alış fiyatı olsa da ADAY doğar: satışa açmak işletmecinin kararı. */
  candidates?: ReadonlySet<string>;
}

/** Kataloğu kurar; çağıran servisleri ve başlangıç sırasını verir, sonuç sayıları döner. */
export async function seedLezzaProducts(
  categories: CategoryService,
  categoryImages: CategoryImageService,
  products: ProductService,
  images: ProductImageService,
  families: ProductFamilyService,
  catId: Map<string, string>,
  startOrder: number,
  /**
   * Satış kurgusuna girmiş ürünler (paket, tarif, koleksiyon); aday seçimi bunları atlar. Listeler
   * `catalog.ts` ve `recipe.ts`'te kalır, kopyalanmaz.
   */
  kurgu: { sku: ReadonlySet<string>; slug: ReadonlySet<string> },
  /** Besleme katmanı — `base` kusursuz katalog kurar (künye `tier.ts` ve `kusurlu` satırında). */
  katman: Katman,
  /** Verilirse yalnız seçilen varyantlar, onları taşıyan ürünler ve kategorileri kurulur (`seed-real.ts`). */
  secim?: LezzaSecim,
): Promise<{ made: number; photos: number; variants: number; families: number }> {
  /** Bilinçli boşluklar (pasif · aday · beyansız · kapaksız · çevirisi yarım) `extend`ten itibaren. */
  const kusurlu = enAz(katman, 'extend');
  /**
   * `base` hiçbir alanı türetmez: addan alerjen, kategoriden besin künyesi ya da addan KDV üretimde
   * yanlış yasal beyan olurdu. Belgesi olan ürünlerin beyanı gerçektir ve her katmanda yazılır.
   */
  const turetmeSerbest = kusurlu || Boolean(secim?.derive);
  if (!turetmeSerbest) console.log('  · türetilmiş alan YAZILMAYACAK: alerjen · iz · içindekiler · saklama · besin künyesi · raf ömrü · KDV tahmini · hedef marj. Belgesi olan 6 ürün etkilenmez.');
  const katalog = readLezzaCatalog();
  const secili = (sku: string | number | null | undefined): boolean => !secim || (sku != null && secim.variants.has(String(sku)));
  /** Aile bağı ÜRÜNLER KURULDUKTAN SONRA yazılır: bağ iki ucun da var olmasını ister. */
  const urunIdBySlug = new Map<string, string>();

  // Kategoriler yalnız kaynaktan kurulur; vitrin ızgarası altı slot olduğu için sondakiler vitrin dışı kalır.
  const sonKategoriler = katalog.categories.length - 1;
  const gorselUrl = lezzaGorselUrlByDosya();
  for (const [k, c] of katalog.categories.entries()) {
    if (catId.has(c.key)) continue;
    if (secim && !katalog.products.some((p) => p.category === c.key && p.variants.some((v) => secili(v.sku)))) continue;
    const vitrinDisi = k >= sonKategoriler - 1; // ızgara 6 slot; ikisi dışarıda kalsın
    // `create` girdisi bilinçli dar (ad + sıra); tagline ve vitrin işareti update ile — aile
    // bağının `products.update` emsali. Tek çağrıda: ikisi de aynı ilk-kurulum kararının parçası.
    const created = await categories.create({ name: c.name });
    await categories.update({
      id: created.id,
      tagline: KATEGORI_TAGLINE[c.key] ?? null,
      isFeatured: !vitrinDisi,
    });
    catId.set(c.key, created.id);

    // İlk fotoğraf kapak, kalanı havuz; R2 ayarsızsa kare atlanır, besleme durmaz.
    let havuzSirasi = 0;
    for (const [n, dosya] of (KATEGORI_GORSELLERI[c.key] ?? []).entries()) {
      const url = gorselUrl.get(dosya);
      if (!url) {
        console.log(`  ⚠ ${c.key} — "${dosya}" katalogda yok; kare atlandı`);
        continue;
      }
      const gorsel = await uploadImageFromUrl(
        url,
        n === 0 ? r2Keys.categoryImage(created.slug, dosya) : r2Keys.categoryGalleryImage(created.slug, `${n + 1}`, dosya),
      );
      if (!gorsel) continue;
      if (n === 0) {
        await categories.update({ id: created.id, ...gorsel });
      } else {
        await categoryImages.insert({ categoryId: created.id, sortOrder: havuzSirasi, ...gorsel });
        havuzSirasi += 1;
      }
    }
  }

  // Pasif kategori ayrı bir kayıt: gerçek bir kategoriyi kapatmak ürünlerini de vitrinden düşürürdü.
  // Kaynakta olmadığı için `base`te yazılmaz.
  if (kusurlu) {
    const sezonluk = await categories.create({
      name: { tr: 'Ramazan Sofrası', fr: 'Table du Ramadan', de: 'Ramadan-Tafel' },
    });
    await categories.update({ id: sezonluk.id, isActive: false, isFeatured: false });
  }

  let made = 0;
  let photos = 0;
  let varyantSayisi = 0;

  const urunler = katalog.products.filter((p) => p.variants.some((v) => secili(v.sku)));

  const ceviriler = readCeviriler();
  const cevirisizler = urunler.filter((p) => !ceviriler[p.slug]).map((p) => p.slug);
  // Çevirisi olmayan ürün SESSİZ GEÇMEZ: kataloğa yeni bir kalem girdiğinde ilk kopan yer burasıdır
  // ve kopuş görünmez — ürün üç dile de İngilizce adıyla düşer, hiçbir sayaç bunu eksik saymaz.
  if (cevirisizler.length > 0) console.log(`  ⚠ çevirisi olmayan ${cevirisizler.length} ürün (İngilizce adıyla kurulacak): ${cevirisizler.join(' · ')}`);

  /** Gerçek alış fiyatı olan SKU'lar — ürünün AKTİF mi ADAY mı doğacağını bu belirliyor (`durum` künyesi). */
  const TEKLIF_SKULARI = teklifSkulari();

  for (const [i, p] of urunler.entries()) {
    // Kaynağın İNGİLİZCE adı — desen eşleştirmeleri (alerjen, KDV) bunun üzerinde çalışır.
    const ad = p.name.tr ?? '';
    const ceviri = ceviriler[p.slug];
    // Belgesi olan üründe beyan belgeden gelir, addan tahmin çalışmaz.
    const beyan = p.declarations;
    // Belgesiz üründe tahmin yalnız `extend`te yazılır; tahmin edilmiş yasal beyan yanlış beyandır.
    const alerjenler = beyan ? spekAlerjen(beyan.allergens) : turetmeSerbest ? alerjenTuret(`${ad} ${p.description ?? ''}`) : [];

    // Serpiştirilen boşluklar yalnız `extend`ten itibaren ve seyrek: `base` açılış günü kataloğudur.
    const dilEksik = kusurlu && i % 41 === 0; // fr/de düşer → "çevirisi tamamlanmamış ürün" hâli
    // Belgesi olan ürünün beyanı süzgeç için silinmez; bu sahneleme değil veri kaybı olurdu.
    const beyanEksik = kusurlu && !beyan && i % 13 === 0; // beyan dörtlüsü boş → "beyan eksik" süzgeci
    const kapaksiz = kusurlu && i % 19 === 0; // görselsiz kayıt → boş kapak durumu

    // Aday stoklanmayacak üründür ve ölçütü alış fiyatıdır; satış kurgusuna giren ürün aday olamaz, yoksa
    // paketi ve tarifi sessizce satılamaz kalır. BEKLEYEN(BACKLOG §2): satış kurguları teklifteki kalemlerden
    // kurulsun.
    const kurguda = kurgu.slug.has(p.slug) || p.variants.some((v) => v.sku && kurgu.sku.has(String(v.sku)));
    const teklifli = p.variants.some((v) => v.sku && TEKLIF_SKULARI.has(String(v.sku)));
    // KÜNYESİ YARIM ÜRÜN — üç sinyal de KAYNAĞIN kendi eksiği, bizim ürettiğimiz bir kusur değil:
    // galeri boş · açıklama yok · çeviri sözlüğünde karşılığı yok. Üçünden biri bile satışa
    // sunmayı engeller (vitrin kartı görselsiz ve dilsiz çizilemez).
    const zayifVeri = p.imageUrls.length === 0 || !p.description || !ceviri;
    // Aile üyeliği aday kararını ezer (künyesi `satilabilirDurum`). Küme `ELLE_AILELER`'den TÜRÜYOR,
    // ikinci bir listeye kopyalanmıyor: aileye bir çeşit eklenince satış durumu da kendiliğinden
    // doğru olsun — iki liste bir gün ayrılsaydı, ayrıldığı gün aile yine yarım kalırdı.
    const aileli = AILE_UYESI_SLUG.has(p.slug);
    // Raf ömrü ve hedef marjı boş ürün ayrı ekran hâlleridir ("veri yok" ≠ "uyarı yok"); yalnız `extend`te.
    const rafOmruYok = kusurlu && i % 31 === 0;
    const marjYok = kusurlu && i % 37 === 0;

    // Saklama rejimi TEK KAYNAK: metin de kargo izni de buradan çıkar, ikisi ayrışamaz.
    // **Beyansız ürün kargolanmaz** ve bu, kolonun yeni varsayılanının (`false`) tam olarak
    // anlatmak istediği şey: beyanı olmayan bir üründe "kargolanabilir mi" sorusunun cevabı
    // "bilmiyoruz"dur ve donuk gıdada bilinmeyen, "evet" değil "hayır" sayılır.
    const rejim = SAKLAMA[saklamaRejimi(p.category ?? null, i, kusurlu)];

    // Görünen ad ve açıklama ÇEVİRİDEN; çeviri yoksa kaynağın İngilizcesine düşülür (yukarıda uyarı
    // basıldı). `dilEksik` sahnesi yalnız TÜRKÇEyi bırakır — operatörün yeni eklediği, henüz
    // çevrilmemiş ürünün gerçek hâli budur ve ürün formundaki "çeviri eksik" uyarısı ancak böyle koşar.
    const tamAd: LocalizedText = ceviri?.name ?? { tr: ad, fr: ad, de: ad };
    const tamAciklama: LocalizedText | null = ceviri?.description ?? (p.description ? { tr: p.description, fr: p.description, de: p.description } : null);
    const name: LocalizedText = dilEksik ? { tr: tamAd.tr } : tamAd;
    const aciklama: LocalizedText | null = tamAciklama ? (dilEksik ? { tr: tamAciklama.tr } : tamAciklama) : null;

    // Kapak GERÇEK görselden; R2 ayarsızsa null döner ve kayıt görselsiz oluşur (graceful).
    const kapakUrl = kapaksiz ? null : p.imageUrls[0];
    const kapak = kapakUrl ? await uploadImageFromUrl(kapakUrl, r2Keys.productImage(p.slug, kapakUrl.split('/').pop() || 'cover.webp')) : null;

    // Yayına hazırlık `has_all_locales` kısıtının TS karşılığıyla ölçülür, elle yeniden yazılmaz.
    const yayinaHazirDegil =
      !hasAllLocales(name) || !hasAllLocales(aciklama) || beyanEksik || (!beyan && !turetmeSerbest);
    const aday = p.variants.some((v) => v.sku != null && Boolean(secim?.candidates?.has(String(v.sku))));
    const durum: ProductStatus = satilabilirDurum({ aday, teklifli, kurguda, zayifVeri, aileli, kusurlu, yayinaHazirDegil, i });

    const { product, variants } = await products.create({
      name,
      description: aciklama,
      categoryId: catId.get(p.category ?? '') ?? null,
      // Anahtar + sürüm + ölçü birlikte (künyeden — `shared.ts`); kapaksız üründe alanlar yazılmaz.
      ...kapak,
      allergens: beyanEksik ? [] : alerjenler,
      // Ürünün zaten içerdiği alerjen ize yazılmaz; belgesi olan üründe iz de belgeden gelir.
      traces: beyan
        ? spekAlerjen(beyan.traces).filter((a) => !alerjenler.includes(a))
        : beyanEksik || !turetmeSerbest
          ? []
          : (NADIR_IZLER[i % NADIR_IZLER.length] ?? []).filter((a) => !alerjenler.includes(a)),
      ingredients: beyan?.ingredientsEU ? ucDile(beyan.ingredientsEU) : beyanEksik || !turetmeSerbest ? null : icindekiler(alerjenler),
      // Hazırlama önerisi varsa saklama metnine EKLENİR: kolon zaten ikisini birden taşıyor
      // ("saklama/hazırlama metni") ve belgede ayrı duran iki cümlenin ekranda ayrı yeri yok.
      storageInstructions: beyan?.storage
        ? ucDile(beyan.cookingTips ? `${beyan.storage} ${beyan.cookingTips}` : beyan.storage)
        : beyanEksik || !turetmeSerbest
          ? null
          : rejim.metin,
      nutrition: beyan?.nutritionPer100g ?? (beyanEksik || !turetmeSerbest ? null : besinDegeri(p.category, i)),
      // Vergi sınıflandırması tahmin edilmez; türetme kapalıyken kolonun varsayılanı (%5,5) geçerlidir.
      vatRate: turetmeSerbest ? (HAZIR_TUKETIM.test(ad) ? KDV_HAZIR : KDV_GIDA) : undefined,
      // Raf ömrü belgede AY cinsinden; kolon gün tutuyor. Boşluk (`rafOmruYok`) gerçek veriyi
      // silmemek için burada da devre dışı — gerekçesi `beyanEksik` satırının aynısı.
      shelfLifeDays: beyan?.shelfLifeMonths
        ? beyan.shelfLifeMonths * 30
        : rafOmruYok || !turetmeSerbest
          ? undefined
          : (RAF_OMRU[p.category ?? ''] ?? 180),
      // Kargo izni saklama rejiminden türer; belgesi olan üründe "-18°C" cümlesi tahmini yener.
      shippable: beyan?.storage ? !BEYAN_DONUK.test(beyan.storage) : beyanEksik || !turetmeSerbest ? false : rejim.shippable,
      // Belge tahmini yener; belgesiz üründe `base` alanı yazmaz, kolonun güvenli varsayılanı (`frozen`) kalır.
      storageType: beyan?.storage
        ? BEYAN_DONUK.test(beyan.storage)
          ? 'frozen'
          : undefined
        : turetmeSerbest
          ? rejim.storageType
          : undefined,
      // Hedef marj ve otomatik fiyat beyan değil fiyat KARARIDIR: türetilmez, yalnız sahnede serpiştirilir.
      targetMarginPercent: marjYok || !kusurlu ? undefined : 30 + (i % 6) * 3,
      autoPrice: kusurlu && i % 4 === 0,
      status: durum,
      sortOrder: startOrder + i,
      variants: p.variants
        .filter((v) => secili(v.sku))
        .map((v) => ({ ...v, ...(secim && v.sku != null ? secim.variants.get(String(v.sku)) : undefined) }))
        .map((v, n) => ({
        // Boysuz ürün tek varsayılan varyant taşır — modelin kendi kuralı.
        label: v.label ?? { tr: 'Tek boy', fr: 'Taille unique', de: 'Einheitsgröße' },
        // Gramajsız varyant gerçek bir hâl (operatör boş bırakabilir); yalnız `extend`te ve aday üründe
        // sahnelenir ki vitrine fiyatsız kart düşmesin.
        netWeightG: kusurlu && durum === 'candidate' && i % 37 === 0 && n === 0 ? undefined : (v.netWeightG ?? undefined),
        piecesCount: v.piecesCount ?? undefined,
        portionKind: v.portionKind ?? undefined,
        sku: v.sku ?? undefined,
        // Ambalaj ölçüsü net ağırlıktan türetilir (gerçeği tartılmadı); `extend` tam, yarım ve yok
        // hâllerini kurar, `base`te hepsi tam.
        ...ambalajAlanlari(
          kusurlu && durum === 'candidate' && i % 37 === 0 && n === 0 ? null : (v.netWeightG ?? null),
          olcuHali(i + n, kusurlu),
        ),
        // Pasif boy onu taşıyan paketi satıştan düşürür; yalnız çok boylu üründe son boy kapatılır ki
        // ürün satılamaz kalmasın.
        isActive: kusurlu && p.variants.length > 1 && n === p.variants.length - 1 && i % 11 === 0 ? false : undefined,
      })),
    });
    made += 1;
    varyantSayisi += variants.length;

    // Galeri tavanı uygulamanın sabitinden (`PRODUCT_GALLERY_MAX`): form tavanı aşan kaydı kaydedemez.
    for (const [n, url] of p.imageUrls.slice(1, 1 + PRODUCT_GALLERY_MAX).entries()) {
      const gorsel = await uploadImageFromUrl(url, r2Keys.productImage(`${p.slug}-${n + 2}`, url.split('/').pop() || 'g.webp'));
      if (!gorsel) continue;
      await images.insert({ productId: product.id, sortOrder: n, ...gorsel, imageFocalX: 50, imageFocalY: 50, imageZoom: 100 });
      photos += 1;
    }
    urunIdBySlug.set(p.slug, product.id);
  }

  const aileler = await aileleriKur(families, products, urunIdBySlug, secim !== undefined);

  return { made, photos, variants: varyantSayisi, families: aileler };
}

// ── ÜRÜN AİLELERİ ─────────────────────────────────────────────────────────────
// Aileler elle listelenir (`ELLE_AILELER`); dolgu sözlüğü etiketin üç dilli karşılığı için durur.

/**
 * Dolgu adının üç dilli karşılığı. Sözlükte olmayan dolgu üç dile de İngilizcesiyle yazılır, var
 * olmayan bir çeviri varmış gibi görünmez.
 */
const DOLGU_SOZLUK: Record<string, LocalizedText> = {
  cheese: { tr: 'Peynirli', fr: 'Fromage', de: 'Käse' },
  meat: { tr: 'Kıymalı', fr: 'Viande', de: 'Hackfleisch' },
  potato: { tr: 'Patatesli', fr: 'Pomme de terre', de: 'Kartoffel' },
  'spinach & cheese': { tr: 'Ispanaklı peynirli', fr: 'Épinards & fromage', de: 'Spinat & Käse' },
  spinach: { tr: 'Ispanaklı', fr: 'Épinards', de: 'Spinat' },
  walnut: { tr: 'Cevizli', fr: 'Noix', de: 'Walnuss' },
  pistachio: { tr: 'Fıstıklı', fr: 'Pistache', de: 'Pistazie' },
  chocolate: { tr: 'Çikolatalı', fr: 'Chocolat', de: 'Schokolade' },
  olive: { tr: 'Zeytinli', fr: 'Olives', de: 'Oliven' },
  vegetable: { tr: 'Sebzeli', fr: 'Légumes', de: 'Gemüse' },
  // Sıfat-önde ailelerin çeşitleri (kek · cheesecake · dondurma).
  lemon: { tr: 'Limonlu', fr: 'Citron', de: 'Zitrone' },
  mango: { tr: 'Mangolu', fr: 'Mangue', de: 'Mango' },
  strawberry: { tr: 'Çilekli', fr: 'Fraise', de: 'Erdbeere' },
  raspberry: { tr: 'Frambuazlı', fr: 'Framboise', de: 'Himbeere' },
  'toffee caramel': { tr: 'Karamelli', fr: 'Caramel', de: 'Karamell' },
  caramel: { tr: 'Karamelli', fr: 'Caramel', de: 'Karamell' },
  cocoa: { tr: 'Kakaolu', fr: 'Cacao', de: 'Kakao' },
  plain: { tr: 'Sade', fr: 'Nature', de: 'Natur' },
  // ── Baklava çeşitleri ──────────────────────────────────────────────────────
  // Şekil adları ÇEVRİLİR (midye · kare), yer ve tarif adları çevrilMEZ: "Sobiyet" ile "Antep"
  // Fransızcada da Sobiyet ve Antep'tir — çevirmek ürünü tanınmaz yapardı.
  assorted: { tr: 'Karışık', fr: 'Assorti', de: 'Gemischt' },
  mussel: { tr: 'Midye', fr: 'Moule', de: 'Muschel' },
  square: { tr: 'Kare', fr: 'Carré', de: 'Quadrat' },
  sobiyet: { tr: 'Sobiyet', fr: 'Sobiyet', de: 'Sobiyet' },
  antep: { tr: 'Antep', fr: 'Antep', de: 'Antep' },
  'pistachio rolls': { tr: 'Fıstık sarma', fr: 'Roulé pistache', de: 'Pistazienrolle' },
  // ── Künefe · börek · fırın çeşitleri ───────────────────────────────────────
  classic: { tr: 'Klasik', fr: 'Classique', de: 'Klassisch' },
  plated: { tr: 'Tabaklı', fr: 'En assiette', de: 'Mit Teller' },
  special: { tr: 'Özel', fr: 'Spécial', de: 'Spezial' },
  wreathing: { tr: 'Burma', fr: 'Torsadé', de: 'Gedreht' },
  acma: { tr: 'Açma', fr: 'Açma', de: 'Açma' },
  sweet: { tr: 'Tatlı', fr: 'Sucré', de: 'Süß' },
  fermented: { tr: 'Ekşi mayalı', fr: 'Au levain', de: 'Sauerteig' },
  // ── Bütün pasta çeşitleri ──────────────────────────────────────────────────
  'black forest': { tr: 'Kara orman', fr: 'Forêt-Noire', de: 'Schwarzwälder' },
  'dark chocolate': { tr: 'Bitter çikolata', fr: 'Chocolat noir', de: 'Zartbitter' },
  profiterol: { tr: 'Profiterollü', fr: 'Profiterole', de: 'Profiterole' },
  latte: { tr: 'Latte', fr: 'Latte', de: 'Latte' },
  'red velvet': { tr: 'Kırmızı kadife', fr: 'Velours rouge', de: 'Roter Samt' },
  'pistachio garden': { tr: 'Fıstık bahçesi', fr: 'Jardin de pistaches', de: 'Pistaziengarten' },
  tiramisu: { tr: 'Tiramisu', fr: 'Tiramisu', de: 'Tiramisu' },
  // ── Meze ───────────────────────────────────────────────────────────────────
  hummus: { tr: 'Humus', fr: 'Houmous', de: 'Hummus' },
  saksuka: { tr: 'Şakşuka', fr: 'Şakşuka', de: 'Şakşuka' },
  'carrot tarator': { tr: 'Havuç tarator', fr: 'Tarator de carotte', de: 'Karotten-Tarator' },
  'tomato dip': { tr: 'Acılı domates', fr: 'Sauce tomate épicée', de: 'Scharfe Tomatensauce' },
  'eggplant yogurt': { tr: 'Yoğurtlu patlıcan', fr: 'Aubergine au yaourt', de: 'Aubergine mit Joghurt' },
  // ── Tavuk: baharat ve pişirme ekseni ───────────────────────────────────────
  spicy: { tr: 'Acılı', fr: 'Épicé', de: 'Scharf' },
  crispy: { tr: 'Çıtır', fr: 'Croustillant', de: 'Knusprig' },
  'crispy spicy': { tr: 'Çıtır acılı', fr: 'Croustillant épicé', de: 'Knusprig scharf' },
};

function dolguEtiketi(dolgu: string): LocalizedText {
  return DOLGU_SOZLUK[dolgu.toLowerCase()] ?? { tr: dolgu, fr: dolgu, de: dolgu };
}

/**
 * Aileler elle listelenir: addan türetme, adlar çevrilince habersiz dağılırdı. Paket biçimi ve porsiyon
 * çeşit değil boydur, "vegan" da çeşit değil özelliktir; aile olmazlar.
 */
const ELLE_AILELER: Array<{ ad: string; uyeler: Array<{ slug: string; dolgu: string }> }> = [
  // ── FIRIN: dolgu ekseni ────────────────────────────────────────────────────
  {
    ad: 'E Böreği',
    uyeler: [
      { slug: 'e-shaped-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'e-shaped-borek-with-meat', dolgu: 'Meat' },
      { slug: 'e-shaped-borek-with-potato', dolgu: 'Potato' },
      { slug: 'e-shaped-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Çubuk Börek',
    uyeler: [
      { slug: 'stick-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'stick-borek-with-meat', dolgu: 'Meat' },
      { slug: 'stick-borek-with-potato', dolgu: 'Potato' },
      { slug: 'stick-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Gül Böreği',
    uyeler: [
      { slug: 'spiral-rose-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'spiral-rose-borek-with-meat', dolgu: 'Meat' },
      { slug: 'spiral-rose-borek-with-potato', dolgu: 'Potato' },
      { slug: 'spiral-rose-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Kol Böreği',
    uyeler: [
      { slug: 'spiral-pie-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'spiral-pie-borek-with-potato', dolgu: 'Potato' },
      { slug: 'spiral-pie-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Mini Rulo Börek',
    uyeler: [
      { slug: 'mini-roll-borek-with-cheese', dolgu: 'Cheese' },
      { slug: 'mini-roll-borek-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Mini Pide',
    uyeler: [
      { slug: 'mini-pide-with-cheese', dolgu: 'Cheese' },
      { slug: 'mini-pide-with-spinach-cheese', dolgu: 'Spinach & Cheese' },
    ],
  },
  {
    ad: 'Poğaça',
    uyeler: [
      { slug: 'plain-pastry', dolgu: 'Plain' },
      { slug: 'cheese-filled-pastry', dolgu: 'Cheese' },
      { slug: 'potato-filled-pastry', dolgu: 'Potato' },
      { slug: 'olive-filled-pastry', dolgu: 'Olive' },
    ],
  },
  {
    // Açma bir dolgu değil bir hamur biçimi, ama müşterinin gözünde aynı raftaki üç kardeş:
    // sade çörek, peynirli çörek, açma. Seçim ekseni tutarlı — "hangisini alayım" sorusu aynı.
    ad: 'Çörek',
    uyeler: [
      { slug: 'savoury-bun', dolgu: 'Plain' },
      { slug: 'savoury-bun-with-cheese', dolgu: 'Cheese' },
      { slug: 'savoury-bun-acma', dolgu: 'Acma' },
    ],
  },
  {
    ad: 'Simit',
    uyeler: [
      { slug: 'turkish-bagel-simit', dolgu: 'Classic' },
      { slug: 'sweet-turkish-bagel-simit', dolgu: 'Sweet' },
      { slug: 'turkish-fermented-bagel', dolgu: 'Fermented' },
    ],
  },
  {
    ad: 'Kalzone',
    uyeler: [
      { slug: 'cheese-calzone', dolgu: 'Cheese' },
      { slug: 'vegetable-calzone', dolgu: 'Vegetable' },
    ],
  },
  // ── TATLI ──────────────────────────────────────────────────────────────────
  {
    // Günlük baklava çeşitleri; özel baklavalar ayrı ailede.
    ad: 'Baklava',
    uyeler: [
      { slug: 'baklava-with-pistachio', dolgu: 'Pistachio' },
      { slug: 'baklava-with-walnut', dolgu: 'Walnut' },
      { slug: 'chocolate-baklava', dolgu: 'Chocolate' },
      { slug: 'assorted-baklava', dolgu: 'Assorted' },
    ],
  },
  {
    // Özel baklavalar şekil ve tarifle ayrışıyor (sobiyet kaymaklı, midye kıvrımlı, kare dilimli).
    // Klasiklerle aynı blokta gösterilseler seçim on bir kartlık bir listeye dönerdi.
    ad: 'Özel Baklava',
    uyeler: [
      { slug: 'sobiyet-baklava', dolgu: 'Sobiyet' },
      { slug: 'mussel-baklava', dolgu: 'Mussel' },
      { slug: 'special-antep-baklava', dolgu: 'Antep' },
      { slug: 'special-square-baklava', dolgu: 'Square' },
      { slug: 'pistachio-rolls-baklava', dolgu: 'Pistachio Rolls' },
    ],
  },
  {
    ad: 'Soğuk Baklava',
    uyeler: [
      { slug: 'cold-baklava-with-pistachio', dolgu: 'Pistachio' },
      { slug: 'cold-baklava-with-walnut', dolgu: 'Walnut' },
    ],
  },
  {
    // Dökme (bulk) kalemler BİLEREK YOK: onlar toptan paket biçimi, çeşit değil.
    ad: 'Künefe',
    uyeler: [
      { slug: 'kunefe-including-syrup', dolgu: 'Classic' },
      { slug: 'kunefe-with-plate-and-syrup', dolgu: 'Plated' },
      { slug: 'special-kunefe', dolgu: 'Special' },
      { slug: 'wreathing-kunefe-including-syrup', dolgu: 'Wreathing' },
    ],
  },
  {
    // `tres-leches-caramel-cup` YOK: bardak porsiyonu boy eksenidir, çeşit değil.
    ad: 'Tres Leches',
    uyeler: [
      { slug: 'tres-leches-caramel', dolgu: 'Caramel' },
      { slug: 'tres-leches-raspberry', dolgu: 'Raspberry' },
    ],
  },
  // ── PASTA ──────────────────────────────────────────────────────────────────
  {
    ad: 'Artisan Kek',
    uyeler: [
      { slug: 'artisan-lemon-cake', dolgu: 'Lemon' },
      { slug: 'artisan-mango-cake', dolgu: 'Mango' },
      { slug: 'artisan-pistachio-cake', dolgu: 'Pistachio' },
      { slug: 'artisan-strawberry-cake', dolgu: 'Strawberry' },
    ],
  },
  {
    // Bütün pastalar tek ailede: müşteri "hangi bütün pastayı alayım" diye soruyor ve cevabın
    // tamamı burada. Dilim/bardak hâlleri AYRI ürün olarak duruyor — onlar boy değil, farklı
    // bir satış biçimi (kaynak öyle kurmuş) ve çeşit bloğunu kalabalıklaştırırlardı.
    ad: 'Bütün Pasta',
    uyeler: [
      { slug: 'black-forest-whole-cake', dolgu: 'Black Forest' },
      { slug: 'dark-chocolate-whole-cake', dolgu: 'Dark Chocolate' },
      { slug: 'dark-chocolate-profiterol-whole-cake', dolgu: 'Profiterol' },
      { slug: 'latte-whole-cake', dolgu: 'Latte' },
      { slug: 'red-velvet-whole-cake', dolgu: 'Red Velvet' },
      { slug: 'special-pistachio-garden-whole-cake', dolgu: 'Pistachio Garden' },
      { slug: 'tiramisu-whole-cake', dolgu: 'Tiramisu' },
    ],
  },
  // `… Mono Pack` ürünleri aile değil: aynı kekin paket boyudur, ayrı aile olunca aynı kekler iki kez görünür.
  {
    ad: 'Kek Bardağı',
    uyeler: [
      { slug: 'chocolate-cake-cup', dolgu: 'Chocolate' },
      { slug: 'pistachio-cake-cup', dolgu: 'Pistachio' },
      { slug: 'toffee-caramel-cake-cup', dolgu: 'Toffee Caramel' },
    ],
  },
  {
    // `raspberry-cheesecake-cup` ve `lemon-cheesecake-slice` BİLEREK YOK: ikisi de format
    // (boy) ekseni, çeşit değil. `san-sebastian-cheesecake` de yok — o bir çeşit değil ayrı bir
    // tarif, aynı ailede göstermek "limonlu/frambuazlı" seçimini bozardı.
    ad: 'Cheesecake',
    uyeler: [
      { slug: 'lemon-cheesecake', dolgu: 'Lemon' },
      { slug: 'raspberry-cheesecake', dolgu: 'Raspberry' },
    ],
  },
  // ── ANADOLU MUTFAĞI ────────────────────────────────────────────────────────
  {
    // Aynı masada, aynı kullanımda beş meze. Vegan ürünler aile değil: vegan bir özelliktir, çeşit değil.
    ad: 'Meze',
    uyeler: [
      { slug: 'hummus', dolgu: 'Hummus' },
      { slug: 'saksuka', dolgu: 'Saksuka' },
      { slug: 'carrot-tarator', dolgu: 'Carrot Tarator' },
      { slug: 'spicy-turkish-tomato-dip', dolgu: 'Tomato Dip' },
      { slug: 'eggplant-with-yogurt', dolgu: 'Eggplant Yogurt' },
    ],
  },
  // ── TAVUK: baharat ve pişirme ekseni ───────────────────────────────────────
  // Katalogda her kalemin sade ve acılı hâli ayrı ürün. Bu tam olarak bir çeşit eksenidir:
  // müşteri "acılı mı alsam" diye soruyor ve iki kart yan yana durmalı.
  {
    ad: 'Tavuk Fileto',
    uyeler: [
      { slug: 'chicken-tender-fillet', dolgu: 'Plain' },
      { slug: 'spicy-chicken-tender-fillet', dolgu: 'Spicy' },
    ],
  },
  {
    ad: 'Çıtır Tavuk Fileto',
    uyeler: [
      { slug: 'crispy-tender-fillet', dolgu: 'Crispy' },
      { slug: 'crispy-spicy-tender-fillet', dolgu: 'Crispy Spicy' },
    ],
  },
  {
    ad: 'Tavuk Kanat',
    uyeler: [
      { slug: 'crispy-chicken-wings', dolgu: 'Crispy' },
      { slug: 'crispy-spicy-chicken-wings', dolgu: 'Crispy Spicy' },
      { slug: 'spicy-chicken-wings', dolgu: 'Spicy' },
    ],
  },
  // ── DONDURMA ───────────────────────────────────────────────────────────────
  {
    ad: 'Maraş Dondurması',
    uyeler: [
      { slug: 'maras-ice-cream-plain', dolgu: 'Plain' },
      { slug: 'maras-ice-cream-cocoa', dolgu: 'Cocoa' },
      { slug: 'maras-ice-cream-pistachio', dolgu: 'Pistachio' },
    ],
  },
  {
    ad: 'Maraş Dondurma Dilimi',
    uyeler: [
      { slug: 'maras-ice-cream-slice-plain', dolgu: 'Plain' },
      { slug: 'maras-ice-cream-slice-cocoa', dolgu: 'Cocoa' },
      { slug: 'maras-ice-cream-slice-lemon', dolgu: 'Lemon' },
    ],
  },
];

/** Aileye bağlanacak ürünler; süzgeç `aileleriKur`unkiyle aynı kalmalı, yoksa tek üyeli satır "aileli" sayılır. */
const AILE_UYESI_SLUG: ReadonlySet<string> = new Set(
  ELLE_AILELER.filter((a) => a.uyeler.length >= 2).flatMap((a) => a.uyeler.map((u) => u.slug)),
);

/** Aynı tabanı paylaşan iki ya da daha çok ürünü bir aileye bağlar; tek üyeli grup aile sayılmaz. */
async function aileleriKur(
  families: ProductFamilyService,
  products: ProductService,
  urunIdBySlug: Map<string, string>,
  /** Seçimli katalogda aile, kurulan üyeleri iki ve üstündeyse açılır; pasif aile sahnesi de kurulmaz. */
  secimli: boolean,
): Promise<number> {
  // Tek üyeli satır bir yazım hatasıdır ve süzülür.
  const kurulacak = ELLE_AILELER.filter(
    (a) => a.uyeler.length >= 2 && (!secimli || a.uyeler.filter((u) => urunIdBySlug.has(u.slug)).length >= 2),
  );

  // **Üyesi katalogda BULUNAMAYAN satır sessiz geçmez.** Liste elle yazılıyor ve katalog
  // değişebiliyor; tutmayan bir slug o çeşidi ekrandan sessizce düşürür — aile yine kurulur,
  // yalnız bir kartı eksik olur, ki bu ancak sayılırsa fark edilir.
  const eksikler = kurulacak.flatMap((a) => a.uyeler.filter((u) => !urunIdBySlug.has(u.slug)).map((u) => `${a.ad} → ${u.slug}`));
  if (eksikler.length > 0) console.log(`  ⚠ aile üyesi katalogda yok (${eksikler.length}): ${eksikler.join(' · ')}`);

  let kurulan = 0;
  for (const { ad: taban, uyeler } of kurulacak) {
    // Aile adı yalnız operatör gördüğü için tek dillidir. Son aile pasif kurulur ki pasif ailenin çeşit
    // bloğu çizmemesi sınansın.
    const aile = await families.insert({ name: taban, isActive: secimli || kurulan < kurulacak.length - 1 });
    for (const [sira, uye] of uyeler.entries()) {
      const id = urunIdBySlug.get(uye.slug);
      if (!id) continue;
      await products.update({ id, familyId: aile.id, familyLabel: dolguEtiketi(uye.dolgu), familyPosition: sira });
    }
    kurulan += 1;
  }
  return kurulan;
}
