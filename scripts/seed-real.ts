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
  StorageAreaService,
  SupplierProductService,
  SupplierService,
  VehicleService,
  WarehouseService,
  waitForRest,
} from '@lezzet/database';
import { canPublishProduct, purchaseOrderReferenceNo, rebalanceAllocations } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type { Product } from '@lezzet/types';

import { brand } from '../packages/brand/src/index';
import { lezzaGorselUrlByDosya, seedLezzaProducts } from './seed/catalog-lezza';
import { gorselOzeti, r2Keys, uploadImageFromPath, uploadImageFromUrl } from './seed/shared';
import { SAKLAMA } from './seed/storage-regime';
import {
  ADAY_SKULARI,
  BUNDLE_DISCOUNT,
  BUNDLES,
  CATEGORIES,
  COLLECTIONS,
  DRAFT_CATEGORY,
  DRAFT_FAMILIES,
  FICTION_ALLERGENS,
  FICTION_INGREDIENTS,
  FICTION_NUTRITION,
  FICTION_SIZES,
  FICTION_STORAGE,
  PURCHASES,
  RECIPES,
  SALE_PRICES,
  SETTINGS,
  STORAGE_AREAS,
  SUPPLIERS,
  TEST_INTAKE,
  VEHICLE,
  WAREHOUSE,
  ZONES,
} from './seed-real/data';

type Purchase = (typeof PURCHASES)[number];
type Draft = Purchase['drafts'][number];
type Line = Purchase['catalog'][number] | Draft['variants'][number];
type SeedLine = (typeof BUNDLES)[number]['items'][number];

/** Katalogda görünen ad Türkçesidir; faturadaki ad tedarikçinin dilinde kalır (eşleştirme onun üstünden). */
const draftName = (draft: Draft): string => draft.nameTr ?? draft.name;

/** Faturadaki ad → katalogdaki Türkçe ad; koleksiyon üyeliği faturadaki adla yazılı. */
const TASLAK_ADI = new Map(PURCHASES.flatMap((p) => p.drafts).map((d) => [d.name, draftName(d)]));

type Db = ReturnType<typeof createServiceRoleClient>;

try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Hangi katmana kadar yazılacağı (`--layers=2`, `--layers=3`; varsayılan 1) — katmanlar birikir, katmanların anlamı `seed-real/data.ts` künyesinde.
 * Varsayılan 1, çünkü üretim kurulumu bayraksız koşar ve orada tek bir uydurma değer yazılamaz.
 */
const LAYERS = (() => {
  const arg = process.argv.find((a) => a.startsWith('--layers='))?.split('=')[1];
  const n = Number(arg ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 3) throw new Error(`--layers 1, 2 ya da 3 olmalı (verilen: ${arg})`);
  return n;
})();
// Kuru koşuda henüz yazılmamış kaydın kimliği yerine geçer; yalnız sonraki adımların listelenmesi için.
const PLANNED = 'planlandı';

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

/** Taslak varyantının boyu: faturadaki, yoksa katman 3'ün uydurması; ikisi de yoksa varyant boysuz doğar. */
const draftSize = (draft: Draft, variant: Draft['variants'][number]) =>
  variant.label ? { label: variant.label, netWeightG: variant.netWeightG } : LAYERS >= 3 ? FICTION_SIZES[draft.name] : undefined;

function checkInvoiceTotals(): void {
  for (const purchase of PURCHASES) {
    if (purchase.invoiceTotal === undefined) continue;
    const lines = [...purchase.catalog, ...purchase.drafts.flatMap((d) => d.variants)];
    const total = lines.reduce((sum, line) => sum + toCents(line.qty * line.unitCost), 0);
    if (total !== toCents(purchase.invoiceTotal)) {
      throw new Error(`${purchase.invoice}: kalemlerin toplamı ${total / 100} €, fatura ${purchase.invoiceTotal} € — veri dosyasını kontrol et`);
    }
  }
}

/** Kategorisiz ürün olmamalı: eşlemesi yazılmamış taslak beslemeyi DURDURUR, sessizce kategorisiz doğmaz. */
function checkDraftCategories(): void {
  const gecerli = new Set(CATEGORIES.map((c) => c.key));
  const eksik = PURCHASES.flatMap((p) => p.drafts)
    .map((d) => d.name)
    .filter((ad) => !gecerli.has(DRAFT_CATEGORY[ad] ?? ''));
  if (eksik.length > 0) {
    throw new Error(`kategorisi yazılmamış taslak (${eksik.length}): ${eksik.join(' · ')} — DRAFT_CATEGORY'ye ekle`);
  }
}

/** Fiyat sözlüğü faturayla birebir olmalı: fiyatsız kalem de faturada olmayan fiyat da sessizce geçmez. */
function checkSalePrices(): void {
  const lines = new Set(PURCHASES.flatMap((p) => [...p.catalog, ...p.drafts.flatMap((d) => d.variants)]).map((l) => l.nameAtSupplier));
  const unpriced = [...lines].filter((name) => !SALE_PRICES[name]);
  const orphan = Object.keys(SALE_PRICES).filter((name) => !lines.has(name));
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
      const boylar = taslak?.variants.map((v) => draftSize(taslak, v)?.label) ?? [];
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
    plan(`${cat.name.tr} · ${cat.featured ? 'vitrinde' : 'vitrin dışı'}${cat.image ? ' · kapaklı' : ''}`);
    if (DRY_RUN) continue;
    const created = await categories.create({ name: cat.name, tagline: cat.tagline, sortOrder: i + 1 });
    // Vitrin işareti ayrı bir karardır ve servis onu ayrı metotla yazar (`setFeatured` künyesi).
    if (cat.featured) await categories.setFeatured(created.id, true);
    const kapak = await kategoriKapagi(cat, created.slug, lezzaUrl);
    if (kapak) await categories.update({ id: created.id, ...kapak });
    for (const key of anahtarlar) catId.set(key, created.id);
  }
  return catId;
}

async function seedCatalog(db: Db, catId: Map<string, string>): Promise<void> {
  console.log('▸ katalog — faturadaki Lezza varyantları');
  const variants = new ProductVariantService(db);
  const lines = PURCHASES.flatMap((p) => p.catalog);
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
  plan(`${lines.length} fatura varyantı + ${ADAY_SKULARI.length} aday · ürün, metin, görsel ve kategori katalog kaynağından`);
  if (DRY_RUN) return;
  const secim = new Map(
    lines.map((l) => [l.sku, l.unit ? { label: allLocales(l.unit.label), netWeightG: l.unit.netWeightG, piecesCount: l.unit.piecesCount } : {}]),
  );
  // Faturada olmayan aday kalemler aynı seçime girer ki ürünleri kurulsun — ama `kurgu.sku`ya
  // GİRMEZLER (aşağıda yalnız fatura satırları veriliyor): o küme "satış kurgusuna girmiş" demek ve
  // ürünü aktif olmaya zorlar. Adayın alış maliyeti yok, fiyatsız ve satışa kapalı kalması karar.
  for (const sku of ADAY_SKULARI) if (!secim.has(sku)) secim.set(sku, {});
  const made = await seedLezzaProducts(
    new CategoryService(db),
    new CategoryImageService(db),
    new ProductService(db),
    new ProductImageService(db),
    new ProductFamilyService(db),
    catId,
    0,
    { sku: new Set(lines.map((l) => l.sku)), slug: new Set() },
    // Katalog hep `base` kurulur: `extend` türetmenin yanında bilinçli kusurlar da sahneler ve gerçek
    // kataloğa kusur yazılmaz. Katman 3 yalnız türetmeyi açar ki belgesiz ürün satışa çıkabilsin.
    'base',
    { variants: secim, derive: LAYERS >= 3, candidates: new Set(ADAY_SKULARI) },
  );
  console.log(`  ✓ ${made.made} ürün · ${made.variants} varyant · ${made.photos} galeri görseli · ${made.families} aile`);
}

async function seedDrafts(db: Db, catId: Map<string, string>): Promise<void> {
  console.log('▸ taslak ürünler');
  const products = new ProductService(db);
  const variants = new ProductVariantService(db);
  const existing = new Map((await products.listAll()).map((p) => [p.name.tr, p.id]));
  for (const purchase of PURCHASES) {
    for (const draft of purchase.drafts) {
      const ad = draftName(draft);
      const mevcut = existing.get(ad);
      if (mevcut) {
        await fillDraftSize(variants, mevcut, draft);
        continue;
      }
      // Katman 3 uydurması ÖNCE hesaplanır, katman 1 onu EZER: ölçülmüş beyan uydurmayı her zaman yener.
      const kurgu = LAYERS >= 3;
      const name = { tr: ad, ...(draft.nameFr ? { fr: draft.nameFr } : {}), ...(draft.nameDe ? { de: draft.nameDe } : {}) };
      const description = LAYERS >= 2 ? draft.description : undefined;
      const ingredients = draft.ingredients ?? (kurgu ? FICTION_INGREDIENTS[draft.name] : undefined);
      const storageInstructions = draft.storage ?? (kurgu ? FICTION_STORAGE[draft.name] : undefined);
      const allergens = kurgu ? (FICTION_ALLERGENS[draft.name] ?? null) : null;
      // Yayına hazır mı sorusunu MOTOR cevaplar (`canPublishProduct`) — besleme kendi ölçütünü
      // uydurmaz ve veritabanı kısıtıyla aynı cümleyi kurar; ayrışsalardı insert sessizce patlardı.
      const yayina = kurgu && canPublishProduct({ name, description, ingredients, storageInstructions, allergens });
      plan(
        `${ad} · ${draft.variants.map((v) => draftSize(draft, v)?.label ?? 'boysuz').join(' + ')} · ${purchase.supplier}${draft.image ? ' · kapaklı' : ''}${yayina ? ' · AKTİF' : ''}`,
      );
      if (DRY_RUN) continue;
      // Kapak: tedarikçinin gönderdiği usta ya da markanın mağazasındaki çekim. R2 ayarsızsa null
      // döner ve ürün görselsiz açılır — besleme durmaz (`catalog-lezza` ile aynı davranış).
      const kapak = draft.image
        ? await (draft.image.file
            ? uploadImageFromPath(draft.image.file, r2Keys.productImage(draft.image.slug, draft.image.file))
            : uploadImageFromUrl(draft.image.url ?? '', r2Keys.productImage(draft.image.slug, draft.image.url ?? 'cover.webp')))
        : null;
      await products.create({
        // Dil alanı YAZILMAZSA boş kalır: `{fr: ''}` yazmak "alan dolu ama boş" anlamına gelir ve
        // `resolveLocalizedText` onu sessizce Türkçeye düşürür — eksik dil görünmez olurdu.
        name,
        // Kategori doğuşta yazılır; eşlemenin tamlığı `checkDraftCategories` ile koşudan önce sınandı.
        categoryId: catId.get(DRAFT_CATEGORY[draft.name] ?? '') ?? null,
        status: yayina ? 'active' : 'candidate',
        // Beyanlar: katman 1 ölçülmüşü, katman 3 uydurmayı verdi — seçim yukarıda yapıldı.
        ...(description ? { description } : {}),
        ...(ingredients ? { ingredients } : {}),
        ...(storageInstructions ? { storageInstructions } : {}),
        ...(draft.shelfLifeDays ? { shelfLifeDays: draft.shelfLifeDays } : {}),
        // Saklama rejimi İKİ kolonu birden yazar. Yazılmazsa kolonların varsayılanı kalır ve o
        // varsayılan donuk: pekmez dondurucuya düşer, hiçbir ürün kargoya çıkamaz.
        ...(draft.rejim ? { storageType: SAKLAMA[draft.rejim].storageType, shippable: SAKLAMA[draft.rejim].shippable } : {}),
        // Katman 3 — UYDURMA: kaynağı yok, yalnız test sunucusunun arayüzünü doldurur.
        ...(kurgu && FICTION_NUTRITION[draft.name] ? { nutrition: FICTION_NUTRITION[draft.name] } : {}),
        ...(allergens ? { allergens } : {}),
        ...(kapak ?? {}),
        variants: draft.variants.map((v) => {
          const boy = draftSize(draft, v);
          return { label: boy ? allLocales(boy.label) : undefined, netWeightG: boy?.netWeightG, sku: v.sku };
        }),
      });
    }
  }
}

/**
 * Faturası boy yazmayan varyant boysuz doğar; boy dosyaya sonradan girince yalnız hâlâ boş olan satıra yazılır, elle
 * girilmiş boy ezilmez (`seedSettings` ile aynı ölçü).
 */
async function fillDraftSize(variants: ProductVariantService, productId: string, draft: Draft): Promise<void> {
  const ad = draftName(draft);
  const [tek, ...diger] = draft.variants;
  const boy = tek && diger.length === 0 ? draftSize(draft, tek) : undefined;
  const satirlar = boy ? await variants.listByProduct(productId) : [];
  const [satir] = satirlar;
  if (!boy || !satir || satirlar.length > 1 || satir.label.tr === boy.label) {
    done(ad);
    return;
  }
  if (satir.label.tr) {
    console.log(`  ⚠ ${ad} — varyantta "${satir.label.tr}" yazılı; ${boy.label} yazılmadı`);
    return;
  }
  plan(`${ad} · boy ${boy.label}`);
  if (!DRY_RUN) await variants.update({ id: satir.id, label: allLocales(boy.label), netWeightG: boy.netWeightG });
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
    const own = product ? await variants.listByProduct(product.id) : [];
    for (const line of draft.variants) {
      const boy = draftSize(draft, line)?.label;
      const match = own.find((v) => (line.sku ? v.sku === line.sku : v.label.tr === boy));
      rows.push({ line, variantId: match?.id ?? null });
    }
  }
  return rows;
}

async function seedPurchases(db: Db): Promise<void> {
  console.log('▸ fiyat · tedarikçi eşlemesi · tedarikçi siparişi');
  const suppliers = await new SupplierService(db).list();
  const prices = new PriceService(db);
  const mappings = new SupplierProductService(db);
  const orders = new PurchaseOrderService(db);
  for (const purchase of PURCHASES) {
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
      const price = SALE_PRICES[line.nameAtSupplier];
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
    plan(`tarif · ${tarif.name.tr} · ${ids.length} ürün`);
    if (DRY_RUN) continue;
    await recipes.createWithItems({
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
  }
}

/** Siparişlerin tamamını tek partide teslim alır — arayüz denemesi için, gerçek sayım değil. */
async function seedTestIntake(db: Db, facilityId: string): Promise<void> {
  console.log(`▸ test kabulü · lot ${TEST_INTAKE.lotNumber} · SKT ${TEST_INTAKE.expiryDate} — uydurma değer, arayüz denemesi`);
  const areas = facilityId === PLANNED ? [] : await new StorageAreaService(db).listByWarehouses([facilityId]);
  const intakes = new StockIntakeService(db);
  const orders = new PurchaseOrderService(db);
  const suppliers = await new SupplierService(db).list();
  for (const purchase of PURCHASES) {
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

async function main(): Promise<void> {
  checkInvoiceTotals();
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
  // Paket fiyatı liste fiyatlarından türediği için fiyatlardan sonra.
  await seedBundles(db);
  await seedRecipes(db);
  // Mal kabulü katman 3: lot ve son kullanma uydurmadır, mal fiilen sayılmamıştır.
  if (LAYERS >= 3) await seedTestIntake(db, facilityId);
  // Künyesi olmayan görsel her koşuda yeniden yüklenir; sayı basılmazsa dönüşüm kotası sessizce erir.
  if (!DRY_RUN) gorselOzeti();
  console.log(DRY_RUN ? '✓ kuru koşu bitti' : '✓ gerçek besleme bitti');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
