import { BundleService, CategoryService, CollectionService, PriceService, ProductImageService, ProductService } from '@lezzet/database';
import { bundleBalance, rebalanceAllocations } from '@lezzet/domain-core';
import { PRODUCT_GALLERY_MAX, resolveLocalizedText, type LocalizedText, type Nutrition, type ProductAllergen, type ProductStatus } from '@lezzet/types';
import { NOW, euro, r2Keys, uploadImage, type Db } from './shared';
import { seedLezzaProducts } from './catalog-lezza';

// Katalog (05): kategori · ürün · varyant · galeri · koleksiyon.

// ── Katalog: kategori + ürün + varyant (05) ──────────────────────────────────────────────────────

interface SeedVariant {
  /** Müşteriye görünen boy etiketi — çok dilli (0005: `product_variant.label` jsonb). */
  label: LocalizedText;
  netWeightG?: number;
  sku?: string;
  // `minStockQty` BURADA verilmez: ticari zemin bölümü (aşağıda) onu senaryoya göre yazıyor — bir
  // kısmı bilinçli olarak eşiğin altında kalsın diye. İki yerden yazılsaydı sonradan koşan kazanır,
  // buradaki değer hiç görünmezdi (tek sahip kuralı).
}
interface SeedProduct {
  slug: string; // görsel anahtarı için (catalog/products/<slug>.jpeg)
  image: string; // temp/ dosya adı
  category: string; // kategori anahtarı
  name: LocalizedText;
  description?: LocalizedText;
  allergens?: ProductAllergen[];
  traces?: ProductAllergen[];
  /** Yasal beyan metinleri — `**vurgu**` işareti TAŞIR (alerjen listede yazdığı hâliyle vurgulanır). */
  ingredients?: LocalizedText;
  storageInstructions?: LocalizedText;
  nutrition?: Nutrition;
  vatRate?: number;
  shelfLifeDays?: number;
  shippable?: boolean;
  targetMarginPercent?: number;
  autoPrice?: boolean;
  status?: ProductStatus;
  variants?: SeedVariant[];
}

// Kategori görseli anasayfa şeridinde görünür (web 3:2 kart · mobil daire). `image` verilmeyen kategori
// görselsiz durumu örnekler (müşteride ad baş harfiyle çıkar, boş gri kutu çizilmez).
const CATEGORIES = [
  { key: 'baklava', image: '1.jpeg', name: { tr: 'Baklava', fr: 'Baklava', de: 'Baklava' } },
  { key: 'serbetli', image: '3.jpeg', name: { tr: 'Şerbetli Tatlılar', fr: 'Desserts au sirop', de: 'Sirup-Süßspeisen' } },
  { key: 'borek', image: '4.jpeg', name: { tr: 'Börek', fr: 'Böreks', de: 'Börek' } },
  { key: 'malzeme', name: { tr: 'Malzeme', fr: 'Ingrédients', de: 'Zutaten' } },
];

/**
 * Elle yazılan ürünlerde İŞ BÖLÜMÜ (28.07): eskiden bu beş kayıt hem "vitrin örneği" hem "eksik veri
 * örneği" idi ve ikisi birbirini yiyordu — müşteri tarafında açılan her ürünün sekmeleri yarı boştu,
 * çünkü boşluklar operasyonun süzgeçlerini denemek için bilinçli bırakılmıştı.
 *
 * Ayrım artık DURUMA bağlı:
 *   **aktif** kayıtlar (müşteri görür) → BEYAN DÖRTLÜSÜ TAM, üç dil tam, galeri dolu. Vitrin ancak
 *     tam veriyle denenebilir; yarım veriyle "boş görünen sekme mi, bozuk kod mu" ayırt edilemez.
 *   **pasif/aday** kayıtlar (müşteri görmez) → eksik dil / eksik beyan örneği burada yaşar.
 * Toplu üretim (aşağıda) zaten her boşluğu indise göre serpiştiriyor; operasyon süzgeçleri oradan
 * beslenir, vitrin buradan.
 *
 * Çeşitlilik ise ÖZELLİKTE aranır, eksiklikte değil: çok/tek varyant · kargolanır/soğuk zincir ·
 * aktif/pasif/aday · yüksek/düşük KDV · uzun/kısa raf ömrü.
 */
const PRODUCTS: SeedProduct[] = [
  {
    slug: 'fistikli-baklava',
    image: '1.jpeg',
    category: 'baklava',
    name: { tr: 'Fıstıklı Baklava', fr: 'Baklava à la pistache', de: 'Pistazien-Baklava' },
    description: {
      tr: 'Antep fıstığından, ince yufkayla açılmış geleneksel baklava.',
      fr: 'Baklava traditionnel à la pistache d’Antep, pâte fine.',
      de: 'Traditionelles Baklava mit Antep-Pistazien und dünnem Teig.',
    },
    allergens: ['gluten', 'sert_kabuklu', 'sut'],
    traces: ['yer_fistigi'],
    ingredients: {
      tr: 'El açması yufka (**buğday unu**, su, tuz), Antep fıstığı (%28), **tereyağı**, şeker, su, limon suyu.',
      fr: 'Pâte étirée à la main (**farine de blé**, eau, sel), pistaches d’Antep (28 %), **beurre**, sucre, eau, jus de citron.',
      de: 'Handgezogener Teig (**Weizenmehl**, Wasser, Salz), Antep-Pistazien (28 %), **Butter**, Zucker, Wasser, Zitronensaft.',
    },
    storageInstructions: {
      tr: 'Dondurucuda (−18 °C) paket üzerindeki tarihe kadar saklayın. Buzdolabında 4-5 saatte çözünür; çözdükten sonra 3 gün içinde tüketin, **tekrar dondurmayın**.',
      fr: 'À conserver au congélateur (−18 °C) jusqu’à la date indiquée. Décongélation au réfrigérateur en 4-5 h ; à consommer sous 3 jours, **ne pas recongeler**.',
      de: 'Im Gefrierschrank (−18 °C) bis zum angegebenen Datum lagern. Im Kühlschrank in 4-5 Std. auftauen; innerhalb von 3 Tagen verzehren, **nicht wieder einfrieren**.',
    },
    nutrition: { energyKj: 1980, energyKcal: 473, fatG: 27.4, saturatedFatG: 11.2, carbohydrateG: 49.8, sugarsG: 31.5, proteinG: 7.1, saltG: 0.2 },
    shelfLifeDays: 180,
    targetMarginPercent: 42,
    autoPrice: true,
    variants: [
      { label: { tr: '1 kg', fr: '1 kg', de: '1 kg' }, netWeightG: 1000, sku: 'BAK-F-1000' },
      { label: { tr: '500 g', fr: '500 g', de: '500 g' }, netWeightG: 500, sku: 'BAK-F-500' },
    ],
  },
  {
    // AKTİF + kargolanır + TEK varyant — "tek boy" hâlinin tam veriyle görünümü.
    slug: 'cevizli-baklava',
    image: '2.jpeg',
    category: 'baklava',
    name: { tr: 'Cevizli Baklava', fr: 'Baklava aux noix', de: 'Walnuss-Baklava' },
    description: {
      tr: 'İç Anadolu cevizi, kat kat yufka ve az şerbet — fıstıklıya göre daha ağır bir tat.',
      fr: 'Noix d’Anatolie centrale, pâte en couches et sirop léger — un goût plus corsé que la pistache.',
      de: 'Zentralanatolische Walnüsse, Teigschichten und wenig Sirup — kräftiger als die Pistazienvariante.',
    },
    allergens: ['gluten', 'sert_kabuklu', 'sut'],
    traces: ['yer_fistigi'],
    ingredients: {
      tr: 'El açması yufka (**buğday unu**, su, tuz), ceviz (%24), **tereyağı**, şeker, su, limon suyu.',
      fr: 'Pâte étirée à la main (**farine de blé**, eau, sel), noix (24 %), **beurre**, sucre, eau, jus de citron.',
      de: 'Handgezogener Teig (**Weizenmehl**, Wasser, Salz), Walnüsse (24 %), **Butter**, Zucker, Wasser, Zitronensaft.',
    },
    storageInstructions: {
      tr: 'Dondurucuda (−18 °C) paket üzerindeki tarihe kadar saklayın. Buzdolabında 4-5 saatte çözünür; çözdükten sonra 3 gün içinde tüketin, **tekrar dondurmayın**.',
      fr: 'À conserver au congélateur (−18 °C) jusqu’à la date indiquée. Décongélation au réfrigérateur en 4-5 h ; à consommer sous 3 jours, **ne pas recongeler**.',
      de: 'Im Gefrierschrank (−18 °C) bis zum angegebenen Datum lagern. Im Kühlschrank in 4-5 Std. auftauen; innerhalb von 3 Tagen verzehren, **nicht wieder einfrieren**.',
    },
    nutrition: { energyKj: 1925, energyKcal: 460, fatG: 25.8, saturatedFatG: 10.4, carbohydrateG: 51.2, sugarsG: 33.1, proteinG: 6.4, saltG: 0.2 },
    shelfLifeDays: 180,
    targetMarginPercent: 38,
    variants: [{ label: { tr: '1 kg', fr: '1 kg', de: '1 kg' }, netWeightG: 1000, sku: 'BAK-C-1000' }],
  },
  {
    // AKTİF + SOĞUK ZİNCİR + ÇOK varyant — teslimat kısıtı ekranlarının ana denek taşı. Künefe tek
    // başınayken sepete iki FARKLI kısıtlı kalem koyup çoğul hâli denemek mümkün değildi.
    slug: 'kazandibi',
    image: '3.jpeg',
    category: 'serbetli',
    name: { tr: 'Kazandibi', fr: 'Kazandibi', de: 'Kazandibi' },
    description: {
      tr: 'Tabanı bilerek karamelize edilmiş sütlü tatlı; soğuk servis edilir.',
      fr: 'Dessert au lait dont le fond est volontairement caramélisé ; se sert frais.',
      de: 'Milchdessert mit absichtlich karamellisiertem Boden; kalt serviert.',
    },
    allergens: ['sut'],
    traces: ['gluten'],
    ingredients: {
      tr: 'Tam yağlı **süt**, şeker, pirinç unu, buğday nişastası, **tavuk göğsü**, damla sakızı.',
      fr: '**Lait** entier, sucre, farine de riz, amidon de blé, **blanc de poulet**, mastic.',
      de: 'Voll**milch**, Zucker, Reismehl, Weizenstärke, **Hähnchenbrust**, Mastix.',
    },
    storageInstructions: {
      tr: 'Buzdolabında (0-4 °C) saklayın, **dondurmayın**. Teslim tarihinden itibaren 4 gün içinde tüketin.',
      fr: 'À conserver au réfrigérateur (0-4 °C), **ne pas congeler**. À consommer sous 4 jours après la livraison.',
      de: 'Im Kühlschrank (0-4 °C) lagern, **nicht einfrieren**. Innerhalb von 4 Tagen nach Lieferung verzehren.',
    },
    nutrition: { energyKj: 640, energyKcal: 153, fatG: 3.1, saturatedFatG: 1.9, carbohydrateG: 27.4, sugarsG: 19.8, proteinG: 4.2, saltG: 0.1 },
    shelfLifeDays: 4,
    shippable: false,
    targetMarginPercent: 40,
    variants: [
      { label: { tr: '2 kişilik', fr: '2 personnes', de: 'für 2' }, netWeightG: 400, sku: 'SER-KAZ-400' },
      { label: { tr: '6 kişilik tepsi', fr: 'plateau 6 personnes', de: 'Platte für 6' }, netWeightG: 1200, sku: 'SER-KAZ-1200' },
    ],
  },
  {
    // AKTİF + SOĞUK ZİNCİR + tek varyant + kısa raf ömrü.
    slug: 'kunefe',
    image: '4.jpeg',
    category: 'serbetli',
    name: { tr: 'Künefe', fr: 'Künefe', de: 'Künefe' },
    description: {
      tr: 'Tel kadayıf arasında peynir; fırında kızarır, şerbetle servis edilir.',
      fr: 'Fromage entre deux couches de kadayıf, doré au four, servi avec sirop.',
      de: 'Käse zwischen Kadayıf-Fäden, im Ofen gebacken, mit Sirup serviert.',
    },
    allergens: ['gluten', 'sut'],
    traces: ['sert_kabuklu'],
    ingredients: {
      tr: 'Tel kadayıf (**buğday unu**, su), taze **peynir** (%35), **tereyağı**, şeker, su, limon suyu, Antep fıstığı.',
      fr: 'Kadayıf (**farine de blé**, eau), **fromage** frais (35 %), **beurre**, sucre, eau, jus de citron, pistaches d’Antep.',
      de: 'Kadayıf (**Weizenmehl**, Wasser), frischer **Käse** (35 %), **Butter**, Zucker, Wasser, Zitronensaft, Antep-Pistazien.',
    },
    storageInstructions: {
      tr: 'Buzdolabında (0-4 °C) saklayın. Servisten önce 180 °C fırında 12-15 dakika ısıtın, şerbeti sıcakken dökün. **Tekrar ısıtmayın.**',
      fr: 'À conserver au réfrigérateur (0-4 °C). Réchauffer 12-15 min à 180 °C avant de servir, verser le sirop chaud. **Ne pas réchauffer deux fois.**',
      de: 'Im Kühlschrank (0-4 °C) lagern. Vor dem Servieren 12-15 Min. bei 180 °C erhitzen, Sirup heiß darübergeben. **Nicht erneut erwärmen.**',
    },
    nutrition: { energyKj: 1310, energyKcal: 313, fatG: 16.2, saturatedFatG: 9.7, carbohydrateG: 33.9, sugarsG: 24.6, proteinG: 8.8, saltG: 0.6 },
    shelfLifeDays: 3,
    shippable: false,
    targetMarginPercent: 45,
    variants: [{ label: { tr: '2 kişilik', fr: '2 personnes', de: 'für 2' }, netWeightG: 600, sku: 'SER-KUN-600' }],
  },
  {
    // PASİF → müşteri görmez, "eksik dil + eksik beyan" örneği burada yaşar (operasyon süzgeçleri).
    slug: 'su-boregi',
    image: '3.jpeg',
    category: 'borek',
    status: 'passive',
    name: { tr: 'Su Böreği' }, // yalnız TR
    allergens: ['gluten', 'yumurta', 'sut'],
    shelfLifeDays: 5,
    shippable: false, // soğuk zincir → yalnız rota/kapı teslim
    // Etiket YALNIZ TR — varyant editöründeki "eksik dil" noktasını örnekler.
    variants: [{ label: { tr: 'Tepsi' }, netWeightG: 1500, sku: 'BOR-SU-1500' }],
  },
  {
    // ADAY → müşteri görmez; varyantsız (varsayılan varyant otomatik) + yüksek KDV örneği.
    slug: 'antep-fistigi',
    image: '5.jpeg',
    category: 'malzeme',
    status: 'candidate',
    name: { tr: 'Antep Fıstığı' },
    allergens: ['sert_kabuklu'],
    vatRate: 20, // malzeme → %20 (tatlılar %5,5)
    shelfLifeDays: 365,
  },
];

// ── Hacim: GERÇEK katalog (kullanıcı kararı 04.08) ───────────────────────────────────────────────
// Elle yazılanlar VİTRİNİN tam-veri örnekleridir. Hacim ise artık uydurma taban×niteleme çarpımından
// değil, Lezza Foods'un gerçek 141 ürününden geliyor (`catalog-lezza.ts` + `data/lezza-catalog.json`).
// Boşluk örnekleri (eksik dil, beyansız, görselsiz, pasif, aday) orada, SEYREK oranlarla serpiştiriliyor —
// gerçekçilik ile süzgeçlerin denenebilirliği arasındaki denge o dosyanın künyesinde yazılı.

/** Görselleri PAYLAŞILAN anahtarlar: 5 dosya bir kez yüklenir, tüm toplu ürünler bunlara işaret eder. */
const SHARED_IMAGE_FILES = ['1.jpeg', '2.jpeg', '3.jpeg', '4.jpeg', '5.jpeg'];

/** Paylaşılan görselleri bir kez yükler; R2 ayarsızsa boş dizi (kayıtlar görselsiz kurulur). */
async function uploadSharedImages(): Promise<string[]> {
  const keys: string[] = [];
  for (const [i, file] of SHARED_IMAGE_FILES.entries()) {
    const key = await uploadImage(file, r2Keys.productImage(`katalog-ornek-${i + 1}`, file));
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * Ürüne galeri (ek fotoğraf) satırları ekler. Yeni DOSYA yüklenmez — paylaşılan anahtarlara işaret
 * eder; galeri tablosunda önemli olan satırın kendisi, dosyanın tekilliği değil.
 *
 * Kırpma değerleri bilinçli FARKLI: hepsi merkez/zoom-100 olsaydı odak ve zoom'un çerçeveye etkisi
 * ekranda hiç görünmezdi — kırpma editörünün doğru çalıştığı ancak farklı değerlerle anlaşılır.
 * `sortOrder` açıkça verilir → servisin sona-ekleme sayımı seed'de gereksiz sorgu doğurmaz.
 */
async function seedGallery(images: ProductImageService, productId: string, keys: string[], count: number, offset: number): Promise<number> {
  if (keys.length === 0) return 0;
  for (let n = 0; n < count; n += 1) {
    const step = offset + n;
    await images.insert({
      productId,
      imageKey: keys[step % keys.length]!,
      sortOrder: n,
      imageUpdatedAt: NOW,
      imageFocalX: 20 + (step % 5) * 15, // 20·35·50·65·80
      imageFocalY: 20 + ((step * 2) % 5) * 15,
      imageZoom: 100 + (step % 3) * 50, // 100·150·200
    });
  }
  return count;
}

/**
 * Elle yazılmış ürünlerin galeri sayıları — `PRODUCTS` ile AYNI SIRADA.
 * Aktif (vitrine düşen) dördü dolu: müşteri galerisi ancak birden fazla fotoğrafla denenebilir.
 * Boş galeri örneği pasif kayda düşer — orada eksiklik zaten kasıtlı.
 * [fıstıklı, cevizli, kazandibi, künefe, su böreği(pasif), antep fıstığı(aday)]
 */
const HAND_GALLERY_COUNTS = [PRODUCT_GALLERY_MAX, 3, 4, 2, 0, 1];

export async function seedCatalog(db: Db): Promise<void> {
  const products = new ProductService(db);
  if ((await products.listAll()).length > 0) {
    console.log('▸ katalog zaten dolu — atlandı');
    return;
  }

  console.log('▸ KATALOG seed');
  const images = new ProductImageService(db);
  // Paylaşılan görseller EN BAŞTA yüklenir: hem toplu ürünlerin kapağı hem de tüm galeriler bunlara
  // işaret eder (yükleme sayısı 5'te kalır, ürün sayısıyla artmaz).
  const sharedKeys = await uploadSharedImages();
  const categories = new CategoryService(db);
  const catId = new Map<string, string>();
  for (const c of CATEGORIES) {
    const created = await categories.create({ name: c.name });
    catId.set(c.key, created.id);
    if (c.image) {
      const key = await uploadImage(c.image, r2Keys.categoryImage(created.slug, c.image));
      if (key) await categories.setImageKey(created.id, key);
    }
  }

  for (const [i, p] of PRODUCTS.entries()) {
    const imageKey = await uploadImage(p.image, r2Keys.productImage(p.slug, p.image));
    const { product, variants } = await products.create({
      name: p.name,
      description: p.description ?? null,
      categoryId: catId.get(p.category) ?? null,
      imageKey,
      imageUpdatedAt: imageKey ? NOW : null, // sürüm damgası (bkz. seedBulkProducts)
      allergens: p.allergens,
      traces: p.traces ?? [],
      ingredients: p.ingredients ?? null,
      storageInstructions: p.storageInstructions ?? null,
      nutrition: p.nutrition ?? null,
      vatRate: p.vatRate,
      shelfLifeDays: p.shelfLifeDays,
      shippable: p.shippable,
      targetMarginPercent: p.targetMarginPercent,
      autoPrice: p.autoPrice,
      status: p.status ?? 'active',
      sortOrder: i, // elle yazılanlar listenin BAŞINDA dursun (durum örnekleri kolay bulunsun)
      variants: p.variants,
    });
    const gallery = await seedGallery(images, product.id, sharedKeys, HAND_GALLERY_COUNTS[i] ?? 0, i);
    console.log(
      `  ✓ ${resolveLocalizedText(product.name)} · ${variants.length} varyant · görsel: ${imageKey ?? 'yok (R2 ayarsız)'} · galeri: ${gallery}`,
    );
  }

  // GERÇEK katalog (kullanıcı kararı 04.08): uydurulmuş 69 ürünün yerine Lezza Foods'un 141 ürünü.
  // Hacim gerekçesi aynı kalıyor — sayfalama ve sonsuz kaydırma ancak birkaç sayfa dolunca
  // denenebilir — ama artık gerçek adlar, gerçek görseller ve gerçek boy/kanal dağılımıyla.
  const lezza = await seedLezzaProducts(categories, products, images, catId, PRODUCTS.length);
  console.log(`  ✓ ${lezza.made} Lezza ürünü · ${lezza.variants} varyant · ${lezza.photos} galeri fotoğrafı`);
  console.log(`✓ katalog: ${catId.size} kategori, ${PRODUCTS.length + lezza.made} ürün`);
}

// ── Koleksiyon + üyelik (05) ─────────────────────────────────────────────────────────────────────

interface SeedCollection {
  slug: string; // paylaşım linki — admin belirler (servis benzersizleştirir)
  name: LocalizedText;
  description?: LocalizedText;
  image?: string; // temp/ dosya adı (kapak; OG kartı görseli)
  isActive?: boolean;
  /** Ürün slug'ları — DİZİNİN SIRASI vitrin kürasyon sırasıdır (position). */
  products: string[];
}

// Bilinçli çeşitlilik: dolu+kapaklı, kapaksız, pasif (taslak kampanya) ve BOŞ koleksiyon
// (design/pages/admin-urunler.md §4: "Boş kategoriler/koleksiyonlar var olabilir").
const COLLECTIONS: SeedCollection[] = [
  {
    slug: 'bayram-sofrasi',
    name: { tr: 'Bayram Sofrası', fr: 'Table de fête', de: 'Festtafel' },
    description: {
      tr: 'Bayramda ikram edilecek klasikler — fıstıklı baklavadan künefeye.',
      fr: 'Les classiques à offrir pour les fêtes — du baklava à la pistache au künefe.',
      de: 'Klassiker für die Festtage — von Pistazien-Baklava bis Künefe.',
    },
    image: '1.jpeg',
    products: ['fistikli-baklava', 'kunefe', 'cevizli-baklava', 'kazandibi'], // kürasyon sırası
  },
  {
    slug: 'yeni-gelenler',
    name: { tr: 'Yeni Gelenler', fr: 'Nouveautés', de: 'Neuheiten' },
    description: {
      tr: 'Kataloğa yeni eklenenler.',
      fr: 'Derniers ajouts au catalogue.',
      de: 'Neu im Katalog.',
    },
    image: '4.jpeg',
    // `su-boregi` PASİF: aktif bir koleksiyonun içinde pasif üye durumunu örnekler — vitrin onu
    // elemeli, operasyon listesi göstermeli.
    products: ['kazandibi', 'kunefe', 'su-boregi'],
  },
  {
    slug: 'indirimde',
    name: { tr: 'İndirimde', fr: 'En promotion', de: 'Im Angebot' },
    isActive: false, // taslak kampanya — hazırlanıyor, vitrinde yok (açıklama/kapak henüz yok)
    products: ['cevizli-baklava'],
  },
  {
    slug: 'hediyelik',
    name: { tr: 'Hediyelik', fr: 'Idées cadeaux', de: 'Geschenkideen' },
    description: { tr: 'Hediye paketiyle gönderilebilecek seçkiler.' }, // yalnız TR — eksik dil örneği
    products: [], // boş koleksiyon örneği
  },
];

export async function seedCollections(db: Db): Promise<void> {
  const collections = new CollectionService(db);
  if ((await collections.list()).length > 0) {
    console.log('▸ koleksiyonlar zaten dolu — atlandı');
    return;
  }

  // Üyelik ürün id'sine muhtaç: slug → id eşlemesi DB'den (kaynak doğru, seed sırasından bağımsız).
  const idBySlug = new Map((await new ProductService(db).listAll()).map((p) => [p.slug, p.id]));

  console.log('▸ KOLEKSİYON seed');
  for (const c of COLLECTIONS) {
    const productIds = c.products.map((slug) => idBySlug.get(slug)).filter((id): id is string => Boolean(id));
    const created = await collections.create({
      name: c.name,
      description: c.description ?? null,
      slug: c.slug,
      isActive: c.isActive ?? true,
      productIds, // sıra = kürasyon (position 0..n-1)
    });
    // Kapak görseli create'ten SONRA: key kesinleşen slug'a bağlanır (gerçek admin akışının aynısı).
    if (c.image) {
      const key = await uploadImage(c.image, r2Keys.collectionImage(created.slug, c.image));
      if (key) await collections.setImageKey(created.id, key);
    }
    const state = (c.isActive ?? true) ? 'aktif' : 'pasif';
    console.log(`  ✓ ${resolveLocalizedText(created.name)} · ${productIds.length} ürün · ${state} · /${created.slug}`);
  }
  console.log(`✓ koleksiyon: ${COLLECTIONS.length} kayıt`);
}

// ── Paket (bundle) + kalemleri (05.5) ────────────────────────────────────────────────────────────

interface SeedBundleItem {
  /** Varyant SKU'su — seed'de deterministik yazılı; kimlik DB'den çözülür (sıra bağımsız). */
  sku: string;
  qty: number;
  /** Hediye kalem: payı 0 kalır, dağıtıma girmez ama maliyeti marja yansır. */
  gift?: boolean;
}

interface SeedBundle {
  name: LocalizedText;
  description?: LocalizedText;
  image?: string; // temp/ dosya adı (3:2 kaynak)
  serves?: number; // "kaç kişilik" künyesi — boşsa müşteride o satır HİÇ çizilmez
  isActive?: boolean;
  /** Kalemlerin BİRİM FİYATLARI toplamına göre indirim — paket fiyatı bundan doğar. */
  discountPercent: number;
  /** Bilinçli mutabakatsızlık (€): liste rozetinin uyarı hâli ekranda görülebilsin. */
  mismatch?: number;
}

/**
 * Paketler arayüzün her durumunu örnekler: görselli/görselsiz · kişilik dolu/boş · hediye kalemi ·
 * aktif/pasif · MUTABAKATI TUTMAYAN bir satır · soğuk zincirli/tamamı kargolanır.
 *
 * Aktif paket sayısı bilinçli DÖRT: paket liste sayfası iki kartla denenemez ve sepetteki teslimat
 * kısıtı hem "gönderilemeyen" hem "kalan" tarafını aynı anda gerektiriyor.
 *
 * FİYAT ELLE YAZILMAZ, birim fiyatlardan TÜRETİLİR (formun yaptığı işin aynısı: `rebalanceAllocations`
 * ağırlık olarak birim fiyatı alır). Eskiden paylar elle yazılıydı ve seed'in fiyat listesiyle hiç
 * ilgisi yoktu — ekranda "paket ayrı ayrı almaktan %66 pahalı" gibi anlamsız bir tablo çıkıyordu.
 * Seed gerçekçi değilse ekranın doğru çalıştığı da anlaşılmaz.
 */
const BUNDLES: Array<SeedBundle & { items: SeedBundleItem[] }> = [
  {
    name: { tr: 'Bayram Sofrası Paketi', fr: 'Coffret Table de fête', de: 'Festtafel-Paket' },
    description: {
      tr: 'Kalabalık sofra için üç klasik: fıstıklı baklava, künefe ve cevizli baklava.',
      fr: 'Trois classiques pour une grande table : baklava à la pistache, künefe et baklava aux noix.',
      de: 'Drei Klassiker für die große Tafel: Pistazien-Baklava, Künefe und Walnuss-Baklava.',
    },
    image: '1.jpeg',
    serves: 6,
    discountPercent: 12,
    // Künefe KARGOLANAMAZ (soğuk zincir) — paket bu yüzden bilinçli olarak "yalnız rota/kapı teslim"
    // örneği: türetilmiş kargo bilgisi kalemlerin en kısıtlayıcısından gelir.
    items: [
      { sku: 'BAK-F-1000', qty: 1 },
      { sku: 'SER-KUN-600', qty: 1 },
      { sku: 'BAK-C-1000', qty: 1 },
    ],
  },
  {
    // Görselsiz + kişilik boş + HEDİYE kalemi: üç boş/sınır durum bir arada.
    name: { tr: 'Fıstık Sevenler', fr: 'Amateurs de pistache', de: 'Für Pistazienliebhaber' },
    description: { tr: 'İki kutu fıstıklı baklava; yanında hediye cevizli baklava.' }, // yalnız TR — eksik dil örneği
    discountPercent: 8,
    items: [
      { sku: 'BAK-F-500', qty: 2 },
      { sku: 'BAK-C-1000', qty: 1, gift: true },
    ],
  },
  {
    // İKİNCİ soğuk zincir paketi. Tek kısıtlı paket varken sepete iki farklı "gönderilemez" paket
    // koyup kısıt bloğunun ÇOĞUL hâlini (satır içi tekil kaydetme) denemek mümkün değildi.
    name: { tr: 'Sütlü Tatlı Seti', fr: 'Coffret desserts au lait', de: 'Milchdessert-Set' },
    description: {
      tr: 'Soğuk servis edilen iki klasik: kazandibi ve künefe. Yalnız kapıya teslim edilir.',
      fr: 'Deux classiques servis frais : kazandibi et künefe. Livraison à domicile uniquement.',
      de: 'Zwei kalt servierte Klassiker: Kazandibi und Künefe. Nur Lieferung an die Tür.',
    },
    image: '3.jpeg',
    serves: 4,
    discountPercent: 10,
    items: [
      { sku: 'SER-KAZ-400', qty: 2 },
      { sku: 'SER-KUN-600', qty: 1 },
    ],
  },
  {
    // TAMAMI KARGOLANIR + büyük indirim: kısıt bloğunun "kalanı" tarafı ancak gönderilebilen bir
    // paket sepette dururken denenebilir (ayır → kalanla asgari sepeti/ücretsiz kargoyu aş).
    name: { tr: 'Baklava İkilisi', fr: 'Duo de baklavas', de: 'Baklava-Duo' },
    description: {
      tr: 'Bir kilo fıstıklı, bir kilo cevizli — kalabalık sofranın iki klasiği bir arada.',
      fr: 'Un kilo à la pistache, un kilo aux noix — les deux classiques des grandes tablées.',
      de: 'Ein Kilo mit Pistazien, ein Kilo mit Walnüssen — die zwei Klassiker für große Tafeln.',
    },
    image: '2.jpeg',
    serves: 10,
    discountPercent: 15,
    items: [
      { sku: 'BAK-F-1000', qty: 1 },
      { sku: 'BAK-C-1000', qty: 1 },
    ],
  },
  {
    // MUTABAKATI TUTMAYAN paket: paylar doğru dağıtılır, sonra paket fiyatı 0,95 € kaydırılır.
    // Bilinçli bozuk veri (seed'in "sınır durum" alışkanlığı): form bu paketi düzeltilmeden kaydetmez,
    // ama liste satırının bozulmuş bir paketi SÖYLEDİĞİ görülebilsin. Pasif ki vitrine düşmesin.
    name: { tr: 'Kış İkramları', fr: 'Douceurs d’hiver', de: 'Winter-Leckereien' },
    isActive: false,
    discountPercent: 10,
    mismatch: 0.95,
    items: [
      { sku: 'BOR-SU-1500', qty: 1 },
      { sku: 'BAK-F-500', qty: 1 },
    ],
  },
];

/** Kuruşa çevrim — `toCents` burada yok (`@lezzet/helper` kökün bağımlısı değil), aritmetik tek satır. */
const cents = (v: number) => Math.round(v * 100);

export async function seedBundles(db: Db): Promise<void> {
  const bundles = new BundleService(db);
  if ((await bundles.listAll()).length > 0) {
    console.log('▸ paketler zaten dolu — atlandı');
    return;
  }

  // SKU → varyant kimliği: paket kalemi varyanta bağlıdır ve SKU seed'de deterministik. Tek sorgu
  // (gömülü varyantlar) — kalem başına arama N+1 doğururdu.
  const products = await new ProductService(db).listWithRelations({ limit: 500 });
  const idBySku = new Map(
    products.rows.flatMap((p) => p.variants.filter((v) => v.sku).map((v) => [v.sku as string, v.id] as const)),
  );
  // Birim fiyatlar (b2c TTC) tek turda: paket fiyatı bunlardan türeyecek.
  const priceMap = await new PriceService(db).findApplicableMap([...idBySku.values()], 'b2c');
  const unitPriceOf = (variantId: string) => priceMap.get(variantId)?.channelPrice?.amountCents ?? null;

  console.log('▸ PAKET seed');
  for (const b of BUNDLES) {
    const lines = b.items.map((i) => ({ ...i, variantId: idBySku.get(i.sku), priceCents: null as number | null }));
    for (const l of lines) l.priceCents = l.variantId ? unitPriceOf(l.variantId) : null;
    if (lines.some((l) => !l.variantId || l.priceCents == null)) {
      console.warn(`  ⚠ ${resolveLocalizedText(b.name)}: SKU ya da birim fiyat eksik — atlandı`);
      continue;
    }

    // Paket fiyatı = birim fiyatlar toplamının indirimlisi. Hediye kalem toplama GİRER (müşteri onu da
    // ayrı alsa parasını verirdi) ama payı 0 kalır — indirimin tamamını öbür kalemler taşır.
    const listTotalCents = lines.reduce((sum, l) => sum + l.priceCents! * l.qty, 0);
    const targetCents = Math.round(listTotalCents * (1 - b.discountPercent / 100));

    const shareable = lines.filter((l) => !l.gift);
    const shares = rebalanceAllocations(
      shareable.map((l) => ({ qty: l.qty, allocatedUnitPriceCents: l.priceCents! })),
      targetCents,
    );
    let shareIndex = 0;
    const items = lines.map((l) => ({
      variantId: l.variantId!,
      qty: l.qty,
      allocatedUnitPrice: l.gift ? 0 : (shares.unitPricesCents[shareIndex++] ?? 0) / 100,
    }));

    const totalPrice = euro(shares.achievedTotalCents / 100 + (b.mismatch ?? 0));
    const { bundle } = await bundles.create({
      name: b.name,
      description: b.description ?? null,
      totalPrice,
      serves: b.serves ?? null,
      isActive: b.isActive ?? true,
      items,
    });
    // Görsel create'ten SONRA: anahtar kesinleşen slug'a bağlanır (gerçek admin akışının aynısı).
    if (b.image) {
      const key = await uploadImage(b.image, r2Keys.bundleImage(bundle.slug, b.image));
      if (key) await bundles.setImageKey(bundle.id, key);
    }

    // "Tutuyor mu" kararı MOTORUN (`bundleBalance`) — seed kendi ölçütünü uydurmaz.
    const denge = bundleBalance(
      items.map((i) => ({ qty: i.qty, allocatedUnitPriceCents: cents(i.allocatedUnitPrice) })),
      cents(totalPrice),
    );
    const mutabakat = denge.balanced ? 'tutuyor' : `TUTMUYOR (${(denge.diffCents / 100).toFixed(2)} € fark)`;
    console.log(
      `  ✓ ${resolveLocalizedText(bundle.name)} · ${items.length} kalem · ayrı ayrı ${(listTotalCents / 100).toFixed(2)} € → paket ${totalPrice.toFixed(2)} € (%${b.discountPercent}) · ${mutabakat} · ${(b.isActive ?? true) ? 'aktif' : 'pasif'} · /${bundle.slug}`,
    );
  }
  console.log(`✓ paket: ${BUNDLES.length} kayıt`);
}
