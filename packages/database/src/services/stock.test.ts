import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { ReservationService } from './reservation.service';
import { StockService } from './stock.service';

/**
 * Stok ve rezervasyon (06.2/06.3/06.4) — DB üstünde. Burada **fiziksel gerçek** doğrulanır:
 * kullanılabilir hesabı, atomik ayırma ve süpürme. "Ne zaman ayrılır, kaç dakika TTL" gibi kurallar
 * motorun birim testindedir (`domain-core/stock`) — `database` paketi motoru bilmez (STACK §4).
 *
 * Not: `order` tablosu henüz yok (modül 07) — `order_id` rastgele uuid ile yazılır (FK yok,
 * migration'da gerekçesi var).
 */
const db = serviceDb();
const stocks = new StockService(db);
const reservations = new ReservationService(db);
const products = new ProductService(db);
const categories = new CategoryService(db);

let variantId: string;
let productId: string;
let categoryId: string;
const orderId = () => crypto.randomUUID();

beforeAll(async () => {
  const category = await categories.create({ name: { tr: `Stok testi ${Date.now()}` } });
  const { product, variants } = await products.create({
    name: { tr: `Mantı ${Date.now()}` },
    categoryId: category.id,
    dateType: 'DLC',
    shelfLifeDays: 360,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

// Test kendi zeminini toplar: aksi hâlde her koşuş yerel veritabanına kalıcı bir ürün bırakır ve
// operasyon listesinde çöp satır olarak görünür. Sıra zorunlu: `stock`/`reservation` varyanta
// RESTRICT ile bağlı, önce onlar silinmezse ürün silinemez (varyant CASCADE'i engellenir).
afterAll(async () => {
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await products.delete(productId).catch(() => {});
  await categories.delete(categoryId).catch(() => {});
});

/** Her testin kendi zemini: varyantın partileri ve rezervasyonları sıfırlanır. */
beforeEach(async () => {
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
});

/** n gün sonrası — ISO tarih (parti son tarihi). */
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('kullanılabilir stok — türetilir, saklanmaz (06.2)', () => {
  it('parti yoksa sıfırlarla döner (null kontrolü gerektirmez)', async () => {
    const available = await stocks.getAvailable(variantId);
    expect(available).toMatchObject({ variantId, physicalQty: 0, availableQty: 0 });
  });

  it('kullanılabilir = fiili − aktif rezervasyon', async () => {
    await stocks.insert({ variantId, physicalQty: 10, expiryDate: dayOffset(200) });
    await reservations.reserve({ orderId: orderId(), variantId, qty: 3 });

    expect(await stocks.getAvailable(variantId)).toMatchObject({ physicalQty: 10, reservedQty: 3, availableQty: 7 });
  });

  it('süresi dolmuş rezervasyon sayılmaz — görünüm süpürücüyü beklemez', async () => {
    await stocks.insert({ variantId, physicalQty: 5, expiryDate: dayOffset(200) });
    await db.from('reservation').insert({
      order_id: orderId(),
      variant_id: variantId,
      qty: 5,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    expect((await stocks.getAvailable(variantId)).availableQty).toBe(5);
  });

  it('tarihi geçmiş DLC partisi OLGU olarak ayrı sayılır (satma kararı motorun)', async () => {
    await stocks.insert({ variantId, physicalQty: 4, expiryDate: dayOffset(200) });
    await stocks.insert({ variantId, physicalQty: 6, expiryDate: dayOffset(-1) });

    const available = await stocks.getAvailable(variantId);
    expect(available.availableQty).toBe(10); // fiili gerçek: mal depoda duruyor
    expect(available.expiredDlcQty).toBe(6); // satışa açık miktar = 10 − 6, kararı çağıran verir
  });

  it('çok varyantlı okuma tek turda ve eksiksiz döner', async () => {
    const unknown = crypto.randomUUID();
    const map = await stocks.getAvailableMap([variantId, unknown]);
    expect(map.size).toBe(2);
    expect(map.get(unknown)?.availableQty).toBe(0);
  });

  it('partiler FEFO sırasında gelir; ürünün tarih alanları aynı turda', async () => {
    await stocks.insert({ variantId, physicalQty: 3, expiryDate: dayOffset(300) });
    await stocks.insert({ variantId, physicalQty: 2, expiryDate: dayOffset(100) });

    const batches = await stocks.listByVariantWithDates(variantId);
    expect(batches.map((b) => b.physicalQty)).toEqual([2, 3]); // önce süresi dolan
    expect(batches[0]!.variant.product).toEqual({ dateType: 'DLC', shelfLifeDays: 360 });
  });
});

describe('atomik ayırma (06.3)', () => {
  it('kullanılabilir yeterse ayırır ve kalanı bildirir', async () => {
    await stocks.insert({ variantId, physicalQty: 8, expiryDate: dayOffset(200) });

    const result = await reservations.reserve({ orderId: orderId(), variantId, qty: 5 });
    expect(result.ok).toBe(true);
    expect(result.available).toBe(3);
    expect(result.reservationId).not.toBeNull();
  });

  it('yetmezse HİÇ yazmaz — kısmi ayırma yok', async () => {
    await stocks.insert({ variantId, physicalQty: 2, expiryDate: dayOffset(200) });

    const result = await reservations.reserve({ orderId: orderId(), variantId, qty: 3 });
    expect(result).toMatchObject({ ok: false, reservationId: null, available: 2 });
    expect((await stocks.getAvailable(variantId)).reservedQty).toBe(0);
  });

  it('YARIŞ: iki istek aynı anda son birimi isterse yalnız biri kazanır', async () => {
    await stocks.insert({ variantId, physicalQty: 1, expiryDate: dayOffset(200) });

    const [a, b] = await Promise.all([
      reservations.reserve({ orderId: orderId(), variantId, qty: 1 }),
      reservations.reserve({ orderId: orderId(), variantId, qty: 1 }),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1); // aşırı-satış yok
    expect((await stocks.getAvailable(variantId)).availableQty).toBe(0);
  });

  it('YARIŞ: on eşzamanlı istek, beş birimlik stoktan yalnız beşini kapar', async () => {
    await stocks.insert({ variantId, physicalQty: 5, expiryDate: dayOffset(200) });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => reservations.reserve({ orderId: orderId(), variantId, qty: 1 })),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect((await stocks.getAvailable(variantId)).availableQty).toBe(0);
  });

  it('TTL verilirse rezervasyon süreli, verilmezse süresiz (kapıda/vadeli)', async () => {
    await stocks.insert({ variantId, physicalQty: 4, expiryDate: dayOffset(200) });
    const order = orderId();

    await reservations.reserve({ orderId: order, variantId, qty: 1, ttlMinutes: 30 });
    await reservations.reserve({ orderId: order, variantId, qty: 1 });

    const rows = await reservations.listActiveByOrder(order);
    expect(rows.filter((r) => r.expiresAt !== null)).toHaveLength(1);
    expect(rows.filter((r) => r.expiresAt === null)).toHaveLength(1);
  });

  it('partiye çıpalı ayırma yalnız O partinin kullanılabilirine bakar', async () => {
    const offerBatch = await stocks.insert({ variantId, physicalQty: 2, expiryDate: dayOffset(30), offerPrice: 4.5 });
    await stocks.insert({ variantId, physicalQty: 20, expiryDate: dayOffset(300) });

    // Varyant toplamı 22 olsa da çıpalı istek partinin 2'siyle sınırlıdır.
    const surplus = await reservations.reserve({ orderId: orderId(), variantId, qty: 3, stockId: offerBatch.id });
    expect(surplus).toMatchObject({ ok: false, available: 2 });

    const exact = await reservations.reserve({ orderId: orderId(), variantId, qty: 2, stockId: offerBatch.id });
    expect(exact.ok).toBe(true);
  });

  it('sıfır/negatif miktar reddedilir', async () => {
    await expect(reservations.reserve({ orderId: orderId(), variantId, qty: 0 })).rejects.toThrow();
  });
});

describe('serbest bırakma ve TTL süpürme (06.4)', () => {
  it('sipariş kapanınca rezervasyonları düşer', async () => {
    await stocks.insert({ variantId, physicalQty: 6, expiryDate: dayOffset(200) });
    const order = orderId();
    await reservations.reserve({ orderId: order, variantId, qty: 4 });

    await reservations.releaseByOrder(order);
    expect((await stocks.getAvailable(variantId)).availableQty).toBe(6);
  });

  it('süpürücü yalnız süresi geçmişi siler; ikinci tarama no-op (idempotent)', async () => {
    await stocks.insert({ variantId, physicalQty: 10, expiryDate: dayOffset(200) });
    const expired = orderId();
    await db.from('reservation').insert({
      order_id: expired,
      variant_id: variantId,
      qty: 3,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await reservations.reserve({ orderId: orderId(), variantId, qty: 2, ttlMinutes: 30 }); // süresi dolmamış
    await reservations.reserve({ orderId: orderId(), variantId, qty: 1 }); // süresiz

    expect(await reservations.sweepExpired()).toBe(1);
    expect(await reservations.sweepExpired()).toBe(0);
    expect((await stocks.getAvailable(variantId)).reservedQty).toBe(3); // 2 süreli + 1 süresiz kaldı
  });
});

describe('eşik altı varyantlar (06.11 girdisi)', () => {
  it('kullanılabilir eşiğin altına düşen varyant listeye girer, üstündeki girmez', async () => {
    await db.from('product_variant').update({ min_stock_qty: 5 }).eq('id', variantId);
    await stocks.insert({ variantId, physicalQty: 4, expiryDate: dayOffset(200) });

    const below = await stocks.listBelowMinStock();
    expect(below.find((r) => r.variantId === variantId)).toMatchObject({ availableQty: 4, minStockQty: 5 });

    await stocks.insert({ variantId, physicalQty: 10, expiryDate: dayOffset(200) });
    const above = await stocks.listBelowMinStock();
    expect(above.find((r) => r.variantId === variantId)).toBeUndefined();
  });
});

describe('tahmini birim maliyet (fiyat kararının girdisi)', () => {
  it('eldeki partilerin alış fiyatını ADETLE ağırlıklı ortalar', async () => {
    // 10 adet × 4 € + 30 adet × 8 € → ortalama 7 €. Düz ortalama 6 € derdi: az kalan pahalı partiyi
    // ucuz göstermek marjı olduğundan yüksek hesaplattırır.
    await stocks.insert({ variantId, physicalQty: 10, purchasePrice: 4, expiryDate: dayOffset(100) });
    await stocks.insert({ variantId, physicalQty: 30, purchasePrice: 8, expiryDate: dayOffset(120) });

    const costs = await stocks.unitCostMap([variantId]);
    expect(costs.get(variantId)).toBeCloseTo(7, 6);
  });

  it('alış fiyatı GİRİLMEMİŞ parti hesaba katılmaz (0 sayılsa maliyet düşük görünürdü)', async () => {
    await stocks.insert({ variantId, physicalQty: 10, purchasePrice: 5, expiryDate: dayOffset(100) });
    await stocks.insert({ variantId, physicalQty: 90, expiryDate: dayOffset(120) }); // fiyatsız parti

    expect((await stocks.unitCostMap([variantId])).get(variantId)).toBeCloseTo(5, 6);
  });

  it('tükenmiş parti maliyeti sürüklemez — elde olmayan mal fiyat kararına girmez', async () => {
    await stocks.insert({ variantId, physicalQty: 0, purchasePrice: 100, expiryDate: dayOffset(50) });
    await stocks.insert({ variantId, physicalQty: 5, purchasePrice: 6, expiryDate: dayOffset(100) });

    expect((await stocks.unitCostMap([variantId])).get(variantId)).toBeCloseTo(6, 6);
  });

  it('fiyatlı partisi olmayan varyant haritada YER ALMAZ — "bilmiyorum" ile "sıfır" ayrı şeyler', async () => {
    await stocks.insert({ variantId, physicalQty: 7, expiryDate: dayOffset(100) });

    const costs = await stocks.unitCostMap([variantId]);
    expect(costs.has(variantId)).toBe(false);
  });

  it('boş kimlik listesinde sorgu ATILMAZ', async () => {
    expect((await stocks.unitCostMap([])).size).toBe(0);
  });
});
