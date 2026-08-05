import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E UÇ-DURUM fikstürü (Kademe 2 Parti 5 · CLAUDE §4b) — damgalı, vitrine açık TEK varyantlı ürün
 * kurar: kategori + ürün + b2c fiyatı (+ istenirse stok partisi ve damgalı teslimat bölgesi).
 * `purgeTestData` ile toplanır. Desen `order-fixture.ts`ten türedir; oradaki kurulum SİPARİŞ
 * merkezliydi, buradaki VİTRİN merkezli: ürünün ziyaretçiye satılabilir görünmesi için sipariş
 * değil fiyat satırı gerekir (fiyatsız varyant "satışa kapalı"dır, DOMAIN §5 — tükendi değil).
 *
 * ── DAMGALI BÖLGE (withZone) NEDEN VAR ──────────────────────────────────────
 * Damgalı depo seed'in 67000 bölgesine bağlı DEĞİL; ürünün "bu yerde alınabilir" görünmesi için
 * yer → bölge → depo zinciri fikstürün kendi satırlarıyla kurulur. Kod UYDURMA bir '00xxx'tir:
 * referans tabloda (`postal_code_place`) '00' öneki iki ülkede de yok (ölçüldü: 0 satır) ve motor
 * kendi bölge tablomuzu otorite sayar (19.16a) — yani kod tek adayla FR'ye çözülür, seed'in
 * 67xxx kodlarıyla ve öteki ajanların verisiyle hiçbir kesişimi olmaz.
 *
 * ── ENV ─────────────────────────────────────────────────────────────────────
 * Playwright süreci `.env`'i kendiliğinden yüklemez (Next yükler, biz Next değiliz). Kök `.env`
 * elle okunur; yalnız EKSİK anahtarlar doldurulur (kabuktan gelen değer kazanır). Import'lar bu
 * yüzden DİNAMİK: statik import olsaydı `serviceDb` env'siz modül yükünde düşerdi.
 */
function loadRootEnv(): void {
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
    }
  } catch {
    // .env yoksa kabuk env'ine güvenilir — serviceDb eksikse zaten adlı hatayla patlar.
  }
}

export interface StampedProduct {
  stamp: number;
  productName: string;
  slug: string;
  /** FR ürün sayfası yolu — katalog görünürlüğüne bağlanmadan DOĞRUDAN gezinme için. */
  urlFr: string;
  /** `withZone` ile açılan damgalı rota kodu; bölge istenmediyse null. */
  postalCode: string | null;
  warehouseId: string;
  variantId: string;
  /** Stok partilerinin fiziksel miktarını sıfırlar — "kalem sepetteyken stok düştü" ânı. */
  clearStock: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export interface StampedProductOptions {
  /** Damgalı depoya konacak parti miktarı; 0 = hiç parti açılmaz (tükendi senaryosu). */
  stockQty?: number;
  /** Damgalı depoya bölge + posta kodu bağı kur (ziyaretçi yer seçebilsin diye). */
  withZone?: boolean;
}

/** Varyantın b2c liste fiyatı — satılabilirliğin ön koşulu; tutarın kendisi senaryoda önemsiz. */
const PRICE_CENTS = 1290;

/**
 * Damgalı, satışa açık (aktif + fiyatlı) tek varyantlı ürün.
 *
 * Dönen `cleanup` MUTLAKA çağrılır (test `afterAll`) — silme sırası `purgeTestData`'nın bilgisidir
 * (CLAUDE §4b): bölge satırları depo hedefiyle, fiyat satırları varyant CASCADE'iyle gider.
 */
export async function createStampedProduct(opts: StampedProductOptions = {}): Promise<StampedProduct> {
  loadRootEnv();
  // Dinamik import: modül yükü env'den SONRA (dosya başındaki künye).
  const { CategoryService, DeliveryZoneService, PriceService, ProductService, StockService, serviceDb } =
    await import('@lezzet/database');
  const { createTestWarehouse, purgeTestData } = await import('@lezzet/database/testing');

  const db = serviceDb();
  const stamp = Date.now();
  const productName = `E2E lokum ${stamp}`;

  // Depo açma TEKRARLI: `createTestWarehouse` kodunu `Date.now()+sayaç`tan üretir ve sayaç süreç
  // içidir — iki paralel Playwright worker'ı AYNI milisaniyede aynı kodu üretebiliyor (yaşandı:
  // `warehouse_code_key` 23505). İkinci deneme ≥1 ms sonra olduğundan kod kendiliğinden ayrışır.
  let warehouseId = '';
  for (let attempt = 0; ; attempt++) {
    try {
      warehouseId = (await createTestWarehouse(db)).id;
      break;
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
  const category = await new CategoryService(db).create({ name: { tr: `E2E kategori ${stamp}` } });
  // Varsayılanlar vitrin koşullarını zaten karşılar: status 'active', shippable true, tek varyant.
  const { product, variants } = await new ProductService(db).create({ name: { tr: productName }, categoryId: category.id });
  const variantId = variants[0]!.id;
  await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: PRICE_CENTS });

  if ((opts.stockQty ?? 0) > 0) {
    await new StockService(db).insert({
      warehouseId,
      variantId,
      physicalQty: opts.stockQty!,
      expiryDate: new Date(stamp + 30 * 86_400_000).toISOString().slice(0, 10),
      purchasePriceCents: 200,
    });
  }

  let postalCode: string | null = null;
  if (opts.withZone) {
    const zones = new DeliveryZoneService(db);
    const zone = await zones.insert({ name: `E2E bölgesi ${stamp}`, warehouseId, weekdays: [2, 5] });
    // Kod bağ tablosunda BİRİNCİL ANAHTARDIR (ülke, kod): iki paralel proje (desktop+mobile) aynı
    // kodu kapmaya kalkarsa ikincisi sessiz bir belirsizlik değil adlı bir hata alır — o yüzden
    // çakışmada yeni rastgele kod denenir. '00' öneki referans tabloda hiç yok, tek aday kalırız.
    for (let attempt = 0; ; attempt++) {
      const candidate = `00${String(100 + Math.floor(Math.random() * 900))}`;
      try {
        await zones.replacePostalCodes(zone.id, [{ country: 'FR', postalCode: candidate }]);
        postalCode = candidate;
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
      }
    }
  }

  return {
    stamp,
    productName,
    slug: product.slug,
    urlFr: `/fr/produit/${product.slug}`,
    postalCode,
    warehouseId,
    variantId,
    clearStock: async () => {
      // Parti SİLİNMEZ, sıfırlanır: satırı silmek `stock_adjustment` zincirini de sürüklerdi ve o
      // sıra purge'ün bilgisidir. Kullanılabilir stok fiziksel miktardan türediği için sıfır yeter.
      const { error } = await db.from('stock').update({ physical_qty: 0 }).eq('variant_id', variantId);
      if (error) throw new Error(`stok sıfırlanamadı — ${error.message}`);
    },
    cleanup: async () => {
      await purgeTestData(db, {
        productIds: [product.id],
        categoryIds: [category.id],
        warehouseIds: [warehouseId],
      });
    },
  };
}
