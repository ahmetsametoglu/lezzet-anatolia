/**
 * Local seed — `supabase db reset` sonrası örnek/temel veriyi kurar (local stack'e karşı).
 *
 * Kullanım:  pnpm db:reset && pnpm db:seed   (ya da tek komut: pnpm db:refresh)
 * Görseller Cloudflare R2'ye yüklenir (R2 env yoksa atlanır). Giriş: OTP kodu Mailpit'e düşer (54324).
 *
 * TABLO KAPSAMI — hangi tabloya veri girer, girmeyenin sebebi:
 *   ✓ category            4 kategori — 3'ü görselli (anasayfa şeridi), 1'i görselsiz (boş durum)
 *   ✓ product             5 ürün — yasal beyan/KDV/raf ömrü/marj alanları dolu; farklı durumlar örneklenir
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

  for (const p of PRODUCTS) {
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
      variants: p.variants,
    });
    console.log(`  ✓ ${resolveLocalizedText(product.name)} · ${variants.length} varyant · görsel: ${imageKey ?? 'yok (R2 ayarsız)'}`);
  }
  console.log(`✓ katalog: ${CATEGORIES.length} kategori, ${PRODUCTS.length} ürün`);
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
