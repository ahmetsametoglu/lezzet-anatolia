import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, StockAdjustmentService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { readVariantStockHistory } from './variant-history';

/**
 * **SAYIM FARKI İKİ SORUYA AYRI CEVAP VERİR** (22.34 · ölçüldü 26.08).
 *
 * Rapor ayrımı fiziksel hareketi silmez ve bu iki cümle aynı sayıya bağlanamaz:
 *
 * 1. **Fire oranı** — *"ne kadarını çöpe attım"*. Sayım farkı buraya GİRMEZ: iki yönlü olduğu için
 *    oranı eksiye düşürüyordu (`FİRE · %−2,1` — hesap doğru, başlık altında okunmuyordu).
 * 2. **Akış denklemi** — *"giren − teslim − düşülen = elde"*. Sayım farkı buraya GİRER: rafta fazla
 *    çıkan mal stoğu gerçekten artırır.
 *
 * İkisini tek sayıya bağlamak denklemi sayım farkı kadar saptırdı ve ekran bunu *"kayda geçmemiş
 * bir hareket var"* diye okudu (ekran görüntüsüyle yakalandı: `73 − 10 − 0 = 59`, fark tam olarak
 * `+4`lük sayım farkıydı). Test o ayrımı çiviliyor — ikisi bir gün yeniden aynı sayıya bağlanırsa
 * burada kırılır.
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
let variantId: string;
let warehouseId: string;
let stockId: string;

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Geçmiş kapısı ${stamp}` } });
  categoryId = category.id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sayım Böreği ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  // Tek parti: 100 girdi. Düzeltmeler bunun üstüne yazılacak.
  stockId = (await new StockService(db).insert({ warehouseId, variantId, physicalQty: 100, expiryDate: gun(60) })).id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

async function oku() {
  return readVariantStockHistory(db, { variantId, warehouseIds: [warehouseId], availableQty: 0, now: new Date() });
}

describe('varyant stok geçmişi — fire ↔ denklem ayrımı', () => {
  it('SAYIM FARKI fire toplamına girmez ama DENKLEME girer', async () => {
    const adjustments = new StockAdjustmentService(db);
    // 6 imha (gerçek kayıp) + sayımda 4 FAZLA çıktı (negatif düzeltme = stoğa geri ekleme).
    await adjustments.adjust({ stockId, qty: 6, reason: 'expired' });
    // Negatif düzeltme (stoğa geri ekleme) SEBEP NOTU ister — kural veride
    // (`adjust_stock`: *"stoğa geri ekleme sebep notu ister"*) ve haklı: stoğu artıran bir düzeltme
    // gerekçesiz kalırsa sayım farkı, kayıt boşluğunu örtmenin sessiz yolu olurdu.
    await adjustments.adjust({ stockId, qty: -4, reason: 'count_diff', note: 'Rafta 4 adet fazla sayıldı' });

    const history = await oku();

    // Fire YALNIZ imhayı sayar — 6. Sayım farkı katılsaydı 2 çıkardı ve "fire azaldı" diye okunurdu.
    expect(history.loss.qty).toBe(6);
    // Sayım farkı kendi alanında, İŞARETİYLE: eksi düzeltme "fazla çıktı" demek.
    expect(history.loss.countDiff).toBe(-4);
    // Denklem ikisini birden sayar: 6 − 4 = 2 net düşüm.
    expect(history.flow.lostQty).toBe(2);
  });

  it('fire ORANI da sayım farkından etkilenmez — payda giren, pay yalnız gerçek kayıp', async () => {
    const history = await oku();

    // 6 / 100 = %6. Sayım farkı paya girseydi %2 çıkardı.
    expect(history.loss.percent).toBe(6);
  });

  it('kırılım HEPSİNİ taşır — sayım farkı da bir olaydır ve görünmelidir', async () => {
    const history = await oku();
    const sebepler = new Map(history.loss.byReason.map((r) => [r.reason, r.qty]));

    expect(sebepler.get('expired')).toBe(6);
    expect(sebepler.get('count_diff')).toBe(-4);
  });
});
