import 'server-only';
import {
  AddressService,
  BundleItemService,
  OrderService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { cityMatchesPlaces, deriveChannel } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import type { DeliveryType, LocalizedText, OrderItemInsert, PaymentMethod } from '@lezzet/types';
import { getCartView } from '@/lib/cart/read';
import { placesForPostalCode } from '@/lib/delivery/places';
import type { CartEntry, CartLine, CartView } from '@/lib/cart/cart-types';
import { resolveCheckoutPayment } from './checkout-options';
import { resolveDelivery } from './delivery';

/**
 * Sepet → TASLAK SİPARİŞ (07.4'ün eksik halkası) — **uygulama katmanı orkestrasyonu**.
 *
 * 07 modülünün checkout parçaları tek tek yazılmıştı ama her biri girdisinin HAZIR olduğunu
 * varsayıyordu: `resolveDelivery` posta kodunu, `resolveCheckoutPayment` sepet tutarını,
 * `createCheckoutSession` ise ortada duran bir `draft` siparişi. O taslağı doğuran yer hiç
 * yazılmamıştı — `OrderService.create` bugüne dek yalnız testlerden çağrılıyordu. Burası o yer.
 *
 * **Bağlayıcı fiyat BURADA sabitlenir** (DOMAIN §5). Sepetteki fiyat gösterimdir ve sepet aylarca
 * bekleyebilir; sipariş kalemine yazılan `unit_price` bu andaki çözümdür. Bu yüzden sepet
 * istemciden gelen tutarlarla değil, sunucuda YENİDEN okunur (`getCartView`).
 *
 * **İstemciden yalnız SEÇİMLER alınır** — adres, gün, ödeme yöntemi. Tutar, kargo ücreti, indirim
 * ve teslimat türü istemciden hiç kabul edilmez; hepsi burada çözülür. Aksi hâlde tarayıcı
 * konsolundan gönderilen bir `total` alanı siparişin parasını belirlerdi.
 *
 * **Her seçim yeniden DOĞRULANIR:** gönderilen gün gerçekten uygun günlerden biri mi, gönderilen
 * yöntem gerçekten açık yöntemlerden biri mi. Ekran doğru davranıyor diye sunucu güvenmez —
 * ekranın açık olduğu süre içinde bölge kapanmış, tavan değişmiş, ürün tükenmiş olabilir.
 */

type CheckoutDraftOutcome =
  | { status: 'ok'; orderId: string; totalCents: number; deliveryType: DeliveryType }
  /**
   * Yer çözülemedi: sipariş açılamaz. `ambiguous_zone` bir VERİ hatasıdır (aynı kod iki bölgede),
   * `no_shipping_warehouse` bir YAPILANDIRMA eksiğidir (kargo deposu yok). İkisi de müşteriye
   * "bölge dışısınız" dedirtmemeli — o başka bir şey; ekran operatöre haber verilmesini söyler.
   */
  | { status: 'warehouse_unresolved'; reason: 'ambiguous_zone' | 'no_shipping_warehouse' }
  | { status: 'empty_cart' }
  /** Tükenmiş/satışa kapanmış satır var — çıkarılmadan sipariş açılmaz. */
  | { status: 'blocked_lines'; lines: string[] }
  | { status: 'min_basket'; missingCents: number }
  | { status: 'address_not_found' }
  /**
   * Adresin şehri, posta kodunun kapsadığı yerleşimlerden biri değil (19.17) — **rota siparişinde.**
   *
   * Yaşanmış bir arızanın kapısı: `67000` + `LINGOLSHEIM` rota + kapıda ödeme olarak açılmıştı,
   * oysa Lingolsheim'ın kodu `67380` ve o kod rotamızda yok. Kurye kapıya gidemez, operasyon
   * müşteriyi aramak zorunda kalır. Yolu belirleyen tek şey posta koduydu ve hiçbir yerde adresle
   * karşılaştırılmıyordu.
   *
   * Sipariş SESSİZCE kargoya çevrilmez: tür değişimi kargo ücretini ve açık ödeme yöntemlerini de
   * değiştirir, müşteri sebebini anlamadan başka bir siparişe bakar. Doğrusu durup söylemek —
   * `places` ekranın "şu olmalı" diyebilmesi için taşınır.
   */
  | { status: 'address_city_mismatch'; postalCode: string; city: string; places: string[] }
  /** Rota dışı adres + sepette soğuk zincir kalemi: ne kapıya ne kargoya. Sepet bölünmeli (K32). */
  | { status: 'cold_chain_unshippable' }
  | { status: 'date_unavailable'; availableDates: string[] }
  | { status: 'payment_not_allowed'; methods: PaymentMethod[] }
  | { status: 'customer_not_found' };

interface CheckoutDraftInput {
  locale: Locale;
  /**
   * **Sunucuda çözülmüş** müşteri kimliği — istemciden ASLA alınmaz.
   *
   * İki meşru kaynağı var ve ikisi de sunucudadır: girişli müşteride oturum (`requireAuth` →
   * `findByAuthUserId`), misafirde OTP doğrulamasından sonra sunucunun kendi yazdığı httpOnly
   * çerez (04.6). Kapı hangisinden geldiğini bilmez — bilmesi de gerekmez; onu çözmek çağıranın
   * işidir ve tek yerde (`checkout/actions.ts`) yapılır.
   */
  customerId: string;
  entries: readonly CartEntry[];
  addressId: string;
  /** Rota içi teslimatta seçilen gün; kargoda null (tarih taşıyıcıya bağlı, söz verilmez). */
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  /** Vadeli ("hesaba") satın alma — ödeme yöntemi değil, siparişin bayrağı. */
  onAccount?: boolean;
  couponCode?: string | null;
  /** Çift sipariş kalkanı (0015) — istemcinin o checkout denemesi için ürettiği anahtar. */
  idempotencyKey?: string | null;
  /**
   * Bu taslak, sepetin KARGO grubundan açılan ikinci sipariş mi (19.15).
   *
   * ── NEDEN AÇIK BİR GİRDİ, TÜRETME DEĞİL ────────────────────────────────────
   * Taslak sepetin alt kümesini zaten alabiliyordu (`entries`), ama teslimatı ADRESTEN çözüyordu:
   * adres rota içindeyse zincir `route` + **rota deposunu** döndürür. Kargo grubunun kalemleriyle
   * açılan ikinci taslak böylece malın BULUNMADIĞI depodan bir rota siparişi üretirdi.
   *
   * Türetmek de yanlış olurdu ("kalemlerin hiçbiri yerelde yok, demek ki kargo"): aynı sepet iki
   * kez okunur ve arada stok değişirse ikinci taslak sessizce tür değiştirirdi. Yol AÇIK seçimdir,
   * varsayılanı yoktur (DOMAIN §17 / C2).
   *
   * `true` iken üç şey değişir: depo kargo deposudur, tür `shipping`'tir, gün seçilmez (kargoda
   * tarih taşıyıcıya bağlıdır ve söz verilmez). Ödeme kısıtı KENDİLİĞİNDEN düzelir — motor
   * `deliveryType === 'shipping'` görünce kapıda ödemeyi zaten kapatıyor (K37, doğrulandı).
   */
  shippingOrder?: boolean;
}

export async function createCheckoutDraft(input: CheckoutDraftInput): Promise<CheckoutDraftOutcome> {
  const db = serviceDb();

  const customer = await new UserProfileService(db).getById(input.customerId);
  if (!customer) return { status: 'customer_not_found' };

  // 1) Adres önce: teslimat türü de kargo ücreti de ondan çıkıyor. Adres MÜŞTERİNİN mi diye
  //    bakılır — kimlik istemciden geldiği için başkasının adresine sipariş açılabilirdi.
  const address = (await new AddressService(db).listByCustomer(customer.id)).find((a) => a.id === input.addressId);
  if (!address) return { status: 'address_not_found' };

  // 2) DEPO önce: sepet hangi deponun stoğuyla okunacağını bilmek zorunda (19.9). Tasarımın
  //    "adres kazanır" kuralı burada uygulanır — seçilen adresin kodu şeritteki koddan farklıysa
  //    sepet o anda o adrese göre değerlendirilir, şerit yalnız bir varsayılandı.
  //
  //    Sıra döngüsel görünüyor (teslimat sepeti ister, sepet depoyu) ama değil: depo seçimi
  //    yalnız ADRESE bağlı, sepet yalnız "kargo da kapalı mı" kararını etkiliyor. O yüzden teslimat
  //    iki kez çözülüyor — girdileri önbellekli (`lib/delivery/inputs`), ikinci tur bedava.
  const place = await resolveDelivery({ postalCode: address.postalCode, country: address.country });

  // Kargo siparişinde depo ADRESTEN değil, ülkenin kargo deposundan gelir (19.15): kalemler orada
  // duruyor, rota deposunda değil. Kargo deposu yoksa sipariş açılamaz ve sebebi ayrı söylenir —
  // bu bizim yapılandırma eksiğimizdir, müşterinin bölgesiyle ilgisi yok.
  const orderWarehouseId = input.shippingOrder ? place.shippingWarehouseId : place.warehouseId;
  if (input.shippingOrder && !orderWarehouseId) {
    return { status: 'warehouse_unresolved', reason: 'no_shipping_warehouse' };
  }

  // 3) Sepet SUNUCUDA yeniden okunur: bağlayıcı fiyat bu okumadan doğar. Depo bağlamıyla —
  //    aksi hâlde "sepette gördüm, ödemede kayboldu" sürprizi mümkün kalırdı.
  //
  //    Kargo siparişinde sepet KARGO deposuyla okunur: kalemlerin bulunduğu yer orası. Satırların
  //    `route`'u o hâlde `local` görünür ve bu bir çelişki değil — o alan "sepet ekranında hangi
  //    gruba düşüyor" sorusunun cevabıdır; burada grup zaten seçilmiş, sipariş türü ayrı taşınıyor.
  const cart = await getCartView(input.locale, input.entries, {
    customerId: customer.id,
    couponCode: input.couponCode,
    warehouseId: orderWarehouseId,
    shippingWarehouseId: place.shippingWarehouseId,
  });
  if (cart.lines.length === 0) return { status: 'empty_cart' };

  // 4) Teslimat kararı tamamlanır: posta kodu → bölge → gün(ler). Soğuk zincir kalemi kargoyu kapatır.
  const hasNonShippableItem = cart.lines.some((l) => !l.shippable);
  const delivery = await resolveDelivery({ postalCode: address.postalCode, country: address.country, hasNonShippableItem });

  // ── SİPARİŞİN TÜRÜ: KARGO SEÇİMİ ADRESİN CEVABINI EZER (19.15) ─────────────
  // Adres rota içinde olsa bile bu sipariş kargodur — kalemleri yerel depoda yok, kargo deposundan
  // gidiyor. Tür burada sabitlenir ve aşağıdaki her karar (ödeme yöntemleri, kargo ücreti, gün) onu
  // izler. Ezme TEK YÖNLÜDÜR: normal taslak adresin cevabını olduğu gibi kullanır.
  const deliveryType = input.shippingOrder ? ('shipping' as const) : delivery.deliveryType;

  // ── YAPISAL ENGEL, GEÇİCİ OLANDAN ÖNCE ────────────────────────────────────
  // Soğuk zincir kontrolü `blocked_lines`'tan ÖNCE gelir. Sepet artık depo bağlamıyla okunuyor
  // (adım 3) ve rota dışı adreste kargo deposunda bulunmayan soğuk zincir kalemi "şu an alınamıyor"
  // diye işaretleniyor — doğru ama YANILTICI cümle: müşteri stok beklemeye başlar, oysa o ürün o
  // adrese hiç gitmeyecek. Önce "gönderilemez" denir, sonra "şu an yok".
  // Kargo siparişi soğuk zincir kalemi TAŞIYAMAZ ve bu ayrıca kontrol edilir: `shippingBlockedReason`
  // yalnız rota DIŞI adreste doluyor (orada kargo tek yoldur). Rota İÇİ bir adresten açılan kargo
  // siparişinde o alan boş kalır — kontrol ona bırakılsaydı soğuk zincir ürün kargoya çıkardı.
  // ── ADRES KENDİYLE TUTARLI MI (19.17) ─────────────────────────────────────
  // Yalnız ROTA siparişinde sorulur ve sırası burası: yolu belirleyen posta kodudur, ama kapıya
  // giden kurye SOKAĞA gider. Kod ile şehir farklı yerleri gösteriyorsa ikisinden biri yanlıştır ve
  // hangisi olduğunu biz bilemeyiz — o yüzden düzeltmiyoruz, soruyoruz. Kargoda sorulmaz: paketi
  // taşıyıcı taşır ve adresi o doğrular; bizim reddimiz orada boşa sürtünme olurdu.
  //
  // Kural KAPIDA, formda değil: form istemcidedir ve atlanabilir. Form aynı şeyi erken söyler
  // (müşteri ödemeye gelmeden düzeltsin) ama tek başına bir kapı değildir.
  if (deliveryType === 'route') {
    const places = await placesForPostalCode(address.country, address.postalCode);
    if (!cityMatchesPlaces(address.city, places)) {
      return { status: 'address_city_mismatch', postalCode: address.postalCode, city: address.city, places };
    }
  }

  if (input.shippingOrder && hasNonShippableItem) return { status: 'cold_chain_unshippable' };
  if (delivery.shippingBlockedReason === 'cold_chain') return { status: 'cold_chain_unshippable' };
  if (cart.hasBlocked) return { status: 'blocked_lines', lines: cart.lines.filter((l) => l.blocked).map((l) => l.name) };

  // ── BU SİPARİŞİN DEPOSUNDA KARŞILANAMAYAN KALEM (19.15) ───────────────────
  // `blocked` bu soruyu artık cevaplamıyor ve cevaplamamalı: 19.10 onu daralttı — kargoyla
  // gelebilen ürün "tükendi" değildir (C3) ve sepette satılabilir görünür. Ama BU sipariş tek bir
  // depodan çıkıyor (K5); o depoda bulunmayan kalem buraya giremez, yoksa taslak açılır ve iş
  // rezervasyon aşamasında, müşteri ödemeye geçtikten sonra patlar.
  //
  // Ayrımın yeri burası: sepet "alınabilir mi" sorusunu yanıtlar, checkout "bu siparişle gelir mi".
  const unfulfillable = cart.lines.filter((l) => l.route !== null && l.route !== 'local');
  if (unfulfillable.length > 0) return { status: 'blocked_lines', lines: unfulfillable.map((l) => l.name) };
  if (!cart.minBasketOk) return { status: 'min_basket', missingCents: cart.missingForMinBasketCents };

  // Gün DOĞRULANIR, kabul edilmez: ekran açıkken kesim saati geçmiş ya da bölge günü değişmiş olabilir.
  // Kargo siparişinde gün HİÇ sorulmaz: tarih taşıyıcıya bağlıdır ve söz verilmez.
  if (deliveryType === 'route') {
    const chosen = input.deliveryDate ?? (delivery.availableDates.length === 1 ? delivery.availableDates[0]! : null);
    if (!chosen || !delivery.availableDates.includes(chosen)) {
      return { status: 'date_unavailable', availableDates: delivery.availableDates };
    }
  }

  // 4) Ödeme seçenekleri + kargo ücreti + KDV kırılımı. Kalem oranları kalem kalem geçilir:
  //    kargonun KDV'si taşıdığı malın oranını izler, tek oran varsaymak karışık sepette yanlış.
  const items = await expandToOrderItems(db, cart.lines, discountSharesOf(cart));
  const options = await resolveCheckoutPayment({
    customerId: customer.id,
    deliveryType,
    basketCents: cart.totalCents,
    lines: items.map((i) => ({ totalCents: Math.round(i.unitPrice * 100) * i.qty, vatRate: i.vatRate })),
  });
  if (!options.methods.includes(input.paymentMethod)) {
    return { status: 'payment_not_allowed', methods: options.methods };
  }

  // Depo çözülemediyse sipariş AÇILMAZ: deposuz bir sipariş şemada da yazılamaz (not null) ve
  // yazılabilseydi hangi depodan hazırlanacağı bilinmeyen bir kayıt kalırdı. Sebep çağırana
  // taşınır — "bölge dışısınız" ile "kargo deposu tanımlı değil" aynı cümle olamaz.
  if (!orderWarehouseId) {
    return { status: 'warehouse_unresolved', reason: delivery.unresolvedReason ?? 'no_shipping_warehouse' };
  }

  // 5) Taslak. Kanal müşteri tipinden TÜRER ve bir daha değişmez (DOMAIN §3); adres ANLIK GÖRÜNTÜ
  //    olarak da yazılır — müşteri adresini sonradan düzenlerse sipariş nereye gittiğini unutmamalı.
  const deliveryDate = deliveryType === 'route' ? (input.deliveryDate ?? delivery.availableDates[0] ?? null) : null;
  const { order } = await new OrderService(db).create(
    {
      customerId: customer.id,
      // Sipariş TEK depodan çıkar (DOMAIN §17) ve kaynağı ADRESİN posta kodudur — uzaktan siparişte
      // varsayılan depo kavramı yoktur (C2). Yer çözümü teslimat kararıyla aynı turda yapıldı.
      warehouseId: orderWarehouseId,
      channel: deriveChannel({ isCompany: customer.type === 'company' }),
      orderSource: 'web',
      status: 'draft',
      idempotencyKey: input.idempotencyKey ?? null,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount ?? false,
      deliveryType,
      // Kargo siparişi bir BÖLGEYE ait değildir: rota bölgesi yalnız araçla gidilen teslimatın kaydı.
      deliveryZoneId: input.shippingOrder ? null : delivery.zoneId,
      deliveryDate,
      addressId: address.id,
      addressSnapshot: { ...address },
      deliveryCountry: address.country,
      shippingFee: options.shippingFeeCents / 100,
      total: options.orderTotalCents / 100,
      discountAmount: discountAmountOf(cart) / 100,
      discountId: discountIdOf(cart),
      discountLabel: discountLabelOf(cart),
      // Siparişin dili: müşteri bu siparişi hangi yüzeyde okuyorsa o. Mailler buradan konuşur.
      locale: input.locale,
    },
    items,
    // Kupon KOTASI siparişle birlikte tükenir (`OrderService.create`); buradan geçen tek şey hangi
    // KAPIDAN girildiği — kotayı bölmez, "hangi dil karşılık buldu" sorusunu yanıtlar.
    { discountCodeId: discountCodeIdOf(cart) },
  );

  return { status: 'ok', orderId: order.id, totalCents: options.orderTotalCents, deliveryType };
}

/**
 * Sepet satırları → sipariş kalemleri. **Paket burada PARÇALANIR.**
 *
 * Müşteri tek bir "Bayram Sofrası" satırı görür ve öyle de görmeli (DOMAIN §13: satılan şey paketin
 * kendisidir). Ama sipariş varyant kalemlerinden oluşur — depo raftan paket değil ürün toplar, stok
 * varyanttan düşer, kâr varyant maliyetinden çıkar. Bu yüzden kalem `bundle_id` taşır: nereden
 * geldiği kaybolmaz, iade ve rapor paketi yeniden kurabilir.
 *
 * **Birim fiyat paketin PAYIDIR, katalog fiyatı değil.** Katalog fiyatı yazılsaydı kalemler toplamı
 * paketin fiyatını aşar ve sipariş kendi toplamıyla çelişirdi — indirim tam da o farktır.
 *
 * **İndirim payı kaleme YAZILIR** (`shares`, kalem sırasıyla hizalı — bkz. `discountSharesOf`).
 * Başlıktaki `discount_amount` tek başına yetmiyor: ödeme durumunu türeten motor "müşteri ne kadar
 * borçlu" sorusunu KALEMLERDEN topluyor (`derivePaymentStatus`) ve payı 0 gördüğü sürece indirimi
 * ödenmemiş bakiye sayıyor.
 */
async function expandToOrderItems(
  db: ReturnType<typeof serviceDb>,
  lines: readonly CartLine[],
  shares: readonly number[],
): Promise<Omit<OrderItemInsert, 'orderId'>[]> {
  const items = new BundleItemService(db);
  const bundleItems = new Map(
    await Promise.all(
      lines.filter((l) => l.kind === 'bundle').map(async (l) => [l.bundleId, await items.listByBundle(l.bundleId)] as const),
    ),
  );

  // KDV oranı ÜRÜNÜN alanı, varyantın değil — varyantlar önce ürünlerine bağlanır. Tek turda:
  // kalem başına sorgu, üç kalemlik bir pakette bile N+1 doğururdu.
  const variantIds = [
    ...lines.filter((l) => l.kind === 'variant').map((l) => l.variantId),
    ...[...bundleItems.values()].flat().map((i) => i.variantId),
  ];
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const vatByProduct = new Map(products.map((p) => [p.id, p.vatRate]));
  const vatByVariant = new Map(variants.map((v) => [v.id, vatByProduct.get(v.productId) ?? 0]));

  const rows: Omit<OrderItemInsert, 'orderId'>[] = [];
  lines.forEach((line, index) => {
    if (line.kind === 'variant') {
      rows.push({
        variantId: line.variantId,
        qty: line.qty,
        stockId: line.stockId,
        bundleId: null,
        unitPrice: (line.unitPriceCents ?? 0) / 100,
        vatRate: vatByVariant.get(line.variantId) ?? 0,
        lineDiscountAmount: (shares[index] ?? 0) / 100,
      });
      return;
    }
    for (const item of bundleItems.get(line.bundleId) ?? []) {
      rows.push({
        variantId: item.variantId,
        // Paketin adedi kalemin adedini ÇARPAR: iki "Bayram Sofrası" iki kat malzeme demektir.
        qty: item.qty * line.qty,
        stockId: null,
        bundleId: line.bundleId,
        unitPrice: item.allocatedUnitPrice,
        vatRate: vatByVariant.get(item.variantId) ?? 0,
        // Pakete sepet indirimi BİNMEZ (DOMAIN §13) — motor da payını 0 dağıtır. Paketin kendi
        // indirimi zaten birim fiyatın içinde.
        lineDiscountAmount: 0,
      });
    }
  });
  return rows;
}

/**
 * İndirimin kalem payları — **sepet satırlarıyla index index hizalı** (`lib/cart/read.ts` her
 * satır için tam bir kayıt gönderir, muaf olanı bile: dizi hizası bunun için korunuyor).
 *
 * İndirim yoksa boş dizi döner ve her kalem 0 pay alır. `Σ pay = discount_amount` motorun
 * garantisidir (`distributeDiscount`) — burada yeniden bölüştürme YAPILMAZ, yapılsaydı kuruş
 * artığı iki yerde farklı yuvarlanır ve sipariş kendi toplamıyla çelişirdi.
 */
function discountSharesOf(cart: { discount: { status: string; lineShares?: number[] } }): readonly number[] {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? (cart.discount.lineShares ?? []) : [];
}

/** İnen indirim (cent) — kupon da otomatik kampanya da aynı alana yazılır, ayrımı `discountId` taşır. */
function discountAmountOf(cart: { discount: { status: string; amountCents?: number } }): number {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? (cart.discount.amountCents ?? 0) : 0;
}

/**
 * Kuponun girildiği KAPI (`discount_code.id`) — yalnız `applied` hâlde vardır.
 *
 * Otomatik kampanyada kod yoktur; `outranked` hâlde kazanan otomatik kampanyadır, yani girilen kodun
 * kapısı da tutmamıştır — kullanım kaydına yazılacak bir kapı yok. Kaydı yine de yazsaydık,
 * uygulanmamış bir kodu "karşılık buldu" diye sayardık.
 */
function discountCodeIdOf(cart: { discount: { status: string; codeId?: string } }): string | null {
  return cart.discount.status === 'applied' ? (cart.discount.codeId ?? null) : null;
}

function discountIdOf(cart: { discount: { status: string; discountId?: string | null } }): string | null {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? (cart.discount.discountId ?? null) : null;
}

/**
 * İndirimin müşteriye görünen adının SİPARİŞ ANINDAKİ kopyası (0015 `discount_label`).
 *
 * `discountId` üzerinden sonradan okumak yetmezdi: kampanya yeniden adlandırılabilir, süresi
 * dolabilir, silinebilir. O zaman altı ay önce gönderilmiş mailin yeniden basımı başka bir şey
 * derdi. Siparişe ait olan bilgi siparişte durur — `addressSnapshot` ile aynı kural.
 */
function discountLabelOf(cart: CartView): LocalizedText | null {
  return cart.discount.status === 'applied' || cart.discount.status === 'automatic' ? cart.discount.label : null;
}
