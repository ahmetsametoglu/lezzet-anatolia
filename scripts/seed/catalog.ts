import { BundleService, CategoryService, CollectionService, ProductImageService, ProductService } from '@lezzet/database';
import { bundleBalance } from '@lezzet/domain-core';
import { PRODUCT_GALLERY_MAX, resolveLocalizedText, type LocalizedText, type Nutrition, type ProductAllergen, type ProductStatus } from '@lezzet/types';
import { NOW, r2Keys, uploadImage, type Db } from './shared';

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

// Farklı durumlar bilinçli örneklenir: çok/tek varyant, eksik dil, pasif, aday, kargolanamaz.
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
    slug: 'cevizli-baklava',
    image: '2.jpeg',
    category: 'baklava',
    name: { tr: 'Cevizli Baklava', fr: 'Baklava aux noix' }, // DE eksik — "diller" göstergesini örnekler
    allergens: ['gluten', 'sert_kabuklu', 'sut'],
    shelfLifeDays: 180,
    targetMarginPercent: 38,
    variants: [{ label: { tr: '1 kg', fr: '1 kg' }, netWeightG: 1000, sku: 'BAK-C-1000' }],
  },
  {
    slug: 'su-boregi',
    image: '3.jpeg',
    category: 'borek',
    status: 'passive', // pasif örneği
    name: { tr: 'Su Böreği' }, // yalnız TR
    allergens: ['gluten', 'yumurta', 'sut'],
    shelfLifeDays: 5,
    shippable: false, // soğuk zincir → yalnız rota/kapı teslim
    // Etiket YALNIZ TR — varyant editöründeki "eksik dil" noktasını örnekler.
    variants: [{ label: { tr: 'Tepsi' }, netWeightG: 1500, sku: 'BOR-SU-1500' }],
  },
  {
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
    shelfLifeDays: 3,
    shippable: false,
    targetMarginPercent: 45,
    variants: [{ label: { tr: '2 kişilik', fr: '2 personnes', de: 'für 2' }, netWeightG: 600, sku: 'SER-KUN-600' }],
  },
  {
    slug: 'antep-fistigi',
    image: '5.jpeg',
    category: 'malzeme',
    status: 'candidate', // aday örneği (varyant verilmez → varsayılan varyant otomatik)
    name: { tr: 'Antep Fıstığı' },
    allergens: ['sert_kabuklu'],
    vatRate: 20, // malzeme → %20 (tatlılar %5,5)
    shelfLifeDays: 365,
  },
];

// ── Toplu ürün üretimi ───────────────────────────────────────────────────────────────────────────
// Elle yazılan 6 ürün belirli DURUMLARI örnekler (eksik dil, alerjensiz, pasif, aday, kargolanamaz).
// Ama sayfalama/sonsuz kaydırma ve süzgeçler ancak GERÇEKÇİ HACİMDE denenebilir: ~30'luk sayfa boyutu
// birkaç sayfa doldurmalı. Bu yüzden aşağıdaki taban adlar × nitelemeler çarpımından ürün türetilir —
// adlar üç dilde kurulur (elle 60×3 metin yazmadan), durumlar indise göre serpiştirilir.

const BULK_BASES: Array<{ cat: string; tr: string; fr: string; de: string }> = [
  { cat: 'baklava', tr: 'Baklava', fr: 'Baklava', de: 'Baklava' },
  { cat: 'baklava', tr: 'Kuru Baklava', fr: 'Baklava sec', de: 'Trockenes Baklava' },
  { cat: 'baklava', tr: 'Şöbiyet', fr: 'Şöbiyet', de: 'Schöbiyet' },
  { cat: 'baklava', tr: 'Bülbül Yuvası', fr: 'Nid de rossignol', de: 'Nachtigallnest' },
  { cat: 'baklava', tr: 'Havuç Dilimi', fr: 'Tranche carotte', de: 'Karottenschnitte' },
  { cat: 'serbetli', tr: 'Kadayıf', fr: 'Kadaïf', de: 'Kadayif' },
  { cat: 'serbetli', tr: 'Künefe', fr: 'Künefe', de: 'Künefe' },
  { cat: 'serbetli', tr: 'Şekerpare', fr: 'Şekerpare', de: 'Şekerpare' },
  { cat: 'serbetli', tr: 'Revani', fr: 'Revani', de: 'Revani' },
  { cat: 'serbetli', tr: 'Tulumba', fr: 'Tulumba', de: 'Tulumba' },
  { cat: 'borek', tr: 'Su Böreği', fr: 'Börek à l’eau', de: 'Wasser-Börek' },
  { cat: 'borek', tr: 'Sigara Böreği', fr: 'Börek cigare', de: 'Zigarren-Börek' },
  { cat: 'borek', tr: 'Kol Böreği', fr: 'Börek roulé', de: 'Rollen-Börek' },
  { cat: 'borek', tr: 'Talaş Böreği', fr: 'Börek feuilleté', de: 'Blätter-Börek' },
  { cat: 'malzeme', tr: 'Antep Fıstığı', fr: 'Pistache d’Antep', de: 'Antep-Pistazie' },
  { cat: 'malzeme', tr: 'Tahin', fr: 'Tahini', de: 'Tahin' },
];

const BULK_QUALIFIERS: Array<{ tr: string; fr: string; de: string }> = [
  { tr: 'fıstıklı', fr: 'aux pistaches', de: 'mit Pistazien' },
  { tr: 'cevizli', fr: 'aux noix', de: 'mit Walnüssen' },
  { tr: 'sade', fr: 'nature', de: 'natur' },
  { tr: 'özel tepsi', fr: 'plateau spécial', de: 'Spezialblech' },
];

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
 * Elle yazılmış 5 ürünün galeri sayıları — arayüzün HER durumu denenebilsin diye seçildi:
 * dolu (sınır notu çıkar) · normal · boş (ekleme karesi tek başına) · tek · orta.
 */
const HAND_GALLERY_COUNTS = [PRODUCT_GALLERY_MAX, 2, 0, 1, 3];

/**
 * Toplu ürünleri oluşturur. Durum çeşitliliği İNDİSE göre serpiştirilir ki her süzgeç gerçekten
 * sonuç döndürsün: ~her 9'uncu pasif, ~her 11'inci aday, ~her 7'nci alerjensiz (beyan eksik),
 * ~her 5'incinin yalnız TR adı var (dil eksik), ~her 6'ncısı görselsiz.
 * `sortOrder` açıkça verilir → servis sona-ekleme için sayım sorgusu atmaz.
 */
async function seedBulkProducts(
  products: ProductService,
  images: ProductImageService,
  catId: Map<string, string>,
  sharedKeys: string[],
  startOrder: number,
): Promise<{ made: number; photos: number }> {
  let made = 0;
  let photos = 0;
  for (const [b, base] of BULK_BASES.entries()) {
    for (const [q, qual] of BULK_QUALIFIERS.entries()) {
      const i = b * BULK_QUALIFIERS.length + q;
      const trOnly = i % 5 === 0; // dil eksik → "beyan eksik" süzgecine düşer
      const beyanTam = i % 3 !== 0; // içindekiler + besin + saklama dolu mu
      const imageKey = i % 6 === 0 ? null : (sharedKeys[i % sharedKeys.length] ?? null);
      const name: LocalizedText = trOnly
        ? { tr: `${base.tr} ${qual.tr}` }
        : { tr: `${base.tr} ${qual.tr}`, fr: `${base.fr} ${qual.fr}`, de: `${base.de} ${qual.de}` };

      const { product } = await products.create({
        name,
        description: trOnly ? null : { tr: `${base.tr} — ${qual.tr}.`, fr: `${base.fr} — ${qual.fr}.`, de: `${base.de} — ${qual.de}.` },
        categoryId: catId.get(base.cat) ?? null,
        imageKey,
        // Sürüm damgası public okuma URL'ini `?v=` ile sürümler — DOSYASI olan kayda yazılır;
        // görselsiz kayıtta damga olmayan bir dosyanın tarihi olurdu.
        imageUpdatedAt: imageKey ? NOW : null,
        allergens: i % 7 === 0 ? [] : i % 2 === 0 ? ['gluten', 'sert_kabuklu'] : ['gluten', 'sut'],
        traces: i % 4 === 0 ? ['yer_fistigi'] : [],
        // Beyan dörtlüsü ~her 3'ten 2'sinde DOLU: ölçüt bunları da saydığı için hepsi boş bırakılsaydı
        // 69 ürünün 69'u "beyan eksik" çıkar, süzgeç ayırt etmez olurdu.
        ingredients: beyanTam
          ? {
              tr: `**Buğday unu**, su, tuz, ${base.tr.toLocaleLowerCase('tr')}, şeker.`,
              fr: `**Farine de blé**, eau, sel, ${base.fr.toLocaleLowerCase('fr')}, sucre.`,
              de: `**Weizenmehl**, Wasser, Salz, ${base.de.toLocaleLowerCase('de')}, Zucker.`,
            }
          : null,
        storageInstructions: beyanTam
          ? {
              tr: 'Serin ve kuru yerde saklayın; açtıktan sonra 3 gün içinde tüketin, **tekrar dondurmayın**.',
              fr: 'Conserver au frais et au sec ; à consommer sous 3 jours après ouverture, **ne pas recongeler**.',
              de: 'Kühl und trocken lagern; nach dem Öffnen innerhalb von 3 Tagen verzehren, **nicht wieder einfrieren**.',
            }
          : null,
        nutrition: beyanTam
          ? { energyKj: 1600 + i * 5, energyKcal: 380 + i, fatG: 18 + (i % 7), saturatedFatG: 7 + (i % 4), carbohydrateG: 45 + (i % 9), sugarsG: 22 + (i % 6), proteinG: 6 + (i % 3), saltG: 0.3 }
          : null,
        vatRate: base.cat === 'malzeme' ? 20 : 5.5,
        shelfLifeDays: base.cat === 'borek' ? 120 : 180,
        shippable: i % 13 !== 0, // bazıları yalnız rota/kapı teslim (soğuk zincir)
        targetMarginPercent: 35 + (i % 5) * 3,
        autoPrice: i % 4 === 0,
        // Tek alan → çakışma imkânsız (eskiden iki bayrak birbirini ezebiliyordu).
        status: i % 9 === 0 ? 'passive' : i % 11 === 0 ? 'candidate' : 'active',
        sortOrder: startOrder + i,
        // Çok boylu ürünlerde etiket üç dilli; tek boylularda 4'te 1'i bilinçli TR-only kalır ki
        // varyant editörünün "eksik dil" göstergesi toplu veride de görünsün.
        variants:
          i % 3 === 0
            ? [
                { label: { tr: '700 g tepsi', fr: 'plateau 700 g', de: 'Platte 700 g' }, netWeightG: 700 },
                { label: { tr: '1 kg tepsi', fr: 'plateau 1 kg', de: 'Platte 1 kg' }, netWeightG: 1000 },
              ]
            : [{ label: i % 4 === 0 ? { tr: '500 g' } : { tr: '500 g', fr: '500 g', de: '500 g' }, netWeightG: 500 }],
      });
      made += 1;

      // Galeri dağılımı — arayüzün her durumu listede bulunabilsin diye: ~her 13'ü DOLU (sınır notu),
      // ~her 4'ü iki fotoğraflı, ~her 6'sı tek. Kapaksız ürünler de (i%6) galeri alıyor: "Kapak yap"
      // takası ancak kapağı olmayan bir üründe denendiğinde satırın galeriden çıktığı görülür.
      const galleryCount = i % 13 === 0 ? PRODUCT_GALLERY_MAX : i % 4 === 0 ? 2 : i % 6 === 0 ? 1 : 0;
      photos += await seedGallery(images, product.id, sharedKeys, galleryCount, i);
    }
  }
  return { made, photos };
}

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

  // Hacim: sayfalama ve sonsuz kaydırma ancak birkaç sayfa dolunca denenebilir.
  const bulk = await seedBulkProducts(products, images, catId, sharedKeys, PRODUCTS.length);
  console.log(`  ✓ ${bulk.made} toplu ürün (sayfalama/süzgeç denemesi için) · ${bulk.photos} galeri fotoğrafı`);
  console.log(`✓ katalog: ${CATEGORIES.length} kategori, ${PRODUCTS.length + bulk.made} ürün`);
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
    products: ['fistikli-baklava', 'kunefe', 'cevizli-baklava'], // kürasyon sırası
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
    products: ['kunefe', 'su-boregi'],
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
  /** Kaleme ATANMIŞ birim fiyat (€, KDV dahil). Hediye = 0. Σ (adet × fiyat) = paket fiyatı. */
  allocatedUnitPrice: number;
}

interface SeedBundle {
  name: LocalizedText;
  description?: LocalizedText;
  image?: string; // temp/ dosya adı (3:2 kaynak)
  serves?: number; // "kaç kişilik" künyesi — boşsa müşteride o satır HİÇ çizilmez
  totalPrice: number;
  isActive?: boolean;
  items: SeedBundleItem[];
}

/**
 * Paketler bilinçli olarak arayüzün her durumunu örnekler: görselli/görselsiz · kişilik dolu/boş ·
 * hediye kalemi (0 €) · aktif/pasif · MUTABAKATI TUTMAYAN bir satır (liste rozeti kırmızıya döner).
 *
 * Fiyatlar toplamı tutacak biçimde SEÇİLİ — atanmış paylar paket fiyatını verir, çünkü kısmi iade ve
 * kalem KDV'si bu paylardan hesaplanıyor.
 */
const BUNDLES: SeedBundle[] = [
  {
    name: { tr: 'Bayram Sofrası Paketi', fr: 'Coffret Table de fête', de: 'Festtafel-Paket' },
    description: {
      tr: 'Kalabalık sofra için üç klasik: fıstıklı baklava, künefe ve cevizli baklava.',
      fr: 'Trois classiques pour une grande table : baklava à la pistache, künefe et baklava aux noix.',
      de: 'Drei Klassiker für die große Tafel: Pistazien-Baklava, Künefe und Walnuss-Baklava.',
    },
    image: '1.jpeg',
    serves: 6,
    totalPrice: 49.9,
    // Künefe KARGOLANAMAZ (soğuk zincir) — paket bu yüzden bilinçli olarak "yalnız rota/kapı teslim"
    // örneği: türetilmiş kargo bilgisi kalemlerin en kısıtlayıcısından gelir.
    items: [
      { sku: 'BAK-F-1000', qty: 1, allocatedUnitPrice: 28.5 },
      { sku: 'SER-KUN-600', qty: 1, allocatedUnitPrice: 12.4 },
      { sku: 'BAK-C-1000', qty: 1, allocatedUnitPrice: 9.0 },
    ],
  },
  {
    // Görselsiz + kişilik boş + HEDİYE kalemi: üç boş/sınır durum bir arada.
    name: { tr: 'Fıstık Sevenler', fr: 'Amateurs de pistache', de: 'Für Pistazienliebhaber' },
    description: { tr: 'İki kutu fıstıklı baklava; yanında hediye cevizli baklava.' }, // yalnız TR — eksik dil örneği
    totalPrice: 31.9,
    items: [
      { sku: 'BAK-F-500', qty: 2, allocatedUnitPrice: 15.95 },
      { sku: 'BAK-C-1000', qty: 1, allocatedUnitPrice: 0 }, // hediye — 0 fiyatlı kalem
    ],
  },
  {
    // MUTABAKATI TUTMAYAN paket: 33,95 atanmış · 34,90 istenmiş → listede kırmızı "Tutmuyor · 0,95 €".
    // Bilinçli bozuk veri (seed'in "sınır durum" alışkanlığı): form bu paketi düzeltilmeden
    // kaydetmez, ama liste satırının bozulmuş bir paketi SÖYLEDİĞİ görülebilsin. Pasif tutuluyor ki
    // vitrine düşmesin.
    name: { tr: 'Kış İkramları', fr: 'Douceurs d’hiver', de: 'Winter-Leckereien' },
    isActive: false,
    totalPrice: 34.9,
    items: [
      { sku: 'BOR-SU-1500', qty: 1, allocatedUnitPrice: 18.0 },
      { sku: 'BAK-F-500', qty: 1, allocatedUnitPrice: 15.95 },
    ],
  },
];

/** Kuruşa çevrim — `toCents` burada yok (`@lezzet/helper` kökün bağımlısı değil), aritmetik tek satır. */
const kurus = (v: number) => Math.round(v * 100);

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

  console.log('▸ PAKET seed');
  for (const b of BUNDLES) {
    const items = b.items
      .map((i) => ({ variantId: idBySku.get(i.sku), qty: i.qty, allocatedUnitPrice: i.allocatedUnitPrice }))
      .filter((i): i is { variantId: string; qty: number; allocatedUnitPrice: number } => Boolean(i.variantId));
    if (items.length !== b.items.length) {
      console.warn(`  ⚠ ${resolveLocalizedText(b.name)}: bazı SKU'lar bulunamadı — atlandı`);
      continue;
    }

    const { bundle } = await bundles.create({
      name: b.name,
      description: b.description ?? null,
      totalPrice: b.totalPrice,
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
      items.map((i) => ({ qty: i.qty, allocatedUnitPriceCents: kurus(i.allocatedUnitPrice) })),
      kurus(b.totalPrice),
    );
    const mutabakat = denge.balanced ? 'tutuyor' : `TUTMUYOR (${(denge.diffCents / 100).toFixed(2)} € fark)`;
    const state = (b.isActive ?? true) ? 'aktif' : 'pasif';
    console.log(
      `  ✓ ${resolveLocalizedText(bundle.name)} · ${items.length} kalem · ${b.totalPrice.toFixed(2)} € · ${mutabakat} · ${state} · /${bundle.slug}`,
    );
  }
  console.log(`✓ paket: ${BUNDLES.length} kayıt`);
}

