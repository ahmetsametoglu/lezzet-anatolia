import { StorageAreaService, VehicleService, WarehouseService, WarehouseTransferService, ShippingBoxService,
  WarehousePrinterService,
} from '@lezzet/database';
import { tabloDolu, type Db } from './shared';

// ── Depo ağı (19) ────────────────────────────────────────────────────────────────────────────────
// Sistem tek depo varsayımıyla kuruldu, artık kurulmuyor. Seed **iki** depo açar: tek depolu bir
// veri setinde depo hatalarının hiçbiri görünmez — süzgeci unutulan sorgu doğru cevap verir, yanlış
// depoya düşen sipariş fark edilmez. İkinci depo o hataların görünür olduğu yerdir.
//
// STR kargo deposudur (`shipsOnline`): bölge dışı müşteriler ve rota müşterilerinin kargo dolgusu
// oradan gider. Ülke başına EN FAZLA BİR aktif kargo deposu olabilir — kural veritabanında.
//
// ── ÜÇ DEPO, VE ÜÇÜNCÜSÜ UZAKTA (kullanıcı kararı 01.09) ────────────────────────────────────────
//
// Karar iki adımda oluştu ve ikinci adım birincisini düzeltti:
//   1. *"Besleme dosyasında sadece iki depo olsun: Strasbourg ve Kehl."*
//   2. *"Colmar'ın birbirine çok yakın olması problemdi. Colmar yerine Marsilya, Bordo gibi şehirler
//      seçmek daha doğru. Gerekiyorsa öyle bir yerde depo açalım."*
//
// **Sorun depo SAYISI değil, MESAFEYDİ.** COLMAR Strasbourg'a 60 km ve Güney Hattının kendi
// DURAĞIYDI: aynı yer hem "başka bir deponun bölgesi" hem "bu deponun rotasında bir kapı" gibi
// duruyordu. Ekranda bu ayrım okunmuyor, kafada da kurulmuyor. Bordeaux 800 km ötede — bir deponun
// neden ayrı bir depo olduğu tek bakışta anlaşılıyor ve Strasbourg'un dört hattından hiçbiri oraya
// uzanamıyor.
//
// **Üçüncü deponun tek işi bir SENARYOYU var etmek** (19.25) ve o senaryo başka hiçbir kurulumda
// doğmuyor: KARMA SEPET — aynı sepette hem "kapıya geliyor" hem "kargoyla gelecek" kalem. Sepetin
// ikiye bölünmesi için müşterinin ROTA deposu ile ülkenin KARGO çıkışının FARKLI olması gerekir;
// STR ikisini birden yaptığı sürece `decideCartAgainstWarehouse` iki havuzu tek yerden okur ve
// `shipping` yolu rota içi bir adres için matematiksel olarak doğamaz (ölçüldü 10.08 · 15.08).
// Bordeaux `shipsOnline=false`: Bordeaux'lu müşterinin rota deposu BDX, kargo çıkışı STR.
//
// **MULHOUSE (kapalı pilot depo) GERİ GELMEDİ** — pasif depo hâli (kapsam seçicisinde görünmeyen
// depo, "depo kapandı" rozeti, stok okumasının onu atlaması) beslemede yok. `seed:coverage`ın o
// kovası zorunluluktan çıktı, gerekçesi orada yazılı; operatör ekrandan bir depo kapattığı an dolar.
//
// **Rotaların hepsi STR'nin** (kullanıcı kararı 01.09: *"Strasbourg merkezli dört rota olsun, Kehl
// deposuna ait bir rota olmasın, dört farklı yöne olsun"*). KEHL depo olarak duruyor — transfer
// hedefi, ikinci ülke, kapsamı dar personelin deposu — ama rotası yok. Bordeaux'nun kendi şehir
// bölgesi var ve o bir KURYE hattı değil, sepetin bölünmesinin adresi (`delivery.ts` künyesi).

export interface Depolar {
  /** Strasbourg — ana depo, aynı zamanda kargo çıkış deposu. Dört rotanın da deposu. */
  str: string;
  /** Kehl (DE) — sınır deposu. Transfer hedefi ve ikinci ülke; ROTASI YOK (01.09). */
  kehl: string;
  /**
   * Bordeaux — **rota deposu, kargo çıkışı DEĞİL** (19.25 · yeri 01.09'da Colmar'dan taşındı).
   *
   * Varlık sebebi tek bir senaryodur: karma sepet. Gerekçenin tamamı dosyanın baş künyesinde.
   * Uzaklığı da senaryonun parçası — Strasbourg'un rota ağıyla hiç kesişmiyor.
   */
  bdx: string;
  /**
   * VAN-1 — kurye aracı (`kind='vehicle'`, 26.08). Tipe girmesinin sebebi kuryenin KAPSAMI: yerinde
   * satışın depo çözümü araçtandır (`?place=van` — 01.09'dan beri açık beyanla).
   *
   * **İÇİ BOŞ BAŞLAR** (01.09): besleme araca mal koymuyor, koymak kuryenin adımı. Satır yine de
   * şart, çünkü türün üç kuralı ancak bir araç varsa koşuyor — bölge bağlanamaz, kargo deposu
   * olamaz, depo-üstü toplamaya girmez.
   */
  van: string;
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
 * Ölçüt bu yüzden varlıktır: STR/KEHL kodlu satır var mı? Yoksa açılır. Böylece hem boş
 * veritabanında hem yabancı satırlarla dolu bir tabloda aynı sonuç doğar.
 */
export async function seedWarehouses(db: Db): Promise<Depolar> {
  const warehouses = new WarehouseService(db);
  const mevcut = await warehouses.list();
  const koduyla = new Map(mevcut.map((w) => [w.code, w.id]));
  // Seed'in YÖNETTİĞİ kodlar tek yerde: listeye bir depo eklenip bu kümeye yazılmazsa, kendi
  // kurduğumuz kayıt bir sonraki koşuda "yabancı" diye raporlanır ve uyarı anlamsızlaşır.
  // VAN-1 26.08'de eklendi — küme künyesinin uyardığı tuzak birebir yaşanmıştı: aracı seed'in
  // kendisi kuruyor ama kümede olmadığı için ikinci koşu onu "yabancı depo" diye raporluyordu.
  //
  // COLMAR/MULHOUSE 01.09'da kümeden ÇIKTI, yerine BDX geldi (kullanıcı kararı, künye dosyanın
  // başında). Tazelenmemiş bir veritabanında eski satırlar hâlâ durur ve buradaki uyarı onları
  // "yabancı" diye sayar — bu doğrudur ve işe yarar: seed onları artık yönetmiyor, ekranda
  // görünüyorlarsa `db:refresh` gerekiyor demektir. Seed onları SİLMEZ; depo silmek `restrict`
  // FK'lerin işi değil, kararın işi.
  const SEED_DEPOLARI = new Set(['STR', 'KEHL', 'BDX', 'VAN-1']);
  const yabanci = mevcut.filter((w) => !SEED_DEPOLARI.has(w.code));
  if (yabanci.length > 0) {
    // Yabancı satır SESSİZ geçilmez: operasyon ekranında görünen her depo veriyi etkiler.
    console.log(`▸ DEPO — tabloda ${yabanci.length} yabancı depo var (${yabanci.map((w) => w.code).join(', ')}); seed yalnız ${[...SEED_DEPOLARI].join('/')} kodlarını yönetir`);
  }

  let strId = koduyla.get('STR');
  let kehlId = koduyla.get('KEHL');
  let bdxId = koduyla.get('BDX');
  let vanId = koduyla.get('VAN-1');
  if (strId && kehlId && bdxId && vanId) {
    console.log('▸ depolar zaten kurulu (STR + KEHL + BDX + VAN-1) — atlandı');
    return { str: strId, kehl: kehlId, bdx: bdxId, van: vanId };
  }
  console.log('▸ DEPO seed');

  if (!strId) {
    const str = await warehouses.insert({
      code: 'STR',
      name: 'Strasbourg — ana depo',
      countryCode: 'FR',
      address: { line1: '12 rue du Marché', postalCode: '67000', city: 'Strasbourg', country: 'FR' },
      // Deponun noktası (11.9) — rotanın çıpası; onsuz sıra hesabı `no_start` der. Sabit değer,
      // ağa çıkılmaz: besleme çevrimdışı ve belirlenimci olmalı.
      lat: 48.5839,
      lng: 7.7455,
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
      lat: 48.5735,
      lng: 7.8148,
      // Almanya'da HENÜZ kargo yok: DE deposundan DE müşterisine satış "yerel satış"tır ve vergi
      // modelini değiştirir (DOMAIN §5/§17). Mali danışmana sorulmadan açılmaz.
      shipsOnline: false,
      sortOrder: 2,
    });
    kehlId = kehl.id;
    console.log(`  ✓ ${kehl.code} · ${kehl.name}`);
  }

  // ── ÜÇÜNCÜ DEPO: ROTASI VAR, KARGO ÇIKIŞI YOK, ve UZAKTA (19.25 · 01.09) ────────────────────
  //
  // Rolün tamamı ve niçin uzakta olduğu dosyanın baş künyesinde. Burada yalnız iki alan konuşuyor:
  //
  //   · `shipsOnline: false` — rolün kendisi. Ülke başına tek aktif kargo deposu kuralına
  //     dokunmuyor (kısmi unique indeks yalnız `ships_online` satırına bakar; FR'de o hâlâ STR).
  //   · nokta (`lat/lng`) — rotanın çıpası; onsuz sıra hesabı `no_start` der. Sabit yazılıyor,
  //     ağa çıkılmıyor: besleme çevrimdışı ve belirlenimci olmalı. Değer `postal_code_place`in
  //     33000 satırıyla birebir (`0034` — Bordeaux merkezi).
  //
  // Gerçekçi bir hikâye de: yeni açılan bir bölge deposu önce yakın çevresine araçla dağıtır,
  // kargo anlaşması sonra gelir.
  if (!bdxId) {
    const bdx = await warehouses.insert({
      code: 'BDX',
      name: 'Bordeaux — bölge deposu',
      countryCode: 'FR',
      address: { line1: '24 cours de l’Intendance', postalCode: '33000', city: 'Bordeaux', country: 'FR' },
      lat: 44.8404,
      lng: -0.5805,
      shipsOnline: false,
      sortOrder: 3,
    });
    bdxId = bdx.id;
    console.log(`  ✓ ${bdx.code} · ${bdx.name} · rotası var, kargo çıkışı YOK`);
  }

  // ── ARAÇ DEPOSU (26.08, kullanıcı kararı) ───────────────────────────────────────────────────
  //
  // Kurye satılan maldan fazlasını yükleyip yolda isteyene satabiliyor — sahada olan bir şey. Araç
  // bu yüzden bir DEPO TÜRÜ (`kind='vehicle'`): yükleme ve akşam dönüşü birer transfer, içindeki
  // mal gerçek parti.
  //
  // **Seed'de bulunması şart, çünkü türün üç kuralı ancak böyle KOŞAR:** araca bölge bağlanamaz
  // (tetikleyici), araç kargo deposu olamaz (kısıt), araç `available_stock_total`a girmez. Hiç
  // araç satırı yoksa bu üç yol da hiç sınanmaz ve "yazdım ama çalışıyor mu bilmiyorum" hâli doğar.
  //
  // **Araç, "iki depo" kararının dışındadır** (01.09): sayılan şey TESİStir, araç bir tesis değil —
  // kuryenin yükü. Kalkarsa yükleme transferi, araçtan satış ve akşam dönüşü hiç koşmaz.
  //
  // `shipsOnline` hiç verilmiyor: kısıt zaten reddederdi, ama varsayılana güvenmek de bir kural
  // beyanıdır — araçtan kargo çıkmaz.
  if (!vanId) {
    const arac = await warehouses.insert({
      code: 'VAN-1',
      name: 'Kurye aracı 1',
      kind: 'vehicle',
      countryCode: 'FR',
      // Adres YOK ve bu doğru: araç bir yerdir ama sabit bir adresi yoktur. `null` burada
      // "girilmedi" değil "yok" demek — uydurma bir adres onu tesis gibi okuturdu.
      address: null,
      // **Aracın evi STR** (02.09) — kurulum, iş değil. 01.09'un kuralı *"besleme dünyayı kurar,
      // işi insan yapar"*: araca MAL koymak iştir ve beslemeden kaldırıldı, aracın hangi tesise
      // ait olduğu ise dünyanın kendisi — plakası gibi, künyenin parçası. Bağ olmadan tesisin
      // paneli "aracımda ek olarak ne var" diye soramaz ve o yol yerelde hiç koşmaz.
      homeWarehouseId: strId,
      sortOrder: 4,
    });
    vanId = arac.id;
    console.log(`  ✓ ${arac.code} · ${arac.name} · ARAÇ (bölge bağlanamaz, kargo çıkışı olamaz)`);
  }

  console.log('✓ depo: STR (kargo çıkışı, dört rota) + KEHL (rotasız) + BDX (rota, kargosuz) + VAN-1 araç');
  return { str: strId, kehl: kehlId, bdx: bdxId, van: vanId };
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

  /*
    ── 5) ARACA YÜKLEME KALKTI (kullanıcı kararı 01.09) ────────────────────────

    Burada STR'den VAN-1'e 4 kalemlik bir transfer açılıp aynı anda kabul ediliyordu ("Sabah
    yüklemesi — serbest satış fazlası"), yani araç dolu doğuyordu. Kullanıcı cihazda gördü:
    *"Ben araca ürün eklemedim ama araçta ürün görünüyor."*

    **Gerekçesi 26.08'de yazılmıştı ve artık geçerli değil:** *"bu transfer olmadan satış ekranı
    araçta hep 'tükendi' gösterir ve akış yerelde hiç denenemez."* Bugün araca serbest ürün koymak
    kuryenin kendi adımı (yükleme ekranının SERBEST ÜRÜN bölümü, v3:19) — besleme onu önceden
    yapınca akışın bir adımı atlanmış oluyor ve araçta nereden geldiği belirsiz mal duruyor.

    Kutular için 01.09'da verilen kararın aynısı: **besleme dünyayı kurar, işi insan yapar.**

    Kapsam denetimi etkilenmiyor: zorunlu kovalar deponun araç TÜRÜNÜ (`kind='vehicle'`) ve araç
    kaydını sayıyor, araçtaki STOĞU değil. VAN-1 duruyor, yalnız içi boş başlıyor.
  */

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

/*
  ── KARGO KUTULARI (07.12, 28.08) ────────────────────────────────────────────

  Depoların kutu listesi. **Şablondan BENİMSENİR, elle yazılmaz**: seed operatörün yapacağı şeyin
  aynısını yapıyor (`ShippingBoxService.adopt`), yani benimseme yolu her `db:refresh`te fiilen
  koşuyor. Elle `insert` etseydik o yol yalnız testte sınanır, beslemede hiç yürümezdi.

  ── ÜÇ HÂL, ve üçü de bir ekranın karşılığı ─────────────────────────────────
    STR  → üç kutu, biri KAPALI (kapanmış kutu listede görünür ama seçicide görünmez)
    KEHL → bir kutu (asgari hâl: kargo çıkışı olmayan depo da kutu tanımlayabilir)
    BDX  → HİÇ kutu yok — "bu depodan kargo etiketi alınamaz" uyarısının tek kaynağı

  Kargo çıkışı olan depo (STR) kutusuz bırakılsaydı ekranın amber cümlesi doğru görünür ama
  hiçbir gönderi hazırlanamazdı; kutusuz hâli TAŞIMAYAN bir depoda (BDX) göstermek ise o cümleyi
  zararsız bir yerde sınıyor. (Bu rolü 01.09'a kadar COLMAR taşıyordu — depo değişti, hâl aynı.)
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
    { depo: depolar.kehl, sablonlar: ['Orta kutu'] },
  ];

  for (const satir of plan) {
    // Guard depo BAZINDA: tablo dolu olabilir (başka deponun kutuları) ve o, bu deponun
    // listesinin kurulmuş olduğu anlamına gelmez — depo seed'inin kendi gerekçesinin aynısı.
    if ((await svc.listForWarehouse(satir.depo)).length > 0) continue;
    for (const ad of satir.sablonlar) {
      const kutu = await svc.adopt(satir.depo, sablon(ad));
      if (satir.kapali === ad) await svc.setActive(kutu.id, false);
    }
  }
}

/*
  ── DEPO YAZICILARI (07.12, 29.08) ───────────────────────────────────────────

  23.7'nin üç `label_printer_*` ayarının halefi. Ayar tek yazıcı varsayıyordu; kargo kanalı hem
  yazıcıyı hem etiket TÜRÜNÜ çoğalttı ve envanter tabloya taşındı (`0054`).

  ── ÜÇ HÂL, üçü de bir ekranın karşılığı ────────────────────────────────────
    STR  → İKİ yazıcı (kutu + kargo) — cihaz seçicisinin normal hâli
    KEHL → TEK yazıcı, yalnız `box` — kargo etiketi basamayan depo; ekran bunu söylemeli
    BDX  → HİÇ yazıcı yok — "yazıcı tanımlı değil" cümlesinin tek kaynağı

  Adresler 23.5'in iğne deneyinde ÖLÇÜLEN gerçek yazıcıdan (`192.168.1.90`); ikincisi ondan
  türetilmiş makul bir varsayım — depo kurulumunda düzeltilir.
*/
export async function seedWarehousePrinters(db: Db, depolar: Depolar): Promise<void> {
  const svc = new WarehousePrinterService(db);

  const plan = [
    // Kutu etiketi 4×6 kalıp kesim (DK-1247) — 23.5'te ölçülen kâğıt.
    { depo: depolar.str, name: 'Masa · QL-1110', purpose: 'box' as const, address: '192.168.1.90', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' },
    // Kargo etiketi A6 yatay; sürekli rulo, çünkü taşıyıcının boyu kalıp kesimle tutmuyor (§4.6).
    { depo: depolar.str, name: 'Rampa · QL-820', purpose: 'shipping' as const, address: '192.168.1.91', model: 'QL-820NWB', labelSize: 'RollW62' },
    { depo: depolar.kehl, name: 'Kehl · QL-1110', purpose: 'box' as const, address: '192.168.2.90', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' },
  ];

  /*
    GUARD TUR BAŞINDA ÖLÇÜLÜR, SATIR SATIR DEĞİL (kusur, ölçüldü 30.08).

    Guard depo bazındaydı ve DOĞRU yerdeydi (kutu kataloğunun aynı gerekçesi: tablo dolu olabilir
    ve bu, BU deponun yazıcılarının kurulduğu anlamına gelmez) — ama döngünün İÇİNDE ölçülüyordu.
    Sonuç: STR'nin ilk yazıcısı yazılıyor, ikinci satıra gelindiğinde STR artık "dolu" görünüyor ve
    KARGO YAZICISI HİÇ KURULMUYORDU. Ölçüm: tabloda 2 yazıcı vardı (STR box · KEHL box), planda 3.

    Sessiz bir kusurdu ve tam olarak dosyanın kendi künyesinin vaat ettiği hâli bozuyordu: "STR →
    İKİ yazıcı — cihaz seçicisinin normal hâli". İki yazıcılı depo hiç doğmadığı için seçicinin
    normal hâli yerel veride HİÇ görülemiyordu (kullanıcı bulgusu: "yazıcılar gelmiyor").
  */
  const zatenKurulu = new Set<string>();
  for (const depo of new Set(plan.map((satir) => satir.depo))) {
    if ((await svc.listForWarehouse(depo)).length > 0) zatenKurulu.add(depo);
  }

  for (const satir of plan) {
    if (zatenKurulu.has(satir.depo)) continue;
    await svc.insert({
      warehouseId: satir.depo,
      name: satir.name,
      purpose: satir.purpose,
      address: satir.address,
      model: satir.model,
      labelSize: satir.labelSize,
    });
  }
}
