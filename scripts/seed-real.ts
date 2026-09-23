// Gerçek başlangıç beslemesi: `seed-real/data.ts`'te yazanı ekler, hiçbir değer üretmez ve katmanlı
// `seed.ts`ten ayrıdır. Var olan kayda dokunmaz — yalnız hâlâ boş ya da varsayılanında duran alanı tamamlar — ki panelden
// yapılan düzeltme yeniden çalıştırmada ezilmesin.
import { receivePurchase } from '@lezzet/application';
import {
  BundleService,
  CategoryImageService,
  CategoryService,
  CollectionService,
  createServiceRoleClient,
  DeliveryZoneService,
  PriceService,
  ProductFamilyService,
  ProductImageService,
  ProductService,
  ProductVariantService,
  PurchaseOrderService,
  RecipeService,
  SettingsService,
  StockIntakeService,
  StockService,
  StorageAreaService,
  SupplierProductService,
  SupplierService,
  VariantBarcodeService,
  VehicleService,
  WarehouseService,
  waitForRest,
} from '@lezzet/database';
import { canPublishProduct, purchaseOrderReferenceNo, rebalanceAllocations } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { PRODUCT_GALLERY_MAX, type LocalizedText, type Product } from '@lezzet/types';

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand } from '../packages/brand/src/index';
import { lezzaGorselUrlByDosya, seedLezzaProducts } from './seed/catalog-lezza';
import { gorselOzeti, r2Keys, uploadImageFromPath, uploadImageFromUrl } from './seed/shared';
import {
  ADAY_SKULARI,
  BUNDLE_DISCOUNT,
  BUNDLES,
  CATEGORIES,
  COLLECTIONS,
  DRAFT_CATEGORY,
  DRAFT_FAMILIES,
  EK_TASLAKLAR,
  KATALOG_BIRLESIK,
  KATALOG_BOY_ADI,
  KATALOG_TEDARIKCISI,
  PURCHASES,
  RECIPES,
  SALE_PRICES,
  SETTINGS,
  STORAGE_AREAS,
  SUPPLIERS,
  TEST_INTAKE,
  TEST_KATALOG_FIYATI,
  TEST_KURGU_STOGU,
  TEST_PURCHASES,
  TEST_SALE_PRICES,
  VEHICLE,
  WAREHOUSE,
  ZONES,
} from './seed-real/data';
import { KATALOG_KUNYELERI, KUNYELER, type UrunKunyesi } from './seed-real/kunye';

const KOK = dirname(fileURLToPath(import.meta.url));
/** Katalog kaynağının slug'ı → beslemedeki ürün görsel klasörü (`katalogKareleri`). */
const KATALOG_GORSEL_KLASORU: Record<string, string> = JSON.parse(
  readFileSync(join(KOK, 'seed-real/data/katalog-gorsel-klasoru.json'), 'utf8'),
) as Record<string, string>;

type Purchase = (typeof PURCHASES)[number];
type Draft = Purchase['drafts'][number];
/** Faturasız taslak: künyesi aynadan gelir, faturası yoktur. */
type AnyDraft = Draft | (typeof EK_TASLAKLAR)[number];
/** Taslağın fatura satırları — faturasız taslakta boş dizi. */
const faturaSatirlari = (draft: AnyDraft): Draft['variants'] => ('variants' in draft ? draft.variants : []);
type Line = Purchase['catalog'][number] | Draft['variants'][number];
type SeedLine = (typeof BUNDLES)[number]['items'][number];

/** Bütün taslaklar tek listede — faturalı olanlar tedarikçisiyle, faturasızlar tedarikçisiz. */
const TASLAKLAR: Array<{ draft: AnyDraft; supplier: string | null }> = [
  ...PURCHASES.flatMap((p) => p.drafts.map((draft) => ({ draft: draft as AnyDraft, supplier: p.supplier }))),
  ...EK_TASLAKLAR.map((draft) => ({ draft: draft as AnyDraft, supplier: null })),
];

/** Katalogda görünen ad Türkçesidir; faturadaki ad tedarikçinin dilinde kalır (eşleştirme onun üstünden). */
const draftName = (draft: AnyDraft): string => draft.nameTr ?? draft.name;

/**
 * Faturadaki ad → katalogdaki Türkçe ad; koleksiyon, paket ve aile üyeliği faturadaki adla yazılı.
 * Faturasız taslak kendi Türkçe adıyla anılır, o yüzden eşleme onda birim (`draftName` aynısını döner).
 */
const TASLAK_ADI = new Map(TASLAKLAR.map(({ draft }) => [draft.name, draftName(draft)]));

type Db = ReturnType<typeof createServiceRoleClient>;

try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Katmanlar yalnız TEST verisini açar; ölçütleri ÜRÜNÜN BEYANINA DOKUNUP DOKUNMADIKLARI:
 *
 * - **1** (varsayılan) gerçek veri — stok yok, tedarikçi siparişleri mal kabulü bekler.
 * - **2** test mal kabulü (lot `TEST-001`, SKT uydurma): stok açar, ürünler alınabilir olur.
 *   Beyana dokunmaz, bu yüzden vitrin denemesi bu katmanda yapılır.
 * - **3** VİTRİNİ UÇTAN UCA AÇAR ve bunun için dört şey uydurur: belgesiz ürünün beyanını addan
 *   türetir, her kalemi "satış kurgusunda" sayar (motorun kapısı `teklifli || kurguda`), fiyatı
 *   olmayan varyanta kilo başına tek oranla fiyat yazar ve partisi olmayana kurgu stoğu açar.
 *   Tahmin edilmiş beyan yanlış beyandır ve uydurma fiyat gerçek fiyat değildir — bu yüzden ayrı
 *   katman: stok görmek için buna razı olmak gerekmemeli (işletmeci kararı 19.09).
 *
 * Varsayılan 1, çünkü üretim kurulumu bayraksız koşar ve orada tek bir uydurma değer yazılamaz.
 * Bizim 39 ürünümüzün beyanı katmansızdır: kaynağı veritabanı aynasıdır, hiçbir katmanda doldurulmaz.
 */
const LAYERS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--layers='))?.split('=')[1];
  const n = Number(arg ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 3) throw new Error(`--layers 1, 2 ya da 3 olmalı (verilen: ${arg})`);
  return n;
})();
/**
 * Katman 2'nin uydurma faturası gerçeklerin YANINA eklenir — fiyat, tedarikçi siparişi ve mal
 * kabulü için. Ürünü kurmaz: taslaklar `EK_TASLAKLAR`ta kalır ve `TASLAKLAR` listesi değişmez,
 * yoksa aynı ürün iki kez açılırdı.
 */
const ALIMLAR = LAYERS >= 2 ? [...PURCHASES, ...TEST_PURCHASES] : PURCHASES;
const FIYATLAR: Record<string, { b2c: number; b2b: number }> = LAYERS >= 2 ? { ...SALE_PRICES, ...TEST_SALE_PRICES } : SALE_PRICES;

/**
 * Aday kalan katalog kalemleri. `ADAY_SKULARI`nın gerekçesi "faturada yok, alış maliyeti yok"tu;
 * uydurma fatura o kaleme maliyet yazdığı an gerekçe düşer ve ürün satışa çıkabilir.
 */
const ADAYLAR = LAYERS >= 2 ? ADAY_SKULARI.filter((sku) => !TEST_PURCHASES.some((p) => p.catalog.some((l) => l.sku === sku))) : ADAY_SKULARI;

/** Katalogdaki Türkçe ad → o ürünün fatura satırları; uydurma fatura taslağa ADINDAN bağlanır. */
const SATIRLAR_ADA_GORE = new Map<string, Draft['variants']>();
/** Katalogdaki Türkçe ad → taslağın tedarikçisi; kurgu stoğu partiyi doğru tedarikçiye yazsın diye. */
const TEDARIKCI_ADA_GORE = new Map<string, string>();
for (const alim of ALIMLAR) {
  for (const draft of alim.drafts) {
    const ad = draftName(draft);
    SATIRLAR_ADA_GORE.set(ad, [...(SATIRLAR_ADA_GORE.get(ad) ?? []), ...draft.variants]);
    TEDARIKCI_ADA_GORE.set(ad, alim.supplier);
  }
}

// Kuru koşuda henüz yazılmamış kaydın kimliği yerine geçer; yalnız sonraki adımların listelenmesi için.
const PLANNED = 'planlandı';

/** Ürün detayının saklama kartının taşıdığı adım satırı sayısı (`Musteri - Urun Detay.dc.html`). */
const ADIM_SINIRI = 3;

const done = (label: string) => console.log(`  · ${label} — var, dokunulmadı`);
const plan = (label: string) => console.log(`  ${DRY_RUN ? '○' : '✓'} ${label}${DRY_RUN ? ' — eklenecek' : ' — eklendi'}`);

async function seedWarehouse(db: Db): Promise<{ facilityId: string }> {
  console.log('▸ depo');
  const warehouses = new WarehouseService(db);
  const existing = (await warehouses.list()).find((w) => w.code === WAREHOUSE.code);
  if (existing) {
    done(`${WAREHOUSE.code} · ${existing.name}`);
    return { facilityId: existing.id };
  }
  const { street, postalCode, city, countryCode } = brand.company.address;
  plan(`${WAREHOUSE.code} · ${WAREHOUSE.name} · ${street}, ${postalCode} ${city}`);
  if (DRY_RUN) return { facilityId: PLANNED };
  const created = await warehouses.insert({
    code: WAREHOUSE.code,
    name: WAREHOUSE.name,
    countryCode,
    address: { line1: street, postalCode, city, country: countryCode },
    lat: WAREHOUSE.lat,
    lng: WAREHOUSE.lng,
    shipsOnline: WAREHOUSE.shipsOnline,
    sortOrder: 1,
  });
  return { facilityId: created.id };
}

async function seedStorageAreas(db: Db, facilityId: string): Promise<void> {
  console.log('▸ saklama alanları');
  const areas = new StorageAreaService(db);
  const existing = facilityId === PLANNED ? [] : await areas.listByWarehouses([facilityId]);
  for (const [i, area] of STORAGE_AREAS.entries()) {
    if (existing.some((a) => a.name === area.name)) {
      done(area.name);
      continue;
    }
    plan(`${area.name} · ${area.kind}`);
    if (DRY_RUN) continue;
    await areas.insert({ warehouseId: facilityId, sortOrder: i + 1, ...area });
  }
}

async function seedVehicle(db: Db, facilityId: string): Promise<void> {
  console.log('▸ araç');
  const vehicles = new VehicleService(db);
  const warehouses = new WarehouseService(db);
  let vehicleId = (await vehicles.list()).find((v) => v.plate === VEHICLE.plate)?.id;
  if (vehicleId) done(`künye ${VEHICLE.plate}`);
  else {
    plan(`künye ${VEHICLE.plate} · ${VEHICLE.name}`);
    if (!DRY_RUN) {
      vehicleId = (
        await vehicles.insert({
          plate: VEHICLE.plate,
          label: VEHICLE.name,
          warehouseId: facilityId,
          expectedDailyChecks: VEHICLE.expectedDailyChecks,
          sortOrder: 1,
        })
      ).id;
    }
  }
  if ((await warehouses.list()).some((w) => w.code === VEHICLE.code)) {
    done(`araç deposu ${VEHICLE.code}`);
    return;
  }
  plan(`araç deposu ${VEHICLE.code} · evi ${WAREHOUSE.code}`);
  if (DRY_RUN || !vehicleId) return;
  await warehouses.insert({
    code: VEHICLE.code,
    name: VEHICLE.name,
    kind: 'vehicle',
    countryCode: brand.company.address.countryCode,
    address: null,
    homeWarehouseId: facilityId,
    vehicleId,
    sortOrder: 2,
  });
}

async function seedZones(db: Db, facilityId: string): Promise<void> {
  console.log('▸ teslimat bölgeleri');
  const zones = new DeliveryZoneService(db);
  const existing = await zones.list();
  for (const zone of ZONES) {
    if (existing.some((z) => z.name === zone.name)) {
      done(zone.name);
      continue;
    }
    plan(`${zone.name} · gün ${zone.weekdays.join(',')} · ${zone.postalCodes.length} posta kodu`);
    if (DRY_RUN) continue;
    const created = await zones.insert({ name: zone.name, warehouseId: facilityId, weekdays: [...zone.weekdays], isActive: true });
    await zones.replacePostalCodes(
      created.id,
      zone.postalCodes.map((postalCode) => ({ country: 'FR' as const, postalCode })),
    );
  }
}

async function seedSettings(db: Db): Promise<void> {
  console.log('▸ ayarlar');
  const settings = new SettingsService(db);
  for (const { key, from, to } of SETTINGS) {
    const global = (await settings.listByKey(key)).find((row) => row.scopeType === 'global');
    if (!global) {
      console.log(`  ⚠ ${key} — genel satır yok (migration uygulanmamış olabilir); yazılmadı`);
      continue;
    }
    if (global.value === to) {
      done(`${key} = ${JSON.stringify(to)}`);
      continue;
    }
    if (global.value !== from) {
      console.log(`  ⚠ ${key} — panelde ${JSON.stringify(global.value)} yapılmış; ${JSON.stringify(to)} yazılmadı`);
      continue;
    }
    plan(`${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    if (!DRY_RUN) await settings.set(key, to);
  }
}

async function seedSuppliers(db: Db): Promise<void> {
  console.log('▸ tedarikçiler');
  const suppliers = new SupplierService(db);
  const existing = await suppliers.list();
  for (const supplier of SUPPLIERS) {
    if (existing.some((s) => s.name === supplier.name)) {
      done(supplier.name);
      continue;
    }
    plan(`${supplier.name} · ${supplier.vatNumber}`);
    if (!DRY_RUN) await suppliers.insert({ ...supplier, contact: { ...supplier.contact } });
  }
}

// Boy etiketi dilden bağımsızdır ("650 g", "5 l").
const allLocales = (text: string) => ({ tr: text, fr: text, de: text });

/** Taslağın künyesi — veritabanı aynasından. Karşılığı yoksa besleme DURUR: beyan uydurulmaz. */
const kunyeOf = (draft: AnyDraft): UrunKunyesi => {
  const kunye = KUNYELER[draftName(draft)];
  if (!kunye) throw new Error(`künye aynasında yok: ${draftName(draft)} — önce panelde/asistanla girilir, sonra aynaya çekilir`);
  return kunye;
};

/**
 * Net miktarın BİRİMİ etiketten okunur: "500 ml" ve "5 l" sıvı, kalanı katı. Etiketin kendisi zaten
 * ambalajdan geliyor — birimi ikinci kez yazmak, iki yerde iki farklı gerçek bırakırdı.
 */
const birimOf = (label: string | undefined): 'g' | 'ml' => (label && /\d\s*(ml|l)\b/i.test(label) ? 'ml' : 'g');

function checkInvoiceTotals(): void {
  for (const purchase of ALIMLAR) {
    if (purchase.invoiceTotal === undefined) continue;
    const lines = [...purchase.catalog, ...purchase.drafts.flatMap((d) => d.variants)];
    const total = lines.reduce((sum, line) => sum + toCents(line.qty * line.unitCost), 0);
    if (total !== toCents(purchase.invoiceTotal)) {
      throw new Error(`${purchase.invoice}: kalemlerin toplamı ${total / 100} €, fatura ${purchase.invoiceTotal} € — veri dosyasını kontrol et`);
    }
  }
}

/** Kategorisiz ürün olmamalı: eşlemesi yazılmamış taslak beslemeyi DURDURUR, sessizce kategorisiz doğmaz. */
/**
 * Her taslağın künye aynasında karşılığı olmalı; fazlası da olmamalı. Eksikse besleme DURUR:
 * ürünü önce panelde/asistanla açıp veritabanına girmek, sonra aynaya çekmek gerekir (künye uydurulmaz).
 */
function checkKunyeler(): void {
  const adlar = TASLAKLAR.map(({ draft }) => draftName(draft));
  const eksik = adlar.filter((ad) => !KUNYELER[ad]);
  const fazla = Object.keys(KUNYELER).filter((ad) => !adlar.includes(ad));
  if (eksik.length > 0 || fazla.length > 0) {
    throw new Error(
      `künye aynası taslaklarla tutmuyor — künyesiz: ${eksik.join(' · ') || 'yok'} · taslağı olmayan künye: ${fazla.join(' · ') || 'yok'}`,
    );
  }
  // Dördüncü adım ekranda çizilmez: kart üç satır taşıyor ve künyenin öteki iki kartıyla aynı ızgarada.
  // Sığmayan adım silinmez, komşusuyla virgülle birleştirilir (`UrunKunyesi.preparationSteps`).
  const tasan = Object.entries(KUNYELER)
    .filter(([, k]) => (k.preparationSteps?.length ?? 0) > ADIM_SINIRI)
    .map(([ad, k]) => `${ad} (${k.preparationSteps?.length})`);
  if (tasan.length > 0) {
    throw new Error(`hazırlama adımı ${ADIM_SINIRI}'ü aşıyor: ${tasan.join(' · ')} — komşu adımları virgülle birleştir`);
  }
}

function checkDraftCategories(): void {
  const gecerli = new Set(CATEGORIES.map((c) => c.key));
  const eksik = TASLAKLAR.map(({ draft }) => draft.name).filter((ad) => !gecerli.has(DRAFT_CATEGORY[ad] ?? ''));
  if (eksik.length > 0) {
    throw new Error(`kategorisi yazılmamış taslak (${eksik.length}): ${eksik.join(' · ')} — DRAFT_CATEGORY'ye ekle`);
  }
}

/** Fiyat sözlüğü faturayla birebir olmalı: fiyatsız kalem de faturada olmayan fiyat da sessizce geçmez. */
function checkSalePrices(): void {
  const lines = new Set(ALIMLAR.flatMap((p) => [...p.catalog, ...p.drafts.flatMap((d) => d.variants)]).map((l) => l.nameAtSupplier));
  const unpriced = [...lines].filter((name) => !FIYATLAR[name]);
  const orphan = Object.keys(FIYATLAR).filter((name) => !lines.has(name));
  if (unpriced.length > 0 || orphan.length > 0) {
    throw new Error(
      `fiyat sözlüğü faturayla tutmuyor — fiyatsız: ${unpriced.join(' · ') || 'yok'} · faturada olmayan: ${orphan.join(' · ') || 'yok'}`,
    );
  }
}

/** Paket ve tarif kalemi faturadaki bir kaleme bağlanmalı; yazım hatası yazmaya başlamadan yakalanır. */
function checkBundleAndRecipeLines(): void {
  const skus = new Set(PURCHASES.flatMap((p) => p.catalog.map((line) => line.sku)));
  const drafts = new Map(PURCHASES.flatMap((p) => p.drafts).map((d) => [d.name, d]));
  const bozuk: string[] = [];
  for (const { name, items } of [...BUNDLES, ...RECIPES]) {
    for (const line of items) {
      if ('sku' in line) {
        if (!skus.has(line.sku)) bozuk.push(`${name.tr}: ${line.sku}`);
        continue;
      }
      const taslak = drafts.get(line.draft);
      const boylar = taslak ? kunyeOf(taslak).variants.map((v) => v.label.tr) : [];
      const bulundu = line.label ? boylar.includes(line.label) : boylar.length === 1;
      if (!bulundu) bozuk.push(`${name.tr}: ${line.draft}${line.label ? ` (${line.label})` : ''}`);
    }
  }
  if (bozuk.length > 0) throw new Error(`faturada karşılığı olmayan paket/tarif kalemi: ${bozuk.join(' · ')}`);
}

/** Kategori kapağı: katalogdaki kare · depodaki usta · markanın mağazası. R2 ayarsızsa null döner. */
async function kategoriKapagi(cat: (typeof CATEGORIES)[number], slug: string, lezzaUrl: Map<string, string>) {
  if (!cat.image) return null;
  if (cat.image.file) return uploadImageFromPath(cat.image.file, r2Keys.categoryImage(slug, cat.image.file));
  const url = cat.image.url ?? (cat.image.lezza ? lezzaUrl.get(cat.image.lezza) : undefined);
  if (!url) {
    console.log(`  ⚠ ${cat.name.tr} — kapak kaynağı katalogda yok; kategori kapaksız kuruldu`);
    return null;
  }
  return uploadImageFromUrl(url, r2Keys.categoryImage(slug, url.split('/').pop() || 'cover.webp'));
}

/**
 * Vitrin kategorileri — dönen harita kaynağın kategori anahtarlarını da taşır ki `seedLezzaProducts` kendi kategorisini kurmasın, ürünlerini buraya düşürsün.
 * Kapak da bu yüzden burada yüklenir: kaynağın kategori bloğu atlanınca onun kapak yüklemesi de atlanır.
 */
async function seedCategories(db: Db): Promise<Map<string, string>> {
  console.log('▸ kategoriler');
  const categories = new CategoryService(db);
  const existing = await categories.list();
  const lezzaUrl = lezzaGorselUrlByDosya();
  const catId = new Map<string, string>();
  for (const [i, cat] of CATEGORIES.entries()) {
    const anahtarlar = [cat.key, ...(cat.lezza ?? [])];
    const bulunan = existing.find((c) => c.name.tr === cat.name.tr);
    if (bulunan) {
      done(cat.name.tr);
      for (const key of anahtarlar) catId.set(key, bulunan.id);
      continue;
    }
    plan(
      `${cat.name.tr} · ${cat.featured ? 'vitrinde' : 'vitrin dışı'}${cat.image ? ' · kapaklı' : ''}${cat.aiQuestion ? ' · yapay zekâ sorusu' : ''}`,
    );
    if (DRY_RUN) continue;
    const created = await categories.create({
      name: cat.name,
      tagline: cat.tagline,
      sortOrder: i + 1,
      ...(cat.aiQuestion ? { aiQuestion: cat.aiQuestion } : {}),
    });
    // Vitrin işareti ayrı bir karardır ve servis onu ayrı metotla yazar (`setFeatured` künyesi).
    if (cat.featured) await categories.setFeatured(created.id, true);
    const kapak = await kategoriKapagi(cat, created.slug, lezzaUrl);
    if (kapak) await categories.update({ id: created.id, ...kapak });
    for (const key of anahtarlar) catId.set(key, created.id);
  }
  return catId;
}

/**
 * Katalog ürününün YEREL kareleri — kapak `0`, kalanlar ada göre galeriye. Klasörün adı ÜRÜNÜN
 * slug'ı, kaynağın İngilizce slug'ı değil; köprü `data/katalog-gorsel-klasoru.json`da durur.
 *
 * Neden bir köprü dosyası: katalog kaynağı kendi adlandırmasından (`turkish-bagel-simit`) başkasını
 * bilmez, işletmeci ise klasörü sitede gördüğü adla (`simit`) arar. İkisini kodda eşlemek, iki
 * adlandırmayı da koda gömmek olurdu.
 */
function katalogKareleri(catalogSlug: string): string[] | null {
  const klasor = KATALOG_GORSEL_KLASORU[catalogSlug];
  if (!klasor) return null;
  const dizin = join(KOK, 'seed-real/images', klasor);
  if (!existsSync(dizin)) return null;
  const kareler = readdirSync(dizin)
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .sort();
  const kapak = kareler.find((f) => f.startsWith('0.'));
  if (!kapak) throw new Error(`${klasor}: kapak yok — klasördeki bir kareyi "0" diye adlandır`);
  return [kapak, ...kareler.filter((f) => f !== kapak)].map((f) => join('scripts/seed-real/images', klasor, f));
}

async function seedCatalog(db: Db, catId: Map<string, string>): Promise<void> {
  console.log('▸ katalog — faturadaki Lezza varyantları');
  const variants = new ProductVariantService(db);
  const lines = ALIMLAR.flatMap((p) => p.catalog);
  const present = (await Promise.all(lines.map((l) => variants.findBySku(l.sku)))).filter((v) => v !== null).length;
  if (present === lines.length) {
    done(`${lines.length} varyant`);
    return;
  }
  // Yarım kurulmuş katalog yeniden kurulmaz: kategori ve aileler ikinci kez açılırdı.
  if (present > 0) {
    console.log(`  ⚠ ${present}/${lines.length} varyant zaten var — katalog yarım kurulmuş, yazılmadı`);
    return;
  }
  plan(`${lines.length} fatura varyantı + ${ADAYLAR.length} aday · ürün, metin, görsel ve kategori katalog kaynağından`);
  if (DRY_RUN) return;
  /** Boy künyesi: kaynağın değerlerinin üstüne yazılan düzeltmeler (fatura birimi, boy adı). */
  type BoyKunyesi = { label?: LocalizedText; netQuantity?: number; netUnit?: 'g' | 'ml'; piecesCount?: number };
  const secim = new Map<string, BoyKunyesi>(
    lines.map((l) => [
      l.sku,
      l.unit
        ? {
            label: allLocales(l.unit.label),
            netQuantity: l.unit.netQuantity,
            netUnit: birimOf(l.unit.label),
            piecesCount: l.unit.piecesCount,
          }
        : {},
    ]),
  );
  // Faturada olmayan aday kalemler aynı seçime girer ki ürünleri kurulsun — ama `kurgu.sku`ya
  // GİRMEZLER (aşağıda yalnız fatura satırları veriliyor): o küme "satış kurgusuna girmiş" demek ve
  // ürünü aktif olmaya zorlar. Adayın alış maliyeti yok, fiyatsız ve satışa kapalı kalması karar.
  for (const sku of ADAYLAR) if (!secim.has(sku)) secim.set(sku, {});
  // Boy adı kaynağın gramajının ÜSTÜNE yazılır: birleşen ilanda "250 g" ile "70 g" hangisinin kalıp
  // hangisinin dilim olduğunu söylemiyordu. Seçimde olmayan koda dokunulmaz — o boy zaten kurulmuyor.
  for (const [sku, ad] of Object.entries(KATALOG_BOY_ADI)) {
    const boy = secim.get(sku);
    if (boy) secim.set(sku, { ...boy, label: ad });
  }
  // Aynadaki boy kaynağı da boy adını da YENER: ölçü ürünün kendi ambalajından okundu (sade dondurmanın
  // kabı 500 g çıktı, kaynak 250 g yazıyordu). Seçimde olmayan koda dokunulmaz — o boy zaten kurulmuyor.
  for (const boylar of Object.values(KATALOG_KUNYELERI)) {
    for (const [sku, duzeltme] of Object.entries(boylar.variants ?? {})) {
      const boy = secim.get(sku);
      if (boy) secim.set(sku, { ...boy, ...duzeltme });
    }
  }
  // KATMAN 3: her kalem "satış kurgusunda" sayılır. Motorun kapısı `teklifli || kurguda`; alış
  // fiyatı olmayan kalem aksi hâlde aday kalırdı. Fiyatı `seedTestCatalogPrices` üretir.
  const kurguSku = LAYERS >= 3 ? new Set(secim.keys()) : new Set(lines.map((l) => l.sku));
  const made = await seedLezzaProducts(
    new CategoryService(db),
    new CategoryImageService(db),
    new ProductService(db),
    new ProductImageService(db),
    new ProductFamilyService(db),
    catId,
    0,
    { sku: kurguSku, slug: new Set() },
    // Katalog hep `base` kurulur: `extend` türetmenin yanında bilinçli kusurlar da sahneler ve gerçek
    // kataloğa kusur yazılmaz. Katman 3 yalnız türetmeyi açar ki belgesiz ürün satışa çıkabilsin.
    'base',
    {
      variants: secim,
      derive: LAYERS >= 3,
      candidates: LAYERS >= 3 ? new Set() : new Set(ADAYLAR),
      localFrames: katalogKareleri,
      merge: KATALOG_BIRLESIK,
      kunye: KATALOG_KUNYELERI,
    },
  );
  console.log(`  ✓ ${made.made} ürün · ${made.variants} varyant · ${made.photos} galeri görseli · ${made.families} aile`);
}

async function seedDrafts(db: Db, catId: Map<string, string>): Promise<void> {
  console.log('▸ taslak ürünler');
  const products = new ProductService(db);
  const existing = new Set((await products.listAll()).map((p) => p.name.tr));
  const barcodes = new VariantBarcodeService(db);
  const images = new ProductImageService(db);
  for (const { draft, supplier } of TASLAKLAR) {
    const ad = draftName(draft);
    // Var olan kayda DOKUNULMAZ: künyenin kaynağı zaten veritabanı, üstüne yazmak dairesel olurdu.
    if (existing.has(ad)) {
      done(ad);
      continue;
    }
    const kunye = kunyeOf(draft);
    // Yayına hazır mı sorusunu MOTOR cevaplar (`canPublishProduct`) — besleme kendi ölçütünü
    // uydurmaz ve veritabanı kısıtıyla aynı cümleyi kurar; ayrışsalardı insert sessizce patlardı.
    // FİYAT ayrı bir şart ve motorun sorusu değil: fiyatsız ürün vitrine fiyatsız kart olarak düşerdi.
    // Uydurma fatura taslağa ADINDAN bağlanır; faturalı taslakta iki kaynak da aynı satırı verir.
    const satirlar = SATIRLAR_ADA_GORE.get(ad) ?? faturaSatirlari(draft);
    const fiyatli = satirlar.length > 0 && satirlar.every((v) => FIYATLAR[v.nameAtSupplier] !== undefined);
    const yayina =
      fiyatli &&
      canPublishProduct({
        name: kunye.name,
        description: kunye.description,
        ingredients: kunye.ingredients,
        storageInstructions: kunye.storage,
        allergens: kunye.allergens ?? null,
        variants: kunye.variants.map((v) => ({ netQuantity: v.netQuantity })),
      });
    plan(
      `${ad} · ${kunye.variants.map((v) => v.label.tr ?? 'boysuz').join(' + ')} · ${supplier ?? 'faturasız'}${draft.image ? ' · kapaklı' : ''}${yayina ? ' · AKTİF' : ''}`,
    );
    if (DRY_RUN) continue;
    // Kapak: tedarikçinin gönderdiği usta ya da markanın mağazasındaki çekim. R2 ayarsızsa null
    // döner ve ürün görselsiz açılır — besleme durmaz (`catalog-lezza` ile aynı davranış).
    const kapak = draft.image
      ? await (draft.image.file
          ? uploadImageFromPath(draft.image.file, r2Keys.productImage(draft.image.slug, draft.image.file))
          : uploadImageFromUrl(draft.image.url ?? '', r2Keys.productImage(draft.image.slug, draft.image.url ?? 'cover.webp')))
      : null;
    const { product, variants: yazilan } = await products.create({
      // Künyenin tamamı aynadan geçer: eksik alan veritabanında da EKSİKTİ, burada tamamlanmaz.
      name: kunye.name,
      // Kategori doğuşta yazılır; eşlemenin tamlığı `checkDraftCategories` ile koşudan önce sınandı.
      categoryId: catId.get(DRAFT_CATEGORY[draft.name] ?? '') ?? null,
      status: yayina ? 'active' : 'candidate',
      ...(kunye.description ? { description: kunye.description } : {}),
      ...(kunye.ingredients ? { ingredients: kunye.ingredients } : {}),
      ...(kunye.storage ? { storageInstructions: kunye.storage } : {}),
      // Hazırlaması olmayan rafta boş dizi yazılır, alan atlanmaz: "adım girilmedi" kolonun varsayılanıdır.
      ...(kunye.preparationSteps ? { preparationSteps: kunye.preparationSteps } : {}),
      ...(kunye.shelfLifeDays ? { shelfLifeDays: kunye.shelfLifeDays } : {}),
      // Saklama rejimi İKİ kolon: ikisi de aynadan gelir, biri ötekinden türetilmez.
      ...(kunye.storageType ? { storageType: kunye.storageType } : {}),
      ...(kunye.shippable === undefined ? {} : { shippable: kunye.shippable }),
      ...(kunye.nutrition ? { nutrition: kunye.nutrition } : {}),
      ...(kunye.allergens ? { allergens: kunye.allergens } : {}),
      ...(kunye.traces?.length ? { traces: kunye.traces } : {}),
      ...(kapak ?? {}),
      variants: kunye.variants.map((v) => ({
        label: v.label,
        netQuantity: v.netQuantity,
        netUnit: v.netUnit,
        sku: v.sku,
        piecesCount: v.piecesCount,
        portionKind: v.portionKind,
        // Tartılmış brüt ve ölçülmüş kutu — kargo teklifi bunlara bakar.
        packedWeightG: v.packedWeightG,
        packedLengthMm: v.packedLengthMm,
        packedWidthMm: v.packedWidthMm,
        packedHeightMm: v.packedHeightMm,
      })),
    });
    // Galeri kapaktan SONRA yazılır ve tavanı uygulamanın sabitinden gelir: formun kaydedemeyeceği
    // kadar kare yazmak, operatörün açıp kaydettiği ilk anda sessizce kırpılırdı.
    for (const [n, kare] of (draft.gallery ?? []).slice(0, PRODUCT_GALLERY_MAX).entries()) {
      const gorsel = kare.file
        ? await uploadImageFromPath(kare.file, r2Keys.productImage(kare.slug, kare.file))
        : await uploadImageFromUrl(kare.url ?? '', r2Keys.productImage(kare.slug, kare.url ?? 'galeri.webp'));
      if (!gorsel) continue;
      await images.insert({ productId: product.id, sortOrder: n, ...gorsel, imageFocalX: 50, imageFocalY: 50, imageZoom: 100 });
    }
    // Barkod varyantın kolonu değil ayrı eşleme kaydı: satır yazıldıktan sonra sırayla bağlanır.
    for (const [i, v] of kunye.variants.entries()) {
      const satir = yazilan[i];
      if (!satir) continue;
      for (const b of v.barcodes ?? [])
        await barcodes.insert({ variantId: satir.id, code: b.code, kind: b.kind, qtyPerCode: b.qtyPerCode });
    }
  }
}

/**
 * Taslakların çeşit blokları. Tek üyeli aile KURULMAZ — katalog tarafındaki kuralın aynısı: bir
 * çeşit bloğu en az iki kart ister, tek kart "seçenek" değil tekrardır.
 */
async function seedDraftFamilies(db: Db): Promise<void> {
  console.log('▸ taslak aileleri');
  const families = new ProductFamilyService(db);
  const products = new ProductService(db);
  const mevcut = new Set((await families.list()).map((f) => f.name));
  // Kuru koşuda ürünler henüz yazılmadığı için üyelik aranmaz; plan listedeki çeşit sayısını gösterir.
  const urunler = DRY_RUN ? [] : await products.listAll();
  for (const aile of DRAFT_FAMILIES) {
    if (mevcut.has(aile.ad)) {
      done(aile.ad);
      continue;
    }
    if (DRY_RUN) {
      plan(`${aile.ad} · ${aile.uyeler.length} çeşit`);
      continue;
    }
    const uyeler: Array<{ id: string; etiket: (typeof DRAFT_FAMILIES)[number]['uyeler'][number]['etiket'] }> = [];
    for (const uye of aile.uyeler) {
      const id = urunler.find((p) => p.name.tr === TASLAK_ADI.get(uye.draft))?.id;
      if (id) uyeler.push({ id, etiket: uye.etiket });
    }
    if (uyeler.length < 2) {
      console.log(`  ⚠ ${aile.ad} — ${uyeler.length} üye bulundu, aile kurulmadı`);
      continue;
    }
    plan(`${aile.ad} · ${uyeler.length} çeşit`);
    const created = await families.insert({ name: aile.ad });
    for (const [sira, uye] of uyeler.entries()) {
      await products.update({ id: uye.id, familyId: created.id, familyLabel: uye.etiket, familyPosition: sira });
    }
  }
}

async function seedCollections(db: Db): Promise<void> {
  console.log('▸ koleksiyonlar');
  const collections = new CollectionService(db);
  const variants = new ProductVariantService(db);
  const existing = await collections.list();
  const urunler = await new ProductService(db).listAll();
  for (const [i, col] of COLLECTIONS.entries()) {
    if (existing.some((c) => c.name.tr === col.name.tr)) {
      done(col.name.tr);
      continue;
    }
    // Üyelik kataloğun kendi kimliğinden çözülür. Bulunamayan üye SESSİZ GEÇMEZ: seçki eksik kurulur
    // ve eksikliği ancak vitrine bakan biri fark ederdi.
    const ids: string[] = [];
    const eksik: string[] = [];
    for (const sku of col.skus) {
      const variant = await variants.findBySku(sku);
      if (variant) ids.push(variant.productId);
      else eksik.push(sku);
    }
    for (const fatura of col.drafts) {
      const urun = urunler.find((p) => p.name.tr === TASLAK_ADI.get(fatura));
      if (urun) ids.push(urun.id);
      else eksik.push(fatura);
    }
    // Kuru koşuda ürünler HENÜZ YAZILMADIĞI için hiçbiri bulunamaz; orada uyarı basmak yanlış alarm
    // olur ve gerçek eksikliği içinde kaybederdi (`seedPurchases` aynı ayrımı yapıyor).
    if (eksik.length > 0 && !DRY_RUN) console.log(`  ⚠ ${col.name.tr} — ${eksik.length} üye bulunamadı: ${eksik.join(' · ')}`);
    plan(`${col.name.tr} · ${DRY_RUN ? col.skus.length + col.drafts.length : new Set(ids).size} ürün`);
    if (DRY_RUN) continue;
    await collections.create({ name: col.name, description: col.description, sortOrder: i + 1, productIds: [...new Set(ids)] });
  }
}

/** Katalog satırı varyant koduyla, taslak satırı ürün adı ve boyuyla bulunur; bulunamayanın kimliği `null`. */
async function purchaseLines(db: Db, purchase: Purchase): Promise<{ line: Line; variantId: string | null }[]> {
  const variants = new ProductVariantService(db);
  const products = await new ProductService(db).listAll();
  const rows: { line: Line; variantId: string | null }[] = [];
  for (const line of purchase.catalog) rows.push({ line, variantId: (await variants.findBySku(line.sku))?.id ?? null });
  for (const draft of purchase.drafts) {
    const product = products.find((p) => p.name.tr === draftName(draft));
    // Fatura satırı ile boy SIRAYLA eşleşir: künyedeki boy dizisi neyse varyantlar o sırayla yazıldı.
    const own = product ? await variants.listByProduct(product.id) : [];
    for (const [i, line] of draft.variants.entries()) rows.push({ line, variantId: own[i]?.id ?? null });
  }
  return rows;
}

async function seedPurchases(db: Db): Promise<void> {
  console.log('▸ fiyat · tedarikçi eşlemesi · tedarikçi siparişi');
  const suppliers = await new SupplierService(db).list();
  const prices = new PriceService(db);
  const mappings = new SupplierProductService(db);
  const orders = new PurchaseOrderService(db);
  for (const purchase of ALIMLAR) {
    const rows = await purchaseLines(db, purchase);
    const supplierId = suppliers.find((s) => s.name === purchase.supplier)?.id;
    const missing = rows.filter((r) => r.variantId === null).length;
    if (!supplierId || missing > 0) {
      const what = [supplierId ? null : 'tedarikçi', missing > 0 ? `${missing} kalemin varyantı` : null].filter(Boolean).join(' ve ');
      console.log(`  ${DRY_RUN ? '○' : '⚠'} ${purchase.invoice} — ${what} henüz yok${DRY_RUN ? '; önceki adımlar yazılınca kurulur' : ', yazılmadı'}`);
      continue;
    }
    const ready = rows.map(({ line, variantId }) => ({ line, variantId: variantId as string }));

    for (const { line, variantId } of ready) {
      // Sözlüğün faturayla birebir olduğu koşudan önce sınandı (`checkSalePrices`).
      const price = FIYATLAR[line.nameAtSupplier];
      if (!price) continue;
      if ((await prices.listByVariant(variantId)).length > 0) {
        done(`fiyat · ${line.nameAtSupplier}`);
        continue;
      }
      plan(`fiyat · ${line.nameAtSupplier} · ${price.b2c} € / ${price.b2b} €`);
      if (DRY_RUN) continue;
      await prices.setPrice({ variantId, channel: 'b2c', amountCents: toCents(price.b2c) });
      await prices.setPrice({ variantId, channel: 'b2b', amountCents: toCents(price.b2b) });
    }

    const mapped = new Set((await mappings.listBySupplier(supplierId)).map((m) => m.variantId));
    for (const { line, variantId } of ready) {
      if (!line.supplierCode) continue;
      if (mapped.has(variantId)) {
        done(`eşleme · ${line.supplierCode}`);
        continue;
      }
      plan(`eşleme · ${line.supplierCode} → ${line.nameAtSupplier}`);
      if (DRY_RUN) continue;
      await mappings.setMapping({
        supplierId,
        variantId,
        supplierCode: line.supplierCode,
        nameAtSupplier: line.nameAtSupplier,
        packQty: line.qty,
        lastPurchasePriceCents: toCents(line.unitCost),
        isPreferred: true,
      });
    }

    // Sipariş faturadaki adetlerle "gönderildi" açılır; stok panelde bu siparişe karşı mal kabulüyle girer.
    const note = `Fatura ${purchase.invoice}`;
    if ((await orders.listBySupplier(supplierId)).some((o) => o.note === note)) {
      done(`sipariş · ${note}`);
      continue;
    }
    plan(`sipariş · ${note} · ${ready.length} kalem · mal kabulü bekliyor`);
    if (DRY_RUN) continue;
    const { order } = await orders.createDraft(
      supplierId,
      ready.map(({ line, variantId }) => ({ variantId, qty: line.qty, unitPriceCents: toCents(line.unitCost) })),
      note,
    );
    await orders.markSent(order.id, purchaseOrderReferenceNo(new Date().getFullYear()));
  }
}

/** Kalemi varyanta çözer: Lezza ürünü varyant koduyla, taslak faturadaki adla ve birden çok boyu varsa etiketle. */
async function lineVariantId(line: SeedLine, variants: ProductVariantService, urunler: Product[]): Promise<string | null> {
  if ('sku' in line) return (await variants.findBySku(line.sku))?.id ?? null;
  const urun = urunler.find((p) => p.name.tr === TASLAK_ADI.get(line.draft));
  if (!urun) return null;
  const boylar = await variants.listByProduct(urun.id);
  const boy = line.label ? boylar.find((v) => v.label.tr === line.label) : boylar.length === 1 ? boylar[0] : undefined;
  return boy?.id ?? null;
}

/** Liste toplamının `BUNDLE_DISCOUNT` altı, 90 kuruşa yuvarlanmış — işletmecinin paket fiyatı kuralı. */
const paketHedefi = (listeCents: number) => Math.round((listeCents * (1 - BUNDLE_DISCOUNT)) / 100) * 100 - 10;

const euro = (cents: number) => `${(cents / 100).toFixed(2)} €`;

async function seedBundles(db: Db): Promise<void> {
  console.log('▸ paketler');
  const bundles = new BundleService(db);
  const variants = new ProductVariantService(db);
  const prices = new PriceService(db);
  const existing = await bundles.listAll();
  const urunler = await new ProductService(db).listAll();
  for (const [i, paket] of BUNDLES.entries()) {
    if (existing.some((b) => b.name.tr === paket.name.tr)) {
      done(`paket · ${paket.name.tr}`);
      continue;
    }
    const ids = await Promise.all(paket.items.map((line) => lineVariantId(line, variants, urunler)));
    const bulunan = ids.filter((id): id is string => id !== null);
    const fiyatlar = await prices.findApplicableMap(bulunan, 'b2c');
    const kalemler = paket.items.map((line, k) => {
      const variantId = ids[k] ?? null;
      return { variantId, qty: line.qty, listeCents: variantId ? (fiyatlar.get(variantId)?.channelPrice?.amountCents ?? null) : null };
    });
    const eksik = kalemler.filter((k) => k.variantId === null || k.listeCents === null).length;
    // Kuru koşuda ürün ve fiyat henüz yazılmadığı için eksik görünür; uyarı gerçek eksikliği gizlemesin (`seedPurchases` aynı ayrımı yapıyor).
    if (eksik > 0) {
      console.log(
        `  ${DRY_RUN ? '○' : '⚠'} paket · ${paket.name.tr} — ${eksik} kalemin varyantı ya da fiyatı ${DRY_RUN ? 'henüz yok; önceki adımlar yazılınca kurulur' : 'yok, yazılmadı'}`,
      );
      continue;
    }
    const hazir = kalemler.map((k) => ({ variantId: k.variantId as string, qty: k.qty, listeCents: k.listeCents as number }));
    const listeCents = hazir.reduce((toplam, k) => toplam + k.listeCents * k.qty, 0);
    // Paylar liste fiyatlarına oransal dağılır; adetli kalemde hedef kuruşuna tutmayabilir, o zaman fiyat ulaşılan toplamdır.
    const paylar = rebalanceAllocations(
      hazir.map((k) => ({ qty: k.qty, allocatedUnitPriceCents: k.listeCents })),
      paketHedefi(listeCents),
    );
    if (paylar.residualCents !== 0) console.log(`  ⚠ paket · ${paket.name.tr} — paylar hedefi ${paylar.residualCents} kuruşla tutturamadı`);
    plan(`paket · ${paket.name.tr} · ${hazir.length} kalem · ${euro(listeCents)} → ${euro(paylar.achievedTotalCents)}`);
    if (DRY_RUN) continue;
    await bundles.create({
      name: paket.name,
      description: paket.description,
      totalPrice: paylar.achievedTotalCents / 100,
      serves: paket.serves ?? null,
      // Alan işletmecinin niyetidir; kalemin ürünü satışta değilse paketi vitrinden motor düşürür (`listSellable`).
      isActive: true,
      isFeatured: paket.isFeatured ?? false,
      sortOrder: i + 1,
      items: hazir.map((k, n) => ({ variantId: k.variantId, qty: k.qty, allocatedUnitPrice: (paylar.unitPricesCents[n] ?? 0) / 100 })),
    });
  }
}

async function seedRecipes(db: Db): Promise<void> {
  console.log('▸ tarifler');
  const recipes = new RecipeService(db);
  const variants = new ProductVariantService(db);
  const existing = await recipes.listAll();
  const urunler = await new ProductService(db).listAll();
  for (const [i, tarif] of RECIPES.entries()) {
    if (existing.some((r) => r.name.tr === tarif.name.tr)) {
      done(`tarif · ${tarif.name.tr}`);
      continue;
    }
    const ids = await Promise.all(tarif.items.map((line) => lineVariantId(line, variants, urunler)));
    const eksik = ids.filter((id) => id === null).length;
    // Malzemesi eksik tarif yarım kurulmaz: ekranda "3 ürün" yazıp iki satır göstermesi fark edilmezdi.
    if (eksik > 0) {
      console.log(
        `  ${DRY_RUN ? '○' : '⚠'} tarif · ${tarif.name.tr} — ${eksik} malzemenin ürünü ${DRY_RUN ? 'henüz yok; önceki adımlar yazılınca kurulur' : 'yok, yazılmadı'}`,
      );
      continue;
    }
    plan(`tarif · ${tarif.name.tr} · ${ids.length} ürün${tarif.image ? ' · kareli' : ''}`);
    if (DRY_RUN) continue;
    const olusan = await recipes.createWithItems({
      name: tarif.name,
      description: tarif.description,
      duration: tarif.duration,
      serves: tarif.serves,
      meal: tarif.meal,
      steps: tarif.steps,
      pantry: tarif.pantry,
      isActive: true,
      sortOrder: i + 1,
      items: tarif.items.map((line, k) => ({ variantId: ids[k] as string, qty: line.qty })),
    });
    // Kare kayıttan SONRA: anahtar servisin benzersizleştirdiği KESİN slug'a bağlanır (paket ve
    // kurgu tarifiyle aynı sıra). R2 ayarsızsa null döner ve tarif karesiz kalır — besleme durmaz.
    if (tarif.image) {
      const kapak = await uploadImageFromPath(tarif.image, r2Keys.recipeImage(olusan.slug, tarif.image));
      if (kapak) await recipes.update({ id: olusan.id, ...kapak });
    }
  }
}

/**
 * KATMAN 3: fiyatı olmayan varyanta UYDURMA fiyat yazar (`TEST_KATALOG_FIYATI` — kilo başına tek
 * oran). Gerçek fiyatın üstüne yazmaz: teklifi ya da faturası olan varyant zaten fiyatlıdır ve
 * atlanır. Ölçüsü olmayan varyant tabana düşer.
 */
async function seedTestCatalogPrices(db: Db): Promise<void> {
  console.log(`▸ test fiyatı · ${TEST_KATALOG_FIYATI.b2cPerKg} €/kg — uydurma değer, vitrin denemesi`);
  const prices = new PriceService(db);
  const variants = new ProductVariantService(db);
  const urunler = await new ProductService(db).listAll();
  let yazilan = 0;
  for (const urun of urunler) {
    for (const v of await variants.listByProduct(urun.id)) {
      if ((await prices.listByVariant(v.id)).length > 0) continue;
      const kg = (v.netQuantity ?? 0) / 1000;
      const b2c = Math.max(TEST_KATALOG_FIYATI.minB2c, Math.round(kg * TEST_KATALOG_FIYATI.b2cPerKg * 100) / 100);
      const b2b = Math.round(b2c * TEST_KATALOG_FIYATI.b2bRate * 100) / 100;
      if (DRY_RUN) continue;
      await prices.setPrice({ variantId: v.id, channel: 'b2c', amountCents: toCents(b2c) });
      await prices.setPrice({ variantId: v.id, channel: 'b2b', amountCents: toCents(b2b) });
      yazilan++;
    }
  }
  console.log(`  ${DRY_RUN ? '○' : '✓'} ${yazilan} varyanta fiyat ${DRY_RUN ? 'yazılacak' : 'yazıldı'}`);
}

/** Siparişlerin tamamını tek partide teslim alır — arayüz denemesi için, gerçek sayım değil. */
async function seedTestIntake(db: Db, facilityId: string): Promise<void> {
  console.log(`▸ test kabulü · lot ${TEST_INTAKE.lotNumber} · SKT ${TEST_INTAKE.expiryDate} — uydurma değer, arayüz denemesi`);
  const areas = facilityId === PLANNED ? [] : await new StorageAreaService(db).listByWarehouses([facilityId]);
  const intakes = new StockIntakeService(db);
  const orders = new PurchaseOrderService(db);
  const suppliers = await new SupplierService(db).list();
  for (const purchase of ALIMLAR) {
    const supplierId = suppliers.find((s) => s.name === purchase.supplier)?.id;
    const order = supplierId
      ? (await orders.listBySupplier(supplierId)).find((row) => row.note === `Fatura ${purchase.invoice}`)
      : undefined;
    const rows = await purchaseLines(db, purchase);
    const missing = rows.filter((row) => row.variantId === null).length;
    if (!order || missing > 0) {
      console.log(`  ${DRY_RUN ? '○' : '⚠'} ${purchase.invoice} — ${order ? `${missing} kalemin varyantı` : 'sipariş'} yok${DRY_RUN ? '; önceki adımlar yazılınca kurulur' : ', kabul yazılmadı'}`);
      continue;
    }
    if ((await intakes.listByPurchaseOrder(order.id)).length > 0) {
      done(`kabul · ${purchase.invoice}`);
      continue;
    }
    const areaName = TEST_INTAKE.areaBySupplier[purchase.supplier];
    const storageAreaId = areas.find((area) => area.name === areaName)?.id ?? null;
    plan(`kabul · ${purchase.invoice} · ${rows.length} kalem · ${areaName ?? 'alansız'}`);
    if (DRY_RUN) continue;
    const outcome = await receivePurchase(db, {
      warehouseId: facilityId,
      purchaseOrderId: order.id,
      supplierId,
      note: `Test kabulü — ${purchase.invoice}`,
      // Fiyat verilmez: kabul çekirdeği siparişteki birim fiyatı kullanır.
      lines: rows.map(({ line, variantId }) => ({
        variantId: variantId as string,
        qty: line.qty,
        expiryDate: TEST_INTAKE.expiryDate,
        lotNumber: TEST_INTAKE.lotNumber,
        storageAreaId,
        unitCostCents: null,
      })),
    });
    if (outcome.status !== 'ok') {
      console.log(`  ⚠ ${purchase.invoice} — kabul yazılamadı (${outcome.status})`);
      continue;
    }
    console.log(`  ✓ ${outcome.result.stockIds.length} parti yazıldı`);
  }
}

/**
 * KATMAN 3: partisi olmayan varyanta UYDURMA stok açar (`TEST_KURGU_STOGU`) — tedarikçi başına tek
 * sipariş ve tek mal kabulü. Gerçek kabulden SONRA koşar ve onun yazdığına dokunmaz: eldekisi olan
 * varyant atlanır. Kabul kapısından geçer, doğrudan parti yazmaz — stok bir belgeden doğar (K6).
 */
async function seedTestStock(db: Db, facilityId: string): Promise<void> {
  console.log(`▸ kurgu stoğu · boy başına ${TEST_KURGU_STOGU.qty} adet — uydurma değer, vitrin denemesi`);
  const urunler = await new ProductService(db).listAll();
  const boylar = await new ProductVariantService(db).listByProducts(urunler.map((u) => u.id));
  const kimlikler = boylar.map((v) => v.id);
  const eldeki = await new StockService(db).getAvailableMap(facilityId, kimlikler);
  const fiyatlar = await new PriceService(db).findApplicableMap(kimlikler, 'b2c');
  const tedarikciByUrun = new Map(urunler.map((u) => [u.id, TEDARIKCI_ADA_GORE.get(u.name.tr ?? '') ?? KATALOG_TEDARIKCISI]));

  // Tedarikçiye göre kümelenir: parti kabulden, kabul siparişten, sipariş tek bir tedarikçiden doğar.
  const kalemler = new Map<string, Array<{ variantId: string; unitPriceCents: number }>>();
  for (const boy of boylar) {
    if ((eldeki.get(boy.id)?.availableQty ?? 0) > 0) continue;
    const tedarikci = tedarikciByUrun.get(boy.productId) ?? KATALOG_TEDARIKCISI;
    const satisCents = fiyatlar.get(boy.id)?.channelPrice?.amountCents ?? toCents(TEST_KATALOG_FIYATI.minB2c);
    const satir = { variantId: boy.id, unitPriceCents: Math.round(satisCents * TEST_KURGU_STOGU.costRate) };
    kalemler.set(tedarikci, [...(kalemler.get(tedarikci) ?? []), satir]);
  }

  const suppliers = await new SupplierService(db).list();
  const orders = new PurchaseOrderService(db);
  const areas = facilityId === PLANNED ? [] : await new StorageAreaService(db).listByWarehouses([facilityId]);
  const note = `Fatura ${TEST_KURGU_STOGU.invoice}`;
  for (const [tedarikci, satirlar] of kalemler) {
    const supplierId = suppliers.find((s) => s.name === tedarikci)?.id;
    if (!supplierId) {
      console.log(`  ${DRY_RUN ? '○' : '⚠'} ${tedarikci} — tedarikçi yok, kurgu stoğu yazılmadı`);
      continue;
    }
    if ((await orders.listBySupplier(supplierId)).some((o) => o.note === note)) {
      done(`kurgu stoğu · ${tedarikci}`);
      continue;
    }
    const areaName = TEST_INTAKE.areaBySupplier[tedarikci];
    plan(`kurgu stoğu · ${tedarikci} · ${satirlar.length} boy · ${areaName ?? 'alansız'}`);
    if (DRY_RUN) continue;
    const { order } = await orders.createDraft(
      supplierId,
      satirlar.map((s) => ({ ...s, qty: TEST_KURGU_STOGU.qty })),
      note,
    );
    await orders.markSent(order.id, purchaseOrderReferenceNo(new Date().getFullYear()));
    const storageAreaId = areas.find((area) => area.name === areaName)?.id ?? null;
    const outcome = await receivePurchase(db, {
      warehouseId: facilityId,
      purchaseOrderId: order.id,
      supplierId,
      note: `Kurgu stoğu — ${TEST_KURGU_STOGU.invoice}`,
      lines: satirlar.map(({ variantId }) => ({
        variantId,
        qty: TEST_KURGU_STOGU.qty,
        expiryDate: TEST_INTAKE.expiryDate,
        lotNumber: TEST_KURGU_STOGU.lotNumber,
        storageAreaId,
        unitCostCents: null,
      })),
    });
    if (outcome.status !== 'ok') {
      console.log(`  ⚠ ${tedarikci} — kabul yazılamadı (${outcome.status})`);
      continue;
    }
    console.log(`  ✓ ${outcome.result.stockIds.length} parti yazıldı`);
  }
}

async function main(): Promise<void> {
  checkInvoiceTotals();
  checkKunyeler();
  checkDraftCategories();
  checkSalePrices();
  checkBundleAndRecipeLines();
  const db = createServiceRoleClient();
  console.log(`▸ GERÇEK BESLEME${DRY_RUN ? ' · KURU KOŞU (yazılmaz)' : ''} · ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(adres yok)'}`);
  await waitForRest(db);
  const { facilityId } = await seedWarehouse(db);
  await seedStorageAreas(db, facilityId);
  await seedVehicle(db, facilityId);
  await seedZones(db, facilityId);
  await seedSettings(db);
  await seedSuppliers(db);
  const catId = await seedCategories(db);
  await seedCatalog(db, catId);
  await seedDrafts(db, catId);
  await seedDraftFamilies(db);
  await seedCollections(db);
  await seedPurchases(db);
  // Uydurma fiyat gerçeklerden SONRA: var olan fiyatın üstüne yazmaz.
  if (LAYERS >= 3) await seedTestCatalogPrices(db);
  // Paket fiyatı liste fiyatlarından türediği için fiyatlardan sonra.
  await seedBundles(db);
  await seedRecipes(db);
  // Mal kabulü KATMAN 2 (işletmeci kararı 19.09): lot ve son kullanma uydurmadır, mal fiilen
  // sayılmamıştır — ama ürünün BEYANINA dokunmaz, yalnız stok açar. Beyanı tahminle dolduran
  // türetme katman 3'te kaldı; ikisi aynı kapıda olsaydı stok görmek için beyan bozmak gerekirdi.
  if (LAYERS >= 2) await seedTestIntake(db, facilityId);
  // Kurgu stoğu gerçek kabulden SONRA: eldekisi olan varyantı görüp atlaması için.
  if (LAYERS >= 3) await seedTestStock(db, facilityId);
  // Künyesi olmayan görsel her koşuda yeniden yüklenir; sayı basılmazsa dönüşüm kotası sessizce erir.
  if (!DRY_RUN) gorselOzeti();
  console.log(DRY_RUN ? '✓ kuru koşu bitti' : '✓ gerçek besleme bitti');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
