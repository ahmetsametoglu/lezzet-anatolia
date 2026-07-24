/**
 * Local seed — `supabase db reset` sonrası örnek/temel veriyi kurar (local stack'e karşı).
 *
 * **Admin seed'i YOK:** ilk giriş yapan hesap 0002 trigger'ıyla otomatik admin olur (email belirtilmez).
 * Seed yalnız katalog örneği kurar. Modüller büyüdükçe kendi adımlarını buraya ekler (07 → sipariş…).
 *
 * Kullanım:  pnpm db:reset && pnpm db:seed   (ya da tek komut: pnpm db:refresh)
 * Görseller Cloudflare R2'ye yüklenir (R2 env yoksa atlanır). Giriş: OTP kodu Mailpit'e düşer (54324).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CategoryService, createServiceRoleClient, ProductService } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { resolveLocalizedText, type LocalizedText } from '@lezzet/types';

// Seed Next.js dışında çalışır — .env'i elle yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

// ── Katalog seed (05) — temp/ altındaki test görselleriyle örnek ürünler ─────────────────────────

interface SeedVariant {
  label: string;
  netWeightG?: number;
  sku?: string;
}
interface SeedProduct {
  slug: string; // görsel anahtarı için (products/<slug>.jpeg)
  image: string; // temp/ dosya adı
  category: string; // kategori anahtarı
  name: LocalizedText;
  description?: LocalizedText;
  isActive?: boolean;
  isCandidate?: boolean;
  variants?: SeedVariant[];
}

/**
 * temp/<file> görselini R2'ye yükler ve saklanacak RELATIVE key'i döner. R2 ayarsızsa (local'de creds
 * yoksa) sessizce null döner → ürün görselsiz oluşur (graceful degradation, petit deseni).
 */
async function uploadImage(file: string, filename: string): Promise<string | null> {
  const r2 = getR2();
  if (!r2) return null;
  try {
    const bytes = readFileSync(join(process.cwd(), 'temp', file));
    const key = r2Keys.productImage(filename);
    await r2.uploadFile(key, bytes, 'image/jpeg');
    return key;
  } catch (err) {
    console.warn(`  ⚠ görsel atlandı (${file}): ${(err as Error).message}`);
    return null;
  }
}

/**
 * Örnek katalog: 4 kategori + 5 ürün (temp görselleriyle). İdempotent değil — ürün varsa atlar,
 * o yüzden taze reset sonrası (db:refresh) çalıştırılır. Farklı durumları örnekler: çok/tek varyant,
 * eksik dil, pasif, aday.
 */
async function seedCatalog(supabase: ReturnType<typeof createServiceRoleClient>): Promise<void> {
  const products = new ProductService(supabase);
  if ((await products.listAll()).length > 0) {
    console.log('▸ katalog zaten dolu — atlandı');
    return;
  }

  console.log('▸ KATALOG seed');
  const categories = new CategoryService(supabase);

  const catDefs = [
    { key: 'baklava', name: { tr: 'Baklava', fr: 'Baklava', de: 'Baklava' } },
    { key: 'serbetli', name: { tr: 'Şerbetli Tatlılar', fr: 'Desserts au sirop', de: 'Sirup-Süßspeisen' } },
    { key: 'borek', name: { tr: 'Börek', fr: 'Böreks', de: 'Börek' } },
    { key: 'malzeme', name: { tr: 'Malzeme', fr: 'Ingrédients', de: 'Zutaten' } },
  ];
  const catId = new Map<string, string>();
  for (const c of catDefs) {
    const created = await categories.create({ name: c.name });
    catId.set(c.key, created.id);
  }

  const productDefs: SeedProduct[] = [
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
      variants: [{ label: '1 kg', netWeightG: 1000, sku: 'BAK-C-1000' }],
    },
    {
      slug: 'su-boregi',
      image: '3.jpeg',
      category: 'borek',
      isActive: false, // pasif örneği
      name: { tr: 'Su Böreği' }, // yalnız TR
      variants: [{ label: 'Tepsi', netWeightG: 1500, sku: 'BOR-SU-1500' }],
    },
    {
      slug: 'kunefe',
      image: '4.jpeg',
      category: 'serbetli',
      name: { tr: 'Künefe', fr: 'Künefe', de: 'Künefe' },
      variants: [{ label: '2 kişilik', netWeightG: 600, sku: 'SER-KUN-600' }],
    },
    {
      slug: 'antep-fistigi',
      image: '5.jpeg',
      category: 'malzeme',
      isCandidate: true, // aday örneği (varyant verilmez → varsayılan varyant otomatik)
      name: { tr: 'Antep Fıstığı' },
    },
  ];

  for (const p of productDefs) {
    const imageKey = await uploadImage(p.image, `${p.slug}.jpeg`);
    const { product, variants } = await products.create({
      name: p.name,
      description: p.description ?? null,
      categoryId: catId.get(p.category) ?? null,
      imageKey,
      isActive: p.isActive ?? true,
      isCandidate: p.isCandidate ?? false,
      variants: p.variants,
    });
    console.log(`  ✓ ${resolveLocalizedText(product.name)} · ${variants.length} varyant · görsel: ${imageKey ?? 'yok (R2 ayarsız)'}`);
  }
  console.log(`✓ katalog: ${catDefs.length} kategori, ${productDefs.length} ürün`);
}

async function main(): Promise<void> {
  const supabase = createServiceRoleClient();
  await seedCatalog(supabase);
  console.log('✓ seed tamam (admin: ilk giriş yapan otomatik admin olur)');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
