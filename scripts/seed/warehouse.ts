import { StorageAreaService, VehicleService, WarehouseService, WarehouseTransferService } from '@lezzet/database';
import { tabloDolu, type Db } from './shared';

// ── Depo ağı (19) ────────────────────────────────────────────────────────────────────────────────
// Sistem tek depo varsayımıyla kuruldu, artık kurulmuyor. Seed **iki** depo açar: tek depolu bir
// veri setinde depo hatalarının hiçbiri görünmez — süzgeci unutulan sorgu doğru cevap verir, yanlış
// depoya düşen sipariş fark edilmez. İkinci depo o hataların görünür olduğu yerdir.
//
// STR kargo deposudur (`shipsOnline`): bölge dışı müşteriler ve rota müşterilerinin kargo dolgusu
// oradan gider. Ülke başına EN FAZLA BİR aktif kargo deposu olabilir — kural veritabanında.

export interface Depolar {
  /** Strasbourg — ana depo, aynı zamanda kargo çıkış deposu. */
  str: string;
  /** Kehl (DE) — ikinci depo. Sınır ötesi rota ve transfer buradan denenir. */
  kehl: string;
  /**
   * Colmar — **rota deposu, kargo çıkışı DEĞİL** (19.25).
   *
   * Varlık sebebi tek bir senaryodur ve o senaryo başka türlü doğmuyordu: **karma sepet**. Sepetin
   * ikiye bölünmesi için müşterinin ROTA deposu ile ülkenin KARGO çıkışının farklı olması gerekir —
   * STR ikisini birden yaptığı sürece `decideCartAgainstWarehouse` iki havuzu aynı yerden okur ve
   * kalem ya ikisinde birden vardır (`local`) ya ikisinde de yoktur (`unavailable`). `shipping`
   * yolu rota içi bir adres için matematiksel olarak doğamıyordu (ölçüldü 10.08, 15.08'de yeniden).
   */
  colmar: string;
}

/**
 * Depolar KOD BAZINDA kurulur — "tablo dolu mu" ölçütüyle değil.
 *
 * Diğer bölümlerin guard'ı "tablo doluysa atla"dır ve orada doğrudur. Burada DEĞİL: bu tablo seed'in
 * kendi verisi dışında da dolabiliyor (entegrasyon testleri `T-…` kodlu depolar bırakıyor, operatör
 * ekrandan depo açabiliyor). Eski hâl tablo doluysa atlıyor ve STR/KEHL bulamayınca **listenin ilk
 * satırına** düşüyordu; o satır bir test artığı olduğunda seed'in tamamı yanlış depoya yazılıyordu —
 * üstelik sessizce. Test kendi satırını silince de geriye FK'si kırık bir kurulum kalıyordu
 * (`user_profiles.warehouse_ids: … diye bir depo yok` — yaşandı).
 *
 * Ölçüt bu yüzden varlıktır: STR/KEHL/COLMAR kodlu satır var mı? Yoksa açılır. Böylece hem boş
 * veritabanında hem yabancı satırlarla dolu bir tabloda aynı sonuç doğar.
 */
export async function seedWarehouses(db: Db): Promise<Depolar> {
  const warehouses = new WarehouseService(db);
  const mevcut = await warehouses.list();
  const koduyla = new Map(mevcut.map((w) => [w.code, w.id]));
  // Seed'in YÖNETTİĞİ kodlar tek yerde: listeye bir depo eklenip bu kümeye yazılmazsa, kendi
  // kurduğumuz kayıt bir sonraki koşuda "yabancı" diye raporlanır ve uyarı anlamsızlaşır.
  const SEED_DEPOLARI = new Set(['STR', 'KEHL', 'COLMAR', 'MULHOUSE']);
  const yabanci = mevcut.filter((w) => !SEED_DEPOLARI.has(w.code));
  if (yabanci.length > 0) {
    // Yabancı satır SESSİZ geçilmez: operasyon ekranında görünen her depo veriyi etkiler.
    console.log(`▸ DEPO — tabloda ${yabanci.length} yabancı depo var (${yabanci.map((w) => w.code).join(', ')}); seed yalnız ${[...SEED_DEPOLARI].join('/')} kodlarını yönetir`);
  }

  let strId = koduyla.get('STR');
  let kehlId = koduyla.get('KEHL');
  let colmarId = koduyla.get('COLMAR');
  if (strId && kehlId && colmarId && koduyla.has('MULHOUSE') && koduyla.has('VAN-1')) {
    console.log('▸ depolar zaten kurulu (STR + KEHL + COLMAR + MULHOUSE + VAN-1) — atlandı');
    return { str: strId, kehl: kehlId, colmar: colmarId };
  }
  console.log('▸ DEPO seed');

  if (!strId) {
    const str = await warehouses.insert({
      code: 'STR',
      name: 'Strasbourg — ana depo',
      countryCode: 'FR',
      address: { line1: '12 rue du Marché', postalCode: '67000', city: 'Strasbourg', country: 'FR' },
      shipsOnline: true,
      sortOrder: 1,
    });
    strId = str.id;
    console.log(`  ✓ ${str.code} · ${str.name} · kargo deposu`);
  }
  if (!kehlId) {
    const kehl = await warehouses.insert({
      code: 'KEHL',
      name: 'Kehl — sınır deposu',
      countryCode: 'DE',
      address: { line1: 'Hauptstraße 8', postalCode: '77694', city: 'Kehl', country: 'DE' },
      // Almanya'da HENÜZ kargo yok: DE deposundan DE müşterisine satış "yerel satış"tır ve vergi
      // modelini değiştirir (DOMAIN §5/§17). Mali danışmana sorulmadan açılmaz.
      shipsOnline: false,
      sortOrder: 2,
    });
    kehlId = kehl.id;
    console.log(`  ✓ ${kehl.code} · ${kehl.name}`);
  }

  // ── ÜÇÜNCÜ DEPO: ROTASI VAR, KARGO ÇIKIŞI YOK (19.25) ───────────────────────────────────────
  //
  // **Bu deponun tek işi bir SENARYOYU var etmek** ve o senaryo başka hiçbir kurulumda doğmuyor:
  // karma sepet (aynı sepette hem "kapıya geliyor" hem "kargoyla gelecek" kalem). Ölçüm 10.08 ve
  // 15.08'de iki kez yapıldı — üç aktif bölgenin üçü de STR'ye bağlıydı ve STR aynı zamanda FR
  // kargo çıkışıydı; yani rota içi bir adres için `warehouseId` ile `shippingWarehouseId` AYNI
  // depoyu gösteriyordu. `decideCartAgainstWarehouse` iki havuzu tek yerden okuyunca kalem ya
  // ikisinde birden var (`local`) ya ikisinde de yok (`unavailable`) — **`shipping` yolu rota içi
  // adres için doğamıyordu.** Sınanmayan davranışlar: iki grup başlığı, "kargolu ürünleri ayrıca
  // sipariş ver" ikinci siparişi, kargo eşiğinin kendi matrahından hesabı (`shippingSubtotalCents`),
  // `shippingOnly` bayrağı, kargo KDV'sinin oransal bölünmesi.
  //
  // Colmar bunu tek satırla çözüyor: **rota deposu ama `shipsOnline = false`.** Colmar'lı müşterinin
  // rota deposu COLMAR, kargo çıkışı STR olur ve iki havuz artık gerçekten ayrı yerlerdir.
  //
  // Gerçekçi de: yeni açılan bir pilot depo önce yakın çevresine araçla dağıtır, kargo anlaşması
  // sonra gelir. Ülke başına tek aktif kargo deposu kuralına da dokunmuyor (kısmi unique indeks
  // yalnız `ships_online` satırına bakar — FR'de o hâlâ yalnız STR).
  if (!colmarId) {
    const colmar = await warehouses.insert({
      code: 'COLMAR',
      name: 'Colmar — rota deposu',
      countryCode: 'FR',
      address: { line1: 'Rue des Clefs 4', postalCode: '68000', city: 'Colmar', country: 'FR' },
      shipsOnline: false,
      sortOrder: 3,
    });
    colmarId = colmar.id;
    console.log(`  ✓ ${colmar.code} · ${colmar.name} · rotası var, kargo çıkışı YOK`);
  }

  // **KAPALI depo** (kapsam denetimi 09.08) — pasif deponun kendi ekran hâli var: kapsam
  // seçicisinde görünmez, bölge ataması yapılamaz, stok okuması onu atlar. Bu hâl seed'de hiç
  // doğmadığı için o yollar bugüne dek hiç koşmadı.
  //
  // **Kapatılan gerçek bir depo, uydurma bir kayıt değil:** sezonluk/pilot depo açılıp kapanır ve
  // kapandığında SİLİNMEZ — geçmiş siparişler, partiler ve hareketler ona bağlı kalır (`restrict`
  // FK'ler zaten silmeyi engelliyor). "Kapalı ama duruyor" bu modelin normal hâlidir.
  //
  // **Bu rolü 19.25'e kadar COLMAR taşıyordu ve devri ZORUNLUYDU:** Colmar aktifleşince pasif depo
  // hiç kalmıyordu ve `seed:coverage`ın **zorunlu** "pasif depo" kovası boşalırdı — yani bir
  // senaryoyu kazanırken ötekini sessizce kaybederdik. Mulhouse aynı hikâyeyi devralıyor: Colmar
  // pilotu tuttu, Mulhouse denendi ve kapatıldı.
  //
  // Seed yalnız kendi kodlarını yönettiği için (yukarıdaki künye) bu satır da koda göre koşullu:
  // varlığı koddan sorulur, tablo doluluğundan değil.
  if (!koduyla.has('MULHOUSE')) {
    const kapali = await warehouses.insert({
      code: 'MULHOUSE',
      name: 'Mulhouse — pilot depo (kapalı)',
      countryCode: 'FR',
      address: { line1: 'Rue du Sauvage 12', postalCode: '68100', city: 'Mulhouse', country: 'FR' },
      shipsOnline: false,
      isActive: false,
      sortOrder: 4,
    });
    console.log(`  ✓ ${kapali.code} · ${kapali.name} · PASİF`);
  }

  // ── ARAÇ DEPOSU (26.08, kullanıcı kararı) ───────────────────────────────────────────────────
  //
  // Kurye satılan maldan fazlasını yükleyip yolda isteyene satabiliyor — sahada olan bir şey. Araç
  // bu yüzden bir DEPO TÜRÜ (`kind='vehicle'`): yükleme ve akşam dönüşü birer transfer, içindeki
  // mal gerçek parti.
  //
  // **Seed'de bulunması şart, çünkü türün üç kuralı ancak böyle KOŞAR:** araca bölge bağlanamaz
  // (tetikleyici), araç kargo deposu olamaz (kısıt), araç `available_stock_total`a girmez. Hiç
  // araç satırı yoksa bu üç yol da hiç sınanmaz ve "yazdım ama çalışıyor mu bilmiyorum" hâli
  // doğar — MULHOUSE'un pasif depo için var olmasıyla birebir aynı gerekçe.
  //
  // `shipsOnline` hiç verilmiyor: kısıt zaten reddederdi, ama varsayılana güvenmek de bir kural
  // beyanıdır — araçtan kargo çıkmaz.
  if (!koduyla.has('VAN-1')) {
    const arac = await warehouses.insert({
      code: 'VAN-1',
      name: 'Kurye aracı 1',
      kind: 'vehicle',
      countryCode: 'FR',
      // Adres YOK ve bu doğru: araç bir yerdir ama sabit bir adresi yoktur. `null` burada
      // "girilmedi" değil "yok" demek — uydurma bir adres onu tesis gibi okuturdu.
      address: null,
      sortOrder: 5,
    });
    console.log(`  ✓ ${arac.code} · ${arac.name} · ARAÇ (bölge bağlanamaz, kargo çıkışı olamaz)`);
  }

  console.log('✓ depo: STR (kargo çıkışı) + KEHL + COLMAR (rota, kargosuz) + MULHOUSE pasif + VAN-1 araç');
  return { str: strId, kehl: kehlId, colmar: colmarId };
}

/**
 * Bir transfer — sevk edilmiş ama HENÜZ KABUL EDİLMEMİŞ (`in_transit`).
 *
 * Bilinçli yarım bırakılıyor: "yoldaki mal" hâli ancak böyle görünür. O mal kaynaktan düşmüştür,
 * hedefte henüz doğmamıştır ve hiçbir depoda satılamaz — sanal bir transit depo olmadığı için
 * "yolda ne var" sorusunun tek cevabı bu kaydın kendisidir. Kabul ekranının (19.6) da işleyecek
 * bir kaydı olur.
 */
export async function seedTransfer(db: Db, depolar: Depolar): Promise<void> {
  if (await tabloDolu(db, 'warehouse_transfer')) {
    console.log('▸ transfer zaten dolu — atlandı');
    return;
  }
  console.log('▸ TRANSFER seed');

  // STR'de duran, teklife çıpalanmamış, REZERVASYONSUZ ve bol adetli partiler: sevk kullanılabilir
  // stoğa bakar (fiiliye değil), söz verilmiş malı yola çıkaramaz. Rezervasyonu olan varyantı
  // baştan eliyoruz — seçtiğimiz parti RPC'de reddedilirse seed düşerdi.
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
  // Hata YUTULMAZ: sessizce boş listeye düşmek "uygun parti yok" gibi görünür ve seed hiçbir şey
  // söylemeden eksik veri bırakır — bir sonraki kişi transfer ekranını boş bulur ve sebebini aramaz.
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
    toWarehouseId: depolar.kehl,
    lines: partiler.map((p) => ({ sourceStockId: p.id, qty: Math.min(4, p.physical_qty) })),
    note: 'Kehl açılış sevkiyatı — kabul bekliyor.',
  });

  console.log(`  ✓ ${sonuc.referenceNo} · ${partiler.length} kalem · STR → KEHL (yolda)`);

  // ── Kapanmış transferler ────────────────────────────────────────────────────────────────────
  // Transferin üç hâli var ve üçü ayrı şey gösterir. Yalnız "yolda" bırakmak sevkiyat GEÇMİŞİNİ hiç
  // göstermez: kabul ekranı işleyecek bir kayıt bulur ama işlendikten SONRA neye benzediği, eksik
  // gelen malın nasıl göründüğü ve iptal edilmiş bir sevkiyatın listede nasıl durduğu görülmez.
  const digerPartiler = ((data ?? []) as Array<{ id: string; variant_id: string; physical_qty: number }>)
    .filter((p) => !mesgulVaryantlar.has(p.variant_id) && !partiler.some((s) => s.id === p.id))
    .slice(0, 5);

  // 1) KABUL EDİLMİŞ — ama biri EKSİK geldi. Sevk 5, gelen 3: aradaki fark bir kayıptır ve kabul
  //    ekranının asıl sınavı odur; tam gelen bir sevkiyat hiçbir soru sormaz.
  if (digerPartiler.length >= 2) {
    const kabul = await transfers.dispatch({
      toWarehouseId: depolar.kehl,
      lines: digerPartiler.slice(0, 2).map((p) => ({ sourceStockId: p.id, qty: Math.min(5, p.physical_qty) })),
      note: 'Haftalık ikmal.',
    });
    const satirlar = await transfers.listLines(kabul.transferId);
    const sonucKabul = await transfers.receive({
      transferId: kabul.transferId,
      // Her satır için miktar ZORUNLU: eksik geleni hiç bildirmemek kabulü bloklar — mal ne
      // kaynakta ne hedefte kalırdı. İlk satır tam, ikincisi iki adet eksik gelir.
      lines: satirlar.map((l, i) => ({ lineId: l.id, receivedQty: i === 1 ? Math.max(0, l.qty - 2) : l.qty })),
    });
    console.log(`  ✓ ${kabul.referenceNo} · KABUL EDİLDİ · ${sonucKabul.ok ? `bir kalem EKSİK geldi · ${sonucKabul.createdBatches} yeni parti` : 'reddedildi'}`);
  }

  // 2) GERİ ALINMIŞ SEVK — kayıt açıldı ama mal hiç çıkmadı (19.6).
  //
  //    Burası eskiden `update({ status: 'cancelled' })` ile DOĞRUDAN yazıyordu ve künyesi "iptal bir
  //    stok hareketi değil, durum düzeltmesidir" diyordu. O cümle yanlıştı: sevk anında mal zaten
  //    kaynaktan DÜŞMÜŞTÜ ve durumu çevirmek onu geri getirmiyordu — demo dünyasında üç adet
  //    sessizce buharlaşıyordu. Geri alma bir stok hareketidir, o yüzden RPC'den geçer.
  const iptalParti = digerPartiler[2];
  if (iptalParti) {
    const iptal = await transfers.dispatch({
      toWarehouseId: depolar.kehl,
      lines: [{ sourceStockId: iptalParti.id, qty: Math.min(3, iptalParti.physical_qty) }],
      note: 'Haftalık ikmalin ikinci aracı.',
    });
    await transfers.cancel({ transferId: iptal.transferId, reason: 'Araç arızalandı, mal araca hiç yüklenmedi.' });
    console.log(`  ✓ ${iptal.referenceNo} · GERİ ALINDI · mal kaynak partiye döndü`);
  }

  // 3) TAM KABUL — hiçbir soru sormayan sevkiyat (19.6). Geçmişte yalnız eksikli kabul dursaydı
  //    "Tam kabul" rozeti hiç görünmez, normal hâlin neye benzediği bilinmezdi.
  const tamParti = digerPartiler[3];
  if (tamParti) {
    const tam = await transfers.dispatch({
      toWarehouseId: depolar.kehl,
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

  // 4) GECİKMİŞ yoldaki — ulaşım süresini (varsayılan 1 gün) belirgin aşmış sevkiyat. Ekranın
  //    amber şeridi ve "N gün" kırmızı rozeti ancak böyle bir kayıtla görünür. Damga HAM update
  //    ile geriye çekilir: geçmiş bir anı kurmak yalnız seed'in derdidir (sefer seed'inin
  //    `created/departed` emsali) — RPC bugünü yazar, doğrusu da odur.
  const gecParti = digerPartiler[4];
  if (gecParti) {
    const gec = await transfers.dispatch({
      toWarehouseId: depolar.kehl,
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

  console.log('✓ transfer: 5 kayıt (yolda · GECİKMİŞ yolda · tam kabul · eksikli kabul · geri alınmış)');
}

// ── Depo bazlı asgari stok eşiği (19.x) ──────────────────────────────────────────────────────────
// Eşik İKİ KATMANLI (`StockService`): varyantın kendi `minStockQty`'si varsayılandır, depo satırı onu
// EZER. İkinci katman veride hiç yoksa ezme kuralının çalıştığı görülemez — ekran her iki hâlde de
// aynı sayıyı gösterir ve kimse farkı bilmez.
//
// Kehl küçük depo: aynı ürün için eşiği DAHA DÜŞÜK olmalı. Ana depoda 20 adet azdır, sınır deposunda
// normaldir — "az mı" sorusunun cevabı depoya göre değişir; kuralın söylediği tam olarak budur.

export async function seedThresholds(db: Db, depolar: Depolar): Promise<void> {
  if (await tabloDolu(db, 'warehouse_variant_threshold')) {
    console.log('▸ depo stok eşikleri zaten dolu — atlandı');
    return;
  }
  console.log('▸ DEPO STOK EŞİĞİ seed');

  // Eşiğin ANLAMLI olması için kullanılabilir stoğu bilinen satırlar seçilir: eşiğin altına düşmüş
  // ürün de rahat duran ürün de olmalı — liste tek renkse uyarı rengi hiç görünmez.
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
  let kehlSayi = 0;
  for (const s of satirlar) {
    const anahtar = `${s.warehouse_id}:${s.variant_id}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    const kehl = s.warehouse_id === depolar.kehl;
    if (kehl ? kehlSayi >= 6 : strSayi >= 12) continue;
    if (kehl) kehlSayi += 1;
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
  console.log(
    `✓ depo eşiği: ${kayitlar.length} satır (STR ${strSayi} · KEHL ${kehlSayi}) · yarısı eşiğin ALTINDA → yeniden sipariş uyarısı`,
  );
}

// ── Ölçüm noktaları (19.28) + partinin rafı (19.29) ──────────────────────────────────────────────
//
// **Burada, `seed/stock.ts`te DEĞİL** ve sebebi sıra: parti artık alana bağlanıyor
// (`stock.storage_area_id`), yani alanlar stoktan ÖNCE var olmak zorunda. Sıcaklık ölçümü de aynı
// alanları kullanıyor — iki tüketici, tek kaynak.

/** Seed'in kurduğu alanlar ve araç — hem stok hem sıcaklık bunlara bağlanıyor. */
export interface Noktalar {
  /** STR'nin alanları: ad → kimlik. Ad anahtar, çünkü iki tüketici de adı biliyor. */
  strAlan: Map<string, string>;
  /** KEHL'in tek alanı — ikinci deponun ölçümü ve partileri için. */
  kehlAlan: string;
  arac: string;
}

/**
 * **Kapsam bilinçli:** dört alan türünün üçü (donuk · soğutulmuş · geçiş) + oda sıcaklığı + bir
 * araç. `staging` ve `ambient` hedef aralıksız, çünkü geçiş alanının ve rafın beklentisi yoktur —
 * "aralığı olmayan nokta" hâli ancak böyle sınanır (sapma ölçütü orada alışkanlığa düşer).
 *
 * **`Kuru depo rafı` bilerek ölçümsüz kalır** (`seedTemperatureLogs` ona kayıt yazmaz): Depolar
 * ekranı "tanımlı ama tura girmemiş nokta" uyarısını çiziyor ve o uyarı ancak böyle bir satırla
 * sınanır. Hepsi ölçülmüş bir kurulumda uyarı hiç görünmez, bir gün bozulsa kimse fark etmez.
 */
/**
 * `gunluk` = günde beklenen ölçüm (19.30) ve küme bilerek ÇEŞİTLİ: takvimin dört hâli de gerçek
 * veriyle çizilsin.
 * · Derin dondurucu 1 → **2**: seed günde 4 kayıt yazıyor, yani "tam" günler.
 * · Öteki soğuk noktalar → **1**: günde 2 kayıtla yine tam.
 * · Mal kabul/Karantina → **1**: geçiş alanı da ölçülür (mal orada bekliyor).
 * · **Kuru depo rafı → 0**: oda sıcaklığı rafından günlük ölçüm beklenmez. Hiç ölçülmeyen tek
 *   nokta bu ve takvimi bilerek `idle` — beklenmeyen bir yokluğun eksik SAYILMADIĞI görülsün.
 */
const STR_ALANLARI = [
  { ad: 'Derin dondurucu 1', tur: 'frozen' as const, hedef: [-20, -18] as const, gunluk: 2 },
  { ad: 'Derin dondurucu 2', tur: 'frozen' as const, hedef: [-20, -18] as const, gunluk: 1 },
  { ad: 'Soğuk oda', tur: 'chilled' as const, hedef: [0, 4] as const, gunluk: 1 },
  { ad: 'Mal kabul', tur: 'staging' as const, hedef: null, gunluk: 1 },
  { ad: 'Karantina', tur: 'staging' as const, hedef: null, gunluk: 1 },
  { ad: 'Kuru depo rafı', tur: 'ambient' as const, hedef: null, gunluk: 0 },
];

/**
 * Bir alandan günde kaç ölçüm beklendiği — **tek kaynak burası** (`STR_ALANLARI`).
 *
 * Sıcaklık seed'i bu sayıyı bilmek zorunda: "eksik gün" ancak beklenenden az ölçüm yazıldığında
 * doğar, yani seri beklentiyi tanımadan o hâli hiç üretemez. Sayıyı orada ikinci kez yazmak, bir
 * gün ayrışan iki beklenti demekti (`CLAUDE §1`).
 */
export const gunlukOlcum = (ad: string): number => STR_ALANLARI.find((a) => a.ad === ad)?.gunluk ?? 0;

export async function seedStoragePoints(db: Db, depolar: Depolar): Promise<Noktalar> {
  const areas = new StorageAreaService(db);
  const vehicles = new VehicleService(db);

  // Guard alan BAZINDA, "tablo dolu mu" ile değil: depo seed'inin kendi gerekçesi burada da geçerli
  // — testler `storage_area` satırı bırakabiliyor ve tablo doluysa atlamak seed'i kendi alanları
  // olmadan bırakırdı (partiler o an FK hatasıyla düşerdi).
  const mevcut = await areas.listByWarehouses([depolar.str, depolar.kehl]);
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

  /**
   * **Kehl'in kendi alanı, aynı ADLA.** "Derin dondurucu 1" iki depoda da var ve bu tam da ekranın
   * sınadığı şey: süzgeci unutan bir okuma iki tesisin dolabını karıştırır. Ad depo İÇİNDE benzersiz
   * (`storage_area_name_uq`), depo üstünde değil.
   */
  const kehlAlan =
    koduyla.get(anahtar(depolar.kehl, 'Derin dondurucu 1')) ??
    (
      await areas.insert({
        warehouseId: depolar.kehl,
        name: 'Derin dondurucu 1',
        kind: 'frozen',
        targetMinC: -20,
        targetMaxC: -18,
        expectedDailyChecks: 1,
        sortOrder: 1,
      })
    ).id;

  const plaka = '67 LZT 01';
  const mevcutArac = (await vehicles.list()).find((v) => v.plate === plaka);
  const arac =
    mevcutArac?.id ??
    // **Frigo kamyonet günde 1 ölçüm bekliyor** — araç varsayılanı 0 ama bu araç soğuk taşıyor.
    // Ayrım veride tutulmadığı için (`vehicle` tablosunda soğutucu bayrağı yok) kararı operatör
    // veriyor; seed de o kararı örnekliyor.
    (await vehicles.insert({ plate: plaka, label: 'Frigo kamyonet', warehouseId: depolar.str, expectedDailyChecks: 1, sortOrder: 1 })).id;

  console.log(`✓ ölçüm noktası: ${strAlan.size} alan (STR) · 1 alan (KEHL) · 1 araç`);
  return { strAlan, kehlAlan, arac };
}
