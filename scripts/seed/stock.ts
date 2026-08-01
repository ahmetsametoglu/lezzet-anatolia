import {
  ProductService, ProductVariantService, StockAdjustmentService, StockIntakeService, StockService, TemperatureLogService,
} from '@lezzet/database';
import { euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';
import type { Depolar } from './warehouse';

// ── Stok partileri (06) ──────────────────────────────────────────────────────────────────────────
// Parti çeşitliliği olmadan raf ömrü kuralları hiç görünmez: FEFO ancak farklı tarihli iki partide
// anlaşılır, "yaklaşan son tarih" uyarısı %25 eşiğinin altına inen parti olmadan tetiklenmez,
// "satılamaz" kuralı ise DLC'si geçmiş bir parti olmadan denenemez.
//
// Partilerin ÇOĞU mal kabulden doğar (izlenebilir zincir: sipariş → giriş → parti); bir kısmı
// doğrudan yazılır (eski/özel durumlar).

// Partiler İKİ depoya dağıtılır: tek depolu bir veri setinde depo süzgeci hataları görünmez.
// Çoğu STR'de (ana depo), bir bölümü KEHL'de — "başka depoda var ama burada yok" hâli denenebilsin.
export async function seedStock(
  db: Db,
  varyantlar: VaryantRef[],
  tedarik: Map<string, string>,
  depolar: Depolar,
): Promise<void> {
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
    warehouseId: depolar.str,
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
    warehouseId: depolar.str,
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
  //
  //    DAĞILIM İKİ DEPOYA: hepsi tek depoda olsaydı depo süzgeci hatalarının hiçbiri görünmezdi —
  //    süzgeci unutulan sorgu da doğru cevap verirdi.
  //
  //    Ama **İLK parti daima ana depoda**: siparişler STR'den çıkıyor ve bir varyantın tüm
  //    partileri Kehl'e düşerse o ürün ana depoda hiç bulunmaz — rezervasyon reddedilir, hazırlık
  //    parti bulamaz ve seed'in kendisi tutarsız veri üretir. Ek partiler Kehl'e gider; sonuç yine
  //    gerçek bir işletme hâli: bazı ürünler iki depoda, bazıları yalnız birinde bol.
  let ekParti = 0;
  for (const [i, v] of satilabilir.entries()) {
    const partiSayisi = 1 + (i % 3);
    for (let p = 0; p < partiSayisi; p += 1) {
      await stocks.insert({
        warehouseId: p > 0 && (i + p) % 3 === 0 ? depolar.kehl : depolar.str,
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
  const teklifA = await stocks.insert({ warehouseId: depolar.str, variantId: ozel[0]!.id, physicalQty: 14, expiryDate: gun(4), lotNumber: 'NE-001', purchasePrice: 2.4, location: 'Dolap 1' });
  await stocks.setOfferPrice(teklifA.id, euro(4.9));
  const teklifB = await stocks.insert({ warehouseId: depolar.str, variantId: ozel[1]!.id, physicalQty: 9, expiryDate: gun(7), lotNumber: 'NE-002', purchasePrice: 3.1, location: 'Dolap 2' });
  await stocks.setOfferPrice(teklifB.id, euro(5.5));
  // Yaklaşan ama HENÜZ indirime alınmamış — "sistem önerir, karar insanın" hâli
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[2]!.id, physicalQty: 11, expiryDate: gun(6), lotNumber: 'NE-003', purchasePrice: 2.8, location: 'Dolap 1' });
  // Tarihi GEÇMİŞ partiler: biri DLC (satılamaz — imha edilecek), biri DDM (satılabilir)
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[3]!.id, physicalQty: 5, expiryDate: gun(-2), lotNumber: 'EXP-DLC', purchasePrice: 3.4, location: 'Karantina' });
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[4]!.id, physicalQty: 8, expiryDate: gun(-6), lotNumber: 'EXP-DDM', purchasePrice: 2.2, location: 'Dolap 3' });
  // Tükenmiş parti (fiili 0): satır durur, miktarı biter — "geçmiş parti" görünümü
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[5]!.id, physicalQty: 0, expiryDate: gun(90), lotNumber: 'L-BITTI', purchasePrice: 2.6, location: 'Dolap 2' });
  // Alış fiyatı GİRİLMEMİŞ parti: gerçek COGS bu partide hesaplanamaz (rapor bunu göstermeli)
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[6]!.id, physicalQty: 12, expiryDate: gun(120), lotNumber: 'L-MALIYETSIZ', location: 'Dolap 4' });

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

export async function seedAdjustments(db: Db, kisiler: Kisiler): Promise<void> {
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

export async function seedTemperatureLogs(db: Db, kisiler: Kisiler, depolar: Depolar): Promise<void> {
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
          warehouseId: depolar.str,
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

