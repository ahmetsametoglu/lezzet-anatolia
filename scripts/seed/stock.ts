import {
  PriceService, ProductService, ProductVariantService, StockIntakeService, StockMovementService, StockService,
  TemperatureLogService, type AdjustInput,
} from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';
import { teklifSkulari } from './supplier-prices';
import { gunlukOlcum, type Depolar, type Noktalar } from './warehouse';

// ── Stok partileri (06) ──────────────────────────────────────────────────────────────────────────
// Parti çeşitliliği olmadan raf ömrü kuralları görünmez: FEFO farklı tarihli iki parti, "yaklaşan son tarih" uyarısı eşiğin altına
// inen parti, "satılamaz" kuralı DLC'si geçmiş parti ister. Partilerin çoğu mal kabulden doğar, bir kısmı doğrudan yazılır.

// Partiler iki tesise dağılır (STR ve QLT): tek depolu veride depo süzgecini unutan sorgu doğru cevap verirdi. Parti, seed'in kurduğu
// alanlara rejimine uygun bağlanır: donuk mal dondurucuda, süresi geçmiş mal karantinada.
const DONUK_ALANLAR = ['Derin dondurucu 1', 'Derin dondurucu 2'] as const;

/** Sırayla dağıt — iki dondurucu da dolsun; tek alana yığmak "hangi alanda ne var" sorusunu boşa çıkarırdı. */
const donukAlan = (noktalar: Noktalar, i: number): string => noktalar.strAlan.get(DONUK_ALANLAR[i % DONUK_ALANLAR.length]!)!;

export async function seedStock(
  db: Db,
  varyantlar: VaryantRef[],
  tedarik: Map<string, string>,
  depolar: Depolar,
  noktalar: Noktalar,
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

  // Alış fiyatı listeden türer (`alış = liste_HT × (1 − hedef marj)`, hedef yoksa %30): sabit bir alış fiyatı ürünleri zararına satılıyor
  // gösterirdi ve maliyet okuyan asistan yanlış öneri üretirdi.
  const b2cUygulanabilir = await new PriceService(db).findApplicableMap(
    satilabilir.map((v) => v.id),
    'b2c',
  );
  const listeFiyati = new Map(
    [...b2cUygulanabilir].flatMap(([id, f]) => (f.channelPrice ? [[id, f.channelPrice.amountCents] as const] : [])),
  );

  /**
   * Bir varyantın alış fiyatı (cent); `tur` aynı varyantın partilerini ±%6 oynatır ki FEFO maliyet raporunun gösterecek farkı olsun. Bazı
   * varyantlar bilerek listenin üstünde alınmış sayılır, çünkü kârlılık uyarısı zararına parti olmadan hiç koşmaz.
   */
  function alisFiyati(v: VaryantRef, tur: number): number {
    const liste = listeFiyati.get(v.id);
    if (!liste) return toCents(2.1 + (tur % 9) * 0.3);

    const listeHT = liste / (1 + v.vatRate / 100);
    const marj = (v.targetMarginPercent ?? 30) / 100;
    // Marj altı seçimi varyant kimliğinden: aynı varyantın iki partisi aynı tarafta kalsın.
    const marjAlti = Number.parseInt(v.id.slice(-2), 16) % 13 === 0;
    const hedef = marjAlti ? listeHT * 1.08 : listeHT * (1 - marj);
    const oynama = 1 + ((tur % 5) - 2) * 0.03; // −%6 … +%6
    return Math.max(1, Math.round(hedef * oynama));
  }

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
      // Mal kabulün birim maliyeti de listeden türer — bu satır `stock.purchase_price`e yazılıyor
      // ve sabit kalsaydı aynı "zararına parti" gürültüsünü kabul yolundan üretirdi.
      unitCostCents: alisFiyati(v, i),
      storageAreaId: donukAlan(noktalar, i),
    })),
  });

  // 1b) Tam gelen PO: sipariş `received`'a kapanır ve "tam kapandı" rozeti görünür; miktarlar tedarik kalemleriyle birebirdir, yoksa sipariş
  //     sessizce `partially_received` kalırdı.
  const tamGelenPo = tedarik.get('tamGelenPo');
  if (tamGelenPo) {
    const { data: poKalem, error: poHatasi } = await db
      .from('purchase_order_item')
      .select('variant_id,qty,unit_price')
      .eq('purchase_order_id', tamGelenPo);
    if (poHatasi) throw poHatasi;
    const kalemler = (poKalem ?? []) as Array<{ variant_id: string; qty: number; unit_price: number }>;
    if (kalemler.length > 0) {
      await intakes.receive({
        warehouseId: depolar.str,
        supplierId: yerel,
        purchaseOrderId: tamGelenPo,
        date: gun(-6),
        note: 'Alsace haftalık — sipariş edilen kadar geldi, eksiksiz.',
        lines: kalemler.map((k, i) => ({
          variantId: k.variant_id,
          qty: k.qty, // TAM: sipariş miktarının aynısı
          expiryDate: gun(60 + i * 25),
          lotNumber: `ALS-${String(i + 1).padStart(2, '0')}`,
          // Ham kolon okunuyor (euro `numeric`) — servis sınırından geçmediği için çevrim burada.
          unitCostCents: toCents(Number(k.unit_price)),
          storageAreaId: noktalar.strAlan.get('Soğuk oda')!,
        })),
      });
    }
  }

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
      unitCostCents: alisFiyati(v, i + 2),
      storageAreaId: noktalar.strAlan.get('Soğuk oda')!,
    })),
  });

  // 3) Hacim: aday olmayan her varyant stoklanır, ilk parti daima STR'dedir (siparişler oradan çıkar), ek partinin bir kısmı QUALITE
  //    deposuna düşer. Teklifsiz ürünlerin bir kısmı bilerek tükenmiş doğar (partisi var, miktarı sıfır), çünkü "tükendi" ekranı ancak
  //    geçmişi olan bir tükenişle çizilir; ilk 45 ve teklifli ürünler tükenmez, sipariş ve paket kurguları onlara dayanır.
  const teklif = teklifSkulari();
  const teklifliUrun = new Set(satilabilir.filter((v) => v.sku && teklif.has(v.sku)).map((v) => v.productId));
  const ilk45Urun = new Set(satilabilir.slice(0, 45).map((v) => v.productId));
  const tukenmeAdaylari = [...new Set(satilabilir.map((v) => v.productId))].filter(
    (id) => !teklifliUrun.has(id) && !ilk45Urun.has(id),
  );
  const tukenmisUrun = new Set(tukenmeAdaylari.filter((_, n) => n % 5 === 0));
  // Küme boşalırsa "tükendi" hâli sessizce kaybolur ve hiçbir test bunu eksik saymaz.
  if (tukenmisUrun.size === 0) console.log('  ⚠ TÜKENMİŞ ürün seçilemedi — "tükendi" ekran hâli bu koşuda hiç doğmayacak');
  let ekParti = 0;
  for (const [i, v] of satilabilir.entries()) {
    const bitti = tukenmisUrun.has(v.productId);
    // İkinci parti her üçüncü varyantta (FEFO için); tükenmiş üründe tek parti, iki parti anlatılan hâli bulandırırdı.
    const partiSayisi = bitti ? 1 : i % 3 === 1 ? 2 : 1;
    for (let p = 0; p < partiSayisi; p += 1) {
      // Ek partinin yarısı QUALITE deposuna, yarısı yine STR'ye: QLT olmadan depo süzgeci, STR'deki ikinci parti olmadan FEFO denenmez.
      const qualitede = p > 0 && (i + p) % 2 === 0;
      await stocks.insert({
        warehouseId: qualitede ? depolar.qlt : depolar.str,
        variantId: v.id,
        physicalQty: bitti ? 0 : 6 + ((i + p * 5) % 40),
        expiryDate: gun(20 + ((i * 7 + p * 45) % 300)),
        lotNumber: `L${String(2600 + i)}-${p + 1}`,
        purchasePriceCents: alisFiyati(v, i + p),
        storageAreaId: qualitede ? noktalar.qltAlan : donukAlan(noktalar, i + p),
      });
      ekParti += 1;
    }
  }

  // 4) SINIR DURUMLAR — ekranların uyarı/engel hâlleri bunlarsız hiç görünmez.
  const ozel = satilabilir.slice(0, 8);

  // Fırsat partileri: teklif fiyatı liste fiyatından türer, çünkü sabit tutar ürünü pahalılaştırabilir ve `isOffer` onu haklı olarak eler.
  // Ürün aktif olmalıdır, vitrin pasif ürünü zaten göstermez.
  const firsatliklar = satilabilir.filter((v) => v.status === 'active');
  // Uygulanabilir fiyat sorulur, ham satır değil: ileri tarihli fiyat sayılsaydı teklif bugün geçerli olmayan bir tutardan türerdi.
  const fiyatlar = await new PriceService(db).findApplicableMap(
    firsatliklar.map((v) => v.id),
    'b2c',
  );
  const b2cFiyat = new Map(
    [...fiyatlar].flatMap(([id, f]) => (f.channelPrice ? [[id, f.channelPrice.amountCents] as const] : [])),
  );
  // Bant altı slot (`OFFER_LIMIT`); dördü hem bandı dolduruyor hem "hepsi dolmadı" hâlini koruyor.
  const FIRSAT_ADEDI = 4;
  const firsatlar = firsatliklar.filter((v) => (b2cFiyat.get(v.id) ?? 0) > 0).slice(0, FIRSAT_ADEDI);
  let firsatNo = 0;
  for (const v of firsatlar) {
    const liste = b2cFiyat.get(v.id)!;
    // İndirim %20-%35 arasında dönüyor: tek oran, bütün kartlarda aynı rozeti üretirdi.
    const indirim = 20 + firsatNo * 5;
    const teklif = Math.max(1, Math.round((liste * (100 - indirim)) / 100));
    const parti = await stocks.insert({
      warehouseId: depolar.str,
      variantId: v.id,
      physicalQty: 14 - firsatNo * 2,
      // SKT yaklaşıyor: teklifin SEBEBİ bu. Tarih uzak olsaydı "neden indirimli" sorusunun cevabı olmazdı.
      expiryDate: gun(4 + firsatNo),
      lotNumber: `NE-${String(firsatNo + 1).padStart(3, '0')}`,
      // Alış teklifin altında kalır, yoksa marj raporu gerçekte olmayan bir alarm üretirdi.
      purchasePriceCents: Math.max(1, Math.round(teklif * 0.6)),
      storageAreaId: donukAlan(noktalar, firsatNo),
    });
    await stocks.setOfferPrice(parti.id, teklif);
    firsatNo += 1;
  }
  // Senaryo partilerinin konusu SKT ve miktardır, alışları ortak kuraldan gelir. Yaklaşan ama henüz indirime alınmamış parti: "sistem
  // önerir, karar insanın" hâli.
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[2]!.id, physicalQty: 11, expiryDate: gun(6), lotNumber: 'NE-003', purchasePriceCents: alisFiyati(ozel[2]!, 1), storageAreaId: donukAlan(noktalar, 0) });
  // Tarihi GEÇMİŞ partiler: biri DLC (satılamaz — imha edilecek), biri DDM (satılabilir)
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[3]!.id, physicalQty: 5, expiryDate: gun(-2), lotNumber: 'EXP-DLC', purchasePriceCents: alisFiyati(ozel[3]!, 2), storageAreaId: noktalar.strAlan.get('Karantina')! });
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[4]!.id, physicalQty: 8, expiryDate: gun(-6), lotNumber: 'EXP-DDM', purchasePriceCents: alisFiyati(ozel[4]!, 3), storageAreaId: donukAlan(noktalar, 1) });
  // Tükenmiş parti (fiili 0): satır durur, miktarı biter — "geçmiş parti" görünümü
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[5]!.id, physicalQty: 0, expiryDate: gun(90), lotNumber: 'L-BITTI', purchasePriceCents: alisFiyati(ozel[5]!, 4), storageAreaId: donukAlan(noktalar, 1) });
  // Alış fiyatı GİRİLMEMİŞ parti: gerçek COGS bu partide hesaplanamaz (rapor bunu göstermeli)
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[6]!.id, physicalQty: 12, expiryDate: gun(120), lotNumber: 'L-MALIYETSIZ' });
  // ↑ Rafı da bilerek bilinmiyor: kabulde alan zorunlu değildir ve iki bilinmeyen aynı satırda `null` yollarını tek partiyle sınar.

  // İki ürün DLC'ye çekilir: "geçince satılamaz" kuralı ancak DLC'li bir üründe denenebilir
  // (varsayılan DDM). Katalog bölümü bu alanı vermiyor, karar burada veriliyor.
  await products.update({ id: ozel[3]!.productId, dateType: 'DLC' });
  await products.update({ id: ozel[0]!.productId, dateType: 'DLC' });
  console.log(`  ✓ mal kabul: 2 giriş (biri PO'lu ve EKSİK gelmiş → fark raporu)`);
  console.log(`  ✓ sınır durumlar: 2 indirimli teklif · 1 indirimsiz yaklaşan · DLC geçmiş · DDM geçmiş · tükenmiş · maliyetsiz`);

  // Asgari stok eşiği: bir kısmı bilinçli olarak ALTINDA kalsın ki yeniden-sipariş önerisi dolsun.
  for (const [i, v] of satilabilir.slice(0, 20).entries()) {
    await variants.update({ id: v.id, minStockQty: i % 4 === 0 ? 60 : 8 + (i % 5) * 3 });
  }

  console.log(`✓ stok: ${ekParti + 18} parti · ${satilabilir.length} varyantın tamamı stoklu (aday olan hiç stoklanmaz) · ${tukenmisUrun.size} ürün bilinçli TÜKENMİŞ · 20 varyantta asgari eşik`);
}

// ── Stok düzeltmesi + sıcaklık kaydı (06) ────────────────────────────────────────────────────────
// Kayıp görünmezse yönetilemez: "bu üründen yılda ne kadar çöpe attım" sorusunun tek cevabı
// düzeltme tablosudur. Beş sebebin beşi de örneklenir — biri İKİ YÖNLÜ (sayım fazlası).

export async function seedAdjustments(db: Db, kisiler: Kisiler): Promise<void> {
  // Atlama ölçütü tablo değil sayım farkıdır: mal kabul de aynı deftere yazar ve "defter dolu" ölçütü bu adımı her koşuda atlatırdı;
  // sayım farkını beslemeden başka kimse yazmaz.
  const { count, error: sayimError } = await db
    .from('stock_movement')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'count_diff');
  if (sayimError) throw sayimError;
  if ((count ?? 0) > 0) {
    console.log('▸ stok düzeltmeleri zaten dolu — atlandı');
    return;
  }
  console.log('▸ STOK DÜZELTMESİ seed');
  const movements = new StockMovementService(db);
  const depocu = kisiler.get('depocu') ?? null;

  // Düzeltme partiye yazılır → düzeltilecek partileri lot numarasından buluyoruz (seed'in kendi izi).
  const { data, error } = await db.from('stock').select('id,lot_number,physical_qty').not('lot_number', 'is', null).limit(400);
  if (error) throw error;
  const partiler = (data ?? []) as Array<{ id: string; lot_number: string; physical_qty: number }>;
  const bul = (lot: string) => partiler.find((p) => p.lot_number === lot);
  const dolu = partiler.filter((p) => p.physical_qty > 4);

  // Yön ayrı alandadır ve iki yönden de örnek vardır ki ekranın yön süzgeci boş kümeyle sınanmasın.
  const islemler: Array<AdjustInput & { note: string }> = [];

  const dlcGecmis = bul('EXP-DLC');
  if (dlcGecmis) {
    islemler.push({ stockId: dlcGecmis.id, qty: 3, direction: 'out', kind: 'write_off', reason: 'expired', note: 'DLC geçti — imha edildi (tutanak #12).' });
  }
  if (dolu[0]) islemler.push({ stockId: dolu[0].id, qty: 2, direction: 'out', kind: 'write_off', reason: 'damaged', note: 'Nakliyede kutu ezildi.' });
  if (dolu[1]) islemler.push({ stockId: dolu[1].id, qty: 1, direction: 'out', kind: 'write_off', reason: 'lost', note: 'Sayımda bulunamadı.' });
  // Sayım farkı İKİ YÖNLÜDÜR: eksik de çıkabilir fazla da. Tek yönlü örnek, yön kolonunu gizlerdi.
  if (dolu[2]) islemler.push({ stockId: dolu[2].id, qty: 4, direction: 'out', kind: 'count_diff', note: 'Yıl sonu sayımı — eksik.' });
  if (dolu[3]) islemler.push({ stockId: dolu[3].id, qty: 3, direction: 'in', kind: 'count_diff', note: 'Yıl sonu sayımı — fazla çıktı.' });
  // İade restoku istisnadır: sebep notu ZORUNLU (soğuk zincir belgelenemezse imha varsayılandır).
  if (dolu[4]) {
    islemler.push({ stockId: dolu[4].id, qty: 2, direction: 'in', kind: 'return_restock', note: 'Kapıda reddedildi, frigo araçtan hiç çıkmadı — admin onayıyla restok.' });
  }

  for (const i of islemler) await movements.adjust({ ...i, createdBy: depocu });
  console.log(`✓ stok düzeltmesi: ${islemler.length} kayıt (imha · hasar · kayıp · sayım ±  · iade restoku)`);
}

/**
 * Ölçüm noktalarının sıcaklık profili; noktalar `seed/warehouse.ts`te doğar, çünkü partiler de onlara bağlanır. Dalga hedef aralığın içinde
 * kalır ve dışarı yalnız `KAZA` çıkar: her gün sapma olsaydı sapma işaret olmaktan çıkardı.
 */
const SICAKLIK_PROFILI: Record<string, { taban: number; sapma: number }> = {
  'Derin dondurucu 1': { taban: -19, sapma: 0.6 }, // hedef −20…−18 → dalga [−19,6 · −18,4]
  'Derin dondurucu 2': { taban: -19, sapma: 0.7 }, // hedef −20…−18 → dalga [−19,7 · −18,3]
  'Soğuk oda': { taban: 2.2, sapma: 1.0 }, //         hedef 0…4     → dalga [1,2 · 3,2]
  'Mal kabul': { taban: 8.5, sapma: 2.2 }, //         hedefsiz → ölçüt alışkanlık (tolerans 4°)
};

/** Frigo aracın profili — soğuk zincirin YOLDAKİ yeri; ölçümü aynı defterde, ayrı tabloda. */
const ARAC_PROFILI = { taban: -17.2, sapma: 2.4 };

export async function seedTemperatureLogs(db: Db, kisiler: Kisiler, depolar: Depolar, noktalar: Noktalar): Promise<void> {
  if (await tabloDolu(db, 'temperature_log')) {
    console.log('▸ sıcaklık kayıtları zaten dolu — atlandı');
    return;
  }
  console.log('▸ SICAKLIK KAYDI seed');
  const logs = new TemperatureLogService(db);
  const depocu = kisiler.get('depocu') ?? null;
  let sayi = 0;

  // `Kuru depo rafı` bilerek atlanır: "tanımlı ama tura girmemiş nokta" uyarısı ancak hiç ölçülmemiş satırla sınanır.
  const olculecek = [...noktalar.strAlan].filter(([ad]) => ad in SICAKLIK_PROFILI);

  /**
   * Seri 75 gün, takvimin 92 günlük penceresinin içinde: eksik gün, yarım tur ve zamana yayılmış sapma ancak uzun seride görünür, pencerenin
   * başındaki boş şerit "veri buraya kadar" sınırını gösterir. Üç hâl rastgele değil belirlenimci kurallarla üretilir.
   */
  const SERI_GUN = 75;
  /** Turun hiç yapılmadığı gün → `missing`. Sabit `5` ofseti BUGÜNÜ boşa düşürmemek için. */
  const ATLANAN = (g: number, n: number) => (g + n) % 23 === 5;
  /** Yalnız sabah bakılmış gün → `short` (yalnız günde 2 bekleyen noktada görünür). */
  const YARIM = (g: number, n: number) => (g + n) % 11 === 0;
  /** Bilinçli SAPMA: kapı açık kalmış / araç güneşte beklemiş. Seyrek — her gün sapma, sapma değildir. */
  const KAZA = (g: number, n: number) => (g * 4 + n) % 37 === 0;

  for (let g = SERI_GUN - 1; g >= 0; g -= 1) {
    // Araç da noktaların arasında: aynı seride, ayrı tabloda — ekran ikisini tek liste okuyor.
    const gununNoktalari = [
      ...olculecek.map(([ad, id]) => ({ ...SICAKLIK_PROFILI[ad]!, gunluk: gunlukOlcum(ad), ref: { storageAreaId: id } })),
      // Frigo aracın beklentisi 1 (`seed/warehouse.ts`) — araç varsayılanı 0 ama bu araç soğuk taşıyor.
      { ...ARAC_PROFILI, gunluk: 1, ref: { vehicleId: noktalar.arac } },
    ];
    for (const [n, nokta] of gununNoktalari.entries()) {
      if (ATLANAN(g, n)) continue;
      // Beklenenden AZ yazmak `short` hâlini doğuruyor; günde 1 bekleyen noktada zaten oluşamaz
      // (1 ölçüm hem yarım hem tam olamaz) ve bu doğru — o nokta yalnız tam ya da eksik olabilir.
      const saatler = !YARIM(g, n) && nokta.gunluk >= 2 ? [7, 18] : [7];
      for (const saat of saatler) {
        const dalga = Math.sin((g * 2 + n + saat) / 3) * nokta.sapma;
        const kaza = KAZA(g, n) ? 5.5 : 0;
        const zaman = new Date(Date.now() - g * 86_400_000);
        zaman.setHours(saat, 0, 0, 0);
        await logs.insert({
          warehouseId: depolar.str,
          ...nokta.ref,
          temperatureC: euro(nokta.taban + dalga + kaza),
          recordedBy: depocu,
          recordedAt: zaman.toISOString(),
        });
        sayi += 1;
      }
    }
  }

  // İkinci tesisin ölçümleri: ekran depo süzgeciyle okur ve yalnız bir depoda ölçüm olsaydı süzgeci unutan sorgu ile "ölçüm yok" ayırt
  // edilemezdi. Seri daha kısa ve tek noktalıdır, iki takvimin "veri buraya kadar" sınırı farklı yerdedir.
  const qltProfil = SICAKLIK_PROFILI['Derin dondurucu 1']!;
  for (let g = 29; g >= 0; g -= 1) {
    // Tur atlanan günler: tek noktalı takvimde eksik gün daha görünür.
    if (g % 9 === 4) continue;
    const zaman = new Date(Date.now() - g * 86_400_000);
    zaman.setHours(8, 0, 0, 0);
    await logs.insert({
      warehouseId: depolar.qlt,
      storageAreaId: noktalar.qltAlan,
      // İki gün aralık dışı: uyarı ikinci tesiste de tetiklenebilmeli.
      temperatureC: euro(qltProfil.taban + Math.sin(g / 2) * qltProfil.sapma + (g === 1 || g === 17 ? 6.2 : 0)),
      recordedBy: depocu,
      recordedAt: zaman.toISOString(),
    });
    sayi += 1;
  }
  console.log(`✓ sıcaklık: ${sayi} ölçüm · ${SERI_GUN} günlük seri · ${olculecek.length} alan + 1 araç · biri hiç ölçülmedi · İKİ depo`);
}

