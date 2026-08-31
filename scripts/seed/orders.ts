import { confirmDoorDelivery, loadBox, markUndelivered, openBox, sealBox } from '@lezzet/application';
import {
  AccountService, AddressService, CartService, DeliveryZoneService, DiscountService, MoneyMovementService,
  OrderBoxService, OrderService, ReservationService, ShipmentEventService, ShipmentService,
  ShippingBoxService, StockMovementService, StockService, UserProfileService,
} from '@lezzet/database';
import { derivePaymentStatusForOrder, generateReferenceNo, resolveVatTreatment } from '@lezzet/domain-core';
import { distributeDiscount, toCents } from '@lezzet/helper';
import type { OrderStatus } from '@lezzet/types';
import type { Kuponlar } from './discount';
import { an, euro, gun, tabloDolu, type Db, type Kisiler, type VaryantRef } from './shared';
import { testLabelCode } from './test-labels';
import type { Katman } from './tier';
import type { Depolar } from './warehouse';

// ── Sepet (07) ───────────────────────────────────────────────────────────────────────────────────
// Sepette stok AYRILMAZ ve sepetteki fiyat BAĞLAYICI DEĞİLDİR (DOMAIN §5): gösterimdir. Bayat sepet
// bilinçli konuyor — checkout'ta "fiyat değişti" bildirimi ancak eski fiyatlı bir sepetle denenir.

export async function seedCarts(db: Db, kisiler: Kisiler, varyantlar: VaryantRef[]): Promise<void> {
  if (await tabloDolu(db, 'cart')) {
    console.log('▸ sepetler zaten dolu — atlandı');
    return;
  }
  console.log('▸ SEPET seed');
  const carts = new CartService(db);
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate');
  const { data } = await db.from('stock').select('id,variant_id').not('offer_price', 'is', null).limit(1);
  const teklif = (data ?? [])[0] as { id: string; variant_id: string } | undefined;

  const b2c = kisiler.get('b2cSadik');
  if (b2c) {
    for (const [i, v] of satilabilir.slice(0, 3).entries()) {
      await carts.addItem(b2c, { variantId: v.id, qty: 1 + i, unitPrice: euro(8 + i * 2) });
    }
    // Partiye çıpalı teklif satırı: indirim PARTİYE aittir, parti tükenirse kalem normal fiyata döner.
    if (teklif) await carts.addItem(b2c, { variantId: teklif.variant_id, qty: 2, unitPrice: 4.9, stockId: teklif.id });
  }

  const b2b = kisiler.get('b2bOnayli');
  if (b2b) {
    // Toptan sepeti: çok kalem, yüksek adet — asgari sepet ve kargo eşiği burada anlam kazanır.
    for (const [i, v] of satilabilir.slice(4, 12).entries()) {
      await carts.addItem(b2b, { variantId: v.id, qty: 6 + i * 2, unitPrice: euro(5.4 + i * 0.8) });
    }
  }

  // BAYAT sepet: bir yıl önce eklenmiş, fiyatı artık yanlış. "Sepette bekleyen fiyat bağlayıcı
  // değildir" kararının (DOMAIN §5) görünür kanıtı.
  const bayat = kisiler.get('b2cKapaliKapida');
  if (bayat && satilabilir[2]) {
    await carts.addItem(bayat, { variantId: satilabilir[2].id, qty: 2, unitPrice: 3.2 });
    // Tarihi geriye almanın SERVİSTE karşılığı yok ve olmamalı: `updatedAt` her dokunuşta tazelenir
    // (sepet kurtarma zamanlaması ona bakar). Geriye almak yalnız seed'in derdi — o yüzden burada,
    // doğrudan. Sepetin anahtarı `customer_id`'dir (id yok), miras `update` bu tabloda çalışmaz.
    const { error } = await db.from('cart').update({ updated_at: an(-380) }).eq('customer_id', bayat);
    if (error) throw error;

    /**
     * ── KARMA SEPET: aynı sepette YEREL + KARGO (19.25) ───────────────────────────────────────
     *
     * Bu müşterinin öteki satırları yalnız STR'de duruyor, yani Colmar'lı bir yer için hepsi kargo
     * grubuna düşüyor — tek gruplu bir sepet, bölünmenin hiçbir şeyini göstermez. Burada eklenen
     * satır COLMAR deposunda BULUNAN bir varyant: sepet ikiye ayrılıyor ve o ana kadar hiç
     * koşmamış davranışlar birden görünür oluyor — iki grup başlığı, "kargolu ürünleri ayrıca
     * sipariş ver" ikinci siparişi, kargo eşiğinin KENDİ matrahından hesabı, "iki grup toplanmaz"
     * cümlesi.
     *
     * **Varyant SORGUYLA seçiliyor, indisle değil:** stok bölümü Colmar'a hangi varyantları
     * koyduğunu kendi kuralıyla belirliyor (`stock.ts`, her dördüncü + iki soğuk zincir) ve buraya
     * sabit bir indis yazmak, o kural değiştiği gün sessizce kargo grubuna düşen bir satır bırakırdı
     * — sepet yine tek gruplu olur, kimse fark etmezdi.
     *
     * **Bölünmeyi görmek için yerin 68000 olması gerekir** (çerez ya da Colmar adresi): grup kararı
     * müşterinin YERİNE bağlı, sepetin kendisine değil. Adres seed'de hazır (`delivery.ts`).
     */
    const { data: colmarDepo } = await db.from('warehouse').select('id').eq('code', 'COLMAR').limit(1);
    const colmarId = ((colmarDepo ?? [])[0] as { id: string } | undefined)?.id;
    if (colmarId) {
      const { data: colmarStok } = await db
        .from('stock')
        .select('variant_id')
        .eq('warehouse_id', colmarId)
        .gt('physical_qty', 0)
        .limit(1);
      const yerelVaryant = ((colmarStok ?? [])[0] as { variant_id: string } | undefined)?.variant_id;
      if (yerelVaryant) await carts.addItem(bayat, { variantId: yerelVaryant, qty: 1, unitPrice: euro(6.5) });
      else console.log('  ⚠ COLMAR stoğu yok — karma sepet hâli bu koşuda doğmayacak (19.25)');
    }
  }
  console.log('✓ sepet: 3 sepet (normal · toptan · BAYAT+KARMA) + partiye çıpalı teklif satırı');
}

// ── Siparişler (07) ──────────────────────────────────────────────────────────────────────────────
// Sipariş katı bir zincir DEĞİL, izin verilen geçişler kümesidir; iki yol vardır (tam yol / hızlı
// satış). Aşağıdaki siparişler durumların HEPSİNİ kaplar — depo kuyruğu, kurye günü, muhasebe
// listesi ve müşteri geçmişi ancak böyle dolu görünür.
//
// Siparişler GERÇEK akışla kurulur (ayır → onayla → hazırla → yola çık → teslim et → kapat), elle
// durum yazılarak değil: böylece rezervasyon, kalem–parti kaydı, geçiş logu ve kâr kalemleri de
// kendiliğinden doğru oluşur.

interface SiparisKalem {
  variantId: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
  /**
   * PAZARLIK İZİ (26.08) — üstüne yazılmadan önceki LİSTE fiyatı. Verilirse `unitPrice` pazarlık
   * sonucudur ve kalem "kim, ne kadar taviz verdi" sorusunu cevaplar. Verilmezse iz YOKTUR ve bu
   * doğrudur: her normal kaleme aynı sayıyı ikinci kez yazmak veriyi büyütüp hiçbir soruya yeni
   * cevap vermez (`order_item_negotiation_complete` kısıtının kendi gerekçesi).
   */
  listeFiyati?: number;
}

/** Tam yolun durakları — sırayla yürünür; hedef nerede ise orada durulur. */
const TAM_YOL: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'];

export async function seedOrders(
  db: Db,
  kisiler: Kisiler,
  varyantlar: VaryantRef[],
  kuponlar: Kuponlar,
  depolar: Depolar,
  katman: Katman,
): Promise<void> {
  if (await tabloDolu(db, 'order')) {
    console.log('▸ siparişler zaten dolu — atlandı');
    return;
  }
  /**
   * `extend` katmanının sipariş tavanı — `full`de sınır yok (künye `siparis` içinde).
   *
   * On iki sayısı keyfî değil: tam yolun dokuz durağı (`draft` → `completed`, artı `cancelled` ve
   * `returned`) bu aralıkta doğuyor, yani sipariş DURUM MAKİNESİ eksiksiz örnekleniyor. Kesilen
   * şey durumlar değil, o durumların varyasyonları — kuponlu sipariş, kısmi iade, sınır ötesi
   * teslimat, ikinci depodan çıkan sipariş. Onlar `full`ün işi.
   */
  const siparisTavani: number | null = katman === 'extend' ? 12 : null;
  let acilanSiparis = 0;
  console.log(siparisTavani === null ? '▸ SİPARİŞ seed' : `▸ SİPARİŞ seed (extend — ilk ${siparisTavani} senaryo)`);
  const orders = new OrderService(db);
  const reservations = new ReservationService(db);
  const stocks = new StockService(db);
  // Kodlar bölgenin dizi kolonunda değil bağ tablosunda (DOMAIN §17) — `listWithCodes` ikisini
  // tek turda birleştirir; bölge başına sorgu (N+1) yok.
  const zones = await new DeliveryZoneService(db).listWithCodes({ activeOnly: true });
  const addresses = new AddressService(db);

  const movements = new MoneyMovementService(db);
  // İndirimin müşteriye görünen adı siparişe KOPYALANIR (0015 `discount_label`) — tanımdan sonradan
  // okunmaz. Seed de aynı yolu izlemeli, yoksa yerelde kopyası olmayan siparişler doğar ve sepette
  // görünen ad mailde kaybolur: bakan kişi bunu bir yüzey hatası sanır.
  const kuralEtiketi = new Map((await new DiscountService(db).list()).map((d) => [d.id, d.publicLabel]));
  // Siparişin dili müşterinin diliyle kurulur: seed'de "sipariş verirken okunan yüzey" yok, en
  // yakın gerçek profilin tercihi. Böylece yerelde üç dilli mail de denenebilir. Okuma KİMLİKLE
  // yapılır, sayfalı listeyle değil — tavanlı bir okuma, tavanı aşan kişilerin siparişini sessizce
  // dilsiz bırakırdı.
  // Profil bir bütün olarak taşınır: dil siparişe kopyalanır, KDV numarasının doğrulanmışlığı ise
  // vergi modelini belirler (`resolveVatTreatment`). İkisi için iki ayrı okuma yapmak, aynı satırı
  // iki kez getirmek olurdu.
  const profiller = new Map(
    (await new UserProfileService(db).listByIds([...new Set(kisiler.values())])).map((p) => [p.id, p]),
  );
  /**
   * **Kalem havuzu: STR'de STOĞU OLAN varyantlar** (05.36'da ölçülerek düzeltildi).
   *
   * Eskiden havuz `status !== 'candidate'` süzgeciydi ve kalemler indisle seçiliyordu
   * (`satilabilir[i % len]`). O havuz siparişin ihtiyaç duyduğu şeyi — **malın kendisini** —
   * garanti etmiyordu: `stock.ts` partileri kendi indisli dilimlerine kuruyor
   * (`satilabilir.slice(0, 45)` gibi), yani iki dosya aynı listeyi farklı yerlerinden kesiyordu.
   * Katalogda durum dağılımı değişince (05.36 yayın kısıtı aday sayısını 26→39 yaptı) indisler
   * kaydı ve kutu seed'i *"tek kutulu kapanmadı"* diye düştü — sebebi kutuyla ilgisizdi, kalemin
   * malı yoktu. Belirti bir yerde, arıza başka yerdeydi.
   *
   * Havuz artık DB'den ölçülüyor: hangi varyantın bu depoda fiili stoğu varsa o. Kalem sayısı
   * katalog büyüyüp küçüldükçe kendiliğinden doğru kalır ve indis kayması bir daha bu sınıftan
   * arıza üretmez.
   */
  const { data: stoklu } = await db.from('stock').select('variant_id').eq('warehouse_id', depolar.str).gt('physical_qty', 0);
  const stokluVaryant = new Set((stoklu ?? []).map((r) => (r as { variant_id: string }).variant_id));
  const satilabilir = varyantlar.filter((v) => v.status !== 'candidate' && stokluVaryant.has(v.id));
  const kurye = kisiler.get('kurye') ?? null;
  /**
   * **Cihaz turunun hesabı** (`hepsi@lezzetanatolia.fr` — dört bölümü de gören personel).
   *
   * Kurye ekranları KİMLİĞE bağlı okur (`listCourierDay(courierId)`), depoya değil: bu hesabın
   * depo kapsamı doğru olsa bile, günün siparişleri BAŞKA bir kuryeye damgalıysa onun sefer ekranı
   * bomboş açılır. O yüzden BUGÜNÜN Strasbourg rotası bu kimliğe yazılıyor; geçmiş günler ve
   * ikinci rota Marc'ta (`kurye`) kalıyor — iki hesap da dolu, hiçbiri ötekinin verisini yemiyor.
   * Araçtan satış da aynı kimliğin AÇIK seferine bağlanıyor (`quickSale` → `readCourierRun`).
   */
  const turKuryesi = kisiler.get('hepsi') ?? kurye;
  const depocu = kisiler.get('depocu') ?? null;
  // Pazarlığı YAZAN el: elle sipariş girişini de kapı önü satışını da personel yapar.
  const pazarlikciId = kisiler.get('yonetici') ?? depocu ?? null;

  /** Kalem kurar: fiyat kanal tabanından, KDV üründen. */
  const kalem = (i: number, qty: number): SiparisKalem => {
    const v = satilabilir[i % satilabilir.length]!;
    return { variantId: v.id, qty, unitPrice: euro(7 + (i % 9) * 1.6), vatRate: v.vatRate };
  };
  const toplam = (kalemler: SiparisKalem[], kargo = 0) => euro(kalemler.reduce((s, k) => s + k.unitPrice * k.qty, 0) + kargo);

  /**
   * ANA DEPO DIŞINDAKİ siparişler YALNIZ o depoda stoğu olan varyantlardan kurulur.
   *
   * Partilerin depoya dağılımı indise bağlı (`stock.ts`) ve hangi varyantın hangi depoda olduğu
   * oradan okunmaz — okunsaydı iki dosya aynı formülü paylaşırdı ve biri değişince diğeri sessizce
   * yanlış sipariş üretirdi. Bu yüzden GERÇEĞE sorulur: o depoda fiili stoğu olan varyantlar.
   *
   * Havuz TEK fonksiyondan çıkar (Kehl · Colmar): iki depo için iki ayrı sorgu yazmak aynı kuralı
   * iki yere kopyalamak olurdu ve biri eşik değiştirdiğinde fark hiçbir yerde görünmezdi.
   */
  async function depoStoklu(warehouseId: string, enAzAdet: number): Promise<VaryantRef[]> {
    const { data, error } = await db
      .from('stock')
      .select('variant_id,physical_qty')
      .eq('warehouse_id', warehouseId)
      .gt('physical_qty', enAzAdet);
    if (error) throw error;
    const idler = new Set(((data ?? []) as Array<{ variant_id: string }>).map((r) => r.variant_id));
    return satilabilir.filter((v) => idler.has(v.id));
  }
  /** Depo havuzundan kalem — dizide dönerek seçer; adet parti tavanının altında tutulur (rezervasyon geçsin). */
  const havuzKalem = (havuz: VaryantRef[], i: number, qty: number): SiparisKalem => {
    const v = havuz[i % havuz.length]!;
    return { variantId: v.id, qty, unitPrice: euro(7 + (i % 9) * 1.6), vatRate: v.vatRate };
  };

  /**
   * ANA DEPODA BOL STOKLU varyantlar — adedi büyük ya da stoğu OYNATILACAK siparişlerin havuzu.
   *
   * `kalem()` havuzu "stoğu olan" varyantları alıyor ve orada bir adet de yeterli; 4-6 adetlik bir
   * sipariş oradan seçilince rezervasyon sessizce yetmeyebilir ya da kutu kapanışı Σ denetimine
   * takılır (`sealBox` "hazır değil" der ve seed durur). Bol havuz o kumarı kaldırıyor.
   */
  const strBolStoklu = await depoStoklu(depolar.str, 8);
  const bolKalem = (i: number, qty: number): SiparisKalem => havuzKalem(strBolStoklu, i, qty);

  const kehlStoklu = await depoStoklu(depolar.kehl, 8);
  const kehlKalem = (i: number, qty: number): SiparisKalem => havuzKalem(kehlStoklu, i, qty);
  // Colmar rotasının kalemleri: eşik DAHA DÜŞÜK, çünkü o depo bilinçli olarak küçük kuruldu (11 parti).
  // 8'lik eşik orayı boş bir havuz yapar ve Colmar seferi hiç doğmazdı.
  const colmarStoklu = await depoStoklu(depolar.colmar, 2);
  const colmarKalem = (i: number, qty: number): SiparisKalem => havuzKalem(colmarStoklu, i, qty);

  /**
   * Kalemin karşılanabileceği partileri FEFO sırasıyla toplar (hazırlık onayının girdisi).
   *
   * **Yalnız SİPARİŞİN DEPOSUNDAN** (DOMAIN §17): partiler iki depoya dağıtılmış durumda ve süzgeç
   * olmadan FEFO en yakın tarihli partiyi seçer — o parti Kehl'de olabilir. `record_preparation`
   * bunu reddeder ("başka deponun malı") ve haklıdır: bir sipariş tek depodan çıkar.
   */
  async function partiSec(variantId: string, qty: number, warehouseId: string): Promise<Array<{ stockId: string; qty: number }>> {
    const partiler = await stocks.listInStock(warehouseId, variantId);
    const secim: Array<{ stockId: string; qty: number }> = [];
    let kalan = qty;
    for (const p of partiler) {
      if (kalan <= 0) break;
      const al = Math.min(p.physicalQty, kalan);
      if (al > 0) secim.push({ stockId: p.id, qty: al });
      kalan -= al;
    }
    return secim;
  }

  const varsayilanAdres = async (customerId: string) => (await addresses.listByCustomer(customerId))[0] ?? null;

  /**
   * Siparişin adresi. Etiket verilmezse varsayılan kart — bugüne kadarki tek davranış.
   *
   * Etiketle seçim, BÖLGESİ farklı bir adres gerektiğinde şart: bölge posta kodundan türüyor
   * (`zone` çözümü) ve müşterinin ikinci adresi başka bir rotada olabilir. Colmar rotasının
   * siparişleri ancak böyle doğuyor — kimse Colmar'ı varsayılan adres yapmadığı için o rota
   * bugüne dek hiç sipariş görmedi ve seferi de hiç kurulmadı.
   */
  async function siparisAdresi(customerId: string, etiket?: string) {
    if (!etiket) return varsayilanAdres(customerId);
    const kartlar = await addresses.listByCustomer(customerId);
    const bulunan = kartlar.find((a) => a.label === etiket);
    // Yazım hatası SESSİZ GEÇMEZ (aynı gerekçe: bilinmeyen müşteri anahtarı): adres bulunamazsa
    // sipariş varsayılan bölgeye düşer ve kurulmak istenen rota hiç doğmaz.
    if (!bulunan) throw new Error(`seed: "${etiket}" etiketli adres yok (müşteri ${customerId})`);
    return bulunan;
  }

  // Paranın gireceği hesap: kasa. Para bölümü siparişlerden ÖNCE koştuğu için hazırdır.
  const kasaId = (await new AccountService(db).list({ activeOnly: true })).find((h) => h.type === 'cash')?.id ?? null;

  /**
   * Tahsilat/iade bir HAREKETTİR (12.2): siparişteki `amount_*` ondan türer. Hareket + cache tek
   * transaction'da (`recordForOrder`), ödeme durumu ardından motordan.
   */
  async function tahsilatYaz(
    orderId: string,
    tutarCents: number,
    tip: 'order_payment' | 'order_refund',
    /**
     * Paranın DEFTERE girdiği gün, bugüne göre. Varsayılan dün, çünkü seed'in siparişlerinin
     * çoğu geçmişin kaydı ve o para dün sayıldı.
     *
     * Parametrik olması BUGÜNÜN parasını görünür kılmak için şart (ölçüldü 30.08): sabit `-1`
     * yüzünden `/money/overview` "bugün tahsil edilen" kırılımı ve `/money/day-end`in
     * `collectedCents`i her `db:refresh` sonrası SIFIR açılıyordu — para ekranları boş değil,
     * "bugün hiç para girmemiş" diye YANLIŞ doluyordu.
     */
    gunKaydirma = -1,
  ): Promise<void> {
    if (!kasaId || tutarCents <= 0) return;
    await movements.recordForOrder({ orderId, accountId: kasaId, amountCents: tutarCents, type: tip, valueDate: gun(gunKaydirma) });
  }

  /**
   * Ödeme durumunu motordan türetip yazar. Web kapısı (`lib/money/order-payment`) üretim yoludur;
   * seed onu import EDEMEZ (uygulama kodu), o yüzden aynı motoru doğrudan çağırır — eşleme
   * motorda olduğu için kural yine tek yerdedir.
   */
  async function odemeDurumuTazele(orderId: string): Promise<void> {
    const bulunan = await orders.getWithItems(orderId);
    if (!bulunan) return;
    const { order, items } = bulunan;
    const durum = derivePaymentStatusForOrder(order, items, {
      collectedCents: order.amountCollectedCents,
      refundedCents: order.amountRefundedCents,
    }).status;
    if (durum !== order.paymentStatus) await orders.update({ id: orderId, paymentStatus: durum });
  }

  /** Siparişi açar ve hedef duruma kadar GERÇEK akışla yürütür. */
  async function siparis(opts: {
    musteri: string;
    kalemler: SiparisKalem[];
    hedef: 'draft' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled' | 'returned';
    channel: 'b2b' | 'b2c';
    kaynak?: 'web' | 'whatsapp' | 'door' | 'manual';
    deliveryType?: 'route' | 'shipping';
    onAccount?: boolean;
    paymentMethod?: 'online' | 'cash' | 'card' | 'cheque' | 'bank_transfer';
    ttlDk?: number | null;
    kargo?: number;
    tahsilat?: number;
    yasi?: number;
    /** Patron ikramı — yalnız muhasebe export'undan düşer, gerisi tam normal (DOMAIN §9). */
    hediye?: boolean;
    /** Dış muhasebeden dönmüş resmî fatura numarası (12.7 eşleştirme kuyruğu boşalmış satır). */
    faturaNo?: string;
    /** Uygulanan kupon kodu — indirim siparişe yazılır, kullanım kaydı `discount_use`'a düşer. */
    kupon?: string;
    /** Kuponun bu sepette İNDİRDİĞİ tutar (motor hesaplar; seed geçmişi kurduğu için verili). */
    kuponTutari?: number;
    /** Teslim gününü bugüne göre kaydır — kurye gün kapanışı ancak farklı günlerle denenebilir. */
    teslimGunu?: number;
    /** Tahsilat hareketinin DEFTER günü, bugüne göre (varsayılan dün — `tahsilatYaz` künyesi). */
    tahsilatGunu?: number;
    /**
     * Müşterinin HANGİ adres kartı — etiketiyle. Verilmezse varsayılan kart.
     * Bölge adresten türediği için ikinci rotanın siparişi ancak bu seçimle doğar.
     */
    adresEtiketi?: string;
    /**
     * Siparişi taşıyan kuryenin kişi anahtarı (varsayılan `kurye` — Marc).
     * Sefer kuryesi siparişlerin kuryesinden geliyor (`seedDeliveryRuns`), yani bu alan aynı
     * zamanda "bu gün hangi hesabın sefer ekranı dolu olacak" sorusunun cevabı.
     */
    kuryeAnahtari?: string;
    /**
     * Kurye ATANMIŞ ama sipariş henüz yola çıkmamış. Sevkiyatçının sabah yaptığı işin sonucu budur
     * ve gün planı ekranı (09.15) tam bu aralıkta çalışır — hâl seed'de hiç doğmuyordu.
     */
    atanmis?: boolean;
    /**
     * Siparişin ÇIKTIĞI depo. Varsayılan ana depo; `kehl`/`colmar` verildiğinde partiler de oradan
     * seçilir. Tek depolu bir veri setinde depo süzgecini unutan sorgu DOĞRU cevap verir ve hata
     * görünmez (CLAUDE.md §1) — ikinci deponun siparişi o kör noktayı açar.
     */
    depo?: 'str' | 'kehl' | 'colmar';
    /** Müşteriye GERİ ÖDENEN tutar — `order_refund` hareketi; ödeme durumu `refunded`'a döner. */
    iade?: number;
    /**
     * Kargoya verilmiş sipariş: taşıyıcı + takip numarası (`setShipment`).
     *
     * Yalnız `shipping` siparişe yazılabilir — kural VERİDE (`order_carrier_only_shipping`).
     * Her kargo siparişine yazılMAZ: "kargoya verilmedi henüz" da bir hâldir ve müşteri sipariş
     * detayında takip kutusunun boş hâli de görünmelidir.
     */
    tasiyici?: { carrier: 'colissimo' | 'chronopost' | 'dhl' | 'ups' | 'other'; takipNo: string | null };
    etiket: string;
  }): Promise<string | null> {
    // ── `extend` KATMANI: "bir miktar geçmiş" (kullanıcı kararı 16.08, künye `tier.ts`) ──────────
    // Tavana varınca sipariş HİÇ AÇILMAZ ve `null` döner. Bu sessiz bir kayıp değil: dönüş tipi
    // zaten `string | null` ve her çağıran onu bekliyor (`kalemDuzelt` ilk satırında kontrol
    // ediyor) — çünkü bilinmeyen müşteri hâli için o sözleşme zaten vardı. Kesim SIRA ile yapılıyor,
    // seçmeyle değil: aşağıdaki liste en temel senaryolardan (tam yolun durakları) başlıyor ve
    // uzmanlaşarak gidiyor, yani baştan kesmek "tipik olanı tut, istisnaları bırak" demek.
    if (siparisTavani !== null && acilanSiparis >= siparisTavani) return null;
    acilanSiparis += 1;
    const customerId = kisiler.get(opts.musteri);
    // SESSİZ `return null` DEĞİL (yaşandı 07.08): bilinmeyen bir müşteri anahtarı yazıldığında —
    // benim `b2cYeni` yazım hatam — iki sipariş hiç doğmadı ve seed "tamam" dedi. Yerel veri
    // sessizce eksik kaldı; eksiklik ancak ekranda bir bölümün hiç dolmamasıyla fark edilirdi ve
    // orada da sebebi seed sanılmazdı. Yazım hatası gürültü çıkarmalı.
    if (!customerId) throw new Error(`seed: bilinmeyen müşteri anahtarı "${opts.musteri}" (${opts.etiket})`);

    const adres = await siparisAdresi(customerId, opts.adresEtiketi);
    // KAPI ÖNÜ satışının teslimat türü `pickup`tır ve SORULMAZ, kaynaktan TÜRETİLİR (26.08):
    // ikisi ayrı yazılsaydı bir gün ayrışırlardı. Kayıt `route` derken teslimatın öteki tüm izleri
    // (gün, bölge, kurye) zaten boş bırakılıyordu — yani satır kendi içinde çelişiyordu ve teslimat
    // türüne bakan her okuma kapı önü satışını bir ROTA teslimatı sayıyordu. Gerçek yol (yerinde
    // satış, `on-site-sale.ts`) `pickup` yazıyor; seed de artık aynısını söylüyor.
    const kapiOnu = opts.kaynak === 'door';
    const deliveryType = kapiOnu ? 'pickup' : (opts.deliveryType ?? 'route');
    const zone =
      deliveryType === 'route'
        ? zones.find((z) => adres && z.postalCodes.some((c) => c.postalCode === adres.postalCode && c.country === adres.country))
        : undefined;
    // Teslim günü siparişin yaşıyla TUTARLI olmalı: 45 gün önce açılmış bir siparişin teslimatı iki
    // gün sonrasına düşemez. Geçmiş günler ayrıca kurye gün kapanışının zeminidir — hepsi aynı güne
    // yığılırsa tek bir kapanış satırı çıkar ve mutabakat ekranı tek satırla denenir.
    const teslimKaydirma = opts.teslimGunu ?? (opts.yasi ? -opts.yasi + 1 : 2);
    const indirim = opts.kupon ? (kuponlar.get(opts.kupon) ?? null) : null;
    const indirimTutari = indirim ? (opts.kuponTutari ?? 0) : 0;
    // KAPI ÖNÜ satışında teslimat YOKTUR: müşteri malı elden aldı. Teslim günü ve kurye yazmak,
    // o satışı bir SEFERE bağlar (`seedDeliveryRuns` kuryeli+günlü rota siparişlerini damgalar,
    // kapanış da seferin tahsilatını sayar) ve kuryeden hiç taşımadığı bir paranın hesabı sorulur.
    const depoId = opts.depo === 'kehl' ? depolar.kehl : opts.depo === 'colmar' ? depolar.colmar : depolar.str;
    // Siparişi taşıyan kurye — anahtar verilmezse Marc. Bilinmeyen anahtar SESSİZ GEÇMEZ: kurye
    // `null` kalsaydı sipariş hiçbir sefere bağlanmaz ve eksiklik yalnız boş bir ekranla görünürdü.
    const siparisKuryesi = opts.kuryeAnahtari
      ? (kisiler.get(opts.kuryeAnahtari) ?? null)
      : kurye;
    if (opts.kuryeAnahtari && !siparisKuryesi) {
      throw new Error(`seed: bilinmeyen kurye anahtarı "${opts.kuryeAnahtari}" (${opts.etiket})`);
    }
    // TESLİMAT ÜLKESİ adresten gelir, varsayılandan değil: Almanya'ya giden bir siparişi `FR`
    // bırakmak hem OSS eşiği izlemini hem vergi modelini sessizce yanlışlar.
    const teslimUlkesi = adres?.country ?? 'FR';
    // VERGİ MODELİ MOTORUN kararı (`resolveVatTreatment`): DE + B2B + doğrulanmış KDV no →
    // reverse charge (%0 + "Autoliquidation" ibaresi). Seed kuralı kendi hesaplamaz, sorar —
    // yoksa aynı karar iki yerde yaşar ve bir gün ayrışır.
    const vergi = resolveVatTreatment({
      channel: opts.channel,
      deliveryCountry: teslimUlkesi,
      vatNumberValid: profiller.get(customerId)?.vatNumberValid ?? undefined,
    });

    // İNDİRİMİN KALEM PAYI (07.4 / d931a0e ile aynı kural). Yalnız başlığa yazmak yetmez: ödeme
    // motoru "müşteri ne kadar borçlu" sorusunu kalemlerden topluyor ve payı 0 gördüğü sürece
    // indirimi ödenmemiş bakiye sayıyor. Seed bunu atlayınca her `db:reset`, tamamı ödenmiş ama
    // `payment_status='partial'` görünen siparişler üretiyordu — ve o siparişlerin maili müşteriye
    // "kapıda şu kadar ödenecek" diyordu.
    const paylar = distributeDiscount(
      opts.kalemler.map((k) => Math.round(k.unitPrice * 100) * k.qty),
      Math.round(indirimTutari * 100),
    );

    const { order, items } = await orders.create(
      {
        customerId,
        // Sipariş TEK depodan çıkar (DOMAIN §17). Kaynağı ya adresin bölgesi ya kapı önü satışta
        // personelin sabit deposudur — seed'de ikisi de STR: bölgelerin üçü de oraya bağlı ve
        // kapıdaki satış ana depoda yapılıyor. Partiler de o depodan seçilecek (DB kısıtı tutar).
        warehouseId: depoId,
        deliveryCountry: teslimUlkesi,
        vatTreatment: vergi.treatment,
        channel: opts.channel,
        orderSource: opts.kaynak ?? 'web',
        deliveryType,
        // Bölge ve teslim günü artık TÜRE bakıyor, kaynağa değil: `pickup`ta bölge zaten hiç
        // aranmıyor (yukarıdaki `zone`) ve teslim günü yok. Ayrıca `kapiOnu` sormak aynı olguyu
        // ikinci kez tanımlamak olurdu.
        deliveryZoneId: zone?.id ?? null,
        deliveryDate: deliveryType === 'route' ? gun(teslimKaydirma) : null,
        discountId: indirim,
        discountAmountCents: toCents(indirimTutari),
        discountLabel: indirim ? (kuralEtiketi.get(indirim) ?? null) : null,
        locale: profiller.get(customerId)?.preferredLanguage ?? null,
        addressId: adres?.id ?? null,
        /* KOPYA, GERÇEK CHECKOUT'UN YAZDIĞI KADAR OLMALI (21.08). Burada dört alan yazılıyordu —
           `line1/postalCode/city/country` — oysa `checkout-draft` adresin TAMAMINI kopyalıyor
           (`addressSnapshot: { ...address }`). Fark sessizdi ve bir ekranı yerelde ölçülemez
           bırakıyordu: alıcı adı ile adres telefonu kopyaya hiç girmediği için sipariş detayı her
           siparişte "hesap sahibine düşüldü" yazıyordu. Seed'in kendi kuralı da bunu söylüyor
           (`seedAddresses`: *"Kalanlar TAM DOLU — kurye ekranı ve fatura, eksik alanla test
           edilirse yalancı bir sonuç verir"*).

           `label` de kopyaya girer: kargo künyesinde işletme adı ("Dükkân") alıcı adının üstünde
           yazar ve o satır adresin kendisine aittir, hesabın adına değil. */
        addressSnapshot: adres
          ? {
              label: adres.label,
              recipient: adres.recipient,
              line1: adres.line1,
              line2: adres.line2,
              postalCode: adres.postalCode,
              city: adres.city,
              phone: adres.phone,
              country: adres.country,
              /* KOORDİNAT DA KOPYAYA GİRER (11.9 · 31.08) — ve bu, yukarıdaki künyenin ikinci kez
                 yaşanmış hâli: `checkout-draft` adresin TAMAMINI yayıyor (`{ ...address }`), yani
                 gerçek sipariş noktayı taşıyor; seed dört alan daha eksik yazınca rota sıralaması
                 snapshot'ta nokta bulamayıp posta kodu MERKEZİNE düşüyordu (ölçüldü: 9 duraklı
                 kuzey hattı `precision: postal_centroid` yazdı, oysa 20 adresin 20'si noktalıydı).
                 Fark yine sessizdi — sıra üretildi, yalnız yanlış çözünürlükte. */
              lat: adres.lat,
              lng: adres.lng,
              geoPrecision: adres.geoPrecision,
              geoSource: adres.geoSource,
            }
          : null,
        // Kurye YOLA ÇIKMIŞ siparişte kendiliğinden yazılır; `atanmis` ise sevkiyatçının SABAH yaptığı
        // atamayı kurar. Bu ikisi ayrı hâllerdir ve gün planı ekranı (09.15) tam aralarında çalışır:
        // "atandı ama henüz çıkmadı" seed'de hiç doğmuyordu, ekranın en kalabalık hâli görülemiyordu.
        courierId:
          !kapiOnu && (opts.atanmis || ['out_for_delivery', 'delivered', 'completed', 'returned'].includes(opts.hedef))
            ? siparisKuryesi
            : null,
        onAccount: opts.onAccount ?? false,
        paymentMethod: opts.paymentMethod ?? null,
        isGiftOrder: opts.hediye ?? false,
        // Seed'in kendi aritmetiği EURO kalıyor (okunurluk: "7 + i*1.6"); çevrim servis sınırında,
        // ortak `toCents` ile (02.9 · STACK §8). Paylar zaten cent — motor öyle döndürüyor.
        shippingFeeCents: toCents(opts.kargo ?? 0),
        totalCents: toCents(toplam(opts.kalemler, opts.kargo ?? 0) - indirimTutari),
      },
      opts.kalemler.map((k, i) => ({
        variantId: k.variantId,
        qty: k.qty,
        vatRate: k.vatRate,
        unitPriceCents: toCents(k.unitPrice),
        // İZ YARIM YAZILMAZ — ikisi birlikte ya da hiç (`order_item_negotiation_complete`).
        // Pazarlığı YAZAN personel kimliği gerçek olmalı: kolon `user_profiles`e `restrict` FK.
        ...(k.listeFiyati != null && pazarlikciId
          ? { listUnitPriceCents: toCents(k.listeFiyati), priceSetBy: pazarlikciId }
          : {}),
        lineDiscountAmountCents: paylar[i] ?? 0,
      })),
    );

    // Kullanım kaydı BURADA YAZILMAZ — `OrderService.create` siparişin `discountId`'sinden türetiyor
    // (09.6). Eskiden seed onu elle yazıyordu çünkü uygulama yolunda yazan yoktu; artık ikinci bir
    // yazım tekil indekse (`discount_use_order_key`) çarpardı ve seed'in kaydı, gerçek yolun test
    // edilmediği yeri gizlerdi.

    // Yaşlandırma: vade gecikmesi ve "eski sipariş" ancak geçmiş tarihli kayıtta görünür.
    if (opts.yasi) await orders.update({ id: order.id, createdAt: an(-opts.yasi) });
    // Fatura numarası DIŞARIDA doğar, sistem yalnız eşleştirir (12.7) — burada eşleşmiş hâli kurulur.
    if (opts.faturaNo) await orders.update({ id: order.id, invoiceNo: opts.faturaNo });
    // Kargo bilgisi KAPIDAN geçer (`setShipment`): "rota siparişine taşıyıcı yazılamaz" kuralı hem
    // serviste hem veride duruyor, doğrudan `update` o kapıyı atlardı.
    if (opts.tasiyici) await orders.setShipment(order.id, opts.tasiyici.carrier, opts.tasiyici.takipNo);

    // Hızlı satış AYRI YOLDUR: rezervasyon yok, fiiliden anında düşer (07.10).
    if (opts.kaynak === 'door' && opts.hedef === 'completed') {
      const picks = [];
      for (const item of items) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, item.qty, depoId) });
      const sonuc = await orders.quickSale({
        orderId: order.id,
        picks,
        actorId: depocu,
        // Referans MOTORDAN gelir (biçim tek yerde tanımlı); hızlı satışta ilk kalıcı durum `completed`.
        referenceNo: generateReferenceNo({ year: new Date().getFullYear() }),
        paymentMethod: opts.paymentMethod ?? 'cash',
      });
      // Tahsilat AYRI yazılır (12.2): kapı önü nakdi kasanın bakiyesine de düşsün. Durum da
      // hareketten türetilir — üretimde bunu kapı yapar (`lib/order/quick-sale`), seed onu taklit eder.
      if (sonuc.ok) {
        await tahsilatYaz(order.id, toCents(opts.tahsilat ?? toplam(opts.kalemler)), 'order_payment', opts.tahsilatGunu);
        await odemeDurumuTazele(order.id);
      }
      console.log(`  ✓ ${opts.etiket} · ${sonuc.ok ? 'kapandı' : `atlandı (${sonuc.reason})`}`);
      return order.id;
    }

    if (opts.hedef === 'draft') {
      // Online checkout başlamış, ödeme bekleniyor: rezervasyon TTL'li (süre dolarsa cron bırakır).
      for (const item of items) await reservations.reserve({ orderId: order.id, variantId: item.variantId, warehouseId: depoId, qty: item.qty, ttlMinutes: opts.ttlDk ?? 30 });
      console.log(`  ✓ ${opts.etiket} · taslak (TTL'li rezervasyon)`);
      return order.id;
    }

    // Tam yol: önce ayır (kapıda/vadeli → süresiz), sonra ilerlet.
    for (const item of items) await reservations.reserve({ orderId: order.id, variantId: item.variantId, warehouseId: depoId, qty: item.qty });

    // İptal/iade kendi hedefine doğrudan gitmez: siparişin oraya gelmiş olması gerekir. İptal
    // `confirmed`'dan, iade ise teslim SONRASINDAN olur — yol farkı budur (ORDER_LIFECYCLE).
    const durak: OrderStatus[] =
      opts.hedef === 'cancelled'
        ? ['confirmed']
        : opts.hedef === 'returned'
          ? ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']
          : TAM_YOL.slice(0, TAM_YOL.indexOf(opts.hedef as OrderStatus) + 1);

    let onceki: OrderStatus = 'draft';
    for (const hedef of durak) {
      /* Mühür siparişi zaten HAZIR yaptıysa `ready` adımı atlanır (kutu kapısının künyesi). */
      if (hedef === onceki) continue;
      if (hedef === 'preparing') {
        /*
          ── HAZIRLIK KUTUYLA YAPILIR (kullanıcı kararı 30.08) ──────────────────────────────────
          Eskiden `recordPreparation` doğrudan çağrılıyordu ve sipariş KUTUSUZ hazırlanmış oluyordu.
          Ölçüldü: 44 rota siparişinin 41'i kutusuzdu — yani seed, sistemin kapattığı bir yolu her
          koşuda yeniden üretiyordu. Mal kutuya konur, kutu mühürlenir; hazırlığın kaydı da o
          mühürdür (`sealBox` = kutu + picks TEK transaction).

          TEK KUTU, TÜM KALEMLER: seed'in işi kutu ÇEŞİTLİLİĞİ değil, kutulu olmanın kendisi. Çok
          kutulu ve yarım kutulu hâller aşağıda kendi bloklarında kuruluyor (`yuklemeSiparisi`,
          kutu döngüsü) ve onlar bilinçli fikstürlerdir.

          KAPI SATIŞI BU YOLDAN GEÇMEZ (`pickup`): orada hazırlık adımı yok, mal tezgâhtan gider.
        */
        const picks = [];
        for (const item of items) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, item.qty, depoId) });
        await orders.transition({ orderId: order.id, from: onceki, to: 'preparing', actorId: depocu });
        const kutu = await openBox(db, { orderId: order.id, warehouseId: depoId });
        if (kutu.status !== 'ok') throw new Error(`seed: kutu açılamadı (${opts.etiket} · ${kutu.status})`);
        /*
          YARIM KALMIŞ HAZIRLIK = AÇIK KUTU (30.08). Hedefin kendisi `preparing` ise depocu
          toplamaya başlamış ama bitirmemiştir — kutu açık kalır, mühür vurulmaz ve sipariş
          `preparing`te bekler. Kutulu akıştan ÖNCE bu hâl "picks yazıldı ama ready olmadı"
          demekti; artık fiziksel karşılığı var ve seed onu üretiyor (kova: `Sipariş — durum
          → preparing`).
        */
        if (opts.hedef === 'preparing') {
          onceki = 'preparing';
          continue;
        }
        const muhur = await sealBox(db, { boxId: kutu.box.boxId, warehouseId: depoId, picks, actorId: depocu });
        if (muhur.status !== 'ok') throw new Error(`seed: kutu mühürlenemedi (${opts.etiket} · ${muhur.status})`);
        /* Mühür siparişi HAZIR yapar (tek kutuda Σ = karşılanan). Sonraki `ready` adımı artık
           yazılmamalı — `from` uyuşmazdı ve geçiş sessizce düşerdi. */
        onceki = muhur.ready ? 'ready' : 'preparing';
        continue;
      }
      if (hedef === 'delivered') {
        /*
          KANIT ŞEMAYA UYGUN YAZILIR (30.08). Eskiden `{ by, at, method: 'imza' }` yazılıyordu ve o
          şekil `DeliveryProofRecordSchema`nın HİÇBİR alanını karşılamıyordu — `kind` yok, yani
          kanıdı okuyan her yer "kanıt yok" görüyordu. Gün listesinin "imza var" satırı bu yüzden
          yerelde hiç doğmuyordu (ölçüldü: 18 siparişte kanıt kaydı vardı, hiçbiri tanınmıyordu).

          **Görsel KOVADA YOK:** seed dosya yüklemiyor, yalnız üretimin yazacağı anahtar biçimini
          yazıyor. Liste satırı yalnız "kanıt var mı" diye soruyor; görseli açan ekran o anahtarla
          boş döner ve bu, sahte bir görsel uydurmaktan dürüsttür.
        */
        await orders.deliver(order.id, {
          actorId: siparisKuryesi,
          deliveryProof: {
            kind: 'signature',
            imageKey: `delivery/proofs/${order.id}/signature.png`,
            receivedBy: null,
            courierId: siparisKuryesi,
            at: an(0),
          },
        });
        onceki = 'delivered';
        continue;
      }
      if (hedef === 'completed') {
        await orders.close(order.id, { actorId: depocu, routeUnitCostCents: 250, packagingUnitCostCents: 120 });
        onceki = 'completed';
        continue;
      }
      // Referans İLK KALICI DURUMDA doğar (tam yolda `confirmed`) — RPC mevcut numarayı ezmez.
      await orders.transition({
        orderId: order.id,
        from: onceki,
        to: hedef,
        actorId: depocu,
        referenceNo: hedef === 'confirmed' ? generateReferenceNo({ year: new Date().getFullYear() }) : null,
      });
      onceki = hedef;
    }

    if (opts.hedef === 'cancelled' || opts.hedef === 'returned') {
      await orders.transition({ orderId: order.id, from: onceki, to: opts.hedef, actorId: depocu });
      await reservations.releaseByOrder(order.id);
    }

    // Tahsilat bir HAREKETTİR (12.2): siparişteki `amount_*` ondan türer, doğrudan yazılmaz.
    if (opts.tahsilat) await tahsilatYaz(order.id, toCents(opts.tahsilat), 'order_payment', opts.tahsilatGunu);
    // GERİ ÖDEME de bir harekettir, ters yönlü. Ayrı bir "iade edildi" bayrağı yok ve olmamalı:
    // `payment_status='refunded'` tahsil edilenle iade edilenin FARKINDAN türer. İade hareketi
    // olmadan o durumu elle yazmak, parası hâlâ kasada duran bir siparişi iade edilmiş göstermekti.
    if (opts.iade) await tahsilatYaz(order.id, toCents(opts.iade), 'order_refund', opts.tahsilatGunu);
    // Ödeme durumu her hâlükârda tazelenir: tahsilatı olmayan sipariş de doğru durumda kalsın
    // (vadeli sipariş `pending`, iptal edilen `pending`…).
    await odemeDurumuTazele(order.id);

    console.log(`  ✓ ${opts.etiket} · ${opts.hedef}`);
    return order.id;
  }

  // — Tam yolun her durağı (depo/kurye kuyrukları dolsun)
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(0, 2), kalem(1, 1)], hedef: 'draft', channel: 'b2c', paymentMethod: 'online', etiket: 'Ödeme bekleyen checkout' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(2, 3)], hedef: 'confirmed', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, etiket: 'Onaylı — kapıda ödeyecek' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(3, 8), kalem(4, 6), kalem(5, 4)], hedef: 'preparing', channel: 'b2b', onAccount: true, etiket: 'Depoda hazırlanıyor (toptan)' });
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(6, 2)], hedef: 'ready', channel: 'b2c', paymentMethod: 'card', tahsilat: 0, etiket: 'Hazır — sevkiyat bekliyor' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(7, 5), kalem(8, 5)], hedef: 'out_for_delivery', channel: 'b2b', onAccount: true, etiket: 'Yolda (kuryede)' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(9, 2), kalem(10, 1)], hedef: 'delivered', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, etiket: 'Teslim edildi — kapıda tahsilat bekliyor' });

  // — Kapanmış siparişler (kâr raporunun girdisi)
  // Fatura numarası eşleşmiş: 12.7 kuyruğunun BOŞALMIŞ hâli de ekranda görülebilsin.
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(11, 3)], hedef: 'completed', channel: 'b2c', paymentMethod: 'online', tahsilat: toplam([kalem(11, 3)]), yasi: 12, faturaNo: 'FA-2026-0117', etiket: 'Kapandı — online ödenmiş (faturası eşleşti)' });
  await siparis({ musteri: 'b2cAlman', kalemler: [kalem(12, 2)], hedef: 'completed', channel: 'b2c', deliveryType: 'shipping', kargo: 7.9, paymentMethod: 'online', tahsilat: toplam([kalem(12, 2)], 7.9), yasi: 20, etiket: 'Kapandı — DE kargo (OSS izlemi)' });

  // — Vadeli: AÇIK BAKİYE ve GECİKME türetiminin öznesi (ödenmemiş, biri vadesi geçmiş)
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(13, 10), kalem(14, 6)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: 0, yasi: 45, etiket: 'Vadeli — GECİKMİŞ (45 gün)' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(15, 4)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: 0, yasi: 10, etiket: 'Vadeli — henüz vadesi dolmadı' });
  await siparis({ musteri: 'b2bAlman', kalemler: [kalem(16, 6)], hedef: 'completed', channel: 'b2b', onAccount: true, tahsilat: euro(toplam([kalem(16, 6)]) / 2), yasi: 8, etiket: 'Vadeli — KISMİ ödenmiş' });

  // — Hızlı satış (kapı önü): tek adımda kapanır, rezervasyon yok
  // PAZARLIKLI kapı önü satışı (26.08): liste 22,20 €, kapıda 20,00 €'ya verilmiş — 2,20 € taviz.
  // Yerel veride bu izin BİR örneği olmalı, yoksa "taviz" sütunu hiçbir ekranda dolu görünmez ve
  // pazarlık izi ancak testte yaşar. Taviz KAMPANYA DEĞİLDİR: `line_discount_amount`a girmez.
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [{ ...kalem(17, 2), unitPrice: 20, listeFiyati: 22.2 }], hedef: 'completed', channel: 'b2c', kaynak: 'door', paymentMethod: 'cash', etiket: 'Hızlı satış — kapı önü (nakit, PAZARLIKLI)' });
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(18, 1), kalem(19, 2)], hedef: 'completed', channel: 'b2c', kaynak: 'door', paymentMethod: 'card', etiket: 'Hızlı satış — kapı önü (kart)' });

  // — Patron ikramı: parayı patron öder, gelir/kâr/kasa TAM normal — yalnız muhasebe export'una
  // girmez (DOMAIN §9). Export özetinde "hariç tutulan" satırı bununla dolar.
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(24, 2)], hedef: 'completed', channel: 'b2c', paymentMethod: 'cash', tahsilat: toplam([kalem(24, 2)]), yasi: 6, hediye: true, etiket: 'Patron ikramı (export dışı)' });

  // — İptal ve iade
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(20, 2)], hedef: 'cancelled', channel: 'b2c', paymentMethod: 'online', tahsilat: 0, etiket: 'İptal' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(21, 3)], hedef: 'returned', channel: 'b2b', onAccount: true, tahsilat: 0, etiket: 'İade sürecinde' });

  // — WhatsApp ve elle giriş: kaynak ekseni kanaldan bağımsızdır (CHANNELS §2)
  await siparis({ musteri: 'b2bBekleyen', kalemler: [kalem(22, 4)], hedef: 'confirmed', channel: 'b2c', kaynak: 'whatsapp', paymentMethod: 'cash', tahsilat: 0, etiket: 'WhatsApp siparişi' });
  await siparis({ musteri: 'b2cAlman', kalemler: [kalem(23, 3)], hedef: 'preparing', channel: 'b2c', kaynak: 'manual', deliveryType: 'shipping', kargo: 7.9, paymentMethod: 'bank_transfer', etiket: 'Telefondan elle girilen sipariş' });

  // — KUPONLU siparişler (0031): indirim siparişe yazılır, kullanım kaydı `discount_use`'a düşer.
  // Kuponun "kaç kez kullanıldı / hakkı kaldı mı" hâli ancak GERÇEK kullanım satırlarıyla görünür.
  const kuponluKalemler = [kalem(25, 3), kalem(26, 2)];
  await siparis({
    musteri: 'b2cSadik', kalemler: kuponluKalemler, hedef: 'completed', channel: 'b2c', paymentMethod: 'online',
    kupon: 'HOSGELDIN10', kuponTutari: euro(toplam(kuponluKalemler) * 0.1),
    tahsilat: euro(toplam(kuponluKalemler) * 0.9), yasi: 9, etiket: 'Kuponlu — %10 sepet indirimi',
  });
  // TEK HAKLI kuponu tüketen sipariş: bundan sonra aynı kod "hakkınız kalmadı" demeli.
  await siparis({
    musteri: 'b2cAlman', kalemler: [kalem(27, 2)], hedef: 'delivered', channel: 'b2c', paymentMethod: 'card',
    kupon: 'TEKSEFER', kuponTutari: 8, tahsilat: 0, teslimGunu: -1, etiket: 'Kuponlu — TEK HAKLI kupon tükendi',
  });
  // Kişiye özel kupon (puan çevriminden doğanların elle kurulmuş kardeşi).
  await siparis({
    musteri: 'b2cSadik', kalemler: [kalem(28, 2)], hedef: 'confirmed', channel: 'b2c', paymentMethod: 'online',
    kupon: 'OZUR10', kuponTutari: 10, tahsilat: 0, etiket: 'Kuponlu — KİŞİYE ÖZEL kupon',
  });

  // — KISMİ İADE ve EKSİK TESLİM (0026 · 07.8/07.9) ─────────────────────────────────────────────
  // `fulfilled_qty` her siparişte sipariş adedine eşitse, "eksik geldi / geri döndü" ekranları hiç
  // denenemez. Üç akıbetin üçü de kurulur, çünkü üçü BAŞKA şeyler yapar:
  //   · restock  → mal stoğa döner (teslim SONRASI iade)
  //   · discard  → mal yok sayılır, hasar olarak düşülür (teslim ÖNCESİ eksik/hasar)
  //   · goodwill → mal geri istenmez, kalem yalnız işaretlenir (jest)
  /** Siparişin ilk kalemini kısmen karşılanmış hâle getirir. */
  async function kalemDuzelt(
    orderId: string | null,
    disposition: 'restock' | 'discard' | 'goodwill',
    eksik: number,
    note: string,
  ): Promise<void> {
    if (!orderId) return;
    const bulunan = await orders.getWithItems(orderId);
    const kalemi = bulunan?.items[0];
    if (!kalemi) return;
    const sonuc = await orders.adjustFulfillment(
      orderId,
      // `goodwill` miktarı DEĞİŞTİRMEZ — mal müşteride kalır, yalnız akıbeti işaretlenir.
      [{
        orderItemId: kalemi.id,
        fulfilledQty: disposition === 'goodwill' ? kalemi.fulfilledQty : Math.max(0, kalemi.fulfilledQty - eksik),
        returnDisposition: disposition,
        note,
      }],
      depocu,
    );
    // Kalem düzeltmesi PARAYI değiştirir: karşılanmayan kalem borcu düşürür, teslim sonrası iade
    // alacak doğurur. Durum motordan yeniden sorulmazsa sipariş "ödendi" görünmeye devam eder.
    await odemeDurumuTazele(orderId);
    console.log(`  ✓ kalem düzeltmesi (${disposition}) · ${sonuc.ok ? `stoğa ${sonuc.restockedQty} · imha ${sonuc.discardedQty} · bırakılan ${sonuc.releasedQty}` : sonuc.reason}`);
  }

  const iadeli = await siparis({
    musteri: 'b2cSadik', kalemler: [kalem(29, 4), kalem(30, 2)], hedef: 'delivered', channel: 'b2c',
    paymentMethod: 'cash', tahsilat: 0, teslimGunu: -2, etiket: 'Teslim edildi — bir kalemi geri gelecek',
  });
  await kalemDuzelt(iadeli, 'restock', 1, 'Müşteri bir kutuyu iade etti — ambalaj açılmamış, stoğa döndü.');

  const eksikCikan = await siparis({
    musteri: 'b2bOnayli', kalemler: [kalem(31, 6), kalem(32, 4)], hedef: 'ready', channel: 'b2b',
    onAccount: true, etiket: 'Hazır — bir kalem EKSİK çıktı (hazırlıkta hasar)',
  });
  await kalemDuzelt(eksikCikan, 'discard', 2, 'Hazırlıkta iki kutunun ambalajı yırtıldı — sevk edilemedi.');

  const jest = await siparis({
    musteri: 'b2cKapaliKapida', kalemler: [kalem(33, 2)], hedef: 'completed', channel: 'b2c',
    paymentMethod: 'cash', tahsilat: toplam([kalem(33, 2)]), yasi: 4, etiket: 'Kapandı — şikâyete jest yapıldı',
  });
  await kalemDuzelt(jest, 'goodwill', 0, 'Müşteri memnun kalmadı; mal geri istenmedi, bedeli iade edildi.');

  // — KURYE GÜNÜ: kapanış mutabakatı (0032) ancak AYNI GÜNE, AYNI KURYEYE düşen kapıda ödemeli
  // siparişler varsa denenebilir. Aşağıdaki üç sipariş dünün gününü doldurur; biri kart, ikisi nakit.
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(34, 2)], hedef: 'completed', channel: 'b2c', paymentMethod: 'cash', tahsilat: toplam([kalem(34, 2)]), teslimGunu: -1, yasi: 3, etiket: 'Kurye günü (dün) — nakit tahsil' });
  await siparis({ musteri: 'b2bOnayli', kalemler: [kalem(35, 5)], hedef: 'completed', channel: 'b2b', paymentMethod: 'card', tahsilat: toplam([kalem(35, 5)]), teslimGunu: -1, yasi: 3, etiket: 'Kurye günü (dün) — kart tahsil' });
  // ÇEK: kapanış ekranının üçüncü sütunu (nakit · kart · çek) ancak çekle ödenen bir teslimat varsa dolar.
  await siparis({ musteri: 'b2bBekleyen', kalemler: [kalem(38, 4)], hedef: 'completed', channel: 'b2b', paymentMethod: 'cheque', tahsilat: toplam([kalem(38, 4)]), teslimGunu: -1, yasi: 3, etiket: 'Kurye günü (dün) — ÇEK tahsil' });
  // Aynı güne düşen ama SONUÇLANMAMIŞ sipariş: kapanışın "devreden" listesi boş kalmasın.
  await siparis({ musteri: 'b2cKapaliKapida', kalemler: [kalem(36, 1)], hedef: 'out_for_delivery', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, teslimGunu: -1, etiket: 'Kurye günü (dün) — DEVREDEN (ulaşılamadı)' });
  // Bir gün öncesi: kapanışı yapılmamış İKİNCİ gün — "açık gün" uyarısı görünsün.
  await siparis({ musteri: 'b2cSadik', kalemler: [kalem(37, 3)], hedef: 'completed', channel: 'b2c', paymentMethod: 'cash', tahsilat: toplam([kalem(37, 3)]), teslimGunu: -2, yasi: 4, etiket: 'Kurye günü (2 gün önce) — kapanış BEKLİYOR' });

  // — BUGÜNÜN GÜN PLANI: sevkiyatçı ekranı (09.15) ─────────────────────────────────────────────
  // Seed'in teslim günleri BUGÜNE GÖRE üretiliyor ama hepsi geçmişe ya da +2'ye düşüyordu; yani
  // `db:refresh`ten hemen sonra bile "bugün" boştu ve ekran ölü görünüyordu (ölçüldü 07.08: en yeni
  // teslim günü dünde kalmıştı). Aşağıdaki blok bugünü doldurur ve ekranın HER HÂLİNİ üretir —
  // atanmamış, atanmış, hazırlanıyor, hiç başlanmamış, kapıda ödemeli, önceden ödenmiş.
  //
  // Bölge AYRIMI önemli: müşteriler farklı posta kodlarında olduğu için satırlar iki ayrı bölge
  // grubuna düşer. Tek gruba yığılsaydı gruplama doğru görünür ama hiç sınanmamış olurdu.
  await siparis({
    musteri: 'b2cSadik', kalemler: [kalem(40, 2)], hedef: 'ready', channel: 'b2c', paymentMethod: 'cash',
    tahsilat: 0, teslimGunu: 0, etiket: 'Bugün — hazır, ATANMAMIŞ (kapıda nakit)',
  });
  await siparis({
    musteri: 'b2bOnayli', kalemler: [kalem(41, 4)], hedef: 'ready', channel: 'b2b', paymentMethod: 'card',
    tahsilat: 0, teslimGunu: 0, atanmis: true, kuryeAnahtari: 'hepsi',
    etiket: 'Bugün — hazır ve ATANMIŞ, henüz yola çıkmadı',
  });
  // Hazırlığı SÜREN sipariş: gün planındaki "Hazırlanıyor" kademesi ancak böyle görünür.
  await siparis({
    musteri: 'b2cKapaliKapida', kalemler: [kalem(42, 1)], hedef: 'preparing', channel: 'b2c', paymentMethod: 'cash',
    tahsilat: 0, teslimGunu: 0, etiket: 'Bugün — HAZIRLANIYOR (araca yüklenmemeli)',
  });
  // Hiç başlanmamış: "Hazır değil" uyarısının kaynağı. İkisi ayrı hâl — biri beklemeye değer, öteki
  // müdahale ister; ekran ikisini ayrı rozetle söylüyor.
  // Müşteri BÖLGESİ OLAN biri olmalı: `b2cAlman` (Offenburg 77652) hiçbir rota bölgesinde değil ve
  // ona rota siparişi yazmak, checkout'un asla üretemeyeceği bir veri olurdu (`isInRoute` onu kargoya
  // düşürür). Ölçüldü 07.08: gün planında "Bölgesi çözülemedi" grubunda tek başına duruyordu —
  // ekranın veri-sorunu grubunu SAHTE bir satırla doldurmak, o grubu yalancı çıkarırdı.
  await siparis({
    musteri: 'b2bBekleyen', kalemler: [kalem(43, 3)], hedef: 'confirmed', channel: 'b2b', paymentMethod: 'online',
    tahsilat: toplam([kalem(43, 3)]), teslimGunu: 0, etiket: 'Bugün — HAZIR DEĞİL ama ödenmiş (kapıda para konuşulmaz)',
  });

  /* ── HATTIN UÇLARI: ROTA SIRASININ SINANABİLDİĞİ TEK VERİ (11.9 · 31.08) ────────────────────
     Yukarıdaki satırların hepsi Strasbourg merkez kodlarına düşüyor ve o üç kod GeoNames'te AYNI
     noktayı taşıyor (`0034:4298-4315`) — yani bütün duraklar tek noktaya çöküyor, motor haklı
     olarak "sıralayamadım" diyor (`indistinguishable`) ve hesap hiç sınanmıyordu.

     Bu üç satır günü gerçekten YAYIYOR: Haguenau (22 km) · Wissembourg (48 km) · Landau (71 km).
     Merkez duraklarla birlikte hat artık kuzeye doğru uzanıyor ve kapalı turun şekli görünür
     oluyor — depoya en yakın durağın en sona düşüp düşmediği ancak böyle okunabilir.

     Adres ETİKETLE seçiliyor: varsayılan kart hep merkez adresidir ve etiket verilmezse bu üç
     sipariş de merkeze düşerdi. */
  await siparis({
    musteri: 'b2cSadik', kalemler: [kalem(40, 1)], hedef: 'ready', channel: 'b2c', paymentMethod: 'cash',
    tahsilat: 0, teslimGunu: 0, adresEtiketi: 'Haguenau şubesi',
    etiket: 'Bugün — kuzey hattı, Haguenau (22 km)',
  });
  await siparis({
    musteri: 'b2bOnayli', kalemler: [kalem(41, 2)], hedef: 'ready', channel: 'b2b', onAccount: true,
    tahsilat: 0, teslimGunu: 0, adresEtiketi: 'Wissembourg bayi',
    etiket: 'Bugün — kuzey hattı, Wissembourg (48 km)',
  });
  await siparis({
    musteri: 'b2bAlman', kalemler: [kalem(42, 2)], hedef: 'ready', channel: 'b2b', onAccount: true,
    tahsilat: 0, teslimGunu: 0, adresEtiketi: 'Landau deposu',
    etiket: 'Bugün — kuzey hattı, Landau DE (71 km · sınır ötesi)',
  });

  /*
    ── BUGÜN TAHSİL EDİLEN PARA (30.08) ────────────────────────────────────────────────────────
    Para bölümünün iki ekranı da GÜNE bakıyor (`readMoneyOverview` / `readMoneyDayEnd` — ölçüt
    `value_date = bugün`), oysa seed'in bütün tahsilatları dün tarihliydi. Ölçüldü: `db:refresh`
    hemen ardından "bugün tahsil edilen" kırılımı BOŞ, gün sonu `collectedCents` SIFIR. Ekran
    boş değil YANLIŞ doluyordu — "bugün hiç para girmedi" diyordu.

    Üç yöntem birden, çünkü kırılım üç sütunlu (nakit · kart · çek) ve tek yöntemli bir gün o
    kırılımı hiç göstermez. Siparişler TESLİM EDİLMİŞ ve BUGÜNÜN AÇIK seferine bağlı: aynı satırlar
    "kuryenin üstündeki para"yı da dolduruyor (`delivery_run_collection` → kapanmamış sefer) —
    iki ekran aynı gerçeğin iki yüzü, iki ayrı fikstür yazmak onları ayrıştırırdı.
  */
  const bugunNakit = [bolKalem(0, 2)];
  const bugunKart = [bolKalem(1, 3)];
  const bugunCek = [bolKalem(2, 2)];
  await siparis({
    musteri: 'b2cSadik', kalemler: bugunNakit, hedef: 'delivered', channel: 'b2c', paymentMethod: 'cash',
    tahsilat: toplam(bugunNakit), teslimGunu: 0, tahsilatGunu: 0, kuryeAnahtari: 'hepsi',
    etiket: 'Bugün — teslim edildi, kapıda NAKİT tahsil',
  });
  await siparis({
    musteri: 'b2bOnayli', kalemler: bugunKart, hedef: 'delivered', channel: 'b2b', paymentMethod: 'card',
    tahsilat: toplam(bugunKart), teslimGunu: 0, tahsilatGunu: 0, kuryeAnahtari: 'hepsi',
    etiket: 'Bugün — teslim edildi, kapıda KART tahsil',
  });
  await siparis({
    musteri: 'b2bBekleyen', kalemler: bugunCek, hedef: 'delivered', channel: 'b2b', paymentMethod: 'cheque',
    tahsilat: toplam(bugunCek), teslimGunu: 0, tahsilatGunu: 0, kuryeAnahtari: 'hepsi',
    etiket: 'Bugün — teslim edildi, kapıda ÇEK tahsil',
  });

  /*
    ── BUGÜNÜN SEFERİNDE SONUÇLANMAMIŞ VE KISMİ DURAKLAR (30.08) ───────────────────────────────
    Kurye gün listesi durağı BEŞ ayrı kartla çiziyor (v3:14): teslim · kısmi · sıradaki · bekleyen ·
    ulaşılamadı. Yerelde yalnız ikisi doğuyordu. Ölçüldü: `returned` durumunda sipariş
    veritabanında HİÇ yoktu (21 rota siparişinin dağılımı `completed` 11 · `delivered` 7 ·
    `ready` 3) ve tek `out_for_delivery → ready` dönüşü DÜNKÜ seferde kalmıştı — yani "kabul
    etmedi" ve "ulaşılamadı" kartları bugünün ekranında hiç görülemiyordu.

    ÜÇÜ DE GERÇEK KAPIDAN geçiyor (`markUndelivered` · `confirmDoorDelivery`), durum elle
    yazılmıyor: kutu okutmasının aynı ilkesi — sonucun iddiası kapının kendi cevabı olsun. Elle
    yazılan bir durum, kapının reddedeceği bir hâli seed'de "olur" gösterirdi.

    NOTLAR SERBEST METİN çünkü sözleşme öyle istiyor (`MarkUndeliveredRequest.note`): sebebi
    standartlaştırmak sahada "yanlış ama düzgün" veri üretir. Ekran bu notu durak kartında yazıyor.
  */
  /*
    ULAŞILAMADI İŞARETİ BURADA DEĞİL, SEFER SEED'İNDE (30.08 · cihaz turunda yakalandı).

    İlk hâlde işaret burada yazılıyordu ve ARDINDAN gelen `seedDeliveryRuns` onu geri alıyordu:
    ulaşılamayan durak `ready`e döner, sefer başlatmanın catch-up claim'i de tam olarak `ready`
    durakları yola çıkarır — yani seed kendi kurduğu hâli bir adım sonra siliyordu. Ölçüldü:
    işaret yazılmış görünüyor ama gün sonunda o durak `out_for_delivery` kalıyordu.

    Sıra artık doğru: sefer kurulur → duraklar yola çıkar → biri ulaşılamadı olur (`courier.ts`).
    Bu, sahanın kendi sırası da: kurye önce yola çıkar, sonra kapıyı çalar.
  */

  const kabulEtmedi = await siparis({
    musteri: 'b2bOnayli', kalemler: [bolKalem(8, 2)], hedef: 'out_for_delivery', channel: 'b2b',
    onAccount: true, teslimGunu: 0, kuryeAnahtari: 'hepsi',
    etiket: 'Bugün — KABUL ETMEDİ işaretlenecek durak',
  });
  if (kabulEtmedi && turKuryesi) {
    const sonuc = await markUndelivered(db, {
      orderId: kabulEtmedi,
      courierId: turKuryesi,
      outcome: 'refused',
      note: 'Restoran kapalıydı, sorumlu teslim almadı',
    });
    if (sonuc.status !== 'ok') throw new Error(`seed: kabul etmedi işareti yazılamadı (${sonuc.status})`);
    console.log('  ✓ bugünün seferi: KABUL ETMEDİ durağı (mal depoya dönüyor)');
  }

  /*
    KISMİ TESLİM — teslim edilmiş ama bir kalemi eksik durak. `StopOutcome`de ayrı bir değer YOK ve
    olmayacak: kısmi bir geçiş değil, `delivered` durağın niteliğidir (`fulfilledQty < qty`). Ekran
    ½ kartını bu farktan çiziyor.

    B2C seçildi çünkü kanıt kapısı orada kapalı (`delivery_proof_required` → b2c: false) ve seed
    kovaya görsel yüklemiyor; B2B olsaydı kapı `proof_required` döner, seed dururdu.

    Tahsilat GÖNDERİLMİYOR: kapıda para alınmamış bir kısmi teslim de gerçek bir hâl ve borcu ekranda
    görünür kılıyor. Tutarı düşüren zaten düzeltmenin kendisi (07.8) — kurye ayrıca hesap görmez.
  */
  const kismi = await siparis({
    musteri: 'b2cKapaliKapida', kalemler: [bolKalem(9, 3)], hedef: 'out_for_delivery', channel: 'b2c',
    paymentMethod: 'cash', tahsilat: 0, teslimGunu: 0, kuryeAnahtari: 'hepsi',
    etiket: 'Bugün — KISMİ teslim (3 adedin 2\'si bırakıldı)',
  });
  if (kismi && turKuryesi) {
    const satirlar = await orders.getWithItems(kismi);
    const satir = satirlar?.items[0];
    if (!satir) throw new Error('seed: kısmi teslim siparişinin kalemi okunamadı');
    /* KAPIDA KUTULAR OKUTULUR (kullanıcı kararı 30.08): teslim kapısı artık kutusuz teslimi
       reddediyor ve seed de gerçek yolu izliyor — kodlar siparişin kendi kutularından. */
    const kutular = await new OrderBoxService(db).listByOrder(kismi);
    const sonuc = await confirmDoorDelivery(db, {
      orderId: kismi,
      courierId: turKuryesi,
      scannedBoxCodes: kutular.map((kutu) => kutu.code),
      // Hedef değer (fark değil): 3 sipariş edildi, 2'si bırakıldı. Kalan 1 adet araçta ve depoya
      // dönüyor — `restock`, çünkü mal hiç kapıdan girmedi ve satılabilir hâlde.
      adjustments: [
        {
          orderItemId: satir.id,
          fulfilledQty: satir.qty - 1,
          returnDisposition: 'restock',
          note: 'Müşteri bir adedi fazla buldu — araçta kaldı',
        },
      ],
    });
    if (sonuc.status !== 'ok') throw new Error(`seed: kısmi teslim yazılamadı (${sonuc.status})`);
    console.log(`  ✓ bugünün seferi: KISMİ teslim durağı (${satir.qty - 1}/${satir.qty} adet bırakıldı)`);
  }

  /*
    ── BUGÜNÜN İKİNCİ ROTASI: DÖNMÜŞ VE KAPANMIŞ SEFER (30.08) ─────────────────────────────────
    Gün sonu mutabakatı BUGÜNÜN kapanmış seferlerine bakıyor (`readMoneyDayEnd` → `listByDate`),
    ama seed bugünün seferini bilerek AÇIK bırakıyordu (araçtan satış açık sefer ister). İkisi aynı
    anda ancak iki rotayla mümkün: Strasbourg hâlâ yolda, Colmar döndü ve sayımı yapıldı.

    **Uydurma bir rota değil, zaten duran rota:** Colmar bölgesi 19.25'te açıldı ve bugüne dek hiç
    siparişi olmadı — çünkü tek Colmar adresi kimsenin VARSAYILAN adresi değil. `adresEtiketi` o
    kapıyı açıyor. Kurye Marc: deposu kapsamında Colmar var (`seed/people.ts`), yani seferi sürmesi
    veriyle tutarlı — ve bugünün Strasbourg rotasını sürmeyen kişi olması da gerçekçi.

    İki durak, ikisi de NAKİT: kapanışın nakit farkı ancak sayılacak bir nakit varsa anlamlı
    (`seedRunCloses` sayımı eksik yazacak — beklenen ↔ sayılan farkı oradan doğuyor).
  */
  if (colmarStoklu.length > 0) {
    for (const [n, adet] of [2, 3].entries()) {
      const kalemler = [colmarKalem(n, adet)];
      await siparis({
        musteri: 'b2cKapaliKapida', kalemler, hedef: 'delivered', channel: 'b2c', depo: 'colmar',
        adresEtiketi: 'Colmar evi', paymentMethod: 'cash', tahsilat: toplam(kalemler),
        teslimGunu: 0, tahsilatGunu: 0,
        etiket: `Bugün — COLMAR rotası, teslim edildi (nakit) #${n + 1}`,
      });
    }
  } else {
    // Sessizce atlamak yok: Colmar deposunun stoksuz kalması gün sonu mutabakatını da susturur.
    console.log('  ▸ COLMAR rotası atlandı: o depoda stoklu varyant yok — gün sonu farkı doğmayacak');
  }

  /*
    ── YARININ RESMİ (30.08) ───────────────────────────────────────────────────────────────────
    Gün özetinin `tomorrow` bloğu (sipariş · hazır · kapıda ödenecek) her koşuda SIFIR açılıyordu:
    seed'in varsayılan teslim kaydırması `+2`, yani yarın hiç iş yoktu. "Yarın 0 sipariş" bir ölçüm
    değil bir fikstür kazasıydı — ekran yarını boş gösteriyordu ve boşluğun sebebi görünmüyordu.
  */
  const yarinKapida = [bolKalem(3, 2)];
  await siparis({
    musteri: 'b2cSadik', kalemler: yarinKapida, hedef: 'ready', channel: 'b2c', paymentMethod: 'cash',
    tahsilat: 0, teslimGunu: 1, etiket: 'Yarın — HAZIR, kapıda nakit ödenecek',
  });
  await siparis({
    musteri: 'b2bOnayli', kalemler: [bolKalem(4, 4)], hedef: 'confirmed', channel: 'b2b', paymentMethod: 'card',
    tahsilat: 0, teslimGunu: 1, etiket: 'Yarın — onaylı, henüz hazırlanmadı',
  });

  // — KARGO KUYRUĞU: taşıyıcıya verilmeyi bekleyenler ──────────────────────────────────────────
  // Kargonun teslim GÜNÜ yoktur (şema: "rota günü; kargoda null"), o yüzden bu satırlar gün planına
  // değil KUYRUĞA düşer. İkisi bilerek farklı: biri takip numarasını almış, öteki almamış — ekranın
  // "takip numarası yok" uyarısı ancak eksik olan bir satır varsa sınanabilir.
  await siparis({
    musteri: 'b2cAlman', kalemler: [kalem(44, 1)], hedef: 'ready', channel: 'b2c', deliveryType: 'shipping', kargo: 7.9,
    paymentMethod: 'online', tahsilat: toplam([kalem(44, 1)], 7.9),
    tasiyici: { carrier: 'colissimo', takipNo: '6A14785236974' }, etiket: 'Kargo kuyruğu — takip numarası VAR',
  });
  await siparis({
    musteri: 'b2cSadik', kalemler: [kalem(45, 2)], hedef: 'ready', channel: 'b2c', deliveryType: 'shipping', kargo: 7.9,
    paymentMethod: 'online', tahsilat: toplam([kalem(45, 2)], 7.9),
    etiket: 'Kargo kuyruğu — takip numarası YOK (gün kapanmadan görünür eksiklik)',
  });

  // — SINIR ÖTESİ: teslimat ülkesi ve vergi modeli (0022 · DOMAIN §5) ────────────────────────────
  // Üç ayrı vergi hâli vardır ve üçü de FATURAYI değiştirir; hiçbiri kod tarafında seçilmez, motor
  // karar verir. Yerelde yalnız `domestic` bulunması, diğer ikisinin hiç görülmemesi demekti.
  //   · FR yurt içi        → normal KDV (zaten yukarıdaki siparişlerin hepsi)
  //   · DE + B2B + KDV no  → reverse charge: %0 + faturada "Autoliquidation"
  //   · DE + B2C           → normal KDV ama OSS eşiği izlemine girer
  await siparis({
    musteri: 'b2bAlman', kalemler: [kalem(39, 8), kalem(40, 6)], hedef: 'completed', channel: 'b2b',
    deliveryType: 'shipping', kargo: 12.5, onAccount: true, tahsilat: 0, yasi: 14,
    tasiyici: { carrier: 'dhl', takipNo: 'JJD0099887766554' },
    etiket: 'SINIR ÖTESİ B2B — reverse charge (Autoliquidation)',
  });
  await siparis({
    musteri: 'b2cAlman', kalemler: [kalem(41, 2)], hedef: 'out_for_delivery', channel: 'b2c',
    deliveryType: 'shipping', kargo: 9.9, paymentMethod: 'online', tahsilat: toplam([kalem(41, 2)], 9.9),
    tasiyici: { carrier: 'colissimo', takipNo: '6A 1234 5678 90' },
    etiket: 'DE B2C kargo — OSS eşiği izlemi (yolda)',
  });

  // — PARA İADESİ: `refunded` ödeme durumu tahsilat ile iadenin FARKINDAN türer ─────────────────
  // İki hâl ayrı ayrı gerekli: tamamı geri ödenmiş (iptal sonrası) ve kısmen geri ödenmiş (eksik
  // çıkan kalemin bedeli). Muhasebe listesinde ikisi farklı satırlardır.
  await siparis({
    musteri: 'b2cSadik', kalemler: [kalem(42, 2)], hedef: 'cancelled', channel: 'b2c',
    paymentMethod: 'online', tahsilat: toplam([kalem(42, 2)]), iade: toplam([kalem(42, 2)]), yasi: 7,
    etiket: 'İPTAL — parası TAMAMEN iade edildi (refunded)',
  });
  await siparis({
    musteri: 'b2cKapaliKapida', kalemler: [kalem(43, 3), kalem(44, 2)], hedef: 'completed', channel: 'b2c',
    paymentMethod: 'online', tahsilat: toplam([kalem(43, 3), kalem(44, 2)]), iade: euro(toplam([kalem(43, 3)]) / 3),
    yasi: 5, etiket: 'Kapandı — bir kalemin bedeli KISMEN iade edildi',
  });

  // — İKİNCİ DEPO: siparişin deposu bir boyut değil DEĞİŞMEZDİR (CLAUDE.md §1) ──────────────────
  // Tüm siparişler tek depodaysa, depo süzgecini unutan her sorgu doğru cevap verir ve hata
  // görünmez. Kehl siparişleri o kör noktayı açar: hazırlıkta parti seçimi de oradan yapılır, yanlış
  // deponun partisi RPC tarafından reddedilir.
  if (kehlStoklu.length >= 3) {
    await siparis({
      musteri: 'b2bAlman', kalemler: [kehlKalem(0, 4)], hedef: 'preparing', channel: 'b2b', depo: 'kehl',
      deliveryType: 'shipping', kargo: 6.5, onAccount: true, etiket: 'KEHL deposundan — hazırlanıyor',
    });
    await siparis({
      musteri: 'b2cAlman', kalemler: [kehlKalem(1, 2)], hedef: 'completed', channel: 'b2c', depo: 'kehl',
      deliveryType: 'shipping', kargo: 6.5, paymentMethod: 'online', tahsilat: toplam([kehlKalem(1, 2)], 6.5),
      tasiyici: { carrier: 'ups', takipNo: '1Z999AA10123456784' },
      yasi: 11, etiket: 'KEHL deposundan — kapandı',
    });
    // Kehl'de bekleyen taze sipariş: depo kuyruğu ikinci depoda da dolu görünsün.
    await siparis({
      musteri: 'b2bAlman', kalemler: [kehlKalem(2, 5), kehlKalem(3, 3)], hedef: 'confirmed', channel: 'b2b', depo: 'kehl',
      deliveryType: 'shipping', kargo: 6.5, onAccount: true, tahsilat: 0, etiket: 'KEHL deposundan — onaylı, kuyrukta',
    });
  } else {
    // Sessizce atlamak yok: ikinci deponun siparişsiz kalması bir VERİ hâlidir ve söylenmeli —
    // yoksa depo süzgeci kör noktası kapanmış sanılır.
    console.log(`  ▸ KEHL siparişleri atlandı: orada 8+ adetli parti yok (${kehlStoklu.length} varyant)`);
  }

  // — KUTU DÖNGÜSÜ (23.6): hazırlık kutu ekseninde de örneklenir ────────────────────────────────
  // Üç hâl coverage'ın zorunlu kovaları: KAPALI (ve yüklenmemiş) kutu, ÇOK KUTULU sipariş, AÇIK
  // kutu. Kutular GERÇEK kapılardan geçer (`openBox`/`sealBox` → `seal_order_box` RPC): Σ kutu =
  // karşılanan denetimi ve `ready` geçişi seed'de de sınanmış olur. Yukarıdaki siparişler kutusuz
  // kalır — çift akış bilinçli (0048 künyesi: kutusuz sipariş eski yoldan gider).
  {
    const strPicks = async (items: Array<{ id: string; variantId: string }>, adetler: number[]) => {
      const picks = [];
      for (const [i, item] of items.entries()) {
        const adet = adetler[i] ?? 0;
        if (adet > 0) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, adet, depolar.str) });
      }
      return picks;
    };

    const tekKutulu = await siparis({
      musteri: 'b2cSadik', kalemler: [kalem(45, 2), kalem(46, 1)], hedef: 'confirmed', channel: 'b2c',
      paymentMethod: 'cash', tahsilat: 0, etiket: 'KUTULU — tek kutu (kapalı, yüklenmemiş)',
    });
    if (tekKutulu) {
      const bulunan = await orders.getWithItems(tekKutulu);
      // TEK KUTULU sipariş FİZİKSEL TEST ETİKETİNİN kutusudur: kodu sabit (`KT-99-TESTKUTU01`),
      // çünkü kâğıda basılmış bir QR her `db:refresh` sonrası aynı kutuyu bulabilmeli. Kutu kodu
      // sonradan değiştirilemez (`OrderBoxUpdate` bilerek yalnız damga alanlarını alıyor), o yüzden
      // AÇILIŞ `openBox` kapısını atlar ve doğrudan kayıt yazar. Kuralın asıl sınandığı yer kapanış
      // (`sealBox` → `seal_order_box` RPC) ve o AYNEN geçerli; `openBox` kapısı da sınanmaya devam
      // ediyor — bir alttaki çok kutulu sipariş onu kullanıyor. Künye: `seed/test-labels.ts`.
      const kutu = { box: await new OrderBoxService(db).insert({
        orderId: tekKutulu, warehouseId: depolar.str, boxNo: 1, code: testLabelCode('kutu'),
      }) };
      if (!bulunan) throw new Error('seed kutu: tek kutulu açılamadı');
      const sonuc = await sealBox(db, {
        boxId: kutu.box.id, warehouseId: depolar.str,
        picks: await strPicks(bulunan.items, bulunan.items.map((i) => i.qty)), actorId: depocu,
      });
      // Sessiz eksik yok: kapanmayan kutu bir VERİ hâli değil seed arızasıdır (stok yetmedi vb.).
      if (sonuc.status !== 'ok' || !sonuc.ready) throw new Error(`seed kutu: tek kutulu kapanmadı (${sonuc.status})`);
    }

    const cokKutulu = await siparis({
      musteri: 'b2bOnayli', kalemler: [kalem(47, 6), kalem(48, 4)], hedef: 'confirmed', channel: 'b2b',
      onAccount: true, etiket: 'KUTULU — çok kutulu (biri açık)',
    });
    if (cokKutulu) {
      const bulunan = await orders.getWithItems(cokKutulu);
      const kutu1 = await openBox(db, { orderId: cokKutulu, warehouseId: depolar.str });
      if (!bulunan || kutu1.status !== 'ok') throw new Error('seed kutu: çok kutulunun ilk kutusu açılamadı');
      // Kutu 1: ilk kalem TAM + ikincinin yarısı — kalem iki kutuya bölünüyor, yani ikinci kutunun
      // kapanışı absolüt birleşim yolunu (0048 ⚠) fiilen kullanacak.
      const sonuc = await sealBox(db, {
        boxId: kutu1.box.boxId, warehouseId: depolar.str,
        picks: await strPicks(bulunan.items, bulunan.items.map((i, n) => (n === 0 ? i.qty : Math.max(1, Math.floor(i.qty / 2))))),
        actorId: depocu,
      });
      if (sonuc.status !== 'ok' || sonuc.ready) throw new Error(`seed kutu: çok kutulunun ilk kutusu beklenen hâlde değil (${sonuc.status})`);
      // Kutu 2 AÇIK bırakılır: masada dolduruluyor — yarım iş ekranı ve "açık kutu" kovası.
      const kutu2 = await openBox(db, { orderId: cokKutulu, warehouseId: depolar.str });
      if (kutu2.status !== 'ok') throw new Error('seed kutu: ikinci kutu açılamadı');
      console.log('  ✓ kutu döngüsü: tek kutu KAPALI + çok kutulu (1 kapalı · 1 açık) — hepsi yüklenmemiş');
    }

    /*
      ── BUGÜNÜN SEFERİNDE KUTULU DURAK (30.08) ────────────────────────────────────────────────
      Kapıda kutu okutma ve rampada yükleme sayacı ("1/3 bindi") ancak BUGÜNÜN seferine bağlı,
      kutuları olan bir durak varsa görülebiliyor. Ölçüldü: `order_box` satırlarının hiçbiri bugüne
      teslim edilecek bir siparişe ait değildi ve tek bir kutu bile yüklenmemişti — kurye
      ekranlarının kutu yolu yerelde hiç açılamıyordu.

      ÜÇ KUTU, BİRİ ARAÇTA: yükleme sayacının aradaki hâli ("hepsi binmedi") ancak kısmi yükte
      görünür. Son kutu binmediği için sipariş `ready` kalıyor — kutulu siparişte "yolda"nın tek
      kapısı son okutmadır (`loadBox`), yani bu durak yükleme ekranının bekleyeni.
    */
    const yuklemeSiparisi = await siparis({
      musteri: 'b2cSadik', kalemler: [bolKalem(5, 4), bolKalem(6, 2)], hedef: 'confirmed', channel: 'b2c',
      paymentMethod: 'cash', tahsilat: 0, teslimGunu: 0, atanmis: true, kuryeAnahtari: 'hepsi',
      etiket: 'KUTULU — bugünün seferinde, 1/3 kutu araçta',
    });
    if (yuklemeSiparisi && turKuryesi) {
      const bulunan = await orders.getWithItems(yuklemeSiparisi);
      if (!bulunan) throw new Error('seed kutu: yükleme siparişi okunamadı');
      // Dağılım: 1. kutu ilk kalemin tamamı, 2. ve 3. kutu ikinci kalemi paylaşıyor. Son kutunun
      // kapanışı siparişi `ready` yapar — sıra bilinçli, öncekiler `ready` DÖNMEMELİ.
      const dagilim = [
        [bulunan.items[0]?.qty ?? 0, 0],
        [0, 1],
        [0, (bulunan.items[1]?.qty ?? 0) - 1],
      ];
      const kodlar: string[] = [];
      for (const [n, adetler] of dagilim.entries()) {
        const acilan = await openBox(db, { orderId: yuklemeSiparisi, warehouseId: depolar.str });
        if (acilan.status !== 'ok') throw new Error(`seed kutu: yükleme kutusu ${n + 1} açılamadı (${acilan.status})`);
        kodlar.push(acilan.box.code);
        const kapanis = await sealBox(db, {
          boxId: acilan.box.boxId, warehouseId: depolar.str,
          picks: await strPicks(bulunan.items, adetler), actorId: depocu,
        });
        const sonKutu = n === dagilim.length - 1;
        if (kapanis.status !== 'ok' || kapanis.ready !== sonKutu) {
          throw new Error(`seed kutu: yükleme kutusu ${n + 1} beklenen hâlde değil (${kapanis.status})`);
        }
      }
      // Yalnız İLK kutu araca biner — okutmayı GERÇEK kapı yapıyor (`loadBox`), damga elle yazılmıyor:
      // rota denetimi ve sayaç aynı yoldan geçsin, "yüklendi" iddiası kapının kendi cevabı olsun.
      const okutma = await loadBox(db, { code: kodlar[0]!, courierId: turKuryesi });
      if (okutma.status !== 'ok') throw new Error(`seed kutu: ilk kutu araca alınamadı (${okutma.status})`);
      console.log(`  ✓ bugünün kutulu durağı: ${okutma.loadedBoxes}/${okutma.boxCount} kutu araçta`);
    }

    /*
      ── KAPIYA HAZIR DURAK: KUTUSU TAM BİNMİŞ VE YOLDA (kullanıcı bulgusu 30.08) ──────────────
      Yukarıdaki durak YARIM yüklü ve öyle kalmalı — yükleme ekranının "hepsi binmedi" hâli onunla
      görülüyor. Ama kutu zorunlu olunca (21.184) o durak kapıda AÇILAMAZ hâle geldi ve ölçüldü:
      bugünün seferinde teslim edilebilir TEK durak kalmamıştı. Kurye uygulamayı açıp hiçbir işi
      bitiremiyordu — seed'in ürettiği gün, kuryenin yapamayacağı bir gündü.

      Bu durak o boşluğu kapatıyor: tek kutu, kutu araca BİNMİŞ, sipariş son okutmayla yola çıkmış.
      Kapıda okutulup teslim edilebilir — teslim · kısmi iade · ulaşılamadı · kabul etmedi
      akışlarının hepsi bu durak üzerinden denenir.
    */
    const kapiyaHazir = await siparis({
      musteri: 'b2cSadik', kalemler: [bolKalem(7, 2)], hedef: 'confirmed', channel: 'b2c',
      paymentMethod: 'cash', tahsilat: 0, teslimGunu: 0, atanmis: true, kuryeAnahtari: 'hepsi',
      etiket: 'KUTULU — kapıya hazır (kutu araçta, yolda)',
    });
    if (kapiyaHazir && turKuryesi) {
      const satirlar = await orders.getWithItems(kapiyaHazir);
      if (!satirlar) throw new Error('seed kutu: kapıya hazır durağın kalemleri okunamadı');
      const acilan = await openBox(db, { orderId: kapiyaHazir, warehouseId: depolar.str });
      if (acilan.status !== 'ok') throw new Error(`seed kutu: kapı kutusu açılamadı (${acilan.status})`);
      const kapanis = await sealBox(db, {
        boxId: acilan.box.boxId,
        warehouseId: depolar.str,
        picks: await strPicks(satirlar.items, [satirlar.items[0]?.qty ?? 0]),
        actorId: depocu,
      });
      if (kapanis.status !== 'ok') throw new Error(`seed kutu: kapı kutusu mühürlenemedi (${kapanis.status})`);
      /* Son kutunun okutması siparişin TAMAMINI araca alır (`allBoxesLoaded`). **Yola ÇIKARMAZ**
         (kullanıcı kararı 31.08): araç bir ara depodur, içinde birden çok seferin kutusu durabilir
         ve yükleme yalnız bir emanet değişimidir. Siparişi yola çıkaran tek kapı sefer başlatmadır.
         Damga elle yazılmıyor; iddia kapının kendi cevabı. */
      const bindi = await loadBox(db, { code: acilan.box.code, courierId: turKuryesi });
      if (bindi.status !== 'ok' || !bindi.allBoxesLoaded) {
        throw new Error(`seed kutu: kapı kutusu araca alınamadı (${bindi.status})`);
      }
      console.log('  ✓ bugünün seferi: KAPIYA HAZIR durak (siparişin tüm kutuları araçta)');
    }

    /*
      ── KARGOYA VERİLMİŞ GÖNDERİLER (07.12) ─────────────────────────────────────────────────────
      Üç ekran bu satırlar olmadan BOŞ kalıyordu: müşteri sipariş detayının takip bloğu, operasyon
      sipariş detayının gönderi künyesi ve "yolda" mailinin takip kutusu. Ölçüldü — `shipment`
      tablosunda tek satır yoktu, yani hepsi yalnız testlerde görülebiliyordu.

      **SAĞLAYICIYA ÇIKILMIYOR ve bu şart:** duyuru gerçek para harcar (`announceOrderShipment`).
      Seed satırları doğrudan yazıyor; alanlar duyurunun yazdıklarının aynısı.

      **`seed-` öneki SÜS DEĞİL, nöbetin okuduğu işaret** (`shipping/watch.ts` → `SEED_PREFIX`):
      bu gönderilerin sağlayıcıda karşılığı YOKTUR ve olması da beklenmez, yani hayalet taraması
      onları atlamak zorunda. Ölçülerek öğrenildi — süzgeç yokken tur gerçek hesapta iki seed
      satırını hayalet diye saydı; yerel makinede her hafta yanlış alarm veren bir nöbet
      susturulmayı öğretir.

      İKİ HÂL bilerek: tek kutulu (taşıyıcıda) ve ÇOK KUTULU (yolda, iki ayrı takip numarası).
      İkincisi olmadan "her kolinin ayrı numarası" kuralı hiçbir ekranda görünmez — ve o kural tam
      olarak tek numara varsayıldığı için bir kez yanlış yazılmıştı.
    */
    const kutuTipi = (await new ShippingBoxService(db).listForWarehouse(depolar.str))[0] ?? null;
    if (kutuTipi) {
      // İç fonksiyon `kutuTipi`nin daraltmasını GÖRMÜYOR (hoisted `function`, kapanışta yeniden
      // geniş tip): kök `tsc -p scripts` bu yüzden 28.08'den beri kırmızıydı. Daraltılmış değeri
      // yerel bir sabite almak, `!` ile susturmaktan iyi — kontrolü koruyor.
      const kutuTipiSecili = kutuTipi;
      const gonderiler = new ShipmentService(db);
      const olaylar = new ShipmentEventService(db);
      const kutular = new OrderBoxService(db);

      async function kargoyaVer(opts: {
        etiket: string;
        kutuSayisi: number;
        durum: 'handed_over' | 'in_transit';
        kod: string;
      }): Promise<void> {
        const orderId = await siparis({
          musteri: 'b2cSadik',
          kalemler: [kalem(49, opts.kutuSayisi * 2)],
          hedef: 'ready',
          channel: 'b2c',
          deliveryType: 'shipping',
          paymentMethod: 'online',
          tahsilat: toplam([kalem(49, opts.kutuSayisi * 2)]),
          etiket: opts.etiket,
        });
        if (!orderId) return;

        const gonderi = await gonderiler.insert({
          orderId,
          warehouseId: depolar.str,
          status: opts.durum,
          providerShipmentId: `seed-${opts.kod}`,
          shippingOptionCode: 'chronopost:shop2shop',
          carrierCode: 'chronopost',
          carrierName: 'Chronopost',
          quotedCents: 499 * opts.kutuSayisi,
        });

        /*
          HAZIRLIK KUTUSU ZATEN VAR (30.08): kutulu hazırlık zorunlu olunca `siparis()` bu siparişe
          bir kutu açıp mühürlüyor. Kargo bloğu eskiden 1'den başlayarak KENDİ kutularını ekliyordu
          ve `order_box_no_uq` ihlaline düşüyordu. Kargo kolisi ile hazırlık kutusu AYNI nesnedir:
          mevcut olan güncellenir, eksik kalan (çok koli senaryosu) numarası devam ederek eklenir.
        */
        const hazirKutular = await new OrderBoxService(db).listByOrder(orderId);
        for (let n = 1; n <= opts.kutuSayisi; n++) {
          const kutu =
            hazirKutular[n - 1] ??
            (await kutular.insert({ orderId, warehouseId: depolar.str, boxNo: n, code: `KG-${opts.kod}-${n}` }));
          await db
            .from('order_box')
            .update({
              sealed_at: an(0),
              shipping_box_id: kutuTipiSecili.id,
              shipment_id: gonderi.id,
              provider_parcel_ref: `seed-p-${opts.kod}-${n}`,
              tracking_number: `SEED${opts.kod.toUpperCase()}${n}00${n}`,
              tracking_url: `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=SEED${opts.kod.toUpperCase()}${n}00${n}`,
            })
            .eq('id', kutu.id);
        }

        // Defterin ilk satırı — duyuru kapısının yazdığının aynısı (gönderi düzeyi, kutusuz).
        await olaylar.insert({ shipmentId: gonderi.id, providerCode: 'ANNOUNCED', mappedStatus: 'created', occurredAt: an(0) });
      }

      await kargoyaVer({ etiket: 'KARGO — tek koli, taşıyıcıda', kutuSayisi: 1, durum: 'handed_over', kod: 'tek' });
      await kargoyaVer({ etiket: 'KARGO — İKİ koli, yolda (ayrı takip numaraları)', kutuSayisi: 2, durum: 'in_transit', kod: 'cift' });
      console.log('  ✓ kargo gönderisi: 1 tek koli (taşıyıcıda) + 1 çok koli (yolda, iki takip numarası)');
    }
  }

  /*
    ── DEV/KARMA PROFİLİN SİPARİŞLERİ (kullanıcı kararı 26.08) ─────────────────
    Cihaz turunun girişli hesabı `yonetici` (Selin) — hem personel hem müşteri. Bildirim akışının
    çeşitliliği ONUN ekranında görünür olmalı ve sipariş bildirimleri gerçek hedef ister: hedefsiz
    demo satırı "tıklayınca gitmeyen" satırdır. Bu blok tavandan SONRA durur (extend'de kesilebilir
    — durum makinesi örneklemesi ondan önceliklidir); `full` katman her refresh'te kurar.
  */
  const yonetici = kisiler.get('yonetici');
  if (yonetici) {
    if (!(await varsayilanAdres(yonetici))) {
      await addresses.addForCustomer({
        customerId: yonetici,
        label: 'Ev',
        recipient: 'Selin Kaya',
        line1: '12 Rue des Moulins',
        postalCode: '67000',
        city: 'Strasbourg',
        phone: '+33600000104',
        country: 'FR',
        isDefault: true,
      });
    }
    await siparis({ musteri: 'yonetici', kalemler: [kalem(30, 1), kalem(31, 2)], hedef: 'confirmed', channel: 'b2c', paymentMethod: 'online', tahsilat: toplam([kalem(30, 1), kalem(31, 2)]), etiket: 'Dev hesabı — onaylı (bildirim turu)' });
    await siparis({ musteri: 'yonetici', kalemler: [kalem(32, 2)], hedef: 'out_for_delivery', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, etiket: 'Dev hesabı — yolda (bildirim turu)' });
    await siparis({ musteri: 'yonetici', kalemler: [kalem(33, 1)], hedef: 'delivered', channel: 'b2c', paymentMethod: 'cash', tahsilat: 0, yasi: 3, etiket: 'Dev hesabı — teslim edilmiş (bildirim turu)' });
    await siparis({ musteri: 'yonetici', kalemler: [kalem(34, 1)], hedef: 'cancelled', channel: 'b2c', paymentMethod: 'online', etiket: 'Dev hesabı — iptal (bildirim turu)' });
  }

  /*
    ── EKSİK TOPLAMA: sipariş istisnası (Y2 · 30.08) ───────────────────────────────────────────
    Yönetimin "sipariş istisnaları" ekranı ve hub'ın karar kutusundaki sayaç aynı motoru okuyor
    (`listPreparationQueue` → `shortfallQty > 0`). Ölçüldü: sayaç 0, ekran boş — çünkü seed her
    siparişi rafta karşılığı olan adetlerle kuruyordu, yani "eksik toplama" hâli hiç doğmuyordu.

    Hâl UYDURULMAZ, YAŞATILIR: sipariş normal yoldan açılır ve stoğu ayrılır; ARDINDAN o partiden
    bir imha (hasar) düşülür. Gerçek hikâye budur — mal söz verildikten sonra rafta kırılır ve
    depocu sabah eksik bulur. Adedi doğrudan "stoktan fazla" yazmak, checkout'un asla üretemeyeceği
    bir sipariş kurmak olurdu (`reserve_stock` kısmi ayırma yapmaz, reddeder).

    **BLOK EN SONDA ve sebebi sıra:** imha o varyantın rafını boşaltıyor. Ortada dursaydı sonraki
    siparişler aynı varyantı bulamaz, rezervasyon ya da kutu kapanışı sessizce yarım kalırdı.

    ── MÜŞTERİ SEÇİMİ TESADÜF DEĞİL (ölçüldü 30.08) ────────────────────────────────────────────
    İlk hâlde müşteri `b2cSadik`'ti ve istisna ekranı YİNE boş açıldı — ama bu kez sebep başkaydı:
    `seedTickets` `source:'order'` taleplerini müşterinin EN YENİ siparişine bağlıyor
    (`siparisler.find(customer_id === …)`, `created_at desc`). Bu blok seed'in son siparişi olduğu
    için "Hasarlı geldi · Baklava" talebi tam da bu kalemin üstüne düştü; `listOrderExceptions`
    cevabı BEKLEYEN kalemi eliyor (`!line.awaitingAnswer`) ve sayaç 0'da kaldı. Ölçüm:
      ticket b633232f… · damaged · open · order_item_ids = {cd5ea6c8…}  → LA-26-QWUWL6'nın tek kalemi
    Çare kalemi gizlemek değil ÇAKIŞMAYI kaldırmak: sipariş, kaleme talep bağlanan üç müşterinin
    (`b2cSadik` · `b2bOnayli` · `b2bAlman`) hiçbirine yazılmıyor. `b2bBekleyen`in tek talebi
    WhatsApp kaynaklı ve siparişsiz. Bağ kırılırsa sessiz kalmasın diye kapsam denetimine ZORUNLU
    bir kova eklendi (`coverage.ts` → "eksik toplama (Y2)") ve o kova ekranın OKUDUĞU motoru çağırır.
  */
  {
    const eksikKalem = bolKalem(7, 4);
    const eksikSiparis = await siparis({
      musteri: 'b2bBekleyen', kalemler: [eksikKalem], hedef: 'confirmed', channel: 'b2b',
      paymentMethod: 'cash', tahsilat: 0, teslimGunu: 0,
      etiket: 'Bugün — EKSİK TOPLAMA olacak (raftaki mal siparişten sonra hasar gördü)',
    });
    if (eksikSiparis) {
      // Rafta KAÇ adet kalsın: sipariş 4, hedef 2 → iki adet eksik. Fark sabit değil hesaplanmış;
      // parti dağılımı değişse de "iki adet eksik" iddiası doğru kalır.
      const kalsin = eksikKalem.qty - 2;
      const partiler = await stocks.listInStock(depolar.str, eksikKalem.variantId);
      let elde = partiler.reduce((s, p) => s + p.physicalQty, 0);
      for (const parti of partiler) {
        if (elde <= kalsin) break;
        const dus = Math.min(parti.physicalQty, elde - kalsin);
        if (dus <= 0) continue;
        await new StockMovementService(db).adjust({
          stockId: parti.id, qty: dus, direction: 'out', kind: 'write_off', reason: 'damaged',
          note: 'Rafta devrildi — kutular ezildi, satılamaz.', createdBy: depocu,
        });
        elde -= dus;
      }
      console.log(`  ✓ eksik toplama zemini: sipariş ${eksikKalem.qty} adet, rafta ${elde} adet kaldı`);
    }
  }

  const { count } = await db.from('order').select('*', { count: 'exact', head: true });
  console.log(`✓ sipariş: ${count ?? 0} kayıt (9 durumun hepsi · 4 kaynak · kuponlu · kısmi iade · kurye günleri · kutulu hazırlık · eksik toplama)`);
}

