import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * E2E YAZAN-PARTİ fikstürü (Kademe 2 Parti 4+ · CLAUDE §4b) — damgalı sipariş + stok kurar,
 * `purgeTestData` ile toplar. Desen `apps/web/lib/order/preparation.test.ts`'ten alınmadır:
 * fikstür İCAT EDİLMEDİ, entegrasyon testlerinin kanıtlanmış kurulumunun e2e'ye taşınmış hâli.
 *
 * ── NEDEN DB'DEN KURULUYOR, UI'DAN DEĞİL ────────────────────────────────────
 * Kuyruk/hazırlık senaryosunun sınadığı şey SİPARİŞİN İŞLENMESİ, yaratılması değil; yaratmayı
 * UI'dan yapmak testi checkout'un (ve OTP kapısının) rehinesi yapardı. Seed siparişi kullanmak da
 * yasak: durumunu ilerletmek KÜRESEL kirliliktir (§4b) — üç ajan aynı seed'i paylaşıyor.
 *
 * ── ENV ─────────────────────────────────────────────────────────────────────
 * Playwright süreci `.env`'i kendiliğinden yüklemez (Next yükler, biz Next değiliz). Kök `.env`
 * elle okunur; yalnız EKSİK anahtarlar doldurulur (kabuktan gelen değer kazanır).
 */
export function loadRootEnv(): void {
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

export interface StampedOrder {
  stamp: number;
  orderId: string;
  customerName: string;
  productName: string;
  warehouseId: string;
  cleanup: () => Promise<void>;
}

/**
 * Damgalı, kendi deposunda, stoğu hazır TEK kalemlik sipariş.
 *
 * Dönen `cleanup` MUTLAKA çağrılır (test `afterAll`) — sırası `purgeTestData`'nın bilgisidir,
 * elle silme YOK (CLAUDE §4b; `warehouse`/`account` restrict FK'leri sessiz yarım silme üretir).
 */
export async function createStampedOrder(): Promise<StampedOrder> {
  loadRootEnv();
  // Dinamik import: modül yükü env'den SONRA — statik import olsaydı `serviceDb` env'siz düşerdi.
  const { CategoryService, OrderService, ProductService, StockService, UserProfileService, serviceDb } = await import('@lezzet/database');
  const { createTestWarehouse, purgeTestData } = await import('@lezzet/database/testing');

  const db = serviceDb();
  const stamp = Date.now();
  const customerName = `E2E kuyruk müşterisi ${stamp}`;
  const productName = `E2E baklava ${stamp}`;

  const warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `E2E kategori ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: productName }, categoryId: category.id });
  const profile = await new UserProfileService(db).insert({ name: customerName });
  await new StockService(db).insert({
    warehouseId,
    variantId: variants[0]!.id,
    physicalQty: 10,
    expiryDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    purchasePriceCents: 200,
  });

  const { order } = await new OrderService(db).create(
    { warehouseId, customerId: profile.id, channel: 'b2c' },
    [{ variantId: variants[0]!.id, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  // Sipariş `draft` doğar ve kuyruk draft'ı LİSTELEMEZ (`LISTED_STATUSES`) — kuyruk senaryosunun
  // öznesi onaylı sipariştir. Durum fikstürde düz yazımla yükseltilir: geçiş MOTORUNU çağırmak bu
  // testin işi değil, motor kendi birim/entegrasyon testlerinde sınanıyor.
  await db.from('order').update({ status: 'confirmed' }).eq('id', order.id);

  return {
    stamp,
    orderId: order.id,
    customerName,
    productName,
    warehouseId,
    cleanup: async () => {
      await db.from('order').delete().eq('customer_id', profile.id);
      await purgeTestData(db, {
        productIds: [product.id],
        categoryIds: [category.id],
        profileIds: [profile.id],
        warehouseIds: [warehouseId],
      });
    },
  };
}
