import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, StockService, WarehouseTransferService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { listVanCandidates, readVanStock, returnFromVan, setVanQty, takeToVan } from './van-stock';

/**
 * **ARACA SERBEST ÜRÜN** (v3:19 · kullanıcı kararı 31.08).
 *
 * Sınanan üç şey, üçü de bu kapının KENDİ kararları:
 *   1. **Mal gerçekten taşınıyor** — depodan düşüyor, araca yazılıyor. Sipariş kutusundan farkı
 *      tam burada: kutu bir emanet değişimidir (stok oynamaz), serbest ürün stok hareketidir.
 *   2. **Ölçü FİİLİ değil KULLANILABİLİR** — müşteriye söz verilmiş mal araca alınmaz. Fiiliye
 *      bakılsaydı rezerve mal gider, sipariş depoda karşılıksız kalırdı.
 *   3. **Devir aynı kapının aynası** — geri koyma ayrı bir yol değil, kaynak ile hedefin yer
 *      değiştirmesi. Ayrı yazılsaydı biri bir gün ötekinden ayrılırdı.
 */
const db = serviceDb();
const stocks = new StockService(db);

const stamp = Date.now();
let variantId: string;
let productId: string;
let categoryId: string;
let facilityId: string;
let vanId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const [facility, van] = await Promise.all([
    createTestWarehouse(db, { label: 'VS' }),
    /* ARAÇ BİR DEPODUR (`kind='vehicle'`) — kapının aradığı da tam bu tür. Tesis olarak
       kurulsaydı `vehicleWarehouseOf` onu bulmaz ve testin zemini sessizce yanlış olurdu. */
    createTestWarehouse(db, { label: 'VAN', kind: 'vehicle' }),
  ]);
  facilityId = facility.id;
  vanId = van.id;

  const category = await new CategoryService(db).create({ name: { tr: `Serbest ürün ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Şöbiyet ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

beforeEach(async () => {
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'warehouse_transfer', (q) => q.eq('from_warehouse_id', facilityId));
  await mustDelete(db, 'warehouse_transfer', (q) => q.eq('from_warehouse_id', vanId));
  await stocks.insert({
    warehouseId: facilityId,
    variantId,
    physicalQty: 10,
    expiryDate: dayOffset(30),
    purchasePriceCents: 200,
  });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [facilityId, vanId] });
});

/*
  ARAÇ DEPOSUNUN ÇÖZÜMÜ BU DOSYADAN TAŞINDI (21.249 · 04.09) → `vehicle-binding.test.ts`.

  Buradaki tek test *"kapsamdaki tesisleri atla, aracı bul"* kuralını sınıyordu ve o kural
  DOĞRUYDU — ama tek başına eksikti: "kapsamda İKİ araç varsa hangisi" sorusunun cevabı hiçbir
  yerde verilmemişti, dizinin sırasından düşüyordu. Fikstür de tek araç kurduğu için soru hiç
  doğmuyordu. Çözüm artık kapsamı değil SEFERİN ARACINI okuyor; testi de iki araçlı kurulumu
  kuran yeni dosyada, çünkü asıl kanıt orada.
*/

describe('araca al / depoya devret', () => {
  it('MAL GERÇEKTEN TAŞINIR: depodan düşer, araca yazılır', async () => {
    const sonuc = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 3 });

    expect(sonuc).toMatchObject({ status: 'ok', movedQty: 3, vanQty: 3 });
    /* İDDİANIN KALBİ: kapı "oldu" demiyor, iki deponun stoğu değişti. Sipariş kutusunda bu
       olmuyordu (emanet değişimi) — serbest üründe olmak ZORUNDA, çünkü kapıda o stoktan
       satılacak. */
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([
      expect.objectContaining({ variantId, qty: 3 }),
    ]);
    const depoda = await stocks.getAvailable(facilityId, variantId);
    expect(depoda.physicalQty).toBe(7);
  });

  it('OLMAYAN mal araca alınmaz ve ret HİÇBİR iz bırakmaz', async () => {
    /*
      ÖLÇÜ `available_stock` GÖRÜNÜMÜNDEN geliyor, partiden değil — yani rezerveler zaten düşülmüş
      hâlde. Burada sınanan o görünümün kendisi değil (onun sözleşmesi kendi testinde), KAPININ
      cevabı: yetmeyen mal reddediliyor, sayı dönüyor ve yarım bir taşıma yazılmıyor.

      Rezerve dalı ayrıca `dispatch_transfer`ın kendi duvarında da duruyor (0031: *"kontrol sevkten
      ÖNCE ve fiili üzerinden değil kullanılabilir üzerinden"*) — yani buradaki kapı tek savunma
      değil, sebebi SÖYLEYEN savunma.
    */
    const sonuc = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 15 });

    expect(sonuc).toEqual({ status: 'not_enough', available: 10 });
    // Ret hiçbir iz bırakmamalı: yarım yazılmış bir taşıma, malı iki depoda birden yok ederdi.
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([]);
  });

  it('DEVİR aynı kapının aynası: araçtan depoya geri döner', async () => {
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 4 });

    const sonuc = await returnFromVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 3 });

    expect(sonuc).toMatchObject({ status: 'ok', movedQty: 3 });
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([
      expect.objectContaining({ variantId, qty: 1 }),
    ]);
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(9);
  });

  it('DEVRİN BELGESİ KENDİ YÖNÜNÜ YAZAR — "araca" değil "araçtan depoya"', async () => {
    /* Depo şeridinin ölçümü (04.09, Oppo · D6 uçtan uca): araçtan inen malın iki transferi de
       `note: "Araca serbest ürün"` yazıyordu, çünkü `returnFromVan` depoları takas edip aynı kapıyı
       çağırıyor ve not kapının gövdesinde SABİTTİ. Kayıt doğru, cümle tersti — geçmişe bakan
       (D5'in kapananlar bölümü) araçtan inen malı "araca konmuş" diye okuyordu. */
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 2 });
    await returnFromVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 2 });

    /* Süzgeç fikstürün KENDİ iki deposu (CLAUDE §4b: kendi kurduğun satırları say) — başka bir
       ajanın transferi bu listeye giremez. */
    const kapananlar = await new WarehouseTransferService(db).listClosedFor([facilityId, vanId]);
    const alis = kapananlar.find((t) => t.fromWarehouseId === facilityId && t.toWarehouseId === vanId);
    const devir = kapananlar.find((t) => t.fromWarehouseId === vanId && t.toWarehouseId === facilityId);

    expect(alis?.note).toBe('Araca serbest ürün');
    expect(devir?.note).toBe('Araçtan depoya devir');
  });

  it('DEVİR ARACIN adedini söyler — tesisinkini DEĞİL', async () => {
    /* AYNANIN TUZAĞI (21.263, ölçüldü 05.09): `returnFromVan` depoları takas edip `takeToVan`ı
       çağırıyor, o da `input.vehicleWarehouseId`i ölçüyor — takas edilmiş hâlde bu TESİS. Yani
       dönen `vanQty` çıkış deposunun adedini taşıyordu. Fikstür bunu ancak İKİ SAYI AYRIŞIRSA
       yakalar: burada araçta 1, tesiste 9 — eşit olsalardı test yanlış kodda da geçerdi. */
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 4 });

    const sonuc = await returnFromVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 3 });

    expect(sonuc).toMatchObject({ status: 'ok', movedQty: 3, vanQty: 1 });
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(9);
  });

  it('AYNI ANAHTARLA iki çağrı malı BİR KEZ taşır — cevabı kaybolan isteğin tekrarı', async () => {
    /* ÖLÇÜLEN ARIZA (04.09, Oppo): rampada cevabı kaybolan istek tekrarlanınca mal araca İKİNCİ
       kez biniyordu ve ekran eski sayıyı gösterdiği için kimse görmüyordu. Kararı artık veritabanı
       veriyor (`warehouse_transfer_idempotency_key`), kapı da kabul adımını hiç çalıştırmıyor —
       çalıştırsaydı mal ikinci kez kaynaktan inerdi. */
    const key = `van-${stamp}-tekrar`;
    const ilk = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 2, idempotencyKey: key });
    const ikinci = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 2, idempotencyKey: key });

    expect(ilk).toMatchObject({ status: 'ok', movedQty: 2, vanQty: 2 });
    /* İkinci çağrı TAŞIMADI (`movedQty: 0`) ama yalan da söylemiyor: araçtaki GERÇEK sayıyı
       veriyor. "2 alındı" deseydi yazılmamış bir hareketi yazılmış gösterirdi. */
    expect(ikinci).toMatchObject({ status: 'ok', movedQty: 0, vanQty: 2 });
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(8);
  });

  it('ANAHTARSIZ iki çağrı meşrudur ve İKİSİ DE yazılır — tekrarın tanımı anahtardır', async () => {
    // Karşı-örnek olmadan üstteki test "iki çağrı hep bir kez yazar" gibi de okunabilirdi.
    // Rampada aynı üründen art arda bir adet almak gerçek bir iştir; koruma anahtarla istenir.
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 1 });
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 1 });

    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(8);
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([
      expect.objectContaining({ variantId, qty: 2 }),
    ]);
  });

  it('HEDEF yazılır, yönü SUNUCU bulur — artırma da azaltma da tek kapıdan', async () => {
    const yukari = await setVanQty(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, targetQty: 4, observedQty: 0 });
    expect(yukari).toMatchObject({ status: 'ok', delta: 4, vanQty: 4 });

    const asagi = await setVanQty(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, targetQty: 1, observedQty: 4 });
    /* İŞARET yönü söylüyor: istemci hiçbir yerde "al" ya da "geri koy" demedi. */
    expect(asagi).toMatchObject({ status: 'ok', delta: -3, vanQty: 1 });
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(9);
  });

  it('YAKINSAMA: gerçek zaten hedefteyse hiçbir şey yazılmaz ve bu bir BAŞARIDIR', async () => {
    /* ARIZANIN ÇEKİRDEĞİ. Cevabı kaybolan bir istek yazmıştır ama ekran göremez; kurye aynı sayıyı
       yeniden yazar. Fark gönderilseydi mal ikinci kez binerdi. Mutlak hedefte ikinci istek
       zararsızdır — ve `stale` DEĞİL `ok` döner: o istek bir çatışma değil, bir başarıdır.
       Sırayı (yakınsama önce, taban sonra) çiviliyen test bu: taban 0 gönderiliyor, yani BAYAT. */
    await setVanQty(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, targetQty: 2, observedQty: 0 });

    const tekrar = await setVanQty(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, targetQty: 2, observedQty: 0 });

    expect(tekrar).toMatchObject({ status: 'ok', delta: 0, vanQty: 2 });
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(8);
  });

  it('TABAN TUTMAZSA hiçbir şey yazılmaz — cevap gerçeği taşır', async () => {
    /* Araçtaki sayı arada değişmiş olabilir (kapıda satış, D6 kabulü, başka bir yazım). Kurye
       bayat bir sayıya bakarak hedef yazıyorsa hedefi de yanlış hesaplamış demektir; kapı yazmayı
       reddediyor ve GERÇEĞİ söylüyor ki ekran satırı yerinde düzeltebilsin. */
    await setVanQty(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, targetQty: 3, observedQty: 0 });

    const bayat = await setVanQty(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, targetQty: 6, observedQty: 5 });

    expect(bayat).toEqual({ status: 'stale', variantId, vanQty: 3 });
    // "Hiçbir şey yazılmadı" bir GARANTİ: depo da araç da kıpırdamamalı.
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(7);
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([expect.objectContaining({ variantId, qty: 3 })]);
  });

  it('ARAÇ YOKSA hiçbir şey yazılmaz — gidecek bir yer yok', async () => {
    const sonuc = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: null, variantId, qty: 1 });

    expect(sonuc).toEqual({ status: 'no_vehicle' });
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(10);
  });
});

describe('alınabilecekler listesi', () => {
  it('KULLANILABİLİR adediyle döner ve ad taşır — kurye kimliği okumaz', async () => {
    const liste = await listVanCandidates(db, { warehouseId: facilityId });

    const satir = liste.find((row) => row.variantId === variantId);
    expect(satir).toMatchObject({ available: 10 });
    /* Ad ZORUNLU: uuid'den ne alacağını çıkaramayan bir kurye için liste işe yaramaz (künyenin
       "kimlik kimseye bir şey söylemez" kuralı). */
    expect(satir?.name).toContain('Şöbiyet');
  });

  it('araca alınan mal DEPODAKİ sayıdan düşer — iki liste aynı gerçeği anlatır', async () => {
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 4 });

    const liste = await listVanCandidates(db, { warehouseId: facilityId });

    expect(liste.find((row) => row.variantId === variantId)).toMatchObject({ available: 6 });
  });

  it('AD ve BOY AYRI döner — ekran ikisini farklı ağırlıkta yazıyor (v3:19)', async () => {
    const satir = (await listVanCandidates(db, { warehouseId: facilityId })).find(
      (row) => row.variantId === variantId,
    );

    /* Birleşik dize gönderiliyordu ("Şöbiyet (500 g)") ve kart adı kalın, boyu ince yazamıyordu.
       Ayrım depo okumasında ZATEN vardı (`variantNames`); kurye ucu onu tek yerde birleştirip
       bilgiyi kaybediyordu. */
    expect(satir?.name).toBe(`Şöbiyet ${stamp}`);
    expect(satir?.variantLabel).toBe('500 g');
  });

  it('şerit kartı ARAÇTA kaç tane olduğunu da söyler — aynı üründen ikinci kez alma tuzağı', async () => {
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 3 });

    const satir = (await listVanCandidates(db, { warehouseId: facilityId, vehicleWarehouseId: vanId })).find(
      (row) => row.variantId === variantId,
    );

    /* Sayı olmadan kart araçta olan üründe de "dokun, araca al" diyordu ve kurye aynı üründen
       ikinci kez alıp almadığını hiçbir yerde göremiyordu (tur 31.08). */
    expect(satir).toMatchObject({ onVan: 3, available: 7 });
  });

  it('ARAMA aynı listeyi süzer — şeridin tavanı dışında kalan mal ancak böyle bulunur', async () => {
    const bulunan = await listVanCandidates(db, { warehouseId: facilityId, query: 'şöbiy' });
    const bulunmayan = await listVanCandidates(db, { warehouseId: facilityId, query: 'zzzyok' });

    expect(bulunan.some((row) => row.variantId === variantId)).toBe(true);
    expect(bulunmayan.some((row) => row.variantId === variantId)).toBe(false);
  });

  it('ARAMA AKSANI YUTAR — telefonda "sobiyet" yazan da bulur', async () => {
    /* Cihazda ölçüldü (31.08): "pogaca" yazınca "Patatesli Poğaça" bulunmuyordu. Rampada
       ğ/ç/ş/ı için klavye değiştirmek fazladan basış demek ve kimse onu yapmıyor. Katlama iki
       yönlü çalışır: aksanlı yazan da bulur (üstteki test), aksansız yazan da. */
    const aksansiz = await listVanCandidates(db, { warehouseId: facilityId, query: 'sobiyet' });

    expect(aksansiz.some((row) => row.variantId === variantId)).toBe(true);
  });

  it('ARAÇTAKİ SATIR depoda kalanı taşır — "alındıktan sonra N kalır" cümlesinin kaynağı', async () => {
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 2 });

    const [satir] = await readVanStock(db, { vehicleWarehouseId: vanId, sourceWarehouseId: facilityId });

    expect(satir).toMatchObject({ qty: 2, available: 8, variantLabel: '500 g' });
  });

  it('ÇIKIŞ DEPOSU verilmezse kalan SORULMAZ — sıfır yazmak "hiç kalmadı" demek olurdu', async () => {
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 2 });

    const [satir] = await readVanStock(db, { vehicleWarehouseId: vanId });

    /* Ölçülemeyen değer sıfır DEĞİLDİR (CLAUDE §1). Bu yolda ekran cümleyi hiç kurmuyor; sayının
       kendisi 0 olarak geliyor ama okuyan taraf onu bir ölçüm gibi göstermiyor. */
    expect(satir?.available).toBe(0);
  });
});
