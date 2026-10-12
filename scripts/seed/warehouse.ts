import { StorageAreaService, VehicleService, WarehouseService, WarehouseTransferService, ShippingBoxService,
} from '@lezzet/database';
import { tabloDolu, type Db } from './shared';

// ── Depo ağı ─────────────────────────────────────────────────────────────────────────────────────
// Strasbourg'da iki tesis: Lezzet'in tesisi (STR) Fransa'ya ve Almanya'ya kargo yapar ve dört rotanın deposudur, QUALITE'nin tesisi (QLT)
// yalnız kendi rotasına dağıtır ve kargo yapmaz. İki tesis ve iki araç depo süzgecini unutan sorguyu görünür kılar, tek depolu veride o
// sorgu doğru cevap verirdi.

export interface Depolar {
  /** Strasbourg, Lezzet: kargo deposu (Fransa ve Almanya), dört rotanın deposu ve gel-al noktası. */
  str: string;
  /** Strasbourg, QUALITE: toptan müşterinin rotası ve stoğu; kargo yapmaz, kural veritabanındadır. */
  qlt: string;
  /** VAN-1, Lezzet'in kurye aracı (`kind='vehicle'`); yerinde satışın depo çözümü araçtandır (`?place=van`). İçi boş başlar. */
  van: string;
  /** VAN-Q, QUALITE'nin aracı; işi evindeki tesisten gelir. */
  qltVan: string;
}

/** Almanya'ya giden kolinin taşıyıcıya verildiği nokta; geliştirme verisinin uydurma adresi. */
const KEHL_TESLIM_NOKTASI = { line1: 'Hauptstraße 8', postalCode: '77694', city: 'Kehl' };

/** Araç kayıtları; depo ve ölçüm noktası adımları aynı aracı ister, plaka tek yerde durur. */
const ARACLAR = {
  // Frigo kamyonet günde bir ölçüm bekler: araç varsayılanı 0 ama bu araç soğuk taşır ve soğutucu bayrağı veride yok.
  lezzet: { plate: '67 LZT 01', label: 'Frigo kamyonet', expectedDailyChecks: 1, sortOrder: 1 },
  qualite: { plate: '67 QLT 02', label: 'QUALITE kamyoneti', expectedDailyChecks: 0, sortOrder: 2 },
} as const;

/** Aracı bul ya da aç — iki seed adımının ortak kapısı; ikinci çağrı mevcut satırı döndürür. */
async function aracKaydi(db: Db, arac: (typeof ARACLAR)[keyof typeof ARACLAR], homeWarehouseId: string): Promise<string> {
  const vehicles = new VehicleService(db);
  const mevcut = (await vehicles.list()).find((v) => v.plate === arac.plate);
  if (mevcut) return mevcut.id;
  return (await vehicles.insert({ ...arac, warehouseId: homeWarehouseId })).id;
}

export async function seedWarehouses(db: Db): Promise<Depolar> {
  const warehouses = new WarehouseService(db);
  const mevcut = await warehouses.list();
  const koduyla = new Map(mevcut.map((w) => [w.code, w.id]));
  // Seed'in yönettiği kodlar tek yerde; yabancı depo silinmez, çünkü depo silmek kararın işidir.
  const SEED_DEPOLARI = new Set(['STR', 'QLT', 'VAN-1', 'VAN-Q']);
  const yabanci = mevcut.filter((w) => !SEED_DEPOLARI.has(w.code));
  if (yabanci.length > 0) {
    // Yabancı satır sessiz geçilmez: operasyon ekranında görünen her depo veriyi etkiler.
    console.log(`▸ DEPO — tabloda ${yabanci.length} yabancı depo var (${yabanci.map((w) => w.code).join(', ')}); seed yalnız ${[...SEED_DEPOLARI].join('/')} kodlarını yönetir`);
  }

  let strId = koduyla.get('STR');
  let qltId = koduyla.get('QLT');
  let vanId = koduyla.get('VAN-1');
  let qltVanId = koduyla.get('VAN-Q');
  if (strId && qltId && vanId && qltVanId) {
    console.log('▸ depolar zaten kurulu (STR + QLT + VAN-1 + VAN-Q) — atlandı');
    return { str: strId, qlt: qltId, van: vanId, qltVan: qltVanId };
  }
  console.log('▸ DEPO seed');

  if (!strId) {
    const str = await warehouses.insert({
      code: 'STR',
      name: 'Strasbourg — Lezzet deposu',
      countryCode: 'FR',
      address: { line1: '12 rue du Marché', postalCode: '67000', city: 'Strasbourg', country: 'FR' },
      // Rotanın çıpası; sabit yazılır, çünkü besleme çevrimdışı ve belirlenimci olmalı.
      lat: 48.5839,
      lng: 7.7455,
      // Gel-al noktası: izinli müşteri hazır siparişini buradan alır.
      pickupEnabled: true,
      sortOrder: 1,
    });
    strId = str.id;
    // Almanya paketi Strasbourg'da hazırlanır ve Kehl'de taşıyıcıya verilir; tarife oradan sorulur.
    await warehouses.setShipCountries(strId, [
      { country: 'FR', handover: null },
      { country: 'DE', handover: KEHL_TESLIM_NOKTASI },
    ]);
    console.log(`  ✓ ${str.code} · ${str.name} · kargo deposu (FR · DE, teslim noktası Kehl)`);
  }

  if (!qltId) {
    const qlt = await warehouses.insert({
      code: 'QLT',
      name: 'Strasbourg — QUALITE deposu',
      business: 'qualite',
      countryCode: 'FR',
      address: { line1: '5 rue du Havre', postalCode: '67100', city: 'Strasbourg', country: 'FR' },
      lat: 48.5717,
      lng: 7.7964,
      sortOrder: 2,
    });
    qltId = qlt.id;
    console.log(`  ✓ ${qlt.code} · ${qlt.name} · QUALITE, rotası var, kargo YOK`);
  }

  // Araç deposu aracını söyler (`warehouse_vehicle_identity`); malın hangi araçtan çıkacağı bu bağdan okunur, işi evinden gelir.
  if (!vanId) {
    const arac = await warehouses.insert({
      code: 'VAN-1',
      name: 'Kurye aracı 1',
      kind: 'vehicle',
      countryCode: 'FR',
      // Adres yok: araç bir yerdir ama sabit adresi yoktur ve uydurma adres onu tesis gibi okuturdu.
      address: null,
      homeWarehouseId: strId,
      vehicleId: await aracKaydi(db, ARACLAR.lezzet, strId),
      sortOrder: 3,
    });
    vanId = arac.id;
    console.log(`  ✓ ${arac.code} · ${arac.name} · ARAÇ (evi STR)`);
  }
  if (!qltVanId) {
    const arac = await warehouses.insert({
      code: 'VAN-Q',
      name: 'QUALITE aracı',
      kind: 'vehicle',
      countryCode: 'FR',
      address: null,
      homeWarehouseId: qltId,
      vehicleId: await aracKaydi(db, ARACLAR.qualite, qltId),
      sortOrder: 4,
    });
    qltVanId = arac.id;
    console.log(`  ✓ ${arac.code} · ${arac.name} · ARAÇ (evi QLT)`);
  }

  console.log('✓ depo: STR (Lezzet · kargo FR+DE · dört rota) + QLT (QUALITE · rota, kargosuz) + VAN-1 + VAN-Q');
  return { str: strId, qlt: qltId, van: vanId, qltVan: qltVanId };
}

/**
 * Transferin hâlleri: yolda (kabul bekleyen), gecikmiş, ters yönde gelen, tam ve eksik kabul, geri alınmış. Yoldaki mal hiçbir depoda
 * satılamaz ve "yolda ne var" sorusunun tek cevabı kaydın kendisidir; bu yüzden yarım bırakılan kayıt bilinçlidir.
 */
export async function seedTransfer(db: Db, depolar: Depolar): Promise<void> {
  // Muhafız "hedefi tesis olan transfer var mı"dır, "tablo dolu mu" değil: araç yüklemesi de bu tabloya yazar ve tabloyu doldurup
  // bu bloğu sessizce atlatırdı.
  const tesisler = [depolar.str, depolar.qlt];
  const { count: tesisTransferi, error: muhafizHatasi } = await db
    .from('warehouse_transfer')
    .select('*', { count: 'exact', head: true })
    .in('to_warehouse_id', tesisler);
  if (muhafizHatasi) throw muhafizHatasi;
  if ((tesisTransferi ?? 0) > 0) {
    console.log('▸ tesis transferi zaten var — atlandı');
    return;
  }
  console.log('▸ TRANSFER seed');

  // Teklife çıpalanmamış, rezervasyonsuz ve bol adetli partiler: sevk kullanılabilir stoğa bakar ve reddedilen parti seed'i düşürürdü.
  const { data: rezerveli, error: rezerveHatasi } = await db
    .from('reservation')
    .select('variant_id')
    .eq('warehouse_id', depolar.str);
  if (rezerveHatasi) throw rezerveHatasi;
  const mesgulVaryantlar = new Set((rezerveli ?? []).map((r) => (r as { variant_id: string }).variant_id));

  const { data, error } = await db
    .from('stock')
    .select('id,variant_id,physical_qty')
    .eq('warehouse_id', depolar.str)
    .is('offer_price', null)
    .gt('physical_qty', 8)
    .order('physical_qty', { ascending: false })
    .limit(40);
  // Hata yutulmaz: boş listeye düşmek "uygun parti yok" gibi görünür ve seed eksik veriyi sessizce bırakırdı.
  if (error) throw error;

  const partiler = ((data ?? []) as Array<{ id: string; variant_id: string; physical_qty: number }>)
    .filter((p) => !mesgulVaryantlar.has(p.variant_id))
    .slice(0, 2);

  if (partiler.length === 0) {
    console.log('  ▸ rezervasyonsuz uygun parti yok — transfer atlandı');
    return;
  }

  const transfers = new WarehouseTransferService(db);
  const sonuc = await transfers.dispatch({
    toWarehouseId: depolar.qlt,
    lines: partiler.map((p) => ({ sourceStockId: p.id, qty: Math.min(4, p.physical_qty) })),
    note: 'QUALITE takviyesi — kabul bekliyor.',
  });

  console.log(`  ✓ ${sonuc.referenceNo} · ${partiler.length} kalem · STR → QLT (yolda)`);

  // Kapanmış transferler: yalnız "yolda" bırakmak sevkiyat geçmişini, eksik kabulü ve geri alınmış sevki hiç göstermezdi.
  const digerPartiler = ((data ?? []) as Array<{ id: string; variant_id: string; physical_qty: number }>)
    .filter((p) => !mesgulVaryantlar.has(p.variant_id) && !partiler.some((s) => s.id === p.id))
    .slice(0, 5);

  // 1) Kabul edilmiş ama biri eksik gelmiş: fark bir kayıptır ve kabul ekranının asıl sınavı odur.
  if (digerPartiler.length >= 2) {
    const kabul = await transfers.dispatch({
      toWarehouseId: depolar.qlt,
      lines: digerPartiler.slice(0, 2).map((p) => ({ sourceStockId: p.id, qty: Math.min(5, p.physical_qty) })),
      note: 'Haftalık ikmal.',
    });
    const satirlar = await transfers.listLines(kabul.transferId);
    const sonucKabul = await transfers.receive({
      transferId: kabul.transferId,
      // Her satır için miktar zorunlu: bildirilmeyen satır kabulü bloklar. İlk satır tam, ikincisi iki adet eksik gelir.
      lines: satirlar.map((l, i) => ({ lineId: l.id, receivedQty: i === 1 ? Math.max(0, l.qty - 2) : l.qty })),
    });
    console.log(`  ✓ ${kabul.referenceNo} · KABUL EDİLDİ · ${sonucKabul.ok ? `bir kalem EKSİK geldi · ${sonucKabul.createdBatches} yeni parti` : 'reddedildi'}`);
  }

  // 2) Geri alınmış sevk: mal hiç çıkmadı. Geri alma bir stok hareketidir, çünkü mal sevk anında kaynaktan düşmüştür; RPC'den geçer.
  const iptalParti = digerPartiler[2];
  if (iptalParti) {
    const iptal = await transfers.dispatch({
      toWarehouseId: depolar.qlt,
      lines: [{ sourceStockId: iptalParti.id, qty: Math.min(3, iptalParti.physical_qty) }],
      note: 'Haftalık ikmalin ikinci aracı.',
    });
    await transfers.cancel({ transferId: iptal.transferId, reason: 'Araç arızalandı, mal araca hiç yüklenmedi.' });
    console.log(`  ✓ ${iptal.referenceNo} · GERİ ALINDI · mal kaynak partiye döndü`);
  }

  // 3) Tam kabul: yalnız eksikli kabul dursaydı "Tam kabul" rozeti hiç görünmezdi.
  const tamParti = digerPartiler[3];
  if (tamParti) {
    const tam = await transfers.dispatch({
      toWarehouseId: depolar.qlt,
      lines: [{ sourceStockId: tamParti.id, qty: Math.min(4, tamParti.physical_qty) }],
      note: 'Hafta sonu takviyesi.',
    });
    const tamSatirlar = await transfers.listLines(tam.transferId);
    await transfers.receive({
      transferId: tam.transferId,
      lines: tamSatirlar.map((l) => ({ lineId: l.id, receivedQty: l.qty })),
    });
    console.log(`  ✓ ${tam.referenceNo} · TAM KABUL`);
  }

  // 4) Gecikmiş yoldaki: ulaşım süresini aşmış sevkiyat. Damga ham `update` ile geriye çekilir, çünkü RPC bugünü yazar ve geçmiş bir
  //    anı kurmak yalnız seed'in işidir.
  const gecParti = digerPartiler[4];
  if (gecParti) {
    const gec = await transfers.dispatch({
      toWarehouseId: depolar.qlt,
      lines: [{ sourceStockId: gecParti.id, qty: Math.min(2, gecParti.physical_qty) }],
      note: 'Ek sipariş — araç dönüşte uğrayacak.',
    });
    const dortGunOnce = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const { error: damgaHatasi } = await db
      .from('warehouse_transfer')
      .update({ dispatched_at: dortGunOnce })
      .eq('id', gec.transferId);
    if (damgaHatasi) throw damgaHatasi;
    console.log(`  ✓ ${gec.referenceNo} · YOLDA ve GECİKMİŞ (4 gün)`);
  }

  // 5) Gelen yoldaki (QLT → STR): Lezzet deposunun ekranında "Gelen — kabul bekliyor" hâli de dolu olsun diye ters yönde bir sevkiyat.
  const { data: qltRezerveli, error: qltRezerveHatasi } = await db.from('reservation').select('variant_id').eq('warehouse_id', depolar.qlt);
  if (qltRezerveHatasi) throw qltRezerveHatasi;
  const qltMesgul = new Set((qltRezerveli ?? []).map((r) => (r as { variant_id: string }).variant_id));
  const { data: qltData, error: qltHatasi } = await db
    .from('stock')
    .select('id,variant_id,physical_qty')
    .eq('warehouse_id', depolar.qlt)
    .is('offer_price', null)
    .gt('physical_qty', 8)
    .order('physical_qty', { ascending: false })
    .limit(20);
  if (qltHatasi) throw qltHatasi;
  const qltPartiler = ((qltData ?? []) as Array<{ id: string; variant_id: string; physical_qty: number }>)
    .filter((p) => !qltMesgul.has(p.variant_id))
    .slice(0, 2);
  if (qltPartiler.length === 0) {
    console.log("  ▸ QLT'de rezervasyonsuz uygun parti yok — gelen transfer atlandı");
  } else {
    const gelen = await transfers.dispatch({
      toWarehouseId: depolar.str,
      lines: qltPartiler.map((p) => ({ sourceStockId: p.id, qty: Math.min(6, p.physical_qty) })),
      note: 'Lezzet takviyesi — kabul bekliyor.',
    });
    console.log(`  ✓ ${gelen.referenceNo} · ${qltPartiler.length} kalem · QLT → STR (yolda, Lezzet deposuna GELEN)`);
  }

  // Araca yükleme beslenmez: araca mal koymak kuryenin adımıdır ve beslemenin yaptığı yükleme araçta kaynağı belirsiz mal bırakırdı.

  console.log('✓ transfer: 6 kayıt (yolda · GECİKMİŞ yolda · QLT → STR gelen yolda · tam kabul · eksikli kabul · geri alınmış)');
}

// ── Depo bazlı asgari stok eşiği ─────────────────────────────────────────────────────────────────
// Varyantın eşiği varsayılandır, depo satırı onu ezer; ikinci katman veride olmasa ezme kuralı hiç görünmezdi. QUALITE deposu küçüktür
// ve aynı ürünün eşiği orada daha düşüktür.

export async function seedThresholds(db: Db, depolar: Depolar): Promise<void> {
  if (await tabloDolu(db, 'warehouse_variant_threshold')) {
    console.log('▸ depo stok eşikleri zaten dolu — atlandı');
    return;
  }
  console.log('▸ DEPO STOK EŞİĞİ seed');

  // Kullanılabilir stoğu bilinen satırlar: eşiğin altına düşmüş ürün de rahat duran ürün de olmalı, yoksa uyarı rengi görünmezdi.
  const { data, error } = await db
    .from('available_stock')
    .select('variant_id,warehouse_id,available_qty')
    .order('available_qty', { ascending: true })
    .limit(400);
  if (error) throw error;
  const satirlar = (data ?? []) as Array<{ variant_id: string; warehouse_id: string; available_qty: number }>;

  const kayitlar: Array<{ warehouse_id: string; variant_id: string; min_stock_qty: number }> = [];
  const gorulen = new Set<string>();
  let strSayi = 0;
  let qltSayi = 0;
  for (const s of satirlar) {
    const anahtar = `${s.warehouse_id}:${s.variant_id}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    const qlt = s.warehouse_id === depolar.qlt;
    if (qlt ? qltSayi >= 6 : strSayi >= 12) continue;
    if (qlt) qltSayi += 1;
    else strSayi += 1;
    // Bir kısmı bilinçli eşiğin ALTINDA (uyarı yansın), kalanı rahat.
    const altinda = kayitlar.length % 2 === 0;
    kayitlar.push({
      warehouse_id: s.warehouse_id,
      variant_id: s.variant_id,
      min_stock_qty: altinda ? s.available_qty + 8 : Math.max(1, Math.floor(s.available_qty / 3)),
    });
  }

  if (kayitlar.length === 0) {
    console.log('  ▸ kullanılabilir stok satırı yok — eşik kurulmadı');
    return;
  }
  const { error: yazmaHatasi } = await db.from('warehouse_variant_threshold').insert(kayitlar);
  if (yazmaHatasi) throw yazmaHatasi;
  console.log(`✓ depo eşiği: ${kayitlar.length} satır (STR ${strSayi} · QLT ${qltSayi}) · yarısı eşiğin ALTINDA → yeniden sipariş uyarısı`);
}

// ── Ölçüm noktaları ve partinin rafı ─────────────────────────────────────────────────────────────
// Burada, `seed/stock.ts`te değil, çünkü parti alana bağlanır (`stock.storage_area_id`) ve alanlar stoktan önce var olmalı; sıcaklık
// ölçümü de aynı alanları kullanır.

/** Seed'in kurduğu alanlar ve araç — hem stok hem sıcaklık bunlara bağlanıyor. */
export interface Noktalar {
  /** STR'nin alanları: ad → kimlik. Ad anahtar, çünkü iki tüketici de adı biliyor. */
  strAlan: Map<string, string>;
  /** QLT'nin tek alanı — ikinci tesisin ölçümü ve partileri için. */
  qltAlan: string;
  arac: string;
}

/**
 * Alan kümesi bilerek çeşitli: hedef aralıksız geçiş alanı ve raf "aralığı olmayan nokta" hâlini, günde 0 ölçüm beklenen raf
 * beklenmeyen yokluğun eksik sayılmadığını gösterir. `gunluk` günde beklenen ölçümdür ve sıcaklık seed'i takvimin dört hâlini ondan üretir.
 */
const STR_ALANLARI = [
  { ad: 'Derin dondurucu 1', tur: 'frozen' as const, hedef: [-20, -18] as const, gunluk: 2 },
  { ad: 'Derin dondurucu 2', tur: 'frozen' as const, hedef: [-20, -18] as const, gunluk: 1 },
  { ad: 'Soğuk oda', tur: 'chilled' as const, hedef: [0, 4] as const, gunluk: 1 },
  { ad: 'Mal kabul', tur: 'staging' as const, hedef: null, gunluk: 1 },
  { ad: 'Karantina', tur: 'staging' as const, hedef: null, gunluk: 1 },
  { ad: 'Kuru depo rafı', tur: 'ambient' as const, hedef: null, gunluk: 0 },
];

/** Bir alandan günde kaç ölçüm beklendiği; sıcaklık seed'i "eksik gün" hâlini bu beklentiden üretir (`CLAUDE §1`). */
export const gunlukOlcum = (ad: string): number => STR_ALANLARI.find((a) => a.ad === ad)?.gunluk ?? 0;

export async function seedStoragePoints(db: Db, depolar: Depolar): Promise<Noktalar> {
  const areas = new StorageAreaService(db);

  // Muhafız alan bazında: testler `storage_area` satırı bırakabilir ve "tablo dolu" diye atlamak partileri FK hatasıyla düşürürdü.
  const mevcut = await areas.listByWarehouses([depolar.str, depolar.qlt]);
  const anahtar = (warehouseId: string, ad: string) => `${warehouseId}:${ad}`;
  const koduyla = new Map(mevcut.map((a) => [anahtar(a.warehouseId, a.name), a.id]));

  const strAlan = new Map<string, string>();
  for (const [i, alan] of STR_ALANLARI.entries()) {
    const varolan = koduyla.get(anahtar(depolar.str, alan.ad));
    const id =
      varolan ??
      (
        await areas.insert({
          warehouseId: depolar.str,
          name: alan.ad,
          kind: alan.tur,
          targetMinC: alan.hedef?.[0] ?? null,
          targetMaxC: alan.hedef?.[1] ?? null,
          expectedDailyChecks: alan.gunluk,
          sortOrder: i + 1,
        })
      ).id;
    strAlan.set(alan.ad, id);
  }

  // QLT'nin alanı aynı adla: süzgeci unutan okuma iki tesisin dolabını karıştırır; ad yalnız depo içinde benzersizdir.
  const qltAlan =
    koduyla.get(anahtar(depolar.qlt, 'Derin dondurucu 1')) ??
    (
      await areas.insert({
        warehouseId: depolar.qlt,
        name: 'Derin dondurucu 1',
        kind: 'frozen',
        targetMinC: -20,
        targetMaxC: -18,
        expectedDailyChecks: 1,
        sortOrder: 1,
      })
    ).id;

  // Araç depo adımında açıldı (VAN-1 ona bağlıdır); burada yalnız bulunur.
  const arac = await aracKaydi(db, ARACLAR.lezzet, depolar.str);

  console.log(`✓ ölçüm noktası: ${strAlan.size} alan (STR) · 1 alan (QLT) · 2 araç`);
  return { strAlan, qltAlan, arac };
}

/**
 * Kargo kutuları şablondan benimsenir, elle yazılmaz, ki benimseme yolu her `db:refresh`te koşsun. STR'de biri kapalı üç kutu var, QLT'de
 * hiç kutu yok: "bu depodan kargo etiketi alınamaz" uyarısı kargo yapmayan depoda sınanır.
 */
export async function seedShippingBoxes(db: Db, depolar: Depolar): Promise<void> {
  const svc = new ShippingBoxService(db);
  const sablonlar = await svc.listTemplates();
  const sablon = (ad: string): string => {
    const row = sablonlar.find((t) => t.name.startsWith(ad));
    if (!row) throw new Error(`Kargo kutusu şablonu bulunamadı: ${ad} (migration 0052 değişti mi?)`);
    return row.id;
  };

  const plan: Array<{ depo: string; sablonlar: string[]; kapali?: string }> = [
    { depo: depolar.str, sablonlar: ['Küçük kutu', 'Orta kutu', 'Büyük kutu'], kapali: 'Büyük kutu' },
  ];

  for (const satir of plan) {
    // Muhafız depo bazında: başka deponun kutuları tabloyu doldurur ama bu deponun listesini kurmaz.
    if ((await svc.listForWarehouse(satir.depo)).length > 0) continue;
    for (const ad of satir.sablonlar) {
      const kutu = await svc.adopt(satir.depo, sablon(ad));
      if (satir.kapali === ad) await svc.setActive(kutu.id, false);
    }
  }
}

// Yazıcı beslenmez: yazıcı envanteri odanın gerçeğidir ve uydurulan adres depocuyu yanıltır; ekranın hâlleri testte kurulur.
