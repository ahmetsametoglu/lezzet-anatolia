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
 *   ✓ product_image       galeri (ek fotoğraflar) — YENİ DOSYA YÜKLENMEZ, aynı 5 anahtara işaret eder.
 *                         Sayılar arayüzün her durumunu kapsar: dolu (sınır notu) · 2'li · tek · boş;
 *                         kapaksız ürünlere de galeri verilir ("Kapak yap" takası orada denenir).
 *                         Kırpma değerleri bilinçli farklı — odak/zoom etkisi ekranda görünsün.
 *   ✓ collection          4 koleksiyon — açıklama + kapak görseli (paylaşım/OG), aktif+pasif, dolu+boş
 *   ✓ product_collections üyelik + `position` (vitrin kürasyon sırası)
 *   ✓ user_profiles       taslak müşteriler + TİCARİ KARTLAR (B2B onaylı/bekleyen, B2C, DE) + personel
 *                         (dev admin + depo/kurye/muhasebe)
 *   ✓ price               varyant başına b2c TTC + b2b HT; bir kısmında geçmiş liste ve İLERİ TARİHLİ
 *                         zam; 6 satır müşteriye özel → "en özgül kazanır" çözümü denenebilir
 *   ✓ delivery_zone       3 aktif + 1 pasif bölge (rota günü ve kargo dallanması)
 *   ✓ address             rota içi · rota dışı (kargo) · pasif bölgede — "in_route" türetimi denenir
 *   ✓ supplier            3 tedarikçi (biri pasif) + ürün–kod eşlemesi (bir kısmı ÇİFT kaynaklı)
 *   ✓ purchase_order      dört durum: taslak · gönderildi · iptal · mal kabulde kapanan
 *   ✓ stock_intake        2 giriş — biri PO'lu ve bilinçli EKSİK geldi (sipariş↔gelen fark raporu)
 *   ✓ stock              ~140 parti: FEFO için farklı tarihler + sınır durumlar (indirimli teklif,
 *                         yaklaşan, DLC geçmiş, DDM geçmiş, tükenmiş, alış fiyatı girilmemiş)
 *   ✓ stock_adjustment    beş sebebin beşi; sayım farkı İKİ YÖNLÜ (işaretli alan görünsün)
 *   ✓ temperature_log     4 nokta × 21 gün × 2 ölçüm; bir kısmı bilinçli ARALIK DIŞI
 *   ✓ cart                normal · toptan · BAYAT (1 yıllık) + partiye çıpalı teklif satırı
 *   ✓ order               9 durumun hepsi · 4 kaynak (web/whatsapp/door/manual) · tam yol + hızlı
 *                         satış · vadeli gecikmiş/kısmi ödenmiş (açık bakiye türetimi)
 *   ✓ reservation         siparişlerle birlikte doğar (TTL'li checkout + süresiz kapıda/vadeli)
 *   ✓ order_item_batch    hazırlık onayında yazılır → geri çağırma ve gerçek COGS denenebilir
 *   ✓ order_status_log    her geçiş kaydedilir → teslim/kapanış anı buradan türetilir
 *   ✓ job_run             3 iş izi (biri HATALI — "koştu ama düştü" ile "hiç koşmadı" ayrımı)
 *   ✓ settings            migration 0016'da seed'li (16 varsayılan) — burada tekrarlanmaz
 *   ✗ email_verifications GEÇİCİ OTP kaydı — seed'lenmez (dakikalar içinde ölür, giriş akışı üretir)
 *   ✗ auth.users          seed auth hesabı AÇMAZ; profiller auth'suz durur (giriş yapılınca 0002
 *                         trigger'ı e-postadan eşleştirip bağlar)
 *
 * ADMİN — dikkat: dev auth bypass'ı (`apps/web/lib/guard.ts`, dev'de varsayılan AÇIK) operasyon
 * kapılarını atlayıp sabit bir kimlik enjekte eder. Seed o kimlikle GERÇEK bir admin profili açar
 * (`DEV_ADMIN_PROFILE_ID`) — zorunlu, çünkü `order_status_log.actor_id` gibi alanlar
 * `user_profiles`'a FK'lidir; profilsiz sahte kullanıcı ilk durum geçişinde FK ihlali verirdi.
 *
 * BEDELİ: veritabanında artık bir admin bulunduğu için 0002'nin "ilk giriş yapan admin olur"
 * bootstrap'ı ARTIK TETİKLENMEZ — gerçek hesabınız `customer` olarak açılır. Kendi hesabınızı
 * yükseltmek için: `pnpm set-role <e-posta> admin`. (Seed yalnız YEREL kurulumdur; üretim
 * veritabanına atılmadığı için oradaki bootstrap olduğu gibi durur.)
 *
 * Her bölüm kendi guard'ıyla idempotent: dolu tabloyu atlar, bu yüzden tekrar çalıştırmak güvenlidir.
 * Değerler DETERMİNİSTİK (indise göre) — rastgelelik yok: iki koşu aynı veriyi kurar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AddressService,
  CartService,
  CategoryService,
  CollectionService,
  createServiceRoleClient,
  DeliveryZoneService,
  JobRunService,
  OrderService,
  PriceService,
  ProductImageService,
  ProductService,
  ProductVariantService,
  PurchaseOrderService,
  ReservationService,
  StockAdjustmentService,
  StockIntakeService,
  StockService,
  SupplierProductService,
  SupplierService,
  TemperatureLogService,
  UserProfileService,
} from '@lezzet/database';
import { generateReferenceNo } from '@lezzet/domain-core';
import { getR2, r2Keys } from '@lezzet/storage';
import { DEV_ADMIN_PROFILE_ID, PRODUCT_GALLERY_MAX, resolveLocalizedText, type LocalizedText, type Nutrition, type OrderStatus, type ProductAllergen, type ProductStatus } from '@lezzet/types';

// Seed Next.js dışında çalışır — .env'i elle yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

type Db = ReturnType<typeof createServiceRoleClient>;

// Görsel sürüm damgası — seed bu koşuşta yüklüyor. Public okuma URL'i `?v=<damga>` ile kurulur
// (05.11); damgasız kayıtta yeni dosya CDN'in eski kopyasının arkasında kalırdı.
const NOW = new Date().toISOString();

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
    status: 'passive', // pasif örneği
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
        variants: i % 3 === 0 ? [{ label: '700 g tepsi', netWeightG: 700 }, { label: '1 kg tepsi', netWeightG: 1000 }] : [{ label: '500 g', netWeightG: 500 }],
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

async function seedCatalog(db: Db): Promise<void> {
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
    // Kimlik ÇÖZÜMÜ (bağlan / oluştur / çakışma) motorun işidir — servis yalnız aday getirir. Seed'in
    // ona ihtiyacı yok: telefonlar zaten E.164 yazılı ve tek beklenti "varsa dokunma, yoksa taslak aç"
    // (idempotent). Bu yüzden doğrudan arama + ekleme; iş kuralı burada hesaplanmıyor (STACK §4).
    if (await profiles.findByPhone(c.phone)) {
      console.log(`  · ${c.name} (zaten var)`);
      continue;
    }
    await profiles.insert({ ...c, type: 'type' in c ? c.type : 'individual', roles: ['customer'], isDraft: true });
    created += 1;
    console.log(`  ✓ ${c.name} (taslak açıldı)`);
  }
  console.log(`✓ taslak müşteri: ${created} yeni / ${DRAFT_CUSTOMERS.length} tanım`);
}

// ═══ TİCARİ ZEMİN (03 · 04 · 06 · 07) ════════════════════════════════════════════════════════════
// Katalog doluydu ama altı boştu: fiyatsız ürün satılamaz, stoksuz ürün "tükendi" görünür, bölgesiz
// adres rota gününü hesaplayamaz. Aşağıdaki bölümler o zemini kurar.
//
// SIRA BAĞLAYICIDIR — her bölüm bir öncekinin ürettiği kimliğe dayanır:
//   müşteri/personel → fiyat → bölge → adres → tedarik → stok → düzeltme/sıcaklık → sepet → sipariş
//
// ÇEŞİTLİLİK ÖLÇÜTÜ: bir ekranın her hâli listede BULUNABİLMELİ. Tek bir "mutlu yol" satırı, o
// ekranın boş/uyarı/hata hâllerini hiç göstermez. Bu yüzden her bölümde sınır durumlar bilinçli
// serpiştirilir (tarihi geçmiş parti, ödenmemiş vadeli sipariş, pasif bölge, bayat sepet…).
//
// Değerler DETERMİNİSTİK (indise göre) — rastgelelik yok: aynı seed iki koşuda aynı veriyi kurar,
// "bende öyle çıkmıyor" tartışması doğmaz.

/** Bölüm guard'ı — tablo doluysa atlanır; seed'i tekrar çalıştırmak güvenli kalsın. */
async function tabloDolu(db: Db, table: string): Promise<boolean> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Bugüne göre n gün ötesi/berisi — `YYYY-MM-DD` (tarih kolonları). */
const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Bugüne göre n gün ötesi/berisi — ISO damgası (timestamptz kolonları). */
const an = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
/** 2 ondalığa yuvarlama — para alanları numeric(10,2). */
const euro = (v: number) => Math.round(v * 100) / 100;

// ── Müşteri kartları + personel (04) ─────────────────────────────────────────────────────────────
// Ticari alanlar (vade, limit, kapıda ödeme, KDV no, indirim) checkout'un ödeme seçeneklerini
// belirler — hepsi aynı satırdadır (user_profiles). Kanal SAKLANMAZ: `companyInfo` varlığından
// türetilir, o yüzden B2B kartlarında künye dolu, B2C'de null.
//
// ADMIN SEED'LENMEZ: 0002 trigger'ı "hiç admin yoksa ilk giren admin olur" der; buraya admin rolü
// koymak o bootstrap'ı sessizce kapatırdı. Depo/kurye/muhasebe rolleri bootstrap'ı engellemez.

interface SeedKisi {
  key: string;
  /** Yalnız dev admin'de sabit: bypass kimliğiyle AYNI olmak zorunda (bkz. `DEV_ADMIN_PROFILE_ID`). */
  id?: string;
  name: string;
  email: string;
  phone: string;
  roles: ('customer' | 'admin' | 'warehouse' | 'courier' | 'accounting')[];
  type?: 'individual' | 'company';
  country?: 'FR' | 'DE';
  preferredLanguage?: 'tr' | 'fr' | 'de';
  companyInfo?: { legalName: string; siret?: string; activityCode?: string; foundedYear?: number; isActive?: boolean };
  vatNumber?: string;
  vatNumberValid?: boolean;
  b2bApproved?: boolean;
  creditEnabled?: boolean;
  creditLimit?: number;
  paymentTermDays?: number;
  discountPercent?: number;
  codAllowed?: boolean;
  marketingConsent?: { email?: { granted: boolean; at?: string; source?: string } };
  note?: string;
}

const KISILER: SeedKisi[] = [
  // — B2B: onaylı, vadeli, indirimli. Açık bakiye/gecikme testinin öznesi.
  {
    key: 'b2bOnayli',
    name: 'Restaurant Bosphore',
    email: 'compta@bosphore-strasbourg.fr',
    phone: '+33388221100',
    roles: ['customer'],
    type: 'company',
    companyInfo: { legalName: 'SARL BOSPHORE', siret: '81234567800019', activityCode: '5610A', foundedYear: 2015, isActive: true },
    vatNumber: 'FR81812345678',
    vatNumberValid: true,
    b2bApproved: true,
    creditEnabled: true,
    creditLimit: 2500,
    paymentTermDays: 30,
    discountPercent: 5,
    codAllowed: true,
    marketingConsent: { email: { granted: true, at: an(-120), source: 'b2b-kayit' } },
    note: 'Haftalık düzenli alım; perşembe rotası.',
  },
  // — B2B: kaydolmuş ama ONAY BEKLİYOR. Toptan fiyatı görmemeli (b2bApproved=false).
  {
    key: 'b2bBekleyen',
    name: 'Épicerie Anatolia',
    email: 'contact@epicerie-anatolia.fr',
    phone: '+33390445566',
    roles: ['customer'],
    type: 'company',
    companyInfo: { legalName: 'EPICERIE ANATOLIA SAS', siret: '90011223300017', activityCode: '4711B', foundedYear: 2023, isActive: true },
    vatNumber: 'FR90900112233',
    vatNumberValid: null as unknown as undefined, // hiç sorulmadı — VIES çağrısı yapılmamış
    b2bApproved: false,
    codAllowed: true,
    note: 'Self-servis B2B kaydı — onay bekliyor.',
  },
  // — B2B Almanya: yurt içi DEĞİL, reverse charge adayı (geçerli KDV no).
  {
    key: 'b2bAlman',
    name: 'Anadolu Markt Kehl GmbH',
    email: 'einkauf@anadolu-markt.de',
    phone: '+4978519900',
    roles: ['customer'],
    type: 'company',
    country: 'DE',
    preferredLanguage: 'de',
    companyInfo: { legalName: 'Anadolu Markt Kehl GmbH', foundedYear: 2019, isActive: true },
    vatNumber: 'DE811234567',
    vatNumberValid: true,
    b2bApproved: true,
    creditEnabled: true,
    creditLimit: 1200,
    paymentTermDays: 14,
    codAllowed: false,
    note: 'Sınır ötesi B2B — reverse charge.',
  },
  // — B2C: sık alan, rota içi, pazarlama izinli.
  {
    key: 'b2cSadik',
    name: 'Claire Weber',
    email: 'claire.weber@example.fr',
    phone: '+33677889900',
    roles: ['customer'],
    preferredLanguage: 'fr',
    codAllowed: true,
    marketingConsent: { email: { granted: true, at: an(-200), source: 'checkout' } },
  },
  // — B2C: kapıda ödemesi KAPALI (geçmişte teslim alınmayan sipariş). Ödeme seçeneği testi.
  {
    key: 'b2cKapaliKapida',
    name: 'Julien Fischer',
    email: 'julien.fischer@example.fr',
    phone: '+33655443322',
    roles: ['customer'],
    preferredLanguage: 'fr',
    codAllowed: false,
    note: 'Kapıda ödeme kapatıldı: iki sipariş kapıda teslim alınmadı.',
  },
  // — B2C Almanya: OSS eşiği izlemi (DE B2C teslimatı).
  {
    key: 'b2cAlman',
    name: 'Sabine Krüger',
    email: 'sabine.krueger@example.de',
    phone: '+4917612345678',
    roles: ['customer'],
    country: 'DE',
    preferredLanguage: 'de',
    codAllowed: true,
  },
  // — Dev admin: auth bypass'ının GERÇEK profil satırı (`apps/web/lib/guard.ts`). Id sabittir ve
  //   bypass kimliğiyle aynıdır; aksi halde operasyon ekranı ilk durum geçişini yazarken
  //   `actor_id` FK'sinden düşerdi. E-posta kimsenin giriş yapmayacağı bir yerel adres.
  { key: 'devAdmin', id: DEV_ADMIN_PROFILE_ID, name: 'Dev Admin (bypass)', email: 'dev-admin@lezzet.local', phone: '+33600000100', roles: ['admin'], preferredLanguage: 'tr' },
  // — Personel: operasyon rolleri. Sipariş geçişlerinin AKTÖRÜ ve kuryesi bunlar.
  { key: 'depocu', name: 'Deniz Arslan', email: 'depo@lezzetanatolia.fr', phone: '+33600000101', roles: ['warehouse'], preferredLanguage: 'tr' },
  { key: 'kurye', name: 'Marc Lemoine', email: 'kurye@lezzetanatolia.fr', phone: '+33600000102', roles: ['courier'], preferredLanguage: 'fr' },
  // Çoklu operasyon rolü olağandır (DOMAIN §2): depo + muhasebe aynı kişide olabilir.
  { key: 'muhasebe', name: 'Ayşe Demir', email: 'muhasebe@lezzetanatolia.fr', phone: '+33600000103', roles: ['accounting', 'warehouse'], preferredLanguage: 'tr' },
];

type Kisiler = Map<string, string>;

/** Kartları açar (varsa dokunmaz) ve `key → profil id` haritasını döner. */
async function seedKisiler(db: Db): Promise<Kisiler> {
  const profiles = new UserProfileService(db);
  const harita: Kisiler = new Map();
  console.log('▸ MÜŞTERİ KARTI + PERSONEL seed');

  for (const k of KISILER) {
    const mevcut = await profiles.findByEmail(k.email);
    if (mevcut) {
      harita.set(k.key, mevcut.id);
      continue;
    }
    const { key, note, ...alanlar } = k;
    const created = await profiles.insert({
      ...alanlar,
      type: k.type ?? 'individual',
      country: k.country ?? 'FR',
      preferredLanguage: k.preferredLanguage ?? 'fr',
      isDraft: false,
    });
    harita.set(key, created.id);
    console.log(`  ✓ ${k.name} · ${k.roles.join('+')}${note ? ` · ${note}` : ''}`);
  }
  console.log(`✓ kişi: ${harita.size} kart (dev admin dâhil — gerçek hesabı admin yapmak: pnpm set-role <e-posta> admin)`);
  return harita;
}

// ── Katalog referansı ────────────────────────────────────────────────────────────────────────────

interface VaryantRef {
  id: string;
  productId: string;
  ad: string;
  vatRate: number;
  status: ProductStatus;
  shelfLifeDays: number | null;
}

/** Fiyat/stok/sipariş bölümlerinin ortak girdisi: satılabilir birimler TEK sorguda (N+1 yok). */
async function katalogVaryantlari(db: Db): Promise<VaryantRef[]> {
  const page = await new ProductService(db).listWithRelations({ limit: 500 });
  return page.rows.flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      productId: p.id,
      ad: `${resolveLocalizedText(p.name)} · ${v.label}`,
      vatRate: p.vatRate,
      status: p.status,
      shelfLifeDays: p.shelfLifeDays,
    })),
  );
}

// ── Fiyat (03/05) ────────────────────────────────────────────────────────────────────────────────
// Aynı tablo üç işi görür: kanal listesi · müşteriye özel fiyat · tarihli geçerlilik. Üçü de
// örneklenir, yoksa fiyat çözücünün "en özgül kazanır" kuralı hiç denenmez.
//
// TABAN FARKI (DOMAIN §5): b2c satırı KDV DAHİL (TTC), b2b satırı KDV HARİÇ (HT). Aynı ürünün iki
// satırı bu yüzden birbirine eşit değildir — b2b sayısının küçük görünmesi hata değil, tabandır.

async function seedPrices(db: Db, varyantlar: VaryantRef[], kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'price')) {
    console.log('▸ fiyatlar zaten dolu — atlandı');
    return;
  }
  console.log('▸ FİYAT seed');
  const prices = new PriceService(db);
  let satir = 0;

  for (const [i, v] of varyantlar.entries()) {
    // Aday ürün satışta değildir; fiyatı da olmasın (fiyatsız aday = gerçekçi boş durum).
    if (v.status === 'candidate') continue;

    const b2cTtc = euro(6.5 + (i % 14) * 1.75);
    // Toptan: KDV'siz tabana in, üstüne toptan indirimi uygula.
    const b2bHt = euro((b2cTtc / (1 + v.vatRate / 100)) * 0.82);

    // Her 11'incisinde ESKİ bir liste bırakılır: fiyat geçmişi ve "hangi listeden çıktı" görünür.
    if (i % 11 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amount: euro(b2cTtc * 0.92), validFrom: gun(-120) });
      satir += 1;
    }
    await prices.setPrice({ variantId: v.id, channel: 'b2c', amount: b2cTtc, validFrom: gun(-30) });
    await prices.setPrice({ variantId: v.id, channel: 'b2b', amount: b2bHt, validFrom: gun(-30) });
    satir += 2;

    // Her 17'ncisinde İLERİ TARİHLİ zam: "zam önceden planlanır" kuralı denenebilsin.
    if (i % 17 === 0) {
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amount: euro(b2cTtc * 1.08), validFrom: gun(30) });
      satir += 1;
    }
  }

  // Müşteriye ÖZEL fiyat — pazarlıkla anlaşılmış satırlar; kanal listesini ezer (en özgül kazanır).
  const ozelMusteri = kisiler.get('b2bOnayli');
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  if (ozelMusteri) {
    for (const v of satilabilir.slice(0, 6)) {
      const liste = euro(6.5 + (satilabilir.indexOf(v) % 14) * 1.75);
      await prices.setPrice({
        variantId: v.id,
        channel: 'b2b',
        customerId: ozelMusteri,
        amount: euro((liste / (1 + v.vatRate / 100)) * 0.74), // listeden daha iyi
        validFrom: gun(-60),
      });
      satir += 1;
    }
  }
  console.log(`✓ fiyat: ${satir} satır (b2c TTC + b2b HT · geçmiş · ileri tarihli · müşteriye özel)`);
}

// ── Teslimat bölgesi + adres (07) ────────────────────────────────────────────────────────────────
// Rota içi/dışı SAKLANMAZ: adresin posta kodu aktif bir bölgeye düşüyorsa rota içidir. Bu yüzden
// adreslerin bir kısmı bilinçli olarak HİÇBİR bölgeye düşmez — "kargoya düşen adres" hâli.

const BOLGELER = [
  { name: 'Strasbourg Merkez', postalCodes: ['67000', '67100', '67200'], weekdays: [2, 5] }, // salı + cuma
  { name: 'Schiltigheim / Bischheim', postalCodes: ['67300', '67800'], weekdays: [4] }, // perşembe
  { name: 'Illkirch / Ostwald', postalCodes: ['67400', '67540'], weekdays: [3, 6] },
  { name: 'Kehl (DE) — hazırlanıyor', postalCodes: ['77694'], weekdays: [5], isActive: false }, // pasif bölge
];

async function seedDeliveryZones(db: Db): Promise<void> {
  if (await tabloDolu(db, 'delivery_zone')) {
    console.log('▸ bölgeler zaten dolu — atlandı');
    return;
  }
  console.log('▸ TESLİMAT BÖLGESİ seed');
  const zones = new DeliveryZoneService(db);
  for (const b of BOLGELER) {
    await zones.insert(b);
    console.log(`  ✓ ${b.name} · ${b.postalCodes.join(', ')} · gün ${b.weekdays.join(',')}${b.isActive === false ? ' · PASİF' : ''}`);
  }
  console.log(`✓ bölge: ${BOLGELER.length} kayıt (3 aktif + 1 pasif)`);
}

async function seedAddresses(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'address')) {
    console.log('▸ adresler zaten dolu — atlandı');
    return;
  }
  console.log('▸ ADRES seed');
  const addresses = new AddressService(db);
  const tanimlar: Array<{ kisi: string; line1: string; line2?: string; postalCode: string; city: string; country?: 'FR' | 'DE'; isDefault?: boolean }> = [
    // Rota içi (aktif bölge posta kodları)
    { kisi: 'b2bOnayli', line1: '12 rue du Faubourg de Pierre', postalCode: '67000', city: 'Strasbourg', isDefault: true },
    { kisi: 'b2bOnayli', line1: '4 quai Kléber', line2: 'Dépôt arrière', postalCode: '67000', city: 'Strasbourg' }, // ikinci adres
    { kisi: 'b2cSadik', line1: '8 rue de Bischwiller', postalCode: '67300', city: 'Schiltigheim', isDefault: true },
    { kisi: 'b2cKapaliKapida', line1: '31 route de Lyon', postalCode: '67400', city: 'Illkirch-Graffenstaden', isDefault: true },
    // Rota DIŞI — hiçbir aktif bölgeye düşmez → kargo yolu
    { kisi: 'b2cSadik', line1: '17 avenue Jean Jaurès', postalCode: '69007', city: 'Lyon' },
    { kisi: 'b2cAlman', line1: 'Hauptstraße 45', postalCode: '77652', city: 'Offenburg', country: 'DE', isDefault: true },
    // Pasif bölgeye düşen adres: bölge açılınca rota içi olacak, bugün değil
    { kisi: 'b2bAlman', line1: 'Marktplatz 3', postalCode: '77694', city: 'Kehl', country: 'DE', isDefault: true },
    { kisi: 'b2bBekleyen', line1: '22 rue de la Krutenau', postalCode: '67000', city: 'Strasbourg', isDefault: true },
  ];

  let sayi = 0;
  for (const { kisi, ...alanlar } of tanimlar) {
    const customerId = kisiler.get(kisi);
    if (!customerId) continue;
    await addresses.addForCustomer({ ...alanlar, customerId });
    sayi += 1;
  }
  console.log(`✓ adres: ${sayi} kayıt (rota içi · rota dışı · pasif bölgede)`);
}

// ── Tedarik zinciri (06) ─────────────────────────────────────────────────────────────────────────
// Tedarikçiye borç SAKLANMAZ, türetilir (Σ giriş − Σ ödeme). Tedarik siparişi TEDARİKÇİNİN DİLİYLE
// yazılır: bizim varyantımız ↔ onun kodu eşlemesi olmadan liste ona bir şey ifade etmez.

const TEDARIKCILER = [
  { key: 'gaziantep', name: 'Gaziantep Baklava Fabrikası', vatNumber: 'TR1234567890', paymentTermDays: 45, contact: { phone: '+903423456789', email: 'ihracat@gaziantepbaklava.com.tr', city: 'Gaziantep' }, note: 'Ana tedarikçi — 45 gün vade, aylık konteyner.' },
  { key: 'alsace', name: 'Alsace Frais Distribution', paymentTermDays: 15, contact: { phone: '+33388991122', email: 'commandes@alsace-frais.fr', city: 'Strasbourg' }, note: 'Yerel taze ürün; haftalık.' },
  { key: 'eskiTedarik', name: 'Marmara Gıda (eski)', paymentTermDays: null, contact: { phone: '+902165550000' }, isActive: false, note: 'Çalışılmıyor — kalite sorunu.' },
];

async function seedSupply(db: Db, varyantlar: VaryantRef[]): Promise<Map<string, string>> {
  const suppliers = new SupplierService(db);
  const harita = new Map<string, string>();

  if (await tabloDolu(db, 'supplier')) {
    console.log('▸ tedarikçiler zaten dolu — atlandı');
    for (const t of await suppliers.list()) harita.set(t.name, t.id);
    return harita;
  }

  console.log('▸ TEDARİKÇİ + TEDARİK SİPARİŞİ seed');
  const mapping = new SupplierProductService(db);
  const purchases = new PurchaseOrderService(db);

  for (const t of TEDARIKCILER) {
    const { key, ...alanlar } = t;
    const created = await suppliers.insert(alanlar);
    harita.set(key, created.id);
    console.log(`  ✓ ${t.name}${t.isActive === false ? ' · PASİF' : ''}`);
  }

  // Ürün–kod eşlemesi: ilk 18 varyant iki tedarikçiye de bağlanır (fiyat karşılaştırması için),
  // biri TERCİHLİ. Koli içi adet bazılarında dolu — "12 adet = 1 koli" çevirisi telefonda biter.
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate').slice(0, 18);
  const ana = harita.get('gaziantep')!;
  const yerel = harita.get('alsace')!;
  for (const [i, v] of satilabilir.entries()) {
    await mapping.setMapping({
      supplierId: ana,
      variantId: v.id,
      supplierCode: `GZT-${String(1000 + i)}`,
      nameAtSupplier: `${v.ad.split(' · ')[0]} (fabrika)`,
      packQty: i % 3 === 0 ? 12 : i % 3 === 1 ? 6 : null,
      lastPurchasePrice: euro(2.4 + (i % 7) * 0.35),
      isPreferred: true,
    });
    // İkinci kaynak yalnız bir kısmında — hepsinde olsaydı "tek kaynaklı ürün" hâli görünmezdi.
    if (i % 4 === 0) {
      await mapping.setMapping({
        supplierId: yerel,
        variantId: v.id,
        supplierCode: `AF-${String(500 + i)}`,
        nameAtSupplier: `${v.ad.split(' · ')[0]} (local)`,
        packQty: 10,
        lastPurchasePrice: euro(2.9 + (i % 5) * 0.4),
      });
    }
  }

  // Tedarik siparişleri — dört durumun dördü de örneklenir.
  const taslak = await purchases.createDraft(ana, satilabilir.slice(0, 5).map((v, i) => ({ variantId: v.id, qty: 24 + i * 6, unitPrice: euro(2.4 + i * 0.3) })), 'Bayram öncesi ek sipariş — taslak.');
  const gonderilen = await purchases.createDraft(ana, satilabilir.slice(5, 11).map((v, i) => ({ variantId: v.id, qty: 36 + i * 12, unitPrice: euro(2.6 + i * 0.25) })), 'Aylık ana sipariş.');
  await purchases.markSent(gonderilen.order.id);
  const iptal = await purchases.createDraft(yerel, satilabilir.slice(0, 2).map((v) => ({ variantId: v.id, qty: 10 })), 'Yanlış tedarikçiye açıldı.');
  await purchases.cancel(iptal.order.id);
  // Dördüncüsü (received) mal kabulde kapanır — stok bölümü onu kullanır.
  const kabulBekleyen = await purchases.createDraft(ana, satilabilir.slice(11, 16).map((v, i) => ({ variantId: v.id, qty: 48 + i * 6, unitPrice: euro(2.2 + i * 0.4) })), 'Gelen konteyner — mal kabulde kapanacak.');
  await purchases.markSent(kabulBekleyen.order.id);
  harita.set('kabulBekleyenPo', kabulBekleyen.order.id);

  console.log(`  ✓ tedarik siparişi: taslak(${taslak.items.length}) · gönderildi(${gonderilen.items.length}) · iptal(${iptal.items.length}) · kabul bekleyen(${kabulBekleyen.items.length})`);
  console.log(`✓ tedarik: ${TEDARIKCILER.length} tedarikçi · ${satilabilir.length} eşleme · 4 sipariş`);
  return harita;
}

// ── Stok partileri (06) ──────────────────────────────────────────────────────────────────────────
// Parti çeşitliliği olmadan raf ömrü kuralları hiç görünmez: FEFO ancak farklı tarihli iki partide
// anlaşılır, "yaklaşan son tarih" uyarısı %25 eşiğinin altına inen parti olmadan tetiklenmez,
// "satılamaz" kuralı ise DLC'si geçmiş bir parti olmadan denenemez.
//
// Partilerin ÇOĞU mal kabulden doğar (izlenebilir zincir: sipariş → giriş → parti); bir kısmı
// doğrudan yazılır (eski/özel durumlar).

async function seedStock(db: Db, varyantlar: VaryantRef[], tedarik: Map<string, string>): Promise<void> {
  if (await tabloDolu(db, 'stock')) {
    console.log('▸ stok zaten dolu — atlandı');
    return;
  }
  console.log('▸ STOK + MAL KABUL seed');
  const intakes = new StockIntakeService(db);
  const stocks = new StockService(db);
  const products = new ProductService(db);
  const variants = new ProductVariantService(db);

  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  const ana = tedarik.get('gaziantep')!;
  const yerel = tedarik.get('alsace')!;

  // 1) PO'lu mal kabul — tedarik siparişini kapatır ve "sipariş edilen vs gelen" farkı doğar
  //    (bilinçli EKSİK gelir: fark raporunun gösterecek bir şeyi olsun).
  const poKalemleri = satilabilir.slice(11, 16);
  await intakes.receive({
    supplierId: ana,
    purchaseOrderId: tedarik.get('kabulBekleyenPo'),
    date: gun(-9),
    note: 'Konteyner #A-227 — iki kalem eksik geldi.',
    lines: poKalemleri.map((v, i) => ({
      variantId: v.id,
      qty: i === 2 ? 30 : 48 + i * 6, // üçüncü kalem eksik → fark raporu
      expiryDate: gun(150 + i * 20),
      lotNumber: `A227-${String(i + 1).padStart(2, '0')}`,
      unitCost: euro(2.2 + i * 0.4),
      location: `Dolap ${1 + (i % 3)}`,
    })),
  });

  // 2) PO'suz doğrudan alım — küçük/plansız alım da mümkündür (zincir zorunlu değil).
  await intakes.receive({
    supplierId: yerel,
    date: gun(-3),
    note: 'Haftalık taze alım (sipariş açılmadan).',
    lines: satilabilir.slice(0, 6).map((v, i) => ({
      variantId: v.id,
      qty: 20 + i * 4,
      expiryDate: gun(25 + i * 15),
      lotNumber: `AF-${gun(-3).replaceAll('-', '')}-${i}`,
      unitCost: euro(2.9 + i * 0.2),
      location: 'Soğuk oda',
    })),
  });

  // 3) Hacim: listeler, eşik uyarıları ve FEFO ancak çok sayıda parti varken gerçekçi görünür.
  //    Her varyanta 1-3 parti; tarihler bilinçli farklı (FEFO sırası görünür olsun).
  let ekParti = 0;
  for (const [i, v] of satilabilir.entries()) {
    const partiSayisi = 1 + (i % 3);
    for (let p = 0; p < partiSayisi; p += 1) {
      await stocks.insert({
        variantId: v.id,
        physicalQty: 6 + ((i + p * 5) % 40),
        expiryDate: gun(20 + ((i * 7 + p * 45) % 300)),
        lotNumber: `L${String(2600 + i)}-${p + 1}`,
        purchasePrice: euro(2.1 + ((i + p) % 9) * 0.3),
        location: `Dolap ${1 + ((i + p) % 4)}`,
      });
      ekParti += 1;
    }
  }

  // 4) SINIR DURUMLAR — ekranların uyarı/engel hâlleri bunlarsız hiç görünmez.
  const ozel = satilabilir.slice(0, 8);
  // Yaklaşan son tarih + indirimli teklif (parti fiyatı): near-expiry havuzu
  const teklifA = await stocks.insert({ variantId: ozel[0]!.id, physicalQty: 14, expiryDate: gun(4), lotNumber: 'NE-001', purchasePrice: 2.4, location: 'Dolap 1' });
  await stocks.setOfferPrice(teklifA.id, euro(4.9));
  const teklifB = await stocks.insert({ variantId: ozel[1]!.id, physicalQty: 9, expiryDate: gun(7), lotNumber: 'NE-002', purchasePrice: 3.1, location: 'Dolap 2' });
  await stocks.setOfferPrice(teklifB.id, euro(5.5));
  // Yaklaşan ama HENÜZ indirime alınmamış — "sistem önerir, karar insanın" hâli
  await stocks.insert({ variantId: ozel[2]!.id, physicalQty: 11, expiryDate: gun(6), lotNumber: 'NE-003', purchasePrice: 2.8, location: 'Dolap 1' });
  // Tarihi GEÇMİŞ partiler: biri DLC (satılamaz — imha edilecek), biri DDM (satılabilir)
  await stocks.insert({ variantId: ozel[3]!.id, physicalQty: 5, expiryDate: gun(-2), lotNumber: 'EXP-DLC', purchasePrice: 3.4, location: 'Karantina' });
  await stocks.insert({ variantId: ozel[4]!.id, physicalQty: 8, expiryDate: gun(-6), lotNumber: 'EXP-DDM', purchasePrice: 2.2, location: 'Dolap 3' });
  // Tükenmiş parti (fiili 0): satır durur, miktarı biter — "geçmiş parti" görünümü
  await stocks.insert({ variantId: ozel[5]!.id, physicalQty: 0, expiryDate: gun(90), lotNumber: 'L-BITTI', purchasePrice: 2.6, location: 'Dolap 2' });
  // Alış fiyatı GİRİLMEMİŞ parti: gerçek COGS bu partide hesaplanamaz (rapor bunu göstermeli)
  await stocks.insert({ variantId: ozel[6]!.id, physicalQty: 12, expiryDate: gun(120), lotNumber: 'L-MALIYETSIZ', location: 'Dolap 4' });

  // İki ürün DLC'ye çekilir: "geçince satılamaz" kuralı ancak DLC'li bir üründe denenebilir
  // (varsayılan DDM). Katalog bölümü bu alanı vermiyor, karar burada veriliyor.
  await products.update({ id: ozel[3]!.productId, dateType: 'DLC' });
  await products.update({ id: ozel[0]!.productId, dateType: 'DLC' });

  // Asgari stok eşiği: bir kısmı bilinçli olarak ALTINDA kalsın ki yeniden-sipariş önerisi dolsun.
  for (const [i, v] of satilabilir.slice(0, 20).entries()) {
    await variants.update({ id: v.id, minStockQty: i % 4 === 0 ? 60 : 8 + (i % 5) * 3 });
  }

  console.log(`  ✓ mal kabul: 2 giriş (biri PO'lu ve EKSİK gelmiş → fark raporu)`);
  console.log(`  ✓ sınır durumlar: 2 indirimli teklif · 1 indirimsiz yaklaşan · DLC geçmiş · DDM geçmiş · tükenmiş · maliyetsiz`);
  console.log(`✓ stok: ${ekParti + 18} parti · 20 varyantta asgari eşik`);
}

// ── Stok düzeltmesi + sıcaklık kaydı (06) ────────────────────────────────────────────────────────
// Kayıp görünmezse yönetilemez: "bu üründen yılda ne kadar çöpe attım" sorusunun tek cevabı
// düzeltme tablosudur. Beş sebebin beşi de örneklenir — biri İKİ YÖNLÜ (sayım fazlası).

async function seedAdjustments(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'stock_adjustment')) {
    console.log('▸ stok düzeltmeleri zaten dolu — atlandı');
    return;
  }
  console.log('▸ STOK DÜZELTMESİ seed');
  const adjustments = new StockAdjustmentService(db);
  const depocu = kisiler.get('depocu') ?? null;

  // Düzeltme partiye yazılır → düzeltilecek partileri lot numarasından buluyoruz (seed'in kendi izi).
  const { data, error } = await db.from('stock').select('id,lot_number,physical_qty').not('lot_number', 'is', null).limit(400);
  if (error) throw error;
  const partiler = (data ?? []) as Array<{ id: string; lot_number: string; physical_qty: number }>;
  const bul = (lot: string) => partiler.find((p) => p.lot_number === lot);
  const dolu = partiler.filter((p) => p.physical_qty > 4);

  const islemler: Array<{ stockId: string; qty: number; reason: 'expired' | 'damaged' | 'count_diff' | 'lost' | 'return_restock'; note: string }> = [];

  const dlcGecmis = bul('EXP-DLC');
  if (dlcGecmis) islemler.push({ stockId: dlcGecmis.id, qty: 3, reason: 'expired', note: 'DLC geçti — imha edildi (tutanak #12).' });
  if (dolu[0]) islemler.push({ stockId: dolu[0].id, qty: 2, reason: 'damaged', note: 'Nakliyede kutu ezildi.' });
  if (dolu[1]) islemler.push({ stockId: dolu[1].id, qty: 1, reason: 'lost', note: 'Sayımda bulunamadı.' });
  // Sayım farkı İKİ YÖNLÜDÜR: eksik de çıkabilir fazla da. Tek yönlü örnek, işaretli alanı gizlerdi.
  if (dolu[2]) islemler.push({ stockId: dolu[2].id, qty: 4, reason: 'count_diff', note: 'Yıl sonu sayımı — eksik.' });
  if (dolu[3]) islemler.push({ stockId: dolu[3].id, qty: -3, reason: 'count_diff', note: 'Yıl sonu sayımı — fazla çıktı.' });
  // İade restoku istisnadır: sebep notu ZORUNLU (soğuk zincir belgelenemezse imha varsayılandır).
  if (dolu[4]) islemler.push({ stockId: dolu[4].id, qty: -2, reason: 'return_restock', note: 'Kapıda reddedildi, frigo araçtan hiç çıkmadı — admin onayıyla restok.' });

  for (const i of islemler) await adjustments.adjust({ ...i, createdBy: depocu });
  console.log(`✓ stok düzeltmesi: ${islemler.length} kayıt (imha · hasar · kayıp · sayım ±  · iade restoku)`);
}

// Hijyen denetiminin ilk istediği veri. Sensör yok, elle giriş: seri de o yüzden seyrek ve
// bazen ARALIK DIŞI — hep -18 °C olsaydı uyarı eşiği hiç denenmezdi.
const SICAKLIK_NOKTALARI = [
  { location: 'Derin dondurucu 1', taban: -19.5, sapma: 0.8 },
  { location: 'Derin dondurucu 2', taban: -18.4, sapma: 1.2 },
  { location: 'Soğuk oda', taban: 3.2, sapma: 1.1 },
  { location: 'Frigo araç', taban: -17.2, sapma: 2.4 },
];

async function seedTemperatureLogs(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'temperature_log')) {
    console.log('▸ sıcaklık kayıtları zaten dolu — atlandı');
    return;
  }
  console.log('▸ SICAKLIK KAYDI seed');
  const logs = new TemperatureLogService(db);
  const depocu = kisiler.get('depocu') ?? null;
  let sayi = 0;

  // 21 gün × sabah/akşam ölçüm — liste ve tarih süzgeci gerçekçi bir seride denenebilsin.
  for (let g = 21; g >= 0; g -= 1) {
    for (const [n, nokta] of SICAKLIK_NOKTALARI.entries()) {
      for (const saat of [7, 18]) {
        const dalga = Math.sin((g * 2 + n + saat) / 3) * nokta.sapma;
        // Her 9'uncu ölçümde bilinçli SAPMA: kapı açık kalmış / araç güneşte beklemiş.
        const kaza = (g * 4 + n) % 9 === 0 ? 5.5 : 0;
        const zaman = new Date(Date.now() - g * 86_400_000);
        zaman.setHours(saat, 0, 0, 0);
        await logs.insert({
          location: nokta.location,
          temperatureC: euro(nokta.taban + dalga + kaza),
          recordedBy: depocu,
          recordedAt: zaman.toISOString(),
        });
        sayi += 1;
      }
    }
  }
  console.log(`✓ sıcaklık: ${sayi} ölçüm · ${SICAKLIK_NOKTALARI.length} nokta (bir kısmı aralık DIŞI)`);
}

// ── Sepet (07) ───────────────────────────────────────────────────────────────────────────────────
// Sepette stok AYRILMAZ ve sepetteki fiyat BAĞLAYICI DEĞİLDİR (DOMAIN §5): gösterimdir. Bayat sepet
// bilinçli konuyor — checkout'ta "fiyat değişti" bildirimi ancak eski fiyatlı bir sepetle denenir.

async function seedCarts(db: Db, kisiler: Kisiler, varyantlar: VaryantRef[]): Promise<void> {
  if (await tabloDolu(db, 'cart')) {
    console.log('▸ sepetler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEPET seed');
  const carts = new CartService(db);
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  const { data } = await db.from('stock').select('id,variant_id').not('offer_price', 'is', null).limit(1);
  const teklif = (data ?? [])[0] as { id: string; variant_id: string } | undefined;

  const b2c = kisiler.get('b2cSadik');
  if (b2c) {
    for (const [i, v] of satilabilir.slice(0, 3).entries()) {
      await carts.addItem(b2c, { variantId: v.id, qty: 1 + i, unitPrice: euro(8 + i * 2) });
    }
    // Partiye çıpalı teklif satırı: indirim PARTİYE aittir, parti tükenirse kalem normal fiyata döner.
    if (teklif) await carts.addItem(b2c, { variantId: teklif.variant_id, qty: 2, unitPrice: 4.9, stockId: teklif.id });
  }

  const b2b = kisiler.get('b2bOnayli');
  if (b2b) {
    // Toptan sepeti: çok kalem, yüksek adet — asgari sepet ve kargo eşiği burada anlam kazanır.
    for (const [i, v] of satilabilir.slice(4, 12).entries()) {
      await carts.addItem(b2b, { variantId: v.id, qty: 6 + i * 2, unitPrice: euro(5.4 + i * 0.8) });
    }
  }

  // BAYAT sepet: bir yıl önce eklenmiş, fiyatı artık yanlış. "Sepette bekleyen fiyat bağlayıcı
  // değildir" kararının (DOMAIN §5) görünür kanıtı.
  const bayat = kisiler.get('b2cKapaliKapida');
  if (bayat && satilabilir[2]) {
    await carts.addItem(bayat, { variantId: satilabilir[2].id, qty: 2, unitPrice: 3.2 });
    // Tarihi geriye almanın SERVİSTE karşılığı yok ve olmamalı: `updatedAt` her dokunuşta tazelenir
    // (sepet kurtarma zamanlaması ona bakar). Geriye almak yalnız seed'in derdi — o yüzden burada,
    // doğrudan. Sepetin anahtarı `customer_id`'dir (id yok), miras `update` bu tabloda çalışmaz.
    const { error } = await db.from('cart').update({ updated_at: an(-380) }).eq('customer_id', bayat);
    if (error) throw error;
  }
  console.log('✓ sepet: 3 sepet (normal · toptan · BAYAT) + partiye çıpalı teklif satırı');
}

// ── Siparişler (07) ──────────────────────────────────────────────────────────────────────────────
// Sipariş katı bir zincir DEĞİL, izin verilen geçişler kümesidir; iki yol vardır (tam yol / hızlı
// satış). Aşağıdaki siparişler durumların HEPSİNİ kaplar — depo kuyruğu, kurye günü, muhasebe
// listesi ve müşteri geçmişi ancak böyle dolu görünür.
//
// Siparişler GERÇEK akışla kurulur (ayır → onayla → hazırla → yola çık → teslim et → kapat), elle
// durum yazılarak değil: böylece rezervasyon, kalem–parti kaydı, geçiş logu ve kâr kalemleri de
// kendiliğinden doğru oluşur.

interface SiparisKalem {
  variantId: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
}

/** Tam yolun durakları — sırayla yürünür; hedef nerede ise orada durulur. */
const TAM_YOL: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'];

async function seedOrders(db: Db, kisiler: Kisiler, varyantlar: VaryantRef[]): Promise<void> {
  if (await tabloDolu(db, 'order')) {
    console.log('▸ siparişler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SİPARİŞ seed');
  const orders = new OrderService(db);
  const reservations = new ReservationService(db);
  const stocks = new StockService(db);
  const zones = await new DeliveryZoneService(db).list({ activeOnly: true });
  const addresses = new AddressService(db);

  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  const kurye = kisiler.get('kurye') ?? null;
  const depocu = kisiler.get('depocu') ?? null;

  /** Kalem kurar: fiyat kanal tabanından, KDV üründen. */
  const kalem = (i: number, qty: number): SiparisKalem => {
    const v = satilabilir[i % satilabilir.length]!;
    return { variantId: v.id, qty, unitPrice: euro(7 + (i % 9) * 1.6), vatRate: v.vatRate };
  };
  const toplam = (kalemler: SiparisKalem[], kargo = 0) => euro(kalemler.reduce((s, k) => s + k.unitPrice * k.qty, 0) + kargo);

  /** Kalemin karşılanabileceği partileri FEFO sırasıyla toplar (hazırlık onayının girdisi). */
  async function partiSec(variantId: string, qty: number): Promise<Array<{ stockId: string; qty: number }>> {
    const partiler = await stocks.listInStock(variantId);
    const secim: Array<{ stockId: string; qty: number }> = [];
    let kalan = qty;
    for (const p of partiler) {
      if (kalan <= 0) break;
      const al = Math.min(p.physicalQty, kalan);
      if (al > 0) secim.push({ stockId: p.id, qty: al });
      kalan -= al;
    }
    return secim;
  }

  const varsayilanAdres = async (customerId: string) => (await addresses.listByCustomer(customerId))[0] ?? null;

  /** Siparişi açar ve hedef duruma kadar GERÇEK akışla yürütür. */
  async function siparis(opts: {
    musteri: string;
    kalemler: SiparisKalem[];
    hedef: 'draft' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled' | 'returned';
    channel: 'b2b' | 'b2c';
    kaynak?: 'web' | 'whatsapp' | 'door' | 'manual';
    deliveryType?: 'route' | 'shipping';
    onAccount?: boolean;
    paymentMethod?: 'online' | 'cash' | 'card' | 'cheque' | 'bank_transfer';
    ttlDk?: number | null;
    kargo?: number;
    tahsilat?: number;
    yasi?: number;
    etiket: string;
  }): Promise<string | null> {
    const customerId = kisiler.get(opts.musteri);
    if (!customerId) return null;

    const adres = await varsayilanAdres(customerId);
    const deliveryType = opts.deliveryType ?? 'route';
    const zone = deliveryType === 'route' ? zones.find((z) => adres && z.postalCodes.includes(adres.postalCode)) : undefined;

    const { order, items } = await orders.create(
      {
        customerId,
        channel: opts.channel,
        orderSource: opts.kaynak ?? 'web',
        deliveryType,
        deliveryZoneId: zone?.id ?? null,
        deliveryDate: deliveryType === 'route' ? gun(2) : null,
        addressId: adres?.id ?? null,
        addressSnapshot: adres ? { line1: adres.line1, postalCode: adres.postalCode, city: adres.city, country: adres.country } : null,
        courierId: ['out_for_delivery', 'delivered', 'completed', 'returned'].includes(opts.hedef) ? kurye : null,
        onAccount: opts.onAccount ?? false,
        paymentMethod: opts.paymentMethod ?? null,
        shippingFee: opts.kargo ?? 0,
        total: toplam(opts.kalemler, opts.kargo ?? 0),
      },
      opts.kalemler,
    );

    // Yaşlandırma: vade gecikmesi ve "eski sipariş" ancak geçmiş tarihli kayıtta görünür.
    if (opts.yasi) await orders.update({ id: order.id, createdAt: an(-opts.yasi) });

    // Hızlı satış AYRI YOLDUR: rezervasyon yok, fiiliden anında düşer (07.10).
    if (opts.kaynak === 'door' && opts.hedef === 'completed') {
      const picks = [];
      for (const item of items) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, item.qty) });
      const sonuc = await orders.quickSale({
        orderId: order.id,
        picks,
        actorId: depocu,
        // Referans MOTORDAN gelir (biçim tek yerde tanımlı); hızlı satışta ilk kalıcı durum `completed`.
        referenceNo: generateReferenceNo({ year: new Date().getFullYear() }),
        paymentMethod: opts.paymentMethod ?? 'cash',
        amountCollected: opts.tahsilat ?? toplam(opts.kalemler),
        paymentStatus: 'paid',
      });
      console.log(`  ✓ ${opts.etiket} · ${sonuc.ok ? 'kapandı' : `atlandı (${sonuc.reason})`}`);
      return order.id;
    }

    if (opts.hedef === 'draft') {
      // Online checkout başlamış, ödeme bekleniyor: rezervasyon TTL'li (süre dolarsa cron bırakır).
      for (const item of items) await reservations.reserve({ orderId: order.id, variantId: item.variantId, qty: item.qty, ttlMinutes: opts.ttlDk ?? 30 });
      console.log(`  ✓ ${opts.etiket} · taslak (TTL'li rezervasyon)`);
      return order.id;
    }

    // Tam yol: önce ayır (kapıda/vadeli → süresiz), sonra ilerlet.
    for (const item of items) await reservations.reserve({ orderId: order.id, variantId: item.variantId, qty: item.qty });

    // İptal/iade kendi hedefine doğrudan gitmez: siparişin oraya gelmiş olması gerekir. İptal
    // `confirmed`'dan, iade ise teslim SONRASINDAN olur — yol farkı budur (ORDER_LIFECYCLE).
    const durak: OrderStatus[] =
      opts.hedef === 'cancelled'
        ? ['confirmed']
        : opts.hedef === 'returned'
          ? ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']
          : TAM_YOL.slice(0, TAM_YOL.indexOf(opts.hedef as OrderStatus) + 1);

    let onceki: OrderStatus = 'draft';
    for (const hedef of durak) {
      if (hedef === 'preparing') {
        // Hazırlık onayı: fiilen çıkan partiler yazılır (geri çağırma + gerçek COGS bunun üstünde).
        const picks = [];
        for (const item of items) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, item.qty) });
        await orders.transition({ orderId: order.id, from: onceki, to: 'preparing', actorId: depocu });
        await orders.recordPreparation(order.id, picks);
        onceki = 'preparing';
        continue;
      }
      if (hedef === 'delivered') {
        await orders.deliver(order.id, { actorId: kurye, deliveryProof: { by: 'Kurye', at: an(0), method: 'imza' } });
        onceki = 'delivered';
        continue;
      }
      if (hedef === 'completed') {
        await orders.close(order.id, { actorId: depocu, routeUnitCost: 2.5, packagingUnitCost: 1.2 });
        onceki = 'completed';
        continue;
      }
      // Referans İLK KALICI DURUMDA doğar (tam yolda `confirmed`) — RPC mevcut numarayı ezmez.
      await orders.transition({
        orderId: order.id,
        from: onceki,
        to: hedef,
        actorId: depocu,
        referenceNo: hedef === 'confirmed' ? generateReferenceNo({ year: new Date().getFullYear() }) : null,
      });
      onceki = hedef;
    }

    if (opts.hedef === 'cancelled' || opts.hedef === 'returned') {
      await orders.transition({ orderId: order.id, from: onceki, to: opts.hedef, actorId: depocu });
      await reservations.releaseByOrder(order.id);
    }

    // Tahsilat: `payment_status` TÜRETİLİR ama cache alanları (amount_*) hareketten gelir (modül 12);
    // o zamana kadar seed doğrudan yazar ki ödeme durumu listelerde gerçekçi görünsün.
    if (opts.tahsilat != null) {
      const tutar = opts.tahsilat;
      const beklenen = toplam(opts.kalemler, opts.kargo ?? 0);
      await orders.update({
        id: order.id,
        amountCollected: tutar,
        paymentStatus: tutar <= 0 ? 'pending' : tutar >= beklenen ? 'paid' : 'partial',
      });
    }

    console.log(`  ✓ ${opts.etiket} · ${opts.hedef}`);
    return order.id;
  }

  // — Tam yolun her durağı (depo/kurye kuyrukları dolsun)
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(0, 2), kalem(1, 1)], hedef: 'draft', channel: 'b2c', paymentMethod: 'online', etiket: 'Ödeme bekleyen checkout' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(2, 3)], hedef: 'confirmed', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, etiket: 'Onaylı — kapıda ödeyecek' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(3, 8), kalem(4, 6), kalem(5, 4)], hedef: 'preparing', channel: 'b2b', onAccount: true, etiket: 'Depoda hazırlanıyor (toptan)' });
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(6, 2)], hedef: 'ready', channel: 'b2c', paymentMethod: 'card', tahsilat: 0, etiket: 'Hazır — sevkiyat bekliyor' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(7, 5), kalem(8, 5)], hedef: 'out_for_delivery', channel: 'b2b', onAccount: true, etiket: 'Yolda (kuryede)' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(9, 2), kalem(10, 1)], hedef: 'delivered', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, etiket: 'Teslim edildi — kapıda tahsilat bekliyor' });

  // — Kapanmış siparişler (kâr raporunun girdisi)
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(11, 3)], hedef: 'completed', channel: 'b2c', paymentMethod: 'online', tahsilat: toplam([kalem(11, 3)]), yasi: 12, etiket: 'Kapandı — online ödenmiş' });
  await siparis({ musteri: 'b2cAlman', kalemler: [kalem(12, 2)], hedef: 'completed', channel: 'b2c', deliveryType: 'shipping', kargo: 7.9, paymentMethod: 'online', tahsilat: toplam([kalem(12, 2)], 7.9), yasi: 20, etiket: 'Kapandı — DE kargo (OSS izlemi)' });

  // — Vadeli: AÇIK BAKİYE ve GECİKME türetiminin öznesi (ödenmemiş, biri vadesi geçmiş)
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(13, 10), kalem(14, 6)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: 0, yasi: 45, etiket: 'Vadeli — GECİKMİŞ (45 gün)' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(15, 4)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: 0, yasi: 10, etiket: 'Vadeli — henüz vadesi dolmadı' });
  await siparis({ musteri: 'b2bAlman', kalemler: [kalem(16, 6)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: euro(toplam([kalem(16, 6)]) / 2), yasi: 8, etiket: 'Vadeli — KISMİ ödenmiş' });

  // — Hızlı satış (kapı önü): tek adımda kapanır, rezervasyon yok
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(17, 2)], hedef: 'completed', channel: 'b2c', kaynak: 'door', paymentMethod: 'cash', etiket: 'Hızlı satış — kapı önü (nakit)' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(18, 1), kalem(19, 2)], hedef: 'completed', channel: 'b2c', kaynak: 'door', paymentMethod: 'card', etiket: 'Hızlı satış — kapı önü (kart)' });

  // — İptal ve iade
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(20, 2)], hedef: 'cancelled', channel: 'b2c', paymentMethod: 'online', tahsilat: 0, etiket: 'İptal' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(21, 3)], hedef: 'returned', channel: 'b2b', onAccount: true, tahsilat: 0, etiket: 'İade sürecinde' });

  // — WhatsApp ve elle giriş: kaynak ekseni kanaldan bağımsızdır (CHANNELS §2)
  await siparis({ musteri: 'b2bBekleyen', kalemler: [kalem(22, 4)], hedef: 'confirmed', channel: 'b2c', kaynak: 'whatsapp', paymentMethod: 'cash', tahsilat: 0, etiket: 'WhatsApp siparişi' });
  await siparis({ musteri: 'b2cAlman', kalemler: [kalem(23, 3)], hedef: 'preparing', channel: 'b2c', kaynak: 'manual', deliveryType: 'shipping', kargo: 7.9, paymentMethod: 'bank_transfer', etiket: 'Telefondan elle girilen sipariş' });

  const { count } = await db.from('order').select('*', { count: 'exact', head: true });
  console.log(`✓ sipariş: ${count ?? 0} kayıt (9 durumun hepsi · 4 kaynak · tam yol + hızlı satış)`);
}

// ── Zamanlanmış iş izi (06) ──────────────────────────────────────────────────────────────────────
// İş başına TEK satır (tarihçe tutulmaz). Biri BAŞARISIZ: "koştu ama hata verdi" ile "hiç koşmadı"
// birbirine karışmasın — gecikme alarmı bu ayrımı okur.

async function seedJobRuns(db: Db): Promise<void> {
  if (await tabloDolu(db, 'job_run')) {
    console.log('▸ iş izleri zaten dolu — atlandı');
    return;
  }
  const jobs = new JobRunService(db);
  await jobs.recordSuccess('reservation-sweep', { released: 3, scannedAt: an(0) });
  await jobs.recordSuccess('near-expiry-scan', { flagged: 4, discounted: 2 });
  await jobs.recordFailure('supplier-price-sync', 'Tedarikçi API zaman aşımı (10s) — 3 deneme sonrası bırakıldı.');
  console.log('✓ iş izi: 3 kayıt (2 başarılı · 1 HATALI)');
}

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  await seedCatalog(db);
  await seedCollections(db);
  await seedDraftCustomers(db);

  // Ticari zemin — sıra bağlayıcıdır (her bölüm öncekinin ürettiği kimliğe dayanır).
  const kisiler = await seedKisiler(db);
  const varyantlar = await katalogVaryantlari(db);
  await seedPrices(db, varyantlar, kisiler);
  await seedDeliveryZones(db);
  await seedAddresses(db, kisiler);
  const tedarik = await seedSupply(db, varyantlar);
  await seedStock(db, varyantlar, tedarik);
  await seedAdjustments(db, kisiler);
  await seedTemperatureLogs(db, kisiler);
  await seedCarts(db, kisiler, varyantlar);
  await seedOrders(db, kisiler, varyantlar);
  await seedJobRuns(db);

  // Seed bir admin açtığı için 0002'nin "ilk giren admin olur" bootstrap'ı artık tetiklenmez.
  console.log('✓ seed tamam · operasyon yüzeyi dev bypass ile açık · gerçek hesabı yükseltmek: pnpm set-role <e-posta> admin');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
