import {
  BundleService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
} from '@lezzet/database';
import {
  bundleQtyOf,
  customerOrderStatus,
  derivePaymentStatusForOrder,
  fulfilledLineAmountCents,
  isActiveForCustomer,
  isFulfilmentKnown,
  orderTimeline,
} from '@lezzet/domain-core';
import type { OrderTimelineStep } from '@lezzet/domain-core';
import { CROP_CENTER, resolveLocalizedText } from '@lezzet/types';
import type {
  CustomerOrderStatus,
  DeliveryType,
  KeysetCursor,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  PreferredLanguage,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from '../catalog/map';
import { parcelOrdinal, readOrderTracking } from '../shipping/tracking';
import type { StorefrontImage } from '../catalog/storefront-types';

/*
  MÜŞTERİ SİPARİŞ OKUMASI — "Siparişlerim" listesi + sipariş detayı. Terfi 21.18.

  Kaynağı `apps/web/lib/order/{customer-orders,customer-lines,carrier}.ts`tı. Ölçüt karşılandı:
  aynı kuralları artık İKİ yüzey istiyor (web sipariş sayfaları + mobil `vOrders`/`vOrder`) ve
  kopyalamak yasak (CLAUDE §1). Web dosyaları kendi yüzeylerinde KÖPRÜ olarak duruyor; benimsemesi
  web şeridinin işi (`customer/profile.ts` ve `customer/addresses.ts` terfilerinin aynı yolu).

  ── PARA SÖZLEŞMESİ ─────────────────────────────────────────────────────────
  Motor ve ekran CENT ile çalışır, DB `numeric` (euro) tutar, dönüşüm servis katmanında yapılır
  (`OrderService` cent döndürüyor). Alan adları sözleşmenin parçasıdır: `…Cents` ile bitmeyen bir
  para alanı YOKTUR. Bu kural bir hatanın ardından yazıldı (30.07): euro değerleri cent sanılıp
  biçimlendi, 74,17 € ekranda "0,74 €" göründü — `total` denince satıra bakınca görünmüyordu,
  `totalCents` deyince görünüyor.

  ── BU KAPI "SERVER-ONLY" DEĞİL, DB'Yİ ÇAĞIRANDAN ALIR ──────────────────────
  Web kopyası `serviceDb()`yi kendi içinde kuruyordu ve `import 'server-only'` taşıyordu; ikisi de
  Next'e özgü. Paket taşıma-bağımsızdır: istemciyi çağıran verir (adres/profil kapılarının imzası).
*/

/** Özette adı/görseli taşınan kalem sayısı — v3 kartı dört ürün + bir paket halkası çiziyor. */
const SUMMARY_THUMB_LIMIT = 5;

/** Liste satırının küçük resmi — ad ekran okuyucunun ve baş harf yedeğinin kaynağı. */
export interface CustomerOrderThumb {
  name: string;
  image: StorefrontImage;
}

export interface CustomerOrderSummary {
  id: string;
  /** Referans numarası — sipariş onaylanınca doğar; taslakta yok ama taslak zaten listede yok. */
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  /** Listenin başında ayrışan satır: müşterinin hâlâ beklediği bir hareket var. */
  active: boolean;
  totalCents: number;
  /** Sipariş KALEM sayısı (satır sayısı) — adet toplamı değil. */
  itemCount: number;
  /** Kısa içerik özeti — tekilleştirilmiş ve SINIRLI; müşteri "hangi siparişim neydi"yi ayırt etsin. */
  thumbs: readonly CustomerOrderThumb[];
  /** Özete sığmayan kalem sayısı ("+N"); sığdıysa `0`. */
  moreCount: number;
}

export interface CustomerOrderPage {
  orders: readonly CustomerOrderSummary[];
  nextCursor: KeysetCursor | null;
}

export interface CustomerOrderListInput {
  customerId: string;
  locale: PreferredLanguage;
  cursor?: KeysetCursor;
  limit?: number;
}

/**
 * "Siparişlerim" listesi.
 *
 * **Sayfalama keyset ve imleç URL'e YAZILMAZ** (CLAUDE §1): sipariş sayısı veriyle sınırsız büyür,
 * ama süzgeç yok — paylaşılabilecek bir seçim de yok. Liste kaydırdıkça uzar.
 *
 * **Taslaklar listede YOKTUR.** Yarıda kalmış bir checkout müşterinin verdiği bir sipariş değildir;
 * göstermek "bir siparişim daha varmış" dedirtirdi. Süzme durum kararının KENDİSİNDEN geliyor
 * (`customerOrderStatus` → `null`), ayrı bir liste tutulmuyor: iki yerde yaşayan bir kural, bir gün
 * ayrışan bir kuraldır.
 *
 * Taslak süzmesi sayfa DOLDURULDUKTAN sonra olduğu için bir sayfa istenenden az satır dönebilir —
 * bu kabul edilir; `nextCursor` yine doğrudur ve kaydırma devam eder. Alternatifi, sorguya durum
 * süzgeci koyup keyset'i bozmaktı.
 */
export async function listCustomerOrders(
  db: SupabaseClient,
  input: CustomerOrderListInput,
): Promise<CustomerOrderPage> {
  const page = await new OrderService(db).listByCustomer(input.customerId, {
    cursor: input.cursor,
    limit: input.limit,
  });

  // Kalemler TEK turda: sipariş başına sorgu N+1 olurdu (`listByOrders` öbekliyor).
  const items = await new OrderItemService(db).listByOrders(page.rows.map((o) => o.id));
  const lines = await resolveOrderLines(db, items, input.locale);

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const bucket = itemsByOrder.get(item.orderId);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  const orders: CustomerOrderSummary[] = [];
  for (const order of page.rows) {
    const status = customerOrderStatus(order.status);
    if (!status) continue; // Taslak — müşterinin siparişi değil.

    const own = itemsByOrder.get(order.id) ?? [];
    /*
      Küçük resimler ÜRÜNE göre tekilleştirilir: aynı ürünün iki boyu yığında iki halka olmaz
      ("Baklava, Baklava"). Anahtar varyant değil ürün adı+görseli — iki boy aynı ürünün aynı
      fotoğrafını taşır ve müşteri için tek bir şeydir.
    */
    const seen = new Set<string>();
    const thumbs: CustomerOrderThumb[] = [];
    for (const item of own) {
      const line = lines.get(item.variantId);
      if (!line || seen.has(line.productId)) continue;
      seen.add(line.productId);
      thumbs.push({ name: line.name, image: line.image });
    }

    orders.push({
      id: order.id,
      referenceNo: order.referenceNo,
      createdAt: order.createdAt,
      status,
      active: isActiveForCustomer(status),
      totalCents: order.orderedTotalCents,
      itemCount: own.length,
      thumbs: thumbs.slice(0, SUMMARY_THUMB_LIMIT),
      // "+N" TEKİLLEŞTİRİLMİŞ kümeden sayılır: yığında görünmeyen ürün sayısıdır, gizlenen kalem
      // sayısı değil. Ham kalem sayısını kullanmak, iki boyu olan bir üründe "+1" yazıp o "+1"in
      // karşılığı olan halkayı zaten göstermek olurdu.
      moreCount: Math.max(0, thumbs.length - SUMMARY_THUMB_LIMIT),
    });
  }

  return { orders, nextCursor: page.nextCursor };
}

/**
 * Detayın SATIRI — künye + sipariş anındaki para (cent).
 *
 * **Paket TEK satırdır.** Sipariş anında paket kalemlerine açılıyor ama müşteri onu bir bütün
 * olarak satın aldı; kalemleri ayrı ayrı fiyatlarıyla dizmek, hiç görmediği bir fiyat kırılımını
 * ona göstermek olurdu (DOMAIN §13). Bu yüzden gruplama KAPIDA yapılır, ekranda değil.
 */
export interface CustomerOrderDetailLine {
  id: string;
  /**
   * Satırın ARKASINDAKİ gerçek sipariş kalemleri. Varyant satırında tek eleman (`id`nin kendisi);
   * PAKET satırında birden çok — paket ekranda tek satıra katlanıyor ama veride kendi kalemleridir
   * ve `id` orada sentetik (`bundle:…`). Talep formu "hangi ürünlerle ilgili" sorusunu bu kümeyle
   * cevaplıyor; katlama geri döndürülemez olduğu için ekranın kendi başına türetemeyeceği tek bilgi.
   */
  orderItemIds: readonly string[];
  /** `bundle` satırında paket adı, `variant` satırında ürün adı. */
  name: string;
  unit: string;
  image: StorefrontImage;
  /** Paket satırıysa içerik künyesi; varyant satırında `null`. */
  bundle: { itemCount: number; contents: readonly string[] } | null;
  /** Sipariş edilen miktar (pakette: kaç paket). */
  qty: number;
  /**
   * Paranın hesaplandığı miktar. Hazırlık onaylanmadan önce **`qty`nin kendisidir** — o aşamada
   * `fulfilled_qty` henüz yazılmamış bir varsayılandır, ölçüm değil (`isFulfilmentKnown`).
   */
  billedQty: number;
  /**
   * Eksik karşılama GERÇEKTEN var mı — yalnız ölçüm bilindiğinde ve gerçekten az olduğunda `true`.
   * Ekran bunu yeniden hesaplamaz: "azsa" kuralını iki yerde tutmak, bir gün ayrışan iki cevap
   * demekti (ve web'in ilk sürümünde ekran kendi hesabını yapıp her siparişte uyarı bastı).
   */
  shortfall: boolean;
  /** Eksik gelen miktarın para karşılığı — uyarıda tutar da yazılıyor ("5,90 € fark"). */
  shortfallCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface CustomerOrderDetail {
  id: string;
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  active: boolean;
  /**
   * GENİŞ küme — checkout'un aksine burada `pickup` GÖRÜLÜR (26.08): müşteri tezgâhtan ya da
   * kuryenin arabasından kendi hesabıyla alışveriş yapabilir ve o sipariş "Siparişlerim"e düşer.
   * Dar bırakılsaydı ekran yerinde satışı rota teslimatı diye yazar, olmayan bir teslimat günü
   * ve adresi gösterirdi.
   */
  deliveryType: DeliveryType;
  deliveryDate: string | null;
  address: { line1?: string; line2?: string; postalCode?: string; city?: string } | null;
  lines: readonly CustomerOrderDetailLine[];
  /**
   * Dört adımlı zaman çizgisi; iptal/iade/taslakta `null` — tasarım orada "çizgi yerine tek durum
   * bloğu" istiyor ve kararı motor veriyor (`orderTimeline`).
   */
  timeline: readonly OrderTimelineStep[] | null;
  subtotalCents: number;
  discountCents: number;
  discountLabel: string;
  shippingFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  /** Vadeli (B2B) — ödeme hapının ayrı bir hâli. */
  onAccount: boolean;
  /**
   * **Kargo künyesi** — `null` iki ayrı hâlde: rota siparişi ve takibi henüz olmayan kargo
   * siparişi. İkisini ayırmıyoruz çünkü ekranda ikisi de aynı şeyi yapar: blok çizilmez.
   *
   * **`parcels` DİZİ, çünkü çok kolili gönderide her kolinin ayrı takip numarası var**
   * (multicollo, 07.12). Tek numara taşıyan eski şekil üç kutulu bir siparişin ikisini görünmez
   * kılıyordu.
   *
   * `carrierName` ya sağlayıcının verdiği özel isimdir ("Chronopost") ya da elle girişte taşıyıcı
   * enum'unun anahtarı — ekran tanıdığı anahtarı çevirir, tanımadığını olduğu gibi basar. İkisini
   * ayrı alanlara bölmek, "tam olarak biri dolu" diyen ve derleyicinin doğrulayamadığı bir
   * sözleşme kurardı.
   */
  shipment: {
    carrierName: string | null;
    parcels: ReadonlyArray<{ ordinal: string | null; trackingNumber: string; trackingUrl: string | null }>;
  } | null;
}

/**
 * Siparişe HANGİ ANAHTARLA ulaşıldığı — iki yüzey iki anahtar kullanıyor ve kural tek.
 *
 * Web `/orders/[reference]` segmentinde aslında sipariş UUID'sini taşıyor (segment adı öyle kalmış,
 * `orderIdOrNull` künyesi); mobil gerçekten REFERANS numarasını taşır — müşteriye gösterilen ve
 * destekle konuşurken kullanılan numara odur (`/support/new?order=LA-…` bağı da onu bekliyor).
 * Ayrık birlik, kapının GÖVDESİNİ ikiye bölmeden ikisini de karşılar; iki ayrı fonksiyon yazmak
 * aynı 80 satırı iki kez bakıma mahkûm etmekti.
 */
export type CustomerOrderLookup = { orderId: string } | { reference: string };

export interface CustomerOrderDetailInput {
  customerId: string;
  locale: PreferredLanguage;
  lookup: CustomerOrderLookup;
}

/**
 * Tek siparişin detayı.
 *
 * **Sahiplik sunucuda doğrulanır** ve bulunamayan ile başkasına ait olan AYNI cevabı alır (`null`):
 * ayrım söylenirse, deneme yanılmayla başkasının sipariş kimliği doğrulatılabilirdi.
 *
 * **Taslak burada da görünmez** — listede olmayan bir siparişin detayına doğrudan adresle
 * girilebilmesi, listenin kuralını arkadan delerdi.
 *
 * **Satır toplamı sipariş anındaki paradan hesaplanır** (`unit_price` × giden miktar − indirim
 * payı), bugünkü fiyattan değil: burası bir KAYITTIR, vitrin değil. Ürün ADI ise canlı okunur —
 * para donar, isim donmaz (ürün yeniden adlandırıldığında eski siparişte eski ad kalsaydı müşteri
 * ne aldığını bulamazdı).
 */
export async function getCustomerOrderDetail(
  db: SupabaseClient,
  input: CustomerOrderDetailInput,
): Promise<CustomerOrderDetail | null> {
  const service = new OrderService(db);

  /*
    Referansla gelen istekte SAHİPLİK SORGUYA GÖMÜLÜ: `reference_no` benzersiz olsa da müşteri
    süzgeci olmadan okumak, "var mı yok mu" sorusunu numara deneyen birine cevaplamak olurdu.
    Kimlikle gelen istekte süzgeç aşağıdaki eşitlik kontrolüdür (web'in kararı, birebir).
  */
  const order =
    'orderId' in input.lookup
      ? await service.getById(input.lookup.orderId)
      : await service.findByReference(input.lookup.reference, input.customerId);
  if (!order || order.customerId !== input.customerId) return null;

  const status = customerOrderStatus(order.status);
  if (!status) return null;

  const items = await new OrderItemService(db).listByOrder(order.id);
  const bundleIds = [...new Set(items.map((i) => i.bundleId).filter((id): id is string => Boolean(id)))];

  const [history, bundles] = await Promise.all([
    new OrderStatusLogService(db).listByOrder(order.id),
    /*
      ── PAKET KÜNYESİ: SATILABİLİRLİK SÜZGECİ YOK (web'den bilinçli sapma) ───────────────
      Web bu künyeyi vitrin kapısından (`getPackagesByIds` → `listSellable`) okuyor ve o kapı
      pasif/kalemi satıştan kalkmış paketi ELER; web künyesi de sonucu kabullenip "paket artık
      satılmıyorsa kalemler tek tek gösterilir" diyor. Ama burası bir SATIŞ ekranı değil, bir
      KAYITTIR: müşteri o paketi aldı ve faturasında tek satır olarak gördü. Satılabilirlik
      süzgeci o kapının kendi işiydi — sipariş geçmişine sızması, ürünlerden biri pasife
      alındığında geçmiş bir siparişin görünümünü değiştirirdi (aynı sipariş dün tek satır,
      bugün beş satır). Kural değişmedi, kuralın yanlış kapıdan geçmesi düzeldi.
      Vitrinin stok/tükenme zinciri zaten HÂLÂ web'de ve buraya gerekmiyor: tükendi bilgisi
      geçmiş bir siparişin sorusu değil.

      Paket kataloğu DOĞAL TAVANLI bir küme (operatör elle kurar — CLAUDE §1 "tek turda" dalı):
      tek sorguda gelir, kimlikler bellekte süzülür (mobil `packages.ts` ucunun aynı deseni).
    */
    bundleIds.length === 0
      ? Promise.resolve([])
      : new BundleService(db).listWithItems().then((all) => all.filter((b) => bundleIds.includes(b.id))),
  ]);

  // Künye çözümü TEK turda: sipariş kalemlerinin varyantları + paket içeriğinin varyantları birlikte
  // — paket başına ikinci bir tur açmak N+1'in küçük hâli olurdu.
  const lookup = await resolveOrderLines(
    db,
    [...items, ...bundles.flatMap((b) => b.items)],
    input.locale,
  );

  /**
   * Ölçüm var mı? Hazırlık onaylanana kadar `fulfilled_qty` yazılmamış bir `0`dır — onu "gönderilen
   * miktar" saymak, yeni siparişte tüm kalemleri boş ve tutarları EKSİ gösterir (30.07 hatası).
   */
  const measured = isFulfilmentKnown(order.status);
  const billedOf = (item: OrderItem) => (measured ? item.fulfilledQty : item.qty);

  /*
    SATIR PARASI ÖDEME MOTORUNDAN (kullanıcı bulgusu 01.09) — burada ikinci kez çarpılmıyor.

    Burada bir tur kendi çarpması vardı (`birim × karşılanan − satır indirimi`) ve motorunkinden
    AYRIŞMIŞTI: motor indirimi karşılanan orana böler (`lineDiscountCents × karşılanan / sipariş`),
    bu satır ise indirimin TAMAMINI düşürüyordu. Sonuç, müşteriye 1 adet için 2 adetlik indirim
    yazmaktı — ölçüldü: aynı kalem ekranda 15,72 €, kuryenin kapıda tahsil ettiği hesapta 19,09 €.
    İki ekran aynı siparişe iki fiyat söylüyordu ve ayrım kimsenin bakmadığı bir çarpmadaydı.
  */
  const moneyLine = (item: OrderItem) => ({
    fulfilledQty: item.fulfilledQty,
    orderedQty: item.qty,
    unitPriceCents: item.unitPriceCents,
    lineDiscountCents: item.lineDiscountAmountCents,
  });
  const moneyCentsOf = (item: OrderItem) => fulfilledLineAmountCents(moneyLine(item), measured);
  /** Sipariş edilenin tutarı — eksik hiç yokmuş gibi; ekranda ÜSTÜ ÇİZİLİ gösterilen sayı. */
  const orderedCentsOf = (item: OrderItem) => fulfilledLineAmountCents(moneyLine(item), false);
  /** Satırın indirim payı — ara toplam ile indirim satırının ayrıştırılması için. */
  const discountShareOf = (item: OrderItem) => item.unitPriceCents * billedOf(item) - moneyCentsOf(item);

  const lines: CustomerOrderDetailLine[] = [];

  /**
   * PAKET satırları tek satıra katlanır. Adet paket içeriğinin oranından geri gelir (paket 2 adet A
   * içeriyorsa ve siparişte 6 A varsa 3 paket alınmıştır) — `reorder` ile aynı hesap (`bundleQtyOf`).
   */
  const grouped = new Set<string>();
  for (const bundle of bundles) {
    const own = items.filter((i) => i.bundleId === bundle.id);
    if (own.length === 0) continue;
    own.forEach((i) => grouped.add(i.id));

    const qty = bundleQtyOf(bundle.items, own);
    const totalCents = own.reduce((sum, i) => sum + moneyCentsOf(i), 0);
    lines.push({
      id: `bundle:${bundle.id}`,
      orderItemIds: own.map((i) => i.id),
      name: resolveLocalizedText(bundle.name, input.locale),
      unit: '',
      image: imageOf(bundle),
      bundle: {
        itemCount: bundle.items.length,
        // Adı çözülemeyen içerik satırı LİSTEDEN DÜŞER, boş dize olarak yazılmaz: "· · Baklava"
        // gibi bir künye müşteriye bir şey söylemez (web `toDetail`in tersi karar ve bilinçli —
        // orada satırın kendisi bir bağdır ve yerini tutmak zorundadır, burada yalnız bir özet).
        contents: bundle.items
          .map((c) => lookup.get(c.variantId)?.name ?? '')
          .filter((name) => name.length > 0),
      },
      qty,
      billedQty: qty,
      // Paket bütün olarak satılır; eksik karşılama kalem düzeyinde bir olaydır ve paket satırında
      // gösterilecek yeri yok. Kalemlerinden biri eksik geldiyse fark tutar satırında görünür.
      shortfall: false,
      shortfallCents: 0,
      unitPriceCents: qty > 0 ? Math.round(totalCents / qty) : totalCents,
      lineTotalCents: totalCents,
    });
  }

  for (const item of items) {
    if (grouped.has(item.id)) continue;
    const line = lookup.get(item.variantId);
    lines.push({
      id: item.id,
      orderItemIds: [item.id],
      name: line?.name ?? '',
      unit: line?.unit ?? '',
      image: line?.image ?? EMPTY_IMAGE,
      bundle: null,
      qty: item.qty,
      billedQty: billedOf(item),
      shortfall: measured && item.fulfilledQty < item.qty,
      /* Fark, İKİ TUTARIN farkıdır — "eksik adet × birim fiyat" DEĞİL. İndirim payı da eksik adetle
         birlikte düştüğü için ham çarpım gerçek kaybı olduğundan büyük gösteriyordu; ekran bu sayıyı
         üstü çizili tutarı geri hesaplamakta kullanıyor (`lineTotal + shortfall = sipariş edilen`),
         dolayısıyla yanlışı orada da görünürdü. */
      shortfallCents: measured ? orderedCentsOf(item) - moneyCentsOf(item) : 0,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: moneyCentsOf(item),
    });
  }

  /* İndirim TÜM kalemlerden toplanır — paketlenmiş olanlar dahil: onların payı da satırlarının
     tutarından düşülmüş durumda, özet panelinde geri eklenmezse ara toplam eksik kalır. */
  const discountCents = items.reduce((sum, item) => sum + discountShareOf(item), 0);

  /*
    Takip künyesi EN SONDA okunuyor ve yalnız kargo siparişinde: rota siparişinde gönderi satırı
    hiç doğmaz, sorgu baştan cevabı belli bir soru olurdu. Kalem/paket çözümünün turlarına
    katılmadı çünkü onlar sipariş kalemlerine bağlı; bu okuma bağımsız ve tek kutulu siparişte
    iki küçük sorgu.
  */
  const tracking =
    order.deliveryType === 'shipping'
      ? await readOrderTracking(db, order.id, { carrier: order.carrier, trackingNumber: order.trackingNumber })
      : null;

  return {
    id: order.id,
    referenceNo: order.referenceNo,
    createdAt: order.createdAt,
    status,
    active: isActiveForCustomer(status),
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate,
    address: order.addressSnapshot as CustomerOrderDetail['address'],
    lines,
    timeline: orderTimeline(order.status, history),
    /*
      ARA TOPLAM VE İNDİRİM DE TÜRETİLİR — siparişte ayrı bir alan yok ve olmamalı: iki kaynak bir
      gün ayrışır (ve ayrıştı, künye aşağıda `totalCents`ta).

      İNDİRİM DE KARŞILANANIN PAYIDIR (kullanıcı bulgusu 01.09): `order.discount_amount` sipariş
      ANINDA anlaşılan indirimdir, eksik gönderimden haberi yoktur. Ham okunduğunda özet paneli
      kendi içinde çelişiyordu — ölçüldü: ara toplam 32,10, indirim 8,18, toplam 27,29; oysa
      32,10 − 8,18 = 23,92. Doğrusu satırların indirim paylarının toplamı (4,81), ve o zaman üç
      satır birbirini tutuyor.
    */
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0) + discountCents,
    discountCents,
    discountLabel: order.discountLabel ? resolveLocalizedText(order.discountLabel, input.locale) : '',
    shippingFeeCents: order.shippingFeeCents,
    /*
      TOPLAM DA TÜRETİLİR — `order.total` HAM OKUNMAZ (kullanıcı bulgusu 01.09).

      Ekran kendi içinde çelişiyordu: ara toplam eksik karşılamayı görüp düşüyor (üstteki künye),
      toplam ise siparişin ANLAŞILAN tutarını yazıyordu. Cihazda ölçüldü — kalemler 23,92 € ederken
      Toplam 46,39 € diyordu; kapıda ödemeli bir siparişte müşteri kapıya yanlış parayla hazırlanır.

      Sayı ÖDEME MOTORUNDAN alınıyor, burada ikinci kez çarpılmıyor: `fulfilledAmountCents` zaten
      kargoyu ve satır indirimlerini içeriyor ve hazırlık kesinleşmediyse siparişin kendi toplamına
      düşüyor (`payment-status.ts` künyesi). Kuryenin kapıda tahsil ettiği tutar da aynı motordan
      geliyor (`courier/delivery.ts`) — iki ekran artık aynı hesabı okuyor, ayrışamaz. Üstteki ara
      toplam künyesinin "iki kaynak bir gün ayrışır" cümlesi tam olarak burada gerçekleşmişti.
    */
    totalCents: derivePaymentStatusForOrder(order, items, {
      collectedCents: order.amountCollectedCents,
      refundedCents: order.amountRefundedCents,
    }).fulfilledAmountCents,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    onAccount: order.onAccount,
    /*
      Künye TEK KAPIDAN geliyor (`readOrderTracking`, 07.12): duyurulan gönderi varsa o konuşur,
      yoksa hazırlık panelinden ELLE girilen numaraya düşülür. İkisi de meşru yol — sağlayıcının
      kapsamadığı taşıyıcı elle giriliyor.

      Numarası olmayan gönderi künye AÇMAZ: taşıyıcı belli ama numara henüz gelmemişse ekranın
      söyleyeceği bir şey yok ve boş bir "Takip no:" satırı müşteriye bilgi değil kaygı verir.
    */
    shipment:
      tracking && tracking.parcels.length > 0
        ? {
            carrierName: tracking.carrierName,
            parcels: tracking.parcels.map((parcel) => ({
              ordinal: parcelOrdinal(parcel),
              trackingNumber: parcel.trackingNumber,
              trackingUrl: parcel.trackingUrl,
            })),
          }
        : null,
  };
}

/* ─────────────────────────── kalem künyesi (iç) ─────────────────────────── */

/** Görseli çözülemeyen satırın yer tutucusu — vitrin kapılarının aynı son çaresi (`CROP_CENTER`). */
const EMPTY_IMAGE: StorefrontImage = { url: null, crop: CROP_CENTER };

/**
 * Sipariş kaleminin MÜŞTERİ künyesi — ürün adı, boy etiketi, görsel.
 *
 * Neden ayrı bir çözüm: `order_item` satırı yalnız `variant_id` taşır, ürün adının anlık
 * görüntüsünü TUTMAZ. Yani "Baklava" yazısını ekrana getirmek her seferinde varyant → ürün
 * zincirini çözmek demek — ve bu zincir üç okumada birden gerekiyor (liste, detay, paket içeriği).
 *
 * **İsim neden siparişte saklanmıyor?** Saklansaydı ürün yeniden adlandırıldığında eski siparişler
 * eski adı gösterirdi. Bugünkü karar: ad CANLI okunur. Fiyat ve indirim ise siparişte donmuş
 * (`unit_price`, `discount_label`) — onlar paranın kaydıdır, ad değil.
 *
 * Sorgu sayısı kalemle DEĞİL, benzersiz varyant/ürün sayısıyla artar: iki toplu okuma
 * (`listByIds`), kalem başına sorgu yok.
 */
interface CustomerOrderLine {
  /** Ürün kimliği — liste küçük resimlerinin tekilleştirme anahtarı. */
  productId: string;
  /** Ürün adı — bulunamazsa boş; ürün silinmiş olabilir, kalem yine de gösterilir. */
  name: string;
  /** Varyant/boy etiketi ("500 g"). */
  unit: string;
  image: StorefrontImage;
}

/**
 * Verilen kalemlerin varyant kimliğine göre künye haritası.
 *
 * Haritada OLMAYAN varyant çağıranı patlatmaz — ürün ya da varyant silinmişse kalem adsız görünür.
 * Siparişi hiç göstermemektense adsız göstermek daha doğru: müşteri parasının karşılığını görmeli.
 */
async function resolveOrderLines(
  db: SupabaseClient,
  items: readonly { variantId: string }[],
  locale: PreferredLanguage,
): Promise<Map<string, CustomerOrderLine>> {
  const variantIds = [...new Set(items.map((i) => i.variantId))];
  if (variantIds.length === 0) return new Map();

  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));

  return new Map(
    variants.map((variant) => {
      const product = productById.get(variant.productId);
      return [
        variant.id,
        {
          productId: variant.productId,
          name: product ? resolveLocalizedText(product.name, locale) : '',
          unit: resolveLocalizedText(variant.label, locale),
          image: product ? imageOf(product) : EMPTY_IMAGE,
        },
      ];
    }),
  );
}
