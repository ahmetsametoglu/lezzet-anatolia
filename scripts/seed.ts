/**
 * Local seed — `supabase db reset` sonrası örnek/temel veriyi kurar (local stack'e karşı).
 *
 * Kullanım:  pnpm db:reset && pnpm db:seed   (ya da tek komut: pnpm db:refresh)
 * Görseller Cloudflare R2'ye yüklenir (R2 env yoksa atlanır). Giriş: OTP kodu Mailpit'e düşer (54324).
 *
 * TABLO KAPSAMI — hangi tabloya veri girer, girmeyenin sebebi:
 *   ✓ category            4 kategori — 3'ü görselli (anasayfa şeridi), 1'i görselsiz (boş durum)
 *   ✓ product             69 ürün — 5'i elle (yasal beyan/KDV/raf ömrü/marj dolu, farklı durumlar
 *                         örneklenir), 64'ü taban×niteleme çarpımından türetilir (16×4): sayfalama ve
 *                         sonsuz kaydırma ancak gerçekçi hacimde denenebilir — 30'luk sayfada 3 sayfa.
 *                         Görseller 5 PAYLAŞILAN anahtara işaret eder (64 yükleme yerine 5); bir kısmı
 *                         bilinçli görselsiz. Süzgeç dağılımı: 21 beyan eksik · 8 pasif · 5 aday.
 *   ✓ product_variant     ürün başına 1-2 varyant (varyantsız üründe servis varsayılan varyant açar)
 *   ✓ collection          4 koleksiyon — açıklama + kapak görseli (paylaşım/OG), aktif+pasif, dolu+boş
 *   ✓ product_collections üyelik + `position` (vitrin kürasyon sırası)
 *   ✓ user_profiles       taslak müşteriler (DOMAIN §10 WhatsApp/manuel; auth'suz, is_draft=true)
 *   ✗ email_verifications GEÇİCİ OTP kaydı — seed'lenmez (dakikalar içinde ölür, giriş akışı üretir)
 *   ✗ auth.users          ADMIN SEED'İ YOK: ilk giriş yapan hesap 0002 trigger'ıyla otomatik admin olur
 *                         (taslak müşteriler role=customer olduğu için bu bootstrap'ı engellemez)
 *
 * Her bölüm kendi guard'ıyla idempotent: dolu tabloyu atlar, bu yüzden tekrar çalıştırmak güvenlidir.
 * Modüller büyüdükçe kendi adımlarını buraya ekler (07 → sipariş, 06 → stok…).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CategoryService,
  CollectionService,
  createServiceRoleClient,
  ProductService,
  UserProfileService,
} from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { resolveLocalizedText, type LocalizedText, type ProductAllergen } from '@lezzet/types';

// Seed Next.js dışında çalışır — .env'i elle yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

type Db = ReturnType<typeof createServiceRoleClient>;

/**
 * temp/<file> görselini R2'ye verilen key ile yükler ve saklanacak RELATIVE key'i döner. R2 ayarsızsa
 * (local'de creds yoksa) sessizce null döner → kayıt görselsiz oluşur (graceful degradation).
 */
async function uploadImage(file: string, key: string): Promise<string | null> {
  const r2 = getR2();
  if (!r2) return null;
  try {
    const bytes = readFileSync(join(process.cwd(), 'temp', file));
    await r2.uploadFile(key, bytes, 'image/jpeg');
    return key;
  } catch (err) {
    console.warn(`  ⚠ görsel atlandı (${file}): ${(err as Error).message}`);
    return null;
  }
}

// ── Katalog: kategori + ürün + varyant (05) ──────────────────────────────────────────────────────

interface SeedVariant {
  label: string;
  netWeightG?: number;
  sku?: string;
}
interface SeedProduct {
  slug: string; // görsel anahtarı için (catalog/products/<slug>.jpeg)
  image: string; // temp/ dosya adı
  category: string; // kategori anahtarı
  name: LocalizedText;
  description?: LocalizedText;
  allergens?: ProductAllergen[];
  vatRate?: number;
  shelfLifeDays?: number;
  shippable?: boolean;
  targetMarginPercent?: number;
  autoPrice?: boolean;
  isActive?: boolean;
  isCandidate?: boolean;
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
    shelfLifeDays: 180,
    targetMarginPercent: 42,
    autoPrice: true,
    variants: [
      { label: '1 kg', netWeightG: 1000, sku: 'BAK-F-1000' },
      { label: '500 g', netWeightG: 500, sku: 'BAK-F-500' },
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
    variants: [{ label: '1 kg', netWeightG: 1000, sku: 'BAK-C-1000' }],
  },
  {
    slug: 'su-boregi',
    image: '3.jpeg',
    category: 'borek',
    isActive: false, // pasif örneği
    name: { tr: 'Su Böreği' }, // yalnız TR
    allergens: ['gluten', 'yumurta', 'sut'],
    shelfLifeDays: 5,
    shippable: false, // soğuk zincir → yalnız rota/kapı teslim
    variants: [{ label: 'Tepsi', netWeightG: 1500, sku: 'BOR-SU-1500' }],
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
    variants: [{ label: '2 kişilik', netWeightG: 600, sku: 'SER-KUN-600' }],
  },
  {
    slug: 'antep-fistigi',
    image: '5.jpeg',
    category: 'malzeme',
    isCandidate: true, // aday örneği (varyant verilmez → varsayılan varyant otomatik)
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

/**
 * Toplu ürünleri oluşturur. Durum çeşitliliği İNDİSE göre serpiştirilir ki her süzgeç gerçekten
 * sonuç döndürsün: ~her 9'uncu pasif, ~her 11'inci aday, ~her 7'nci alerjensiz (beyan eksik),
 * ~her 5'incinin yalnız TR adı var (dil eksik), ~her 6'ncısı görselsiz.
 * `sortOrder` açıkça verilir → servis sona-ekleme için sayım sorgusu atmaz.
 */
async function seedBulkProducts(products: ProductService, catId: Map<string, string>, startOrder: number): Promise<number> {
  // Paylaşılan görseller: 5 yükleme (R2 ayarsızsa hepsi null → ürünler görselsiz kurulur).
  const sharedKeys: Array<string | null> = [];
  for (const [i, file] of SHARED_IMAGE_FILES.entries()) {
    sharedKeys.push(await uploadImage(file, r2Keys.productImage(`katalog-ornek-${i + 1}`, file)));
  }

  let made = 0;
  for (const [b, base] of BULK_BASES.entries()) {
    for (const [q, qual] of BULK_QUALIFIERS.entries()) {
      const i = b * BULK_QUALIFIERS.length + q;
      const trOnly = i % 5 === 0; // dil eksik → "beyan eksik" süzgecine düşer
      const name: LocalizedText = trOnly
        ? { tr: `${base.tr} ${qual.tr}` }
        : { tr: `${base.tr} ${qual.tr}`, fr: `${base.fr} ${qual.fr}`, de: `${base.de} ${qual.de}` };

      await products.create({
        name,
        description: trOnly ? null : { tr: `${base.tr} — ${qual.tr}.`, fr: `${base.fr} — ${qual.fr}.`, de: `${base.de} — ${qual.de}.` },
        categoryId: catId.get(base.cat) ?? null,
        imageKey: i % 6 === 0 ? null : (sharedKeys[i % sharedKeys.length] ?? null),
        allergens: i % 7 === 0 ? [] : i % 2 === 0 ? ['gluten', 'sert_kabuklu'] : ['gluten', 'sut'],
        vatRate: base.cat === 'malzeme' ? 20 : 5.5,
        shelfLifeDays: base.cat === 'borek' ? 120 : 180,
        shippable: i % 13 !== 0, // bazıları yalnız rota/kapı teslim (soğuk zincir)
        targetMarginPercent: 35 + (i % 5) * 3,
        autoPrice: i % 4 === 0,
        isActive: i % 9 !== 0,
        isCandidate: i % 11 === 0 && i % 9 !== 0, // aday ve pasif aynı kayıtta çakışmasın
        sortOrder: startOrder + i,
        variants: i % 3 === 0 ? [{ label: '700 g tepsi', netWeightG: 700 }, { label: '1 kg tepsi', netWeightG: 1000 }] : [{ label: '500 g', netWeightG: 500 }],
      });
      made += 1;
    }
  }
  return made;
}

async function seedCatalog(db: Db): Promise<void> {
  const products = new ProductService(db);
  if ((await products.listAll()).length > 0) {
    console.log('▸ katalog zaten dolu — atlandı');
    return;
  }

  console.log('▸ KATALOG seed');
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
      allergens: p.allergens,
      vatRate: p.vatRate,
      shelfLifeDays: p.shelfLifeDays,
      shippable: p.shippable,
      targetMarginPercent: p.targetMarginPercent,
      autoPrice: p.autoPrice,
      isActive: p.isActive ?? true,
      isCandidate: p.isCandidate ?? false,
      sortOrder: i, // elle yazılanlar listenin BAŞINDA dursun (durum örnekleri kolay bulunsun)
      variants: p.variants,
    });
    console.log(`  ✓ ${resolveLocalizedText(product.name)} · ${variants.length} varyant · görsel: ${imageKey ?? 'yok (R2 ayarsız)'}`);
  }

  // Hacim: sayfalama ve sonsuz kaydırma ancak birkaç sayfa dolunca denenebilir.
  const bulk = await seedBulkProducts(products, catId, PRODUCTS.length);
  console.log(`  ✓ ${bulk} toplu ürün (sayfalama/süzgeç denemesi için)`);
  console.log(`✓ katalog: ${CATEGORIES.length} kategori, ${PRODUCTS.length + bulk} ürün`);
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

async function seedCollections(db: Db): Promise<void> {
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

// ── Taslak müşteriler (04) ───────────────────────────────────────────────────────────────────────

// DOMAIN §10: WhatsApp/manuel gelen müşteri auth'suz TASLAK olarak açılır, ilk girişte auth'a bağlanır.
// findOrCreate tek kapıdır (telefon/e-posta normalize + bul-veya-oluştur) → seed de onu kullanır,
// böylece kimlik anahtarı kuralları seed'de yeniden yazılmaz ve tekrar çalıştırmak güvenlidir.
const DRAFT_CUSTOMERS = [
  { name: 'Élodie Martin', phone: '+33612345678', email: 'elodie.martin@example.fr', country: 'FR' as const, preferredLanguage: 'fr' as const },
  { name: 'Şirket: Anadolu Market GmbH', phone: '+4930123456789', email: 'siparis@anadolumarket.de', country: 'DE' as const, preferredLanguage: 'de' as const, type: 'company' as const },
  { name: 'Mehmet Yıldız', phone: '+33788112233', country: 'FR' as const, preferredLanguage: 'tr' as const },
];

async function seedDraftCustomers(db: Db): Promise<void> {
  const profiles = new UserProfileService(db);
  console.log('▸ TASLAK MÜŞTERİ seed');
  let created = 0;
  for (const c of DRAFT_CUSTOMERS) {
    const result = await profiles.findOrCreate(c);
    if (result.created) created += 1;
    console.log(`  ${result.created ? '✓' : '·'} ${c.name} (${result.created ? 'taslak açıldı' : 'zaten var'})`);
  }
  console.log(`✓ taslak müşteri: ${created} yeni / ${DRAFT_CUSTOMERS.length} tanım`);
}

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  await seedCatalog(db);
  await seedCollections(db);
  await seedDraftCustomers(db);
  console.log('✓ seed tamam (admin: ilk giriş yapan otomatik admin olur)');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
