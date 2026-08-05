import { loadRootEnv } from './order-fixture';

/**
 * E2E MAL KABUL fikstürü (Kademe 2 Parti 4b · CLAUDE §4b) — damgalı depo + kategori + ürün kurar
 * (bilerek STOKSUZ) ve girişi üretim RPC'siyle yapar; `purgeTestData` toplar.
 *
 * ── NEDEN GİRİŞ RPC'DEN, EKRANDAN DEĞİL ─────────────────────────────────────
 * Mal kabul EKRANI henüz yok (10.4 — arka uç hazır, çizim bekleniyor; `docs/build/10-depo.md`).
 * Ekran inene dek duman testinin sınayabildiği şey girişin EKRANA YANSIMASIDIR: yazım, ekranın da
 * kullanacağı tek transaction'lı RPC'den geçer (`StockIntakeService.receive` → `receive_intake`:
 * giriş kaydı + parti + belge numarası bölünmez). Uygulama kapısı `apps/web/lib/stock/intake.ts`
 * buradan ÇAĞRILAMAZ: zinciri `server-only` importuna uzanıyor ve Playwright sürecinde patlar;
 * kapının kendi güvencesi (MLOR uyarısı, PO farkı, maliyet eşlemesi) zaten kendi entegrasyon
 * testlerinde (`intake.test.ts`, 7 test). Ekran gelince yazım adımı UI'a taşınır, iddialar kalır.
 *
 * ── ENV ─────────────────────────────────────────────────────────────────────
 * `loadRootEnv` + dinamik import deseni `order-fixture`'dan: modül yükü env'den SONRA olmalı,
 * statik `@lezzet/database` importu env'siz düşerdi.
 */
export interface StampedCatalog {
  stamp: number;
  productName: string;
  categoryId: string;
  variantId: string;
  warehouseId: string;
  lotNumber: string;
  cleanup: () => Promise<void>;
}

/**
 * Damgalı, kendi deposunda, HİÇ PARTİSİZ tek boylu ürün. Stok bilerek kurulmaz: senaryonun öznesi
 * "parti yok → giriş → 1 parti" geçişidir; hazır stokla başlasaydı giriş görünmez kalırdı.
 *
 * Dönen `cleanup` MUTLAKA çağrılır (test `afterAll`); giriş satırları da (`stock`, `stock_intake`,
 * depo belge numaratörü) `purgeTestData`'nın bildiği hedeflerdir — parti varyant üzerinden, kabul
 * kaydı ve numaratör depo üzerinden gider, elle silme YOK (CLAUDE §4b).
 */
export async function createStampedCatalog(): Promise<StampedCatalog> {
  loadRootEnv();
  const { CategoryService, ProductService, serviceDb } = await import('@lezzet/database');
  const { createTestWarehouse, purgeTestData } = await import('@lezzet/database/testing');

  const db = serviceDb();
  const stamp = Date.now();
  const productName = `E2E lokum ${stamp}`;

  const warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `E2E kabul ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: productName }, categoryId: category.id });

  return {
    stamp,
    productName,
    categoryId: category.id,
    variantId: variants[0]!.id,
    warehouseId,
    lotNumber: `E2E-LOT-${stamp}`,
    cleanup: async () => {
      await purgeTestData(db, {
        productIds: [product.id],
        categoryIds: [category.id],
        warehouseIds: [warehouseId],
      });
    },
  };
}

/**
 * Girişin kendisi — senaryonun "yaz" adımı (gerekçe dosya başında). Tedarikçisiz, PO'suz elle
 * giriş: ikisi de meşru (küçük/plansız alım) ve temizliği depo/ürün hedefleri karşılıyor.
 * Son tarih uzak tutulur (+120 gün): parti karar kuyruğuna DÜŞMEMELİ, senaryo seviye ekranının.
 */
export async function receiveStampedBatch(catalog: StampedCatalog, opts: { qty: number }): Promise<void> {
  const { StockIntakeService, serviceDb } = await import('@lezzet/database');
  await new StockIntakeService(serviceDb()).receive({
    warehouseId: catalog.warehouseId,
    lines: [
      {
        variantId: catalog.variantId,
        qty: opts.qty,
        expiryDate: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
        lotNumber: catalog.lotNumber,
        location: 'E2E raf',
      },
    ],
  });
}
