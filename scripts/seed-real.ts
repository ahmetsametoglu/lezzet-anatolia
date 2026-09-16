// Gerçek başlangıç beslemesi: `seed-real/data.ts`'te yazanı ekler, hiçbir değer üretmez ve katmanlı
// `seed.ts`ten ayrıdır. Var olan kayda dokunmaz ki panelden yapılan düzeltme yeniden çalıştırmada ezilmesin.
import { receivePurchase } from '@lezzet/application';
import {
  CategoryImageService,
  CategoryService,
  createServiceRoleClient,
  DeliveryZoneService,
  PriceService,
  ProductFamilyService,
  ProductImageService,
  ProductService,
  ProductVariantService,
  PurchaseOrderService,
  SettingsService,
  StockIntakeService,
  StorageAreaService,
  SupplierProductService,
  SupplierService,
  VehicleService,
  WarehouseService,
  waitForRest,
} from '@lezzet/database';
import { purchaseOrderReferenceNo } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';

import { brand } from '../packages/brand/src/index';
import { seedLezzaProducts } from './seed/catalog-lezza';
import { PURCHASES, SETTINGS, STORAGE_AREAS, SUPPLIERS, TEST_INTAKE, VEHICLE, WAREHOUSE, ZONES } from './seed-real/data';

type Purchase = (typeof PURCHASES)[number];
type Line = Purchase['catalog'][number] | Purchase['drafts'][number]['variants'][number];

type Db = ReturnType<typeof createServiceRoleClient>;

try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

const DRY_RUN = process.argv.includes('--dry-run');
// Uydurma lot ve son kullanma taşıdığı için ayrı bayrak ister; düz çalıştırma stok yazmaz.
const WITH_INTAKE = process.argv.includes('--with-intake');
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

async function seedCatalog(db: Db): Promise<void> {
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
  plan(`${lines.length} varyant · ürün, metin, görsel ve kategori katalog kaynağından`);
  if (DRY_RUN) return;
  const secim = new Map(
    lines.map((l) => [l.sku, l.unit ? { label: allLocales(l.unit.label), netWeightG: l.unit.netWeightG, piecesCount: l.unit.piecesCount } : {}]),
  );
  const made = await seedLezzaProducts(
    new CategoryService(db),
    new CategoryImageService(db),
    new ProductService(db),
    new ProductImageService(db),
    new ProductFamilyService(db),
    new Map(),
    0,
    { sku: new Set(secim.keys()), slug: new Set() },
    'base',
    { variants: secim },
  );
  console.log(`  ✓ ${made.made} ürün · ${made.variants} varyant · ${made.photos} galeri görseli · ${made.families} aile`);
}

async function seedDrafts(db: Db): Promise<void> {
  console.log('▸ taslak ürünler');
  const products = new ProductService(db);
  const existing = new Set((await products.listAll()).map((p) => p.name.tr));
  for (const purchase of PURCHASES) {
    for (const draft of purchase.drafts) {
      if (existing.has(draft.name)) {
        done(draft.name);
        continue;
      }
      plan(`${draft.name} · ${draft.variants.map((v) => v.label ?? 'boysuz').join(' + ')} · ${purchase.supplier}`);
      if (DRY_RUN) continue;
      await products.create({
        name: { tr: draft.name },
        status: 'candidate',
        variants: draft.variants.map((v) => ({ label: v.label ? allLocales(v.label) : undefined, netWeightG: v.netWeightG, sku: v.sku })),
      });
    }
  }
}

/** Katalog satırı varyant koduyla, taslak satırı ürün adı ve boyuyla bulunur; bulunamayanın kimliği `null`. */
async function purchaseLines(db: Db, purchase: Purchase): Promise<{ line: Line; variantId: string | null }[]> {
  const variants = new ProductVariantService(db);
  const products = await new ProductService(db).listAll();
  const rows: { line: Line; variantId: string | null }[] = [];
  for (const line of purchase.catalog) rows.push({ line, variantId: (await variants.findBySku(line.sku))?.id ?? null });
  for (const draft of purchase.drafts) {
    const product = products.find((p) => p.name.tr === draft.name);
    const own = product ? await variants.listByProduct(product.id) : [];
    for (const line of draft.variants) {
      const match = own.find((v) => (line.sku ? v.sku === line.sku : v.label.tr === line.label));
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
      if (line.b2c === undefined || line.b2b === undefined) continue;
      if ((await prices.listByVariant(variantId)).length > 0) {
        done(`fiyat · ${line.nameAtSupplier}`);
        continue;
      }
      plan(`fiyat · ${line.nameAtSupplier} · ${line.b2c} € / ${line.b2b} €`);
      if (DRY_RUN) continue;
      await prices.setPrice({ variantId, channel: 'b2c', amountCents: toCents(line.b2c) });
      await prices.setPrice({ variantId, channel: 'b2b', amountCents: toCents(line.b2b) });
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
  const db = createServiceRoleClient();
  console.log(`▸ GERÇEK BESLEME${DRY_RUN ? ' · KURU KOŞU (yazılmaz)' : ''} · ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(adres yok)'}`);
  await waitForRest(db);
  const { facilityId } = await seedWarehouse(db);
  await seedStorageAreas(db, facilityId);
  await seedVehicle(db, facilityId);
  await seedZones(db, facilityId);
  await seedSettings(db);
  await seedSuppliers(db);
  await seedCatalog(db);
  await seedDrafts(db);
  await seedPurchases(db);
  if (WITH_INTAKE) await seedTestIntake(db, facilityId);
  console.log(DRY_RUN ? '✓ kuru koşu bitti' : '✓ gerçek besleme bitti');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
