import {
  PriceService, ProductService, ProductVariantService, StockIntakeService, StockMovementService, StockService,
  TemperatureLogService, type AdjustInput,
} from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';
import { teklifSkulari } from './supplier-prices';
import { gunlukOlcum, type Depolar, type Noktalar } from './warehouse';

// ── Stok partileri (06) ──────────────────────────────────────────────────────────────────────────
// Parti çeşitliliği olmadan raf ömrü kuralları hiç görünmez: FEFO ancak farklı tarihli iki partide
// anlaşılır, "yaklaşan son tarih" uyarısı %25 eşiğinin altına inen parti olmadan tetiklenmez,
// "satılamaz" kuralı ise DLC'si geçmiş bir parti olmadan denenemez.
//
// Partilerin ÇOĞU mal kabulden doğar (izlenebilir zincir: sipariş → giriş → parti); bir kısmı
// doğrudan yazılır (eski/özel durumlar).

// Partiler İKİ depoya dağıtılır: tek depolu bir veri setinde depo süzgeci hataları görünmez.
// Çoğu STR'de (ana depo), bir bölümü KEHL'de — "başka depoda var ama burada yok" hâli denenebilsin.
/**
 * **Partinin rafı artık tanımlı bir alan** (19.29) — `Dolap 1..4` diye serbest metinler yazılıyordu
 * ve hiçbiri gerçek bir kayda karşılık gelmiyordu. Şimdi `seedStoragePoints`in kurduğu alanlara
 * bağlanıyor; dağılım da rastgele değil rejime uygun: donuk mal dondurucuda, süresi geçmiş mal
 * karantinada. Böylece `storage_area.kind` ↔ `product.storage_type` uyumu gerçek veriyle sınanır.
 */
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

  // ── ALIŞ FİYATI LİSTEDEN TÜRER, SABİT YAZILMAZ (denetim bulgusu 09.08) ────────────────────────
  //
  // Önce sabit bir formül vardı: `2,10 € + ((i + p) % 9) × 0,30` → 2,10-4,50 € arası, varyantın
  // gerçek fiyatına HİÇ bakmadan. Katalogda liste fiyatları 1,49 € ile 78,24 € arasında; sonuç
  // ölçüldü: **44 varyant zararına satılıyor görünüyordu**, en kötüsü **−2,07 €** birim marj
  // (1,49 € liste_HT'ye 2,40 € alış).
  //
  // **Hata sınıfı bu dosyada zaten yaşanmıştı:** teklif fiyatı da sabit yazılıyordu (490 · 550
  // cent) ve indirim ürünü PAHALILAŞTIRIYORDU (aşağıdaki künye). Gerçek veriye sabit sayı yazmak.
  //
  // **Neden şimdi gürültüden fazlası:** MCP asistanına maliyet okuması açıldı (22.5) ve harici
  // denetim ajanı ilk gerçek kullanımında bu veriye bakıp *"bu parti zararlı"* dedi, ardından
  // **zararına bir paket önerdi** ve gerekçelendirdi. Araç doğru çalıştı, model doğru okudu —
  // veri yalan söyledi. Sessiz bir tutarsızlık, yanlış öneri üreten bir girdiye dönüştü.
  //
  // Kural: `alış = liste_HT × (1 − hedefMarj)`. Hedef marj modelde zaten var
  // (`product.target_margin_percent`); yoksa %30 (katalog seed'inin de tabanı).
  const b2cUygulanabilir = await new PriceService(db).findApplicableMap(
    satilabilir.map((v) => v.id),
    'b2c',
  );
  const listeFiyati = new Map(
    [...b2cUygulanabilir].flatMap(([id, f]) => (f.channelPrice ? [[id, f.channelPrice.amountCents] as const] : [])),
  );

  /**
   * Bir varyantın alış fiyatı (cent). `tur` parti/senaryo indisidir — aynı varyantın iki partisi
   * birebir aynı tutarı taşımasın diye ±%6 bandında oynatır (tedarikçi pazarlığı gerçekte de
   * sabit değil ve FEFO maliyet raporunun gösterecek bir farkı olmalı).
   *
   * **MARJ ALTI KALAN VARYANTLAR — kural değil İSTİSNA.** Her yedinci varyant bilinçli olarak
   * listenin ÜSTÜNDE alınmış sayılıyor: zararına satılan parti gerçek bir işletme hâlidir (yanlış
   * alım, kur farkı, fiyat düşürülüp alış güncellenmemiş) ve kârlılık ekranının uyarısı bu hâl
   * olmadan hiç koşmaz. Fark önceki hâlden şu: **44 kaza yerine ~%14 bilinçli örnek.**
   *
   * Liste fiyatı bilinmiyorsa (fiyatsız varyant) eski tabana düşülür — uydurma bir marj hesabı
   * yapmaktansa bilinen bir sabit dürüsttür.
   */
  function alisFiyati(v: VaryantRef, tur: number): number {
    const liste = listeFiyati.get(v.id);
    if (!liste) return toCents(2.1 + (tur % 9) * 0.3);

    const listeHT = liste / (1 + v.vatRate / 100);
    const marj = (v.targetMarginPercent ?? 30) / 100;
    // Marj altı seçimi VARYANT KİMLİĞİNDEN: aynı varyantın iki partisi aynı tarafta kalsın, yoksa
    // "bu ürün zararına mı" sorusunun cevabı partiye göre değişirdi.
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

  // 1b) TAM gelen PO — sipariş edilen ne ise o kadarı gelir, sipariş `received`'a kapanır.
  //     Eksik gelenle aynı ekranda ama AYRI rozet: "tam kapandı" hâli ancak böyle bir kayıtla
  //     görünür. Miktarlar tedarik bölümündeki kalemlerle BİREBİR olmalı — bir adet fark, siparişi
  //     sessizce `partially_received` bırakır ve bu bölüm hiçbir şey söylemeden amacını ıskalardı.
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
  //
  // ── "STOKLU MU" KURALI KALKTI: ADAY OLMAYAN HER VARYANT STOKLANIR (kullanıcı kararı 16.08) ─────
  //
  // 16.08 sabahına kadar burada ikinci bir seçim vardı (`i < 45 || i % 3 === 0`) ve katalog
  // tarafındaki durum kuralından (`i % 29`) HABERSİZDİ. Ölçüldü: **116 aktif ürünün 53'ünün hiç
  // partisi yoktu** — müşteriye "tükendi" diyen kataloğun yarısı, malın bitmesinden değil hiç
  // gelmemesinden öyleydi. Kullanıcının cümlesi bunu tam yerinden yakalıyor: *"bir ürün stoğa hiç
  // girmediyse tükendi olamaz ki."*
  //
  // Kural artık tek yönlü: **stoklanmayacak ürün ADAY olarak doğar** (`catalog-lezza.ts`), buradaki
  // liste zaten adayları elemiş durumda, dolayısıyla kalan HERKES stoklanır. İki ayrı indis kuralı
  // yerine tek bir kaynak; ayrışacak bir şey kalmadı. `satilabilir`in ilk 45'ine dair eski
  // bağımlılık notu da düştü — sipariş kalemleri (`kalem(0…38)`) artık kendiliğinden stoklu.
  //
  // ── GERÇEKTEN TÜKENMİŞ ÜRÜNLER: hâl kaybolmuyor, GEÇMİŞ kazanıyor ─────────────────────────────
  // "Tükendi" meşru bir hâldir ve ekranı (rozet · pasif sepet düğmesi · "haber ver") ancak onunla
  // çizilir. Dördü bilinçli olarak öyle: partisi VAR, lot numarası ve alış fiyatı var, miktarı
  // sıfırlanmış. Fark ekranda değil ANLAMDA — geçmişi olan bir tükeniş operatöre "ne zaman gelecek"
  // diye sorulabilir, hiç gelmemiş bir ürün sorulamaz.
  //
  // Seçim ÜRÜN bazında: bir ürünün tek boyu tükenirse ürün tükenmiş sayılmaz (öteki boy satılır) ve
  // aranan müşteri hâli "bu ÜRÜN şu an yok"tur.
  //
  // ── TÜKENEN, GERÇEK ALIŞ FİYATI OLMAYAN ÜRÜNDÜR (kullanıcı kararı 19.08) ──────────────────────
  // Seçim eskiden katalogda dört sabit orandaydı (`0,45 · 0,6 · 0,75 · 0,9`) ve nereye düştüğü
  // tesadüftü — teklifteki bir ürüne de düşebiliyordu. Oysa kullanıcının istediği ayrım net:
  // *"bu listedeki ürünler sadece aktif satın alınmış gibi görünsün; diğerlerinin az bir kısmı
  // tükenmiş görünebilir."* Teklifli 33 ürün bu yüzden HİÇ tükenmez — onların stoğu dolu doğar.
  //
  // İlk 45 dışarıda: sipariş bölümü kalemlerini oradan seçiyor ve tükenmiş bir kaleme rezervasyon
  // yazılamaz. Kalandan da yalnız bir kısmı tükeniyor — hepsi değil, çünkü teklifsiz ürünlerin bir
  // kısmı paket kalemi ve tarif malzemesi; hepsini birden tüketmek o kurguların tamamını satılamaz
  // kılardı.
  //
  // ── ORAN HAVUZLA BİRLİKTE DEĞİŞMEK ZORUNDAYDI (ölçüldü 19.08) ────────────────────────────────
  // Ölçüt `n % 2` idi ve havuz küçükken doğruydu. Aile kuralı aday sayısını 64'ten 26'ya indirince
  // (`catalog-lezza.ts` künyesi) satılabilir ürün 59'dan 97'ye çıktı, tükenme havuzu da onunla
  // büyüdü: **97 aktif üründen 21'i tamamen tükenmiş** doğdu. Kullanıcının cümlesi "diğerlerinin
  // **az bir kısmı** tükenmiş görünebilir" idi; %22 az değil, boş raf. `n % 5` oranı ~%9'a çekiyor.
  //
  // Sabit sayı yerine oran bilinçli: havuz yine değişebilir ve sabit bir "10 ürün" bir gün havuzun
  // tamamı olurdu.
  const teklif = teklifSkulari();
  const teklifliUrun = new Set(satilabilir.filter((v) => v.sku && teklif.has(v.sku)).map((v) => v.productId));
  const ilk45Urun = new Set(satilabilir.slice(0, 45).map((v) => v.productId));
  const tukenmeAdaylari = [...new Set(satilabilir.map((v) => v.productId))].filter(
    (id) => !teklifliUrun.has(id) && !ilk45Urun.has(id),
  );
  const tukenmisUrun = new Set(tukenmeAdaylari.filter((_, n) => n % 5 === 0));
  // Küme boşalırsa hâl sessizce kaybolur: "tükendi" rozeti, pasif sepet düğmesi ve "haber ver"
  // akışının tamamı bu satırlara bağlı ve hiçbir test bunu eksik saymaz.
  if (tukenmisUrun.size === 0) console.log('  ⚠ TÜKENMİŞ ürün seçilemedi — "tükendi" ekran hâli bu koşuda hiç doğmayacak');
  let ekParti = 0;
  for (const [i, v] of satilabilir.entries()) {
    const bitti = tukenmisUrun.has(v.productId);
    // İkinci parti her üçüncü varyantta: FEFO iki farklı tarihli parti olmadan görünmez, ama bunu
    // her varyantta tekrarlamak yalnız satır sayısını büyütür. Tükenmiş üründe tek parti — "bitmiş"
    // olan şeyin iki partisi olması, anlatılmak istenen hâli bulandırırdı.
    const partiSayisi = bitti ? 1 : i % 3 === 1 ? 2 : 1;
    for (let p = 0; p < partiSayisi; p += 1) {
      await stocks.insert({
        // İLK parti daima ana depoda (künye yukarıda); ek parti Kehl'e ya da yine STR'ye düşer —
        // ikisi de gerekli: Kehl olmadan depo süzgeci, STR'deki ikinci parti olmadan FEFO denenmez.
        warehouseId: p > 0 && (i + p) % 2 === 0 ? depolar.kehl : depolar.str,
        variantId: v.id,
        physicalQty: bitti ? 0 : 6 + ((i + p * 5) % 40),
        expiryDate: gun(20 + ((i * 7 + p * 45) % 300)),
        lotNumber: `L${String(2600 + i)}-${p + 1}`,
        // Alış LİSTEDEN türer; parti parti biraz oynar (tedarikçi pazarlığı gerçekte de sabit değil).
        purchasePriceCents: alisFiyati(v, i + p),
        storageAreaId: donukAlan(noktalar, i + p),
      });
      ekParti += 1;
    }
  }

  // ── BORDEAUX: BİR KISMI ORADA, GERİSİ KARGODAN (19.25) ───────────────────────────────────────
  //
  // **Dağılımın kendisi senaryodur ve sadeleştirilmemelidir.** Karma sepet ancak Bordeaux'lu
  // müşterinin bazı kalemleri KENDİ deposunda bulup bazılarını bulamamasıyla doğar:
  //   · BDX'te var                             → `local`   ("kapıya geliyor")
  //   · BDX'te yok, STR'de var, kargolanabilir  → `shipping` ("kargoyla gelecek")  ← ARANAN HÂL
  //   · BDX'te yok, soğuk zincir               → `not_shippable_here`
  //   · hiçbir depoda yok                      → `unavailable`
  // Dördü de aynı katalogda duruyor, yani tek bir sepet dört cümleyi birden gösterebiliyor.
  //
  // *(Bu blok 01.09'a kadar COLMAR'ı besliyordu; depo Bordeaux'ya taşındı, kural aynı kaldı.)*
  //
  // Oran bilinçli AZ (her dördüncü varyant + iki soğuk zincir kalemi): yeni açılmış bir bölge deposu
  // dar bir çekirdek stokla çalışır. BDX'e her şeyi koysaydık `shipping` grubu yine hiç doğmazdı —
  // bu bölümün var oluş sebebini kendi elimizle silerdik.
  //
  // **Soğuk zincir kalemi BİLEREK var:** hepsi kargolanabilir olsaydı Bordeaux'lu müşteri için
  // "buraya gelemez" hâli hiç oluşmaz, kısıt cümlesi yalnız rota DIŞI adreslerde görünürdü.
  const { data: sogukSatirlar, error: sogukHatasi } = await db.from('product').select('id').eq('shippable', false);
  if (sogukHatasi) throw sogukHatasi;
  const sogukUrunler = new Set((sogukSatirlar ?? []).map((r) => (r as { id: string }).id));

  // Tükenmiş ürün burada da tükenmiş kalır: BDX'e stok koymak onu diriltirdi ve "hiçbir depoda yok"
  // (`unavailable`) hâli — bu beslemenin ikinci kazanımı — kaybolurdu.
  const bdxAdaylari = satilabilir.filter((v) => !tukenmisUrun.has(v.productId));
  const bdxKume = new Map<string, (typeof bdxAdaylari)[number]>();
  for (const [i, v] of bdxAdaylari.entries()) {
    if (i % 4 === 0 && bdxKume.size < 10) bdxKume.set(v.id, v);
  }
  for (const v of bdxAdaylari.filter((v) => sogukUrunler.has(v.productId)).slice(0, 2)) bdxKume.set(v.id, v);

  let bdxParti = 0;
  for (const v of bdxKume.values()) {
    await stocks.insert({
      warehouseId: depolar.bdx,
      variantId: v.id,
      // Küçük depo, küçük miktar: eşit hacim "yeni bölge deposu" gerçeğini yalanlar.
      physicalQty: 5 + (bdxParti % 9),
      expiryDate: gun(30 + ((bdxParti * 11) % 240)),
      lotNumber: `BX${String(2600 + bdxParti)}-1`,
      purchasePriceCents: alisFiyati(v, bdxParti + 3),
      // Rafı YOK ve bu bilinçli: BDX'in tanımlı alanı henüz açılmadı (yeni depo), `storage_area_id`
      // nullable ve ekranların "raf bilinmiyor" hâli ikinci bir depoda da doğsun.
    });
    bdxParti += 1;
  }
  console.log(
    `  ✓ BDX · ${bdxParti} parti (${bdxKume.size} varyant) — gerisi o adrese KARGOYLA gider: karma sepetin kaynağı`,
  );

  // 4) SINIR DURUMLAR — ekranların uyarı/engel hâlleri bunlarsız hiç görünmez.
  const ozel = satilabilir.slice(0, 8);

  // ── FIRSAT (near-expiry teklif) PARTİLERİ ────────────────────────────────────
  // **Teklif fiyatı LİSTE FİYATINDAN TÜRER, sabit yazılmaz** (kullanıcı bildirimi 09.08).
  //
  // Önce iki parti sabit tutarla açılıyordu (490 · 550 cent) ve varyantın gerçek fiyatına HİÇ
  // bakmıyordu. Gerçek katalogda fiyatlar 1,50 € ile 40 € arasında değişiyor; ölçüldü: "Artisan
  // Lemon Cake" listede **2,30 €**, teklifi **4,90 €** yazılmıştı. Yani indirim, ürünü PAHALILAŞTIRAN
  // bir sayıydı — ve `isOffer` haklı olarak eliyordu ("teklif normal fiyatı yenemezse fırsat
  // değildir"). Sonuç: **ana sayfanın fırsat bandı hiç çizilmiyordu** ve sebebi ekrandan görünmüyordu.
  //
  // Hata sınıfı tanıdık: gerçek veriye sabit sayı yazmak (aynı sınıf `shippable` kategorisinde de
  // yaşandı). Türetilen değer bu tuzağa düşemez — fiyat değişse de indirim indirim kalır.
  //
  // **Ürün AKTİF olmalı:** `satilabilir` yalnız `candidate`i eliyor, `passive`i değil. Eski hâlde
  // iki teklifin biri pasif bir ürüne düşmüştü ve vitrin sorgusu (`status: 'active'`) onu zaten
  // eliyordu — yani iki teklifin biri doğuşundan ölüydü.
  const firsatliklar = satilabilir.filter((v) => v.status === 'active');
  // Fiyat **uygulanabilir** olanı sorulur (`findApplicableMap`), ham satır değil: kanal + geçerlilik
  // tarihi seçimi orada tek yerde yaşıyor ve vitrinin okuduğuyla aynı. Ham satır okusaydık ileri
  // tarihli bir fiyat da sayılır, teklif bugün geçerli olmayan bir tutardan türerdi.
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
      // Alış fiyatı teklifin ALTINDA kalmalı, yoksa parti zararına satılıyor görünür ve marj
      // raporu gerçekte olmayan bir alarm üretir.
      purchasePriceCents: Math.max(1, Math.round(teklif * 0.6)),
      storageAreaId: donukAlan(noktalar, firsatNo),
    });
    await stocks.setOfferPrice(parti.id, teklif);
    firsatNo += 1;
  }
  // ── SENARYO PARTİLERİNİN ALIŞI DA LİSTEDEN TÜRER ───────────────────────────────────────────
  // Dört sabit vardı (280 · 340 · 220 · 260) ve hangi ürüne düştüklerine bakmıyorlardı; asistanın
  // Tur 4'te takıldığı Mango Cake tam olarak buradan geliyordu. Bu partilerin senaryosu SKT ve
  // miktardır — fiyat onların konusu değil, o yüzden ortak kuraldan alınıyor.
  //
  // Yaklaşan ama HENÜZ indirime alınmamış — "sistem önerir, karar insanın" hâli
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[2]!.id, physicalQty: 11, expiryDate: gun(6), lotNumber: 'NE-003', purchasePriceCents: alisFiyati(ozel[2]!, 1), storageAreaId: donukAlan(noktalar, 0) });
  // Tarihi GEÇMİŞ partiler: biri DLC (satılamaz — imha edilecek), biri DDM (satılabilir)
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[3]!.id, physicalQty: 5, expiryDate: gun(-2), lotNumber: 'EXP-DLC', purchasePriceCents: alisFiyati(ozel[3]!, 2), storageAreaId: noktalar.strAlan.get('Karantina')! });
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[4]!.id, physicalQty: 8, expiryDate: gun(-6), lotNumber: 'EXP-DDM', purchasePriceCents: alisFiyati(ozel[4]!, 3), storageAreaId: donukAlan(noktalar, 1) });
  // Tükenmiş parti (fiili 0): satır durur, miktarı biter — "geçmiş parti" görünümü
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[5]!.id, physicalQty: 0, expiryDate: gun(90), lotNumber: 'L-BITTI', purchasePriceCents: alisFiyati(ozel[5]!, 4), storageAreaId: donukAlan(noktalar, 1) });
  // Alış fiyatı GİRİLMEMİŞ parti: gerçek COGS bu partide hesaplanamaz (rapor bunu göstermeli)
  await stocks.insert({ warehouseId: depolar.str, variantId: ozel[6]!.id, physicalQty: 12, expiryDate: gun(120), lotNumber: 'L-MALIYETSIZ' });
  // ↑ **Rafı da BİLİNMİYOR ve bu bilinçli** (19.29): kabulde alan seçmek zorunlu değil, ekranların
  // o hâli de çizmesi gerekiyor. Bu satır zaten "eksik veri" fikstürü (maliyeti de yok) — iki
  // bilinmeyeni aynı satırda toplamak, `null` yollarını tek partiyle sınanır kılıyor.

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
  // **ATLAMA KONTROLÜ TABLOYA DEĞİL, SAYIM FARKINA BAKAR** (06.14 · ölçüldü 27.08).
  //
  // Eskiden `tabloDolu('stock_adjustment')` yeterliydi: o tablo yalnız elle düzeltmeleri tutuyordu
  // ve seed'den başka kimse yazmıyordu. Defter tek olunca kontrol SESSİZCE işlevsizleşti — mal
  // kabul adımı (`receive_intake`) defteri zaten dolduruyor, yani bu adım her koşuda "zaten dolu"
  // deyip atlanıyordu ve imha/sayım kovaları hiç doğmuyordu. Belirtisi yoktu: seed yeşil bitiyor,
  // yalnız Çıkışlar sekmesi tek satırla açılıyordu.
  //
  // `count_diff` ölçütü, çünkü seed'den BAŞKA kimse sayım farkı yazmıyor: imha ve iade restoku
  // sipariş iade akışından da doğabiliyor (`0020`), o yüzden onlar bu soruyu cevaplayamaz.
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

  // **Yön artık AYRI alanda** (06.14): eskiden `qty` işaretliydi ve fazla çıkan mal negatif adetle
  // yazılıyordu. Kapsam kovaları da buna göre — her iki yönden de örnek olmalı ki ekranın yön
  // süzgeci boş bir kümeyle sınanmasın.
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
 * Ölçüm noktalarının SICAKLIK profili — noktaların kendisi `seed/warehouse.ts`te doğuyor (19.29).
 *
 * Ayrılmalarının sebebi sıra: partiler de artık alana bağlanıyor (`stock.storage_area_id`), yani
 * alanlar stoktan ÖNCE var olmak zorunda. Burada yalnız "o nokta kaç derece okur" kalıyor — bu
 * dosyanın bildiği tek şey ölçümün kendisi.
 *
 * Seri seyrek ve bazen ARALIK DIŞI: hep −18 °C olsaydı uyarı eşiği hiç denenmezdi.
 *
 * ── DALGA HEDEF ARALIĞIN İÇİNDE KALIR (17.08) ───────────────────────────────
 * Profiller bir kez daraltıldı ve gerekçesi takvimden okundu. Eski değerler sınırı doğal olarak
 * aşıyordu (dondurucu `−19,5 ± 0,8` → hedef `−20…−18`in altına taşıyor) ve beş günlük seride bu
 * fark edilmiyordu; 75 güne çıkınca **günlerin yarısı kırmızı** oldu — yarısı sapma olan bir
 * takvimde sapma bir işaret olmaktan çıkar, arka plan olur.
 *
 * Bugün dalga aralığın İÇİNDE duruyor ve dışarı yalnız `KAZA` çıkarıyor. Ayrım kasıtlı: hedefli
 * noktalarda `target` ölçütü, hedefsiz noktalarda (`Mal kabul`, araç) `habit` ölçütü sınanıyor —
 * ikisi de kazayla tetikleniyor, ikisi de gündelik gürültüyle DEĞİL.
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

  // Noktalar `seedStoragePoints`te doğdu (19.29): partiler de onlara bağlandığı için stoktan ÖNCE
  // var olmaları gerekiyordu. Burada yalnız ölçüm yazılıyor.
  // **`Kuru depo rafı` bilerek ATLANIYOR** — "tanımlı ama tura girmemiş nokta" uyarısı ancak hiç
  // ölçülmemiş bir satırla sınanır.
  const olculecek = [...noktalar.strAlan].filter(([ad]) => ad in SICAKLIK_PROFILI);

  /**
   * **Seri 5 günden 75 güne çıktı (kullanıcı kararı 17.08: "takvimi besleyebilirsin").**
   *
   * 16.08'de 22 günden 5 güne indirilmişti ve gerekçesi doğruydu: uzun seri "listenin ne kadar
   * uzayabileceğini" göstermekten başka bir şey sınamıyordu. **Hijyen takvimi (19.30) o gerekçeyi
   * değiştirdi** — takvim üç aylık bir pencere çiziyor ve beş günlük bir seride görülemeyen ÜÇ hâli
   * var: eksik gün, yarım tur, ve zamana yayılmış sapma. Uzunluk artık bir gösteri değil, ekranın
   * sınadığı şeyin kendisi.
   *
   * 75 gün, 92 günlük pencerenin İÇİNDE bilerek: pencerenin başında boş bir şerit kalıyor ve
   * "veri buraya kadar" sınırı ekranda görünüyor — dolu bir takvim, sınırın nerede olduğunu saklar.
   *
   * Üç hâl DETERMİNİST kurallarla üretiliyor (rastgelelik yok — aynı seed hep aynı takvimi çizsin):
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

  // İKİNCİ DEPONUN ölçümleri: soğuk zincir kaydı depo başına tutulur ve ekran depo süzgeciyle
  // okunur. Yalnız ana depoda ölçüm olsaydı, süzgeci unutan bir sorgu Kehl'i seçince BOŞ liste
  // döndürür — bu "ölçüm yok" mu, "süzgeç yanlış" mı, ayırt edilemezdi. Seri daha kısa (30 gün) ve
  // tek noktalı: ikinci depo küçük, kayıt hacmi de öyle olmalı — eşit hacim gerçeği yalanlar.
  // **İki deponun takvimi de FARKLI uzunlukta** ve bu kasıtlı: pencere sabit (92 gün) ama veri
  // değil; ekran "veri buraya kadar" sınırını iki ayrı yerde göstermek zorunda.
  const kehlProfil = SICAKLIK_PROFILI['Derin dondurucu 1']!;
  for (let g = 29; g >= 0; g -= 1) {
    // Kehl'de de tur atlanan günler var — tek noktalı bir takvimde eksik gün daha görünür.
    if (g % 9 === 4) continue;
    const zaman = new Date(Date.now() - g * 86_400_000);
    zaman.setHours(8, 0, 0, 0);
    await logs.insert({
      warehouseId: depolar.kehl,
      storageAreaId: noktalar.kehlAlan,
      // Kehl'de iki gün ARALIK DIŞI: uyarı ikinci depoda da tetiklenebilmeli.
      temperatureC: euro(kehlProfil.taban + Math.sin(g / 2) * kehlProfil.sapma + (g === 1 || g === 17 ? 6.2 : 0)),
      recordedBy: depocu,
      recordedAt: zaman.toISOString(),
    });
    sayi += 1;
  }
  console.log(`✓ sıcaklık: ${sayi} ölçüm · ${SERI_GUN} günlük seri · ${olculecek.length} alan + 1 araç · biri hiç ölçülmedi · İKİ depo`);
}

