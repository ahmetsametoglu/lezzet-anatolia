import { OrderItemService, OrderService, OrderStatusLogService, UserProfileService, WarehouseService, type Db } from '@lezzet/database';
import type { CreateOrderItemInput } from '@lezzet/database';
import type { PaymentMethod, PreferredLanguage } from '@lezzet/types';
import { getCartView } from '../cart/read';
import { discountAmountOf, discountIdOf, discountLabelOf, discountSharesOf } from '../cart/cart-types';
import { quickSale, type QuickSaleOutcome } from './quick-sale';

/**
 * **YERİNDE SATIŞ** (21.118 · `DOMAIN §17`) — depo kapısında ya da kuryenin aracında, tek adımda.
 *
 * `DOMAIN §17`: *"Admin yerinde satış yapmaz — satan kişi, malın yanında duran personeldir."*
 * Bu yüzden depo çağıranın künyesinden gelir (personelin O ANKİ deposu) ve **araç da bir depodur**
 * (`warehouse.kind='vehicle'`): aynı kapı hem tezgâhı hem arabayı taşır.
 *
 * ── İKİNCİ BİR SİPARİŞ KURALI YAZILMADI (09.8'in dersi) ─────────────────────
 * Fiyat, KDV, indirim ve toplam **sepet okumasından** geliyor (`getCartView`) — yani müşterinin
 * gördüğü sayıyı üreten motorun ta kendisinden. Pazarlık da oraya giriyor (`priceOverrides`), o
 * alanın künyesi zaten *"yalnız personel yolundan dolar (elle sipariş girişi, yerinde satış)"*
 * diyor. Burada ikinci bir hesap YOK; bu dosya yalnız sırayı kuruyor.
 *
 * ── AMA `createCheckoutDraft` KULLANILMIYOR, VE BU BİLİNÇLİ ─────────────────
 * O kapı **adresten çözülen** akıştır: dönüş tipi bile `AddressDeliveryType` (yani `pickup`
 * HARİÇ). Yerinde satışta adres yok, bölge yok, gün yok, kargo ücreti yok — dördü de `pickup`ın
 * tanımı gereği anlamsız (`resolveShippingFee` `pickup` ALMAZ: cevabı "0" değil, sorunun kendisi
 * geçersiz). Adres yolunu zorlamak, dar kümenin taşıdığı kararı sessizce delmek olurdu.
 *
 * ── `pickup` ⇒ ANINDA TÜKETİM DEĞİL ────────────────────────────────────────
 * Kural bu dosyanın kuralıdır, `delivery_type`ın değil (`DATA_MODEL` › `pickup`). Stok etkisini
 * teslimat tipi değil GEÇİŞ belirliyor (`stockEffectOf`) ve `draft → completed`i BURASI seçiyor.
 * İleride Drive (sipariş ver, gelip al) aynı `pickup` değerini kullanacak ama tam yoldan geçecek:
 * ayırır → hazırlar → teslimde tüketir. O kapıyı kapatmamak için tüketim kararı burada durur.
 */

/**
 * **Yerinde satışın anonim alıcısı** — sabit kimlik, `0001`de yazılıyor (`roles = {system}`).
 *
 * Sipariş sahipsiz olamıyor ama kimlik de SORULMUYOR (kullanıcı kararı 26.08). Bu satır bir kişi
 * değil, bir beyandır: *"müşterisi bilinmiyor."* `system` rolü hiçbir kapı açmaz ve müşteri
 * listesi/sayaçları `roles @> {customer}` ile süzüldüğü için hiçbirinde görünmez — yani ona bir
 * GEÇMİŞ oluşmuyor. Gerekçenin tamamı `0001`in künyesinde.
 *
 * Kimlikli müşteri de bu kapıdan alabilir (kendi hesabıyla duran biri) — o hâlde çağıran gerçek
 * kimliği geçirir; bu sabit yalnız VARSAYILAN değil, **kimliksiz hâlin cevabıdır**.
 */
export const ANONYMOUS_BUYER_ID = '00000000-0000-4000-8000-00000000d001';

export interface OnSiteSaleLine {
  variantId: string;
  qty: number;
  /**
   * Pazarlıklı birim fiyat (**cent**). Verilmezse liste fiyatı çözülür.
   *
   * Dokunulmamış kalemde `undefined` gider ve sunucu fiyatı kendisi çözer — her kaleme sayı
   * göndermek siparişin parasını istemciye yazdırmak olurdu (09.8'in aynı kararı).
   */
  negotiatedUnitPriceCents?: number;
}

export interface OnSiteSaleInput {
  /** Personelin O ANKİ deposu — tesis ya da ARAÇ. Varsayılanı YOKTUR (DOMAIN §17 / C2). */
  warehouseId: string;
  /** Satışı yapan personel — pazarlık izinin "kim" tarafı ve geçiş logunun aktörü. */
  staffId: string;
  /**
   * Siparişin yazılacağı müşteri. Kimlik SORULMADIĞI için bu normalde anonim kayıttır; kimlikli
   * müşteri de geçebilir (kendi hesabıyla alan biri). Kararı çağıran verir — bu kapı politika
   * uygulamaz, yalnız yazar.
   */
  customerId: string;
  lines: readonly OnSiteSaleLine[];
  paymentMethod: PaymentMethod;
  /** Tahsil edilen tutar (**cent**). Verilmezse siparişin toplamı tahsil edilmiş sayılır. */
  collectedAmountCents?: number;
  /** Paranın girdiği kasa. Verilmezse `door_cash_account_id` ayarına düşülür (`quickSale`). */
  paymentAccountId?: string;
  /** Satır adlarının dili — ret mesajları müşterinin değil PERSONELİN dilinde okunur. */
  locale?: PreferredLanguage;
}

export type OnSiteSaleOutcome =
  | { status: 'ok'; orderId: string; totalCents: number; referenceNo: string | null; paymentRecorded: boolean }
  /** Kalemsiz satış yazılamaz — RPC de reddediyor, kontrol gidiş-dönüşü harcamamak için. */
  | { status: 'empty' }
  | { status: 'warehouse_not_found' }
  /** Satılamaz satır (tükendi / satışa kapalı). Elle fiyat yazmak kapanmış ürünü DİRİLTMEZ. */
  | { status: 'blocked_lines'; lines: string[] }
  /**
   * Bu depoda o kadar yok — **sipariş HİÇ yazılmaz** ve kalan sayı söylenir.
   *
   * `createCheckoutDraft`in aynı reddi (aynı ad, aynı biçim): adet sessizce düşürülmez, çünkü
   * müşterinin/personelin yazdığı sayıyı haber vermeden değiştirmek sepette yasakladığımız sessiz
   * daralmanın ta kendisidir.
   */
  | { status: 'insufficient_here'; lines: { name: string; available: number }[] }
  /** Kapanış adımının reddi olduğu gibi taşınır — mal yok, yarış, kural reddi. */
  | { status: 'sale_failed'; outcome: Exclude<QuickSaleOutcome, { status: 'ok' }> };

export async function sellOnSite(db: Db, input: OnSiteSaleInput): Promise<OnSiteSaleOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  const warehouse = await new WarehouseService(db).getById(input.warehouseId);
  if (!warehouse) return { status: 'warehouse_not_found' };

  const locale: PreferredLanguage = input.locale ?? 'tr';
  const overrides = new Map(
    input.lines
      .filter((line) => line.negotiatedUnitPriceCents !== undefined)
      .map((line) => [line.variantId, line.negotiatedUnitPriceCents!] as const),
  );

  /*
    Sepet okuması yerin DEPOSUNU alıyor ve bu tam da istediğimiz süzgeç: depo bazlı
    `available_stock` aracı AYNEN gösteriyor (depo-üstü toplam göstermiyor — `available_stock_total`
    araçları dışlıyor). Yani kuryenin arabasındaki mal burada görünür, ayrılmış mal görünmez.
  */
  const view = await getCartView(
    db,
    locale,
    input.lines.map((line) => ({ kind: 'variant' as const, variantId: line.variantId, qty: line.qty, stockId: null })),
    { customerId: input.customerId, priceOverrides: overrides, warehouseId: input.warehouseId },
  );

  const blocked = view.lines.filter((line) => line.unitPriceCents === null).map((line) => line.name);
  if (blocked.length > 0) return { status: 'blocked_lines', lines: blocked };

  /*
    ── ÖNCE KONTROL, SONRA YAZIM (07.10'un ilkesi, burada da geçerli) ─────────
    Kullanıcının sorusu (26.08): *"oradan satış yaptırırken oranın stoğunu göz önünde bulunduracak
    mıyız?"* Evet — ve iki katman birden: sepet okuması DEPO BAZLI (`availableHere` o deponun
    kullanılabiliri; araç deposu da aynen görünür), son söz ise RPC'nindir (`quickSale` yazım anında
    bir kez daha bakar, çünkü öneri ile yazım arasında raf değişebilir).

    **Ama kontrol yazımdan ÖNCE olmak zorunda ve bu ölçülerek öğrenildi:** kontrol yalnız
    `quickSale`de kalınca satış doğru reddediliyordu ama geriye **hayalet bir taslak** kalıyordu —
    hiçbir yere teslim edilmeyecek, hiç kapanmayacak, kimsenin silmediği bir sipariş satırı. Test
    bunu yakaladı (araçta 5 varken 6 istendi: satış olmadı, sipariş sayısı 0 → 1 oldu).

    Ret biçimi `createCheckoutDraft`inkiyle AYNI (`insufficient_here`): adet sessizce DÜŞÜRÜLMEZ ve
    kalan sayı söylenir — personel müşteriye "üçü var" diyebilsin diye. Sayı sepetin gösterdiğiyle
    aynı kaynaktan geliyor, ikinci bir okuma yok.
  */
  const overCap = view.lines.filter((line) => line.availableHere !== null && line.availableHere < line.qty);
  if (overCap.length > 0) {
    return {
      status: 'insufficient_here',
      lines: overCap.map((line) => ({ name: line.name, available: line.availableHere ?? 0 })),
    };
  }

  /*
    PAKET SATIRI BURADA YOK ve bu bir eksiklik değil, girdinin şekli: bu kapı yalnız varyant
    kalemi alıyor (`OnSiteSaleLine.variantId`), yani sepet okuması da paket satırı üretemiyor.
    Süzgeç tipi daraltmak için, davranışı değiştirmiyor. Kapıda paket satılmak istenirse girdi
    genişler; o gün pazarlığın pakete UYGULANMADIĞI da hatırlanmalı (`priceOverrides` künyesi:
    paketin fiyatı tek sayıdır ve payların toplamı olmak zorundadır — DOMAIN §13).
  */
  /*
    ── İNDİRİM PAYLARI SATIRLA BİRLİKTE SÜZÜLÜR (03.09) ───────────────────────
    `discountSharesOf` KONUM dizisi döner: `view.lines[i]`nin payı `shares[i]`dir. Satırları süzüp
    payları süzmemek, kalan kalemlere BAŞKASININ indirimini yazmaktır (`orderScopeOf` künyesi aynı
    tuzağı checkout tarafında anlatıyor). Bugün süzgeç hiçbir satırı elemiyor — bu kapı yalnız
    varyant kalemi alıyor — ama hizayı tesadüfe bırakmak, girdi bir gün genişlediğinde sessizce
    yanlış kaleme indirim yazmaktır.
  */
  const shares = discountSharesOf(view.discount);
  const kept = view.lines
    .map((line, index) => ({ line, share: shares[index] ?? 0 }))
    .filter((row): row is { line: typeof row.line & { variantId: string }; share: number } => row.line.variantId !== undefined);

  const items: CreateOrderItemInput[] = kept.map(({ line, share }) => ({
    variantId: line.variantId,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents ?? 0,
    // Pazarlık izi İKİSİ BİRLİKTE yazılır (kısıt veride: `order_item_negotiation_complete`).
    ...(line.listUnitPriceCents != null
      ? { listUnitPriceCents: line.listUnitPriceCents, priceSetBy: input.staffId }
      : {}),
    vatRate: line.vatRate,
    /* İNDİRİM KALEME YAZILIR, yoksa CİRO indirimi hiç görmez: `revenue_total` tetikleyicisi
       (0012 `resync_order_revenue`) kalemlerden türüyor ve tek gördüğü alan bu. Künyenin
       tamamı aşağıda, sipariş alanlarının yanında. */
    lineDiscountAmountCents: share,
  }));

  const { order } = await new OrderService(db).create(
    {
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      channel: 'b2c',
      // `door` enum değeri 15.15'ten beri tanımlıydı ve yazan yolu YOKTU — bu kapı onu dolduruyor.
      orderSource: 'door',
      deliveryType: 'pickup',
      status: 'draft',
      paymentMethod: input.paymentMethod,
      // Kargo ücreti SORULMUYOR: `resolveShippingFee` `pickup` almıyor, sipariş doğrudan 0 yazar.
      shippingFeeCents: 0,
      orderedTotalCents: view.totalCents,
      /*
        ── İNDİRİM SİPARİŞE YAZILIR (kullanıcı bulgusu 03.09, cihazda ölçüldü) ──
        Bu üç alan bir tur BOŞ GİDİYORDU ve `orderedTotalCents` indirimli tutarı taşıyordu; yani
        sipariş ucuz, sebebi yoktu. Ölçülen sonuç (LA-26-9DPPDL, araçtan iki adet baklava):
        sepet 18,30 €, tahsilat 15,30 € (otomatik "Bayram Sofrası seçkisi" 3 €) — ve kayıtta
        `ordered_total 15,30` · `revenue_total 18,30` · `discount_amount 0` · **`payment_status
        partial`**. Yani müşteri parasını tam ödemişken sistem onu 3 € BORÇLU sayıyordu; ciro da
        indirimi görmediği için şişik. Üç ayrı sonuç, tek sebep:
          · `revenue_total` kalemlerden türer (`resync_order_revenue`) ve yalnız
            `line_discount_amount`ı okur — pay yazılmayınca indirim ciroya hiç girmez.
          · `payment_status` ciroyu tahsilatla karşılaştırır → `partial`, borç hatırlatması yolu açık.
          · Kampanya KOTASI `create_order` RPC'sinde siparişin `discount_id`sinden tükenir; boş
            kalınca kapıda satılan her indirimli kalem kotayı sessizce deliyordu (`OrderService.create`
            künyesi bu açığı 09.6'da checkout için kapatmıştı — kapıda satış aynı deliği geri açmıştı).
        Alanlar checkout'un okuduğu AYNI fonksiyonlardan geliyor (`cart-types`): iki kapı bir gün
        ayrışsaydı aynı sepet iki farklı kayıt üretirdi. `discount_amount = Σ line_discount_amount`
        değişmezini veritabanı commit anında denetliyor (`order_discount_balance`, 0041) — pay ile
        başlık ayrışırsa yazım reddedilir, sessiz sapma imkânsız.

        KUPON KODU YOK ve olmayacak: bu kapı sepete kod almıyor, yalnız OTOMATİK kampanya iniyor
        (`create`in `discountCodeId` seçeneği bu yüzden geçilmiyor — uydurulmuş bir "kod karşılık
        buldu" kaydı, kampanya raporunu yanlış okuturdu).
      */
      discountAmountCents: discountAmountOf(view.discount),
      discountId: discountIdOf(view.discount),
      discountLabel: discountLabelOf(view.discount),
      locale,
    },
    items,
  );

  const outcome = await quickSale(db, {
    orderId: order.id,
    actorId: input.staffId,
    paymentMethod: input.paymentMethod,
    collectedAmountCents: input.collectedAmountCents,
    paymentAccountId: input.paymentAccountId,
  });

  if (outcome.status !== 'ok') return { status: 'sale_failed', outcome };

  return {
    status: 'ok',
    orderId: order.id,
    totalCents: view.totalCents,
    referenceNo: outcome.referenceNo,
    paymentRecorded: outcome.paymentRecorded,
  };
}

/** Son satışlar görünümünün satırı — telin şekli `SaleRecordSchema`da aynalanır. */
export interface DoorSaleRecord {
  orderId: string;
  referenceNo: string | null;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  /** Kalem sayısı — ekran "N kalem" yazar; kalem adları bu görünümün sorusu değil. */
  lineCount: number;
  /**
   * Satışı YAZAN personelin adı. Kaynağı ayrı bir kolon değil, zaten tutulan iz:
   * `order_status_log`un `completed` geçişindeki `actorId` (`quick_sale` RPC yazıyor, 0017).
   * `null` = iz yok (aktörsüz eski kayıt) — ekran "bilinmiyor" der, uydurmaz.
   */
  sellerName: string | null;
}

/**
 * **SON KAPI SATIŞLARI** (21.119, kullanıcı isteği 26.08: "kaydedilen satışı görebileyim, kim
 * yaptıysa görünsün") — personelin O ANKİ deposunun `door` siparişleri, en yeni önce.
 *
 * Üç okuma, üçü de TOPLU (N+1 yok): siparişler → kalemler → geçiş izleri; satıcı adları tek
 * `listByIds` ile. Tavan `listDoorSales`ın bilinçli sınırı (künyesi orada).
 */
export async function listRecentDoorSales(db: Db, warehouseId: string): Promise<DoorSaleRecord[]> {
  const orders = await new OrderService(db).listDoorSales(warehouseId);
  if (orders.length === 0) return [];
  const orderIds = orders.map((o) => o.id);

  const [items, logs] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
  ]);

  const lineCounts = new Map<string, number>();
  for (const item of items) lineCounts.set(item.orderId, (lineCounts.get(item.orderId) ?? 0) + 1);

  // Satan kişi = `completed`a GEÇİREN aktör. Aynı sipariş iki kez completed olamaz (durum makinesi);
  // yine de son yazılan kazanır — log kronolojik geliyor.
  const sellerIds = new Map<string, string>();
  for (const log of logs) {
    if (log.toStatus === 'completed' && log.actorId !== null) sellerIds.set(log.orderId, log.actorId);
  }
  const sellers = await new UserProfileService(db).listByIds([...new Set(sellerIds.values())]);
  const nameOf = new Map(sellers.map((s) => [s.id, s.name]));

  return orders.map((order) => ({
    orderId: order.id,
    referenceNo: order.referenceNo,
    totalCents: order.orderedTotalCents,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    lineCount: lineCounts.get(order.id) ?? 0,
    sellerName: nameOf.get(sellerIds.get(order.id) ?? '') ?? null,
  }));
}
