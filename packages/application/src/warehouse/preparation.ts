import {
  OrderBoxItemService,
  OrderBoxService,
  OrderItemBatchService,
  OrderItemService,
  OrderService,
  ReservationService,
  SettingsService,
  StockService,
  TicketService,
  UserProfileService,
} from '@lezzet/database';
import { isSellableBatch, suggestFefoPicks, suggestShortfallAction, type ShortfallSuggestion } from '@lezzet/domain-core';
import type { Order, OrderItem, PreparationPick, PreparationResult, TransitionResult } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantNames } from './names';

/**
 * **Depo hazırlığı — D1** (10.1–10.3), terfi 21.11. Kaynağı `apps/web/lib/order/preparation.ts` +
 * `apps/web/lib/stock/fefo.ts`; `design/pages/depo-hazirlik.md` ve mobil v2'nin "Toplama" ekranı
 * bağlayıcı.
 *
 * ── NEDEN PAKETTE ────────────────────────────────────────────────────────────
 * Paketin kabul ölçütü "EN AZ İKİ yüzeyin çağırdığı orkestrasyon" (`index.ts`). Aynı kuyruğu
 * operasyon web ekranı (`/operations/preparation`) ve mobil Depo bölümü (D1) okuyor; ikinci bir
 * uygulama yazmak, aynı FEFO önerisini iki kez üretmek olurdu. Web kopyası bugün hâlâ ekranını
 * besliyor — **köprü**; benimsemesi web şeridinin işi (görev satırı 21.11'in notu: web aynı kapıya
 * ihtiyaç duyduğunda PAKETTEN çağırır, ikinci yol açılmaz).
 *
 * ── PARA BU DOSYADAN GEÇMEZ ──────────────────────────────────────────────────
 * Tasarımın altın kuralı ("depocu fiyat, tutar, kâr, maliyet asla görmez") burada bir arayüz
 * disiplini değil **yapısal bir sınır**: dönen görünüm modelinde para alanı YOKTUR. Ekran isteseydi
 * bile gösteremez. Eksik kararının parasal ölçütü motora GİRDİ olarak verilir, dönen değerde yer
 * almaz (`domain-core/stock/shortfall`).
 *
 * ── DEPO KİMLİĞİ ZORUNLU ─────────────────────────────────────────────────────
 * İki kapı da `warehouseId` ister (CLAUDE.md §1: varsayılan depo YOKTUR). Web kopyasında süzgeç
 * OPSİYONELDİ ve depo-üstü okuma admin'in yoluydu; burada değil: kapıyı çağıran yüzey personelin
 * sabit deposunu kendi çözer (jetondan/guard'dan) ve kimliği geçirir. Süzgeci unutulan bir sorgu
 * tek depolu veride DOĞRU cevap verir — ve sistem sessizce başka şehrin işini gösterir.
 */

/** Bir kalemin hazırlık satırı — ürün/adet/parti; fiyat yok. */
export interface PreparationLine {
  itemId: string;
  /**
   * **Bu kalem müşterinin cevabını bekliyor** (10.3) — siparişe bağlı, kalemi işaretleyen ve henüz
   * çözülmemiş bir talep var demek.
   *
   * Kalemi KİLİTLEMEZ ve kilitlememeli: cevap gecikirse depocu yine de "kalanı gönder" diyebilir —
   * karar hep insanda (`DOMAIN §4`). İşaretin tek işi, sorulmuş bir sorunun ekranda iz bırakması.
   */
  awaitingAnswer: boolean;
  variantId: string;
  /** "Fıstıklı Baklava" — müşterinin dilinde değil, operasyon dilinde (Türkçe). */
  productName: string;
  /** "500 g" gibi boy etiketi; tek boylu üründe boş. */
  variantLabel: string;
  orderedQty: number;
  /** Daha önce hazırlanmış adet — **yarım kalan iş kaldığı yerden sürer** (mobil v2: "Yarım iş sürer"). */
  pickedQty: number;
  /**
   * Kalemin ŞU ANDA yazılı parti dağılımı (21.11d) — boş dizi = henüz hiç toplanmamış.
   *
   * ── NEDEN OKUMA TARAFINDA DA GEREKİYOR ──────────────────────────────────────
   * Yazım ABSOLÜT: `record_preparation` (0015) kalemin önceki parti kaydını **silip yeniden yazıyor**
   * ("önceki parti kaydı tamamen yenisiyle değişir, yamalanmaz") ve `fulfilled_qty` gönderilen
   * toplamın kendisi oluyor. Okuma yalnız `pickedQty`'yi taşıdığı sürece yarım kalmış bir kalemin
   * eski dağılımı hiçbir ekrandan yeniden ÜRETİLEMEZ — devam eden depocu ya sıfırdan yazar (önceki
   * emeği görünmez şekilde siler) ya da eksiği "ilk öneri partisine" ekleyerek atamayı TAHMİN eder.
   * İkincisi daha tehlikeli: geri çağırmanın ve gerçek COGS'un dayandığı kayıt tahminle yazılamaz.
   *
   * Şekil yazım tipinin AYNISI (`PreparationPick['batches']`) çünkü ekranın göndereceği dizi bunun
   * devamıdır; ikinci bir şekil, aynı kalemi iki dilde konuşmak olurdu.
   *
   * `suggestion` ile karıştırılmaz: o motorun ÖNERİSİ, bu depocunun YAZDIĞI gerçek. Çakışmak zorunda
   * değiller — depocu öneriden sapabilir (DOMAIN §4).
   */
  pickedBatches: PreparationPick['batches'];
  /**
   * Partiye kilitli mi (indirimli teklif kalemi). Kilitliyse öneri değil ZORUNLULUKTUR: depocu
   * başka partiden veremez, kapı da yazdırmaz.
   */
  pinnedStockId: string | null;
  /** Sistem önerisi: hangi partiden kaç adet — bir kalem birden çok partiye bölünebilir. */
  suggestion: PreparationSuggestion[];
  /** Önerilen partiler istenen adedi karşılayamıyorsa kalan (fiziksel eksik sinyali). */
  shortfallQty: number;
}

/** Motorun önerdiği tek parti — depocunun rafta arayacağı şey. */
export interface PreparationSuggestion {
  stockId: string;
  qty: number;
  expiryDate: string;
  /** Alanın ADI ("Derin dondurucu 2") — depocu rafta uuid aramaz, tabelayı okur (19.29). */
  areaName: string | null;
}

/** Kuyruk satırı — sipariş künyesi + kalemleri. Tutar, adres, iletişim YOK (tasarım §6). */
export interface PreparationOrder {
  orderId: string;
  referenceNo: string | null;
  customerName: string;
  /**
   * Adrese GİDEN kişi — sipariş anındaki kopyadan (`address_snapshot.recipient`). `null` = adreste
   * alıcı yazılı değil; ekran o zaman `customerName`i kullanır.
   *
   * ── TASARIM §6'DAN BİLİNÇLİ SAPMA (kullanıcı kararı 21.08) ──────────────────
   * `design/pages/depo-hazirlik.md` *"müşteri iletişim bilgisi ve adres görünmez — teslimat
   * kuryenin işidir"* diyor ve o karar duruyor: adres de telefon da BURADA YOK, eklenmedi. Ama aynı
   * tasarım müşteri adını *"koli etiketleme/eşleştirme için"* istiyor ve etikete yazılacak ad
   * hesap sahibininki değildir: hediye ya da iş adresinde paketi alan başka biridir ve taşıyıcı
   * künyesi o adla üretilir (ölçüldü 21.08 — dört taşıyıcının hiçbiri adsız künye kabul etmiyor,
   * teslim noktası kimliği künyedeki adla karşılaştırıyor). Yani değişen şey "yeni bir bilgi
   * göstermek" değil, alanın KENDİ amacına doğru adı taşımak.
   *
   * Ek sorgu YOK: kopya siparişin kendi satırında duruyor.
   */
  recipientName: string | null;
  /** B2B/B2C — hacim beklentisini kurar (B2B 10-50 koli olabilir). */
  channel: Order['channel'];
  status: Order['status'];
  deliveryDate: string | null;
  /**
   * Kargo künyesinin ÖN KOŞULU (10.9): taşıyıcı yalnız `shipping` siparişine yazılabilir
   * (`order_carrier_only_shipping` kısıtı). Kulvar bu alana bakmaz — kulvarı teslim GÜNÜ belirler;
   * bu alan yalnız künye formunun çizilip çizilmeyeceğini söyler.
   */
  deliveryType: Order['deliveryType'];
  /**
   * Kargo künyesi (10.9) — paketi kapatan kişi etiketi elinde tutar, yazma yeri bu ekrandır
   * (`OrderService.setShipment` künyesi). `carrier: null` bir eksik değil bir HÂLDİR: "henüz
   * kargoya verilmedi" — ekran onu boş kutu olarak değil o cümleyle gösterir.
   */
  carrier: Order['carrier'];
  trackingNumber: string | null;
  lineCount: number;
  /** Toplanan kalem sayısı — hazırlık ilerlemesi. */
  pickedLineCount: number;
  lines: PreparationLine[];
  /**
   * Siparişin kutuları (23.6) — `boxNo` sırasıyla; boş dizi = kutusuz akış (eski yol, bilinçli
   * çift akış). Mobil ekran "bu kalemden kaç adet zaten kutulandı"yı `items`ten türetir; web
   * paneli yalnız sayar ("2 kutu · 1 kapalı") — web'de kutu açılmaz/kapanmaz (karar §1.1).
   */
  boxes: PreparationBox[];
}

/** Bir kutu, kuyruğun gözünden — `sealedAt null` = açık (masada dolduruluyor). */
export interface PreparationBox {
  boxId: string;
  boxNo: number;
  /** QR'ın içeriği (`KT-…`) — sipariş referansı DEĞİL (Netleşecek 4). */
  code: string;
  sealedAt: string | null;
  items: Array<{ orderItemId: string; qty: number }>;
}

/**
 * **Günün hazırlama listesi** (D1). `confirmed` ve `preparing` birlikte gelir: ikincisi yarım kalan
 * iştir ve ekranda kaybolmamalıdır (tasarım §4).
 *
 * Teslim gününe göre süzülür; gün verilmezse o deponun bekleyen her siparişi gelir. **Arşiv
 * yığılmaz**: teslim edilmiş/kapanmış sipariş bu okumaya hiç girmez.
 *
 * **`orderId` verilirse TEK sipariş** (10.1 · hazırlık kâğıdı): belge tek siparişi basıyor ve onun
 * için kuyruğun tamamını okuyup elde süzmek, kâğıdın maliyetini kuyruğun boyuna bağlardı. Süzgeç
 * kuyruğun kendi ölçütlerini DEĞİŞTİRMEZ — kapanmış bir siparişin kimliği verilse de liste boş
 * döner, yani kâğıt yalnız hazırlanabilir bir siparişe basılır.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function listPreparationQueue(
  db: SupabaseClient,
  input: { warehouseId: string; deliveryDate?: string; limit?: number; orderId?: string },
): Promise<PreparationOrder[]> {
  const orders = await new OrderService(db).listByStatus(['confirmed', 'preparing'], {
    deliveryDate: input.deliveryDate,
    limit: input.limit ?? 50,
    warehouseId: input.warehouseId,
    orderId: input.orderId,
  });
  if (orders.length === 0) return [];

  const items = await new OrderItemService(db).listByOrders(orders.map((order) => order.id));
  // Beşi AYNI dalgada: parti dağılımı ve kutu okumaları mevcut turların yanına giriyor,
  // arkalarına DEĞİL — ikinci bir uçuş açsaydı kuyruğun gecikmesi iki katına çıkardı (21.11d ölçümü).
  const [names, customers, pinned, picked, boxes, awaiting] = await Promise.all([
    variantNames(db, items.map((item) => item.variantId)),
    customerNames(db, orders),
    pinnedStockIds(db, orders.map((order) => order.id)),
    pickedBatches(db, orders.map((order) => order.id)),
    orderBoxes(db, orders.map((order) => order.id)),
    // Cevap bekleyen kalemler (10.3) — AYNI dalgada, arkasında değil: soru sorulduktan sonra
    // ekranda iz kalmazsa depocu o kalemi unutur ya da ikinci kez sordurur.
    new TicketService(db).awaitingItemIds(orders.map((order) => order.id)),
  ]);

  const queue: PreparationOrder[] = [];
  for (const order of orders) {
    const orderItems = items.filter((item) => item.orderId === order.id);
    const built = await Promise.all(
      orderItems.map((item) =>
        buildLine(
          db,
          // Hazırlık siparişin deposundan toplanır. Süzgeç zaten `warehouseId` ile kuruldu, ama
          // öneri SİPARİŞİN deposundan çıkar: ikisi eşit, ve eşitliği kaynağından okumak niyeti
          // yazılı tutar.
          order.warehouseId,
          item,
          names.get(item.variantId),
          pinned.get(`${order.id}:${item.variantId}`) ?? item.stockId,
          picked.get(item.id) ?? [],
        ),
      ),
    );
    /*
      YÜRÜYÜŞ SIRASI (23.6 · karar §1.13'ün ekran yarısı): kalemler ilk öneri partisinin alanına
      göre dizilir (`storage_area.sort_order` — operatörün Depolar'daki dizilimi); depocu listeyi
      yukarıdan aşağı okuyarak depoyu TEK yönde yürür. Sıra SUNUCUDA kurulur, sözleşmeye sayı
      taşınmaz: ekranın işi verilen sırayla çizmek. Alanı olmayan (ya da önerisiz) kalem sona düşer
      — `Infinity` bir ceza değil "yürüyüşe oturmayan işin sonu" (stabil sort eşitleri korur).
    */
    const lines = built
      .sort((a, b) => (a.areaSort ?? Infinity) - (b.areaSort ?? Infinity))
      // İşaret `buildLine`in İÇİNE değil dışına konuyor: o kalemin FİZİKSEL gerçeğini kuruyor
      // (kaç kaldı, hangi parti, hangi raf), bu ise siparişin çevresindeki bir hâl.
      .map((row) => ({ ...row.line, awaitingAnswer: awaiting.has(row.line.itemId) }));

    queue.push({
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: customers.get(order.customerId) ?? '—',
      recipientName: recipientOf(order.addressSnapshot),
      channel: order.channel,
      status: order.status,
      deliveryDate: order.deliveryDate,
      deliveryType: order.deliveryType,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      lineCount: lines.length,
      pickedLineCount: lines.filter((line) => line.pickedQty >= line.orderedQty).length,
      lines,
      boxes: boxes.get(order.id) ?? [],
    });
  }
  return queue;
}

/**
 * Kalem satırı + parti önerisi. Kilitli kalemde öneri o partiye sabitlenir — FEFO'ya sorulmaz:
 * teklife söz verilen stok başka partiyle karşılanamaz (DOMAIN §4).
 *
 * `areaSort` satırın YÜRÜYÜŞ anahtarıdır (ilk öneri partisinin alan sırası) — sözleşmeye girmez,
 * yalnız kuyruğun dizilimini kurar (`listPreparationQueue` künyesi).
 */
async function buildLine(
  db: SupabaseClient,
  warehouseId: string,
  item: OrderItem,
  variant: { productName: string; variantLabel: string } | undefined,
  pinnedStockId: string | null,
  picked: PreparationPick['batches'],
  // `awaitingAnswer` dışarıda ekleniyor (çağıran künyesi): bu fonksiyon kalemin FİZİKSEL gerçeğini
  // kuruyor, siparişin çevresindeki hâlleri değil. `Omit` niyeti tipe yazıyor — alan unutulmadı.
): Promise<{ line: Omit<PreparationLine, 'awaitingAnswer'>; areaSort: number | null }> {
  const remaining = Math.max(0, item.qty - item.fulfilledQty);
  const base = {
    itemId: item.id,
    variantId: item.variantId,
    productName: variant?.productName ?? '—',
    variantLabel: variant?.variantLabel ?? '',
    orderedQty: item.qty,
    pickedQty: item.fulfilledQty,
    pickedBatches: picked,
  };

  if (pinnedStockId) {
    // `getBatchDetails` (tekil `getById` değil): alanın ADI gömülü satırdan geliyor ve depocunun
    // ekranda göreceği şey o (19.29). Kimlikle dönseydik telefon ikinci bir okuma yapardı.
    const batch = (await new StockService(db).getBatchDetails([pinnedStockId]))[0];
    return {
      areaSort: batch?.storageArea?.sortOrder ?? null,
      line: {
        ...base,
        pinnedStockId,
        suggestion: batch
          ? [{ stockId: batch.id, qty: remaining, expiryDate: batch.expiryDate, areaName: batch.storageArea?.name ?? null }]
          : [],
        shortfallQty: batch ? Math.max(0, remaining - batch.physicalQty) : remaining,
      },
    };
  }

  const fefo = await suggestPicksForVariant(db, warehouseId, item.variantId, remaining);
  return {
    // İlk öneri FEFO'nun başı — depocunun gideceği İLK raf; yürüyüş ona göre kurulur.
    areaSort: fefo.picks[0]?.areaSort ?? null,
    line: {
      ...base,
      pinnedStockId: null,
      suggestion: fefo.picks.map((pick) => ({
        stockId: pick.stockId,
        qty: pick.qty,
        expiryDate: pick.expiryDate,
        areaName: pick.areaName,
      })),
      shortfallQty: fefo.shortfall,
    },
  };
}

type ConfirmOutcome =
  | { status: 'ok'; items: number; ready: boolean; shortfalls: { itemId: string; suggestion: ShortfallSuggestion }[] }
  /** Kilitli kalem başka partiden verilmek istendi — yazım yapılmadı. */
  | { status: 'pinned_violation'; itemId: string; requiredStockId: string }
  /**
   * Sipariş çağıranın deposunda değil. **Yetki kararı DEĞİL, kapsam kararı** (`order/refund`
   * emsali): kimliğin doğrulanması uç katmanın işi; burada yalnız "bu sipariş bu depoda mı" sorusu
   * var ve o bir İŞ kuralıdır (DOMAIN §17).
   */
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'not_found' };

/**
 * **Hazırlık onayı** (10.1/10.2). Seçilen partiler yazılır; sipariş tamamen toplandıysa `ready`'e
 * geçer. Eksik kalan kalem varsa motorun tavsiyesi döner — **karar depocunun değildir**: mobil v2
 * "Eksik bildirildi — karar yönetim ekranında" diyor (D1 → Y2). Kapı kimsenin yerine karar vermez,
 * tavsiyeyi taşır.
 *
 * Kilitli kalem kontrolü BURADA: RPC fiziksel gerçeği korur (olmayan mal yazılmaz) ama "bu kalem şu
 * partiden çıkmalı" bir iş kuralıdır, veritabanının değil uygulamanın sorusudur.
 *
 * **Yarım iş sürdürülebilir ve bu cevapta görünür:** `ready: false` dönen bir onay hata değildir —
 * toplanan adet kayıtta kalır, sipariş `preparing`te bekler, depocu kaldığı yerden devam eder.
 */
export async function confirmPreparation(
  db: SupabaseClient,
  input: {
    orderId: string;
    /** Depocunun çalıştığı depo — siparişinki değilse yazım HİÇ yapılmaz (CLAUDE.md §1). */
    warehouseId: string;
    picks: readonly PreparationPick[];
    actorId?: string | null;
  },
): Promise<ConfirmOutcome> {
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };
  if (found.order.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };

  const violation = await findPinnedViolation(db, input.orderId, found.items, input.picks);
  if (violation) return { status: 'pinned_violation', ...violation };

  const result: PreparationResult = await new OrderService(db).recordPreparation(input.orderId, input.picks);

  const shortfalls = await adviseShortfalls(
    db,
    input.picks.flatMap((pick) => {
      const item = found.items.find((row) => row.id === pick.orderItemId);
      return item ? [{ item, pickedQty: pick.batches.reduce((sum, batch) => sum + batch.qty, 0) }] : [];
    }),
  );

  // Tamamı toplandıysa sipariş sevkiyata hazırdır. Eksik varsa `preparing`'de kalır: karar
  // verilmeden ilerletmek, yönetimin elindeki soruyu atlamak olurdu.
  const complete = found.items.every((item) => {
    const pick = input.picks.find((row) => row.orderItemId === item.id);
    return (pick?.batches.reduce((sum, batch) => sum + batch.qty, 0) ?? item.fulfilledQty) >= item.qty;
  });

  let ready = false;
  if (complete) {
    const transition: TransitionResult = await new OrderService(db).transition({
      orderId: input.orderId,
      from: found.order.status,
      to: 'ready',
      actorId: input.actorId,
    });
    ready = transition.ok;
  }

  return { status: 'ok', items: result.items, ready, shortfalls };
}

type ShipmentOutcome =
  | { status: 'ok' }
  /** Sipariş çağıranın deposunda değil — `confirmPreparation`'ın aynı kapsam kararı. */
  | { status: 'forbidden'; reason: 'out_of_scope' }
  /**
   * Rota siparişine taşıyıcı yazılmaz. Kısıt VERİDE de duruyor (`order_carrier_only_shipping`);
   * buradaki kontrol kuralı yeniden uygulamak için değil, depocuya kısıt ihlali yerine okunur bir
   * cümle verebilmek için (Depolar'ın `constraintOf` gerekçesinin aynısı).
   */
  | { status: 'not_shipping' }
  | { status: 'not_found' };

/**
 * **Kargo künyesini yazar** (10.9) — taşıyıcı + takip numarası, hazırlık ekranının işi:
 * *"numarayı hazırlık ekranı girer — paketi kapatan kişi etiketi elinde tutuyor"*
 * (`yer-ekseni-arka-uc-talebi.md §5`). `setShipment` 07.12'den beri hazırdı ve arayüz çağıranı
 * yoktu; bu kapı o sahipsizliği kapatır. Ayrı bir "sevk" adımı yine açılmıyor.
 *
 * `trackingNumber: null` geçerli bir yazımdır: taşıyıcı belli, numara henüz elde değil —
 * müşteri ekranı o hâlde bağlantısız düz metin gösteriyor (`customer-orders` künyesi).
 */
export async function recordShipment(
  db: SupabaseClient,
  input: {
    orderId: string;
    /** Depocunun çalıştığı depo — siparişinki değilse yazım HİÇ yapılmaz (CLAUDE.md §1). */
    warehouseId: string;
    carrier: NonNullable<Order['carrier']>;
    trackingNumber: string | null;
  },
): Promise<ShipmentOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  if (order.deliveryType !== 'shipping') return { status: 'not_shipping' };

  await orders.setShipment(input.orderId, input.carrier, input.trackingNumber);
  return { status: 'ok' };
}

/**
 * **Çıpalı parti ihlali** — kilitli kalem başka partiden verilmek istendi mi (DOMAIN §4).
 * `confirmPreparation` ile `sealBox`ın (23.6) ORTAK kuralı: kutu döngüsü de indirimli teklifin
 * partisine dokunamaz; kural iki kapıda ayrı yazılsaydı bir gün yalnız birinde değişirdi.
 * Dönüş `null` = ihlal yok.
 */
export async function findPinnedViolation(
  db: SupabaseClient,
  orderId: string,
  items: readonly OrderItem[],
  picks: readonly PreparationPick[],
): Promise<{ itemId: string; requiredStockId: string } | null> {
  const pinned = await pinnedStockIds(db, [orderId]);
  for (const pick of picks) {
    const item = items.find((row) => row.id === pick.orderItemId);
    if (!item) continue;
    const requiredStockId = pinned.get(`${orderId}:${item.variantId}`) ?? item.stockId;
    if (!requiredStockId) continue;

    const wrong = pick.batches.find((batch) => batch.stockId !== requiredStockId);
    if (wrong) return { itemId: item.id, requiredStockId };
  }
  return null;
}

/**
 * **Eksik tavsiyesi** — toplanan adet sipariş edileni karşılamayan kalemler için motorun önerisi.
 * Tutar motora GİRDİ olarak verilir, dönen değerde yer almaz (depocu parayı görmez). İki kapının
 * ortak dili: `confirmPreparation` her onayda, `sealBox` yalnız `declareShort` beyanında çağırır.
 */
export async function adviseShortfalls(
  db: SupabaseClient,
  rows: ReadonlyArray<{ item: OrderItem; pickedQty: number }>,
): Promise<Array<{ itemId: string; suggestion: ShortfallSuggestion }>> {
  const short = rows.filter((row) => row.pickedQty < row.item.qty);
  if (short.length === 0) return [];

  const thresholds = await shortfallThresholds(db);
  return short.map(({ item, pickedQty }) => ({
    itemId: item.id,
    suggestion: suggestShortfallAction({
      orderedQty: item.qty,
      pickedQty,
      missingValueCents: item.unitPriceCents * (item.qty - pickedQty),
      thresholds,
    }),
  }));
}

/** Eşikler ayardan — kodda sabit yok (CLAUDE.md §4). */
async function shortfallThresholds(db: SupabaseClient): Promise<{ ratio: number; valueCents: number }> {
  const settings = new SettingsService(db);
  const [ratioPercent, valueCents] = await Promise.all([
    settings.getNumber('shortfall_ask_ratio_percent', 50),
    settings.getNumber('shortfall_ask_value_cents', 1_500),
  ]);
  return { ratio: ratioPercent / 100, valueCents };
}

/**
 * **Kalemlerin yazılı parti dağılımı** (21.11d) — `order_item_batch`, KALEM kimliğiyle anahtarlanır.
 *
 * ── ÖLÇÜM: BU İKİNCİ BİR UÇUŞ DEĞİL, MEVCUT DALGANIN BİR TURU ───────────────
 * Kuyruk zaten sipariş başına tur atıyor (`pinnedStockIds` → `listActiveByOrder`) ve müşteri başına
 * bir tur daha (`customerNames`). Bu okuma o dalganın İÇİNE giriyor (`Promise.all`), yani gecikme
 * en yavaş turun kendisi kadar kalıyor; sıralı yazılsaydı kuyruk iki tam gidiş-dönüş uzardı.
 *
 * ── TERFİ İHTİYACI (raporlandı, kendim dokunmadım) ──────────────────────────
 * `OrderItemBatchService`in çok-siparişli okuması YOK (`listByOrder` tekil, `getAll` korumalı), bu
 * yüzden sipariş başına bir sorgu kuruluyor. `listByOrders(orderIds)` eklendiği gün buradaki
 * `Promise.all` tek çağrıya iner ve künyenin bu bölümü silinir. Bugünkü hâl yeni bir N+1 SINIFI
 * açmıyor — aynı döngü kuyruğun içinde zaten iki kez var.
 */
export async function pickedBatches(
  db: SupabaseClient,
  orderIds: readonly string[],
): Promise<Map<string, PreparationPick['batches']>> {
  const service = new OrderItemBatchService(db);
  const perOrder = await Promise.all(orderIds.map((orderId) => service.listByOrder(orderId)));

  const map = new Map<string, PreparationPick['batches']>();
  for (const row of perOrder.flat()) {
    const batches = map.get(row.orderItemId);
    // Bir kalem birden çok partiye bölünmüş olabilir: satırlar TOPLANIR, üzerine yazılmaz.
    if (batches) batches.push({ stockId: row.stockId, qty: row.qty });
    else map.set(row.orderItemId, [{ stockId: row.stockId, qty: row.qty }]);
  }
  return map;
}

/**
 * Siparişlerin kutuları — kuyruk sözleşmesinin `boxes` alanı (23.6). İki okuma zincirli ama
 * dalganın TEK turu: kutusuz veride (bugünün baskın hâli) ikinci okuma hiç koşmaz.
 */
async function orderBoxes(db: SupabaseClient, orderIds: readonly string[]): Promise<Map<string, PreparationBox[]>> {
  const boxes = await new OrderBoxService(db).listByOrders([...orderIds]);
  if (boxes.length === 0) return new Map();

  const items = await new OrderBoxItemService(db).listByBoxes(boxes.map((box) => box.id));
  const itemsByBox = new Map<string, PreparationBox['items']>();
  for (const row of items) {
    const list = itemsByBox.get(row.boxId);
    const entry = { orderItemId: row.orderItemId, qty: row.qty };
    if (list) list.push(entry);
    else itemsByBox.set(row.boxId, [entry]);
  }

  const map = new Map<string, PreparationBox[]>();
  for (const box of boxes) {
    const view: PreparationBox = {
      boxId: box.id,
      boxNo: box.boxNo,
      code: box.code,
      sealedAt: box.sealedAt,
      items: itemsByBox.get(box.id) ?? [],
    };
    const list = map.get(box.orderId);
    if (list) list.push(view);
    else map.set(box.orderId, [view]);
  }
  return map;
}

/** Siparişin partiye ÇIPALI rezervasyonları — `order:variant` anahtarıyla. */
async function pinnedStockIds(db: SupabaseClient, orderIds: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const reservations = new ReservationService(db);
  for (const orderId of orderIds) {
    for (const row of await reservations.listActiveByOrder(orderId)) {
      if (row.stockId) map.set(`${orderId}:${row.variantId}`, row.stockId);
    }
  }
  return map;
}

/**
 * Kopyadaki alıcı adı — koli etiketine yazılacak ad (kullanıcı kararı 21.08; gerekçesi
 * `PreparationOrder.recipientName` künyesinde). Yalnız AD okunur: adres ve telefon burada
 * görünmez, tasarım §6 o kısmıyla yürürlükte.
 */
export function recipientOf(snapshot: Record<string, unknown> | null | undefined): string | null {
  const raw = snapshot?.['recipient'];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** Müşteri adı — koli etiketleme için. İletişim ve adres OKUNMAZ (tasarım §6). */
async function customerNames(db: SupabaseClient, orders: readonly Order[]): Promise<Map<string, string>> {
  const profiles = new UserProfileService(db);
  const map = new Map<string, string>();
  for (const customerId of new Set(orders.map((order) => order.customerId))) {
    const profile = await profiles.getById(customerId);
    if (profile) map.set(customerId, profile.name);
  }
  return map;
}

/**
 * **FEFO parti önerisi** (06.5) — kaynağı `apps/web/lib/stock/fefo.ts`.
 *
 * Burada yaşamasının sebebi sınır kuralıdır (STACK §4/§13): `domain-core` DB'yi bilmez, `database`
 * motoru bilmez. Satırları servis getirir, kararı motor verir, ikisini birleştiren yer burasıdır.
 * Uygulama kuralı KENDİ hesaplamaz — sıralamayı, satılabilirliği ve çıpalı düşümü motora sorar.
 *
 * Öneridir, emir değil: depo ekranı bunu gösterir, depocu saparsa yalnız o satırı değiştirir
 * (DOMAIN §4).
 *
 * `warehouseId` zorunlu: hazırlık daima siparişin deposundan toplanır. Süzgeçsiz bir FEFO önerisi
 * başka şehirdeki partiyi önerir; depocu onu seçer ve `record_preparation` reddeder (DOMAIN §17).
 *
 * **Web kopyasının taşıdığı iki alan burada YOK** (`flag`, `remainingPercent`, `lotNumber`): D1
 * ekranı raf ömrü işareti göstermiyor (o D3'ün sorusu) ve kimse okumuyordu. Hesaplanıp atılan bir
 * değer, bir gün "bu neden hep boş" diye aranacak ölü koddur.
 */
async function suggestPicksForVariant(
  db: SupabaseClient,
  warehouseId: string,
  variantId: string,
  qty: number,
  now: Date = new Date(),
): Promise<{ picks: Array<PreparationSuggestion & { areaSort: number | null }>; shortfall: number }> {
  const [batches, reservations] = await Promise.all([
    new StockService(db).listByVariantWithDates(warehouseId, variantId),
    new ReservationService(db).listActiveByVariant(variantId),
  ]);

  const decision = suggestFefoPicks(
    qty,
    batches.map((batch) => ({
      stockId: batch.id,
      physicalQty: batch.physicalQty,
      expiryDate: batch.expiryDate,
      sellable: isSellableBatch(batch.variant.product.dateType, batch.expiryDate, now),
    })),
    reservations.map((row) => ({ qty: row.qty, stockId: row.stockId, expiresAt: row.expiresAt })),
    now,
  );

  const byId = new Map(batches.map((batch) => [batch.id, batch]));
  return {
    shortfall: decision.shortfall,
    picks: decision.picks.map((pick) => {
      const batch = byId.get(pick.stockId)!;
      return {
        stockId: pick.stockId,
        qty: pick.qty,
        expiryDate: batch.expiryDate,
        areaName: batch.storageArea?.name ?? null,
        // Yürüyüş anahtarı (sözleşmeye girmez) — `buildLine` ilk önerininkini satıra taşır.
        areaSort: batch.storageArea?.sortOrder ?? null,
      };
    }),
  };
}
