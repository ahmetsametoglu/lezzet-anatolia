import { openBox, sealBox } from '@lezzet/application';
import {
  AccountService, AddressService, CartService, DeliveryZoneService, DiscountService, MoneyMovementService,
  OrderBoxService, OrderService, ReservationService, StockService, UserProfileService,
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
   * İkinci deponun siparişleri YALNIZ orada stoğu olan varyantlardan kurulur.
   *
   * Partilerin depoya dağılımı indise bağlı (`stock.ts`) ve hangi varyantın Kehl'de olduğu oradan
   * okunmaz — okunsaydı iki dosya aynı formülü paylaşırdı ve biri değişince diğeri sessizce yanlış
   * sipariş üretirdi. Bu yüzden GERÇEĞE sorulur: Kehl'de fiili stoğu olan varyantlar.
   */
  const kehlStoklu = await (async () => {
    const { data, error } = await db
      .from('stock')
      .select('variant_id,physical_qty')
      .eq('warehouse_id', depolar.kehl)
      .gt('physical_qty', 8);
    if (error) throw error;
    const idler = new Set(((data ?? []) as Array<{ variant_id: string }>).map((r) => r.variant_id));
    return satilabilir.filter((v) => idler.has(v.id));
  })();
  /** Kehl kalemi — dizide dönerek seçer; adet parti tavanının altında tutulur (rezervasyon geçsin). */
  const kehlKalem = (i: number, qty: number): SiparisKalem => {
    const v = kehlStoklu[i % kehlStoklu.length]!;
    return { variantId: v.id, qty, unitPrice: euro(7 + (i % 9) * 1.6), vatRate: v.vatRate };
  };

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

  // Paranın gireceği hesap: kasa. Para bölümü siparişlerden ÖNCE koştuğu için hazırdır.
  const kasaId = (await new AccountService(db).list({ activeOnly: true })).find((h) => h.type === 'cash')?.id ?? null;

  /**
   * Tahsilat/iade bir HAREKETTİR (12.2): siparişteki `amount_*` ondan türer. Hareket + cache tek
   * transaction'da (`recordForOrder`), ödeme durumu ardından motordan.
   */
  async function tahsilatYaz(orderId: string, tutarCents: number, tip: 'order_payment' | 'order_refund'): Promise<void> {
    if (!kasaId || tutarCents <= 0) return;
    await movements.recordForOrder({ orderId, accountId: kasaId, amountCents: tutarCents, type: tip, valueDate: gun(-1) });
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
    /**
     * Kurye ATANMIŞ ama sipariş henüz yola çıkmamış. Sevkiyatçının sabah yaptığı işin sonucu budur
     * ve gün planı ekranı (09.15) tam bu aralıkta çalışır — hâl seed'de hiç doğmuyordu.
     */
    atanmis?: boolean;
    /**
     * Siparişin ÇIKTIĞI depo. Varsayılan ana depo; `kehl` verildiğinde partiler de oradan seçilir.
     * Tek depolu bir veri setinde depo süzgecini unutan sorgu DOĞRU cevap verir ve hata görünmez
     * (CLAUDE.md §1) — ikinci deponun siparişi o kör noktayı açar.
     */
    depo?: 'str' | 'kehl';
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

    const adres = await varsayilanAdres(customerId);
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
    const depoId = opts.depo === 'kehl' ? depolar.kehl : depolar.str;
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
            }
          : null,
        // Kurye YOLA ÇIKMIŞ siparişte kendiliğinden yazılır; `atanmis` ise sevkiyatçının SABAH yaptığı
        // atamayı kurar. Bu ikisi ayrı hâllerdir ve gün planı ekranı (09.15) tam aralarında çalışır:
        // "atandı ama henüz çıkmadı" seed'de hiç doğmuyordu, ekranın en kalabalık hâli görülemiyordu.
        courierId:
          !kapiOnu && (opts.atanmis || ['out_for_delivery', 'delivered', 'completed', 'returned'].includes(opts.hedef))
            ? kurye
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
        await tahsilatYaz(order.id, toCents(opts.tahsilat ?? toplam(opts.kalemler)), 'order_payment');
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
      if (hedef === 'preparing') {
        // Hazırlık onayı: fiilen çıkan partiler yazılır (geri çağırma + gerçek COGS bunun üstünde).
        const picks = [];
        for (const item of items) picks.push({ orderItemId: item.id, batches: await partiSec(item.variantId, item.qty, depoId) });
        await orders.transition({ orderId: order.id, from: onceki, to: 'preparing', actorId: depocu });
        await orders.recordPreparation(order.id, picks);
        onceki = 'preparing';
        continue;
      }
      if (hedef === 'delivered') {
        await orders.deliver(order.id, { actorId: kurye, deliveryProof: { by: 'Kurye', at: an(0), method: 'imza' } });
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
    if (opts.tahsilat) await tahsilatYaz(order.id, toCents(opts.tahsilat), 'order_payment');
    // GERİ ÖDEME de bir harekettir, ters yönlü. Ayrı bir "iade edildi" bayrağı yok ve olmamalı:
    // `payment_status='refunded'` tahsil edilenle iade edilenin FARKINDAN türer. İade hareketi
    // olmadan o durumu elle yazmak, parası hâlâ kasada duran bir siparişi iade edilmiş göstermekti.
    if (opts.iade) await tahsilatYaz(order.id, toCents(opts.iade), 'order_refund');
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
    tahsilat: 0, teslimGunu: 0, atanmis: true, etiket: 'Bugün — hazır ve ATANMIŞ, henüz yola çıkmadı',
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

  const { count } = await db.from('order').select('*', { count: 'exact', head: true });
  console.log(`✓ sipariş: ${count ?? 0} kayıt (9 durumun hepsi · 4 kaynak · kuponlu · kısmi iade · kurye günleri · kutulu hazırlık)`);
}

