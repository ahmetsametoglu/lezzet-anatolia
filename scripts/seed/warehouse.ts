import { WarehouseService, WarehouseTransferService } from '@lezzet/database';
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
  const SEED_DEPOLARI = new Set(['STR', 'KEHL', 'COLMAR']);
  const yabanci = mevcut.filter((w) => !SEED_DEPOLARI.has(w.code));
  if (yabanci.length > 0) {
    // Yabancı satır SESSİZ geçilmez: operasyon ekranında görünen her depo veriyi etkiler.
    console.log(`▸ DEPO — tabloda ${yabanci.length} yabancı depo var (${yabanci.map((w) => w.code).join(', ')}); seed yalnız ${[...SEED_DEPOLARI].join('/')} kodlarını yönetir`);
  }

  let strId = koduyla.get('STR');
  let kehlId = koduyla.get('KEHL');
  if (strId && kehlId && koduyla.has('COLMAR')) {
    console.log('▸ depolar zaten kurulu (STR + KEHL + COLMAR) — atlandı');
    return { str: strId, kehl: kehlId };
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

  // **KAPALI depo** (kapsam denetimi 09.08) — pasif deponun kendi ekran hâli var: kapsam
  // seçicisinde görünmez, bölge ataması yapılamaz, stok okuması onu atlar. Bu hâl seed'de hiç
  // doğmadığı için o yollar bugüne dek hiç koşmadı.
  //
  // **Kapatılan gerçek bir depo, uydurma bir kayıt değil:** sezonluk/pilot depo açılıp kapanır ve
  // kapandığında SİLİNMEZ — geçmiş siparişler, partiler ve hareketler ona bağlı kalır (`restrict`
  // FK'ler zaten silmeyi engelliyor). "Kapalı ama duruyor" bu modelin normal hâlidir.
  //
  // Seed yalnız STR/KEHL'i yönettiği için (yukarıdaki künye) bu satır da koda göre koşullu:
  // varlığı koddan sorulur, tablo doluluğundan değil.
  if (!koduyla.has('COLMAR')) {
    const kapali = await warehouses.insert({
      code: 'COLMAR',
      name: 'Colmar — pilot depo (kapalı)',
      countryCode: 'FR',
      address: { line1: 'Rue des Clefs 4', postalCode: '68000', city: 'Colmar', country: 'FR' },
      shipsOnline: false,
      isActive: false,
      sortOrder: 3,
    });
    console.log(`  ✓ ${kapali.code} · ${kapali.name} · PASİF`);
  }

  console.log('✓ depo: STR + KEHL hazır (biri kargo çıkışı) + COLMAR pasif');
  return { str: strId, kehl: kehlId };
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
    .slice(0, 3);

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

  console.log('✓ transfer: 3 kayıt (yolda · kabul edilmiş + EKSİK gelen · geri alınmış)');
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
