import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import {
  getCartView,
  getPackagesByIds,
  shippingGroupFee,
  type CartDiscount,
  type CartEntry,
  type CartLine,
  type CartView,
  type PlaceWarehouses,
} from '@lezzet/application';
import { serviceDb, type Db } from '@lezzet/database';
import {
  CartViewBodySchema,
  MeCartViewSchema,
  PreferredLanguageEnum,
  type LocalizedText,
  type MeCartView,
  type PreferredLanguage,
} from '@lezzet/types';
import { resolvedOrNull } from '../../lib/home';
import { readJsonBody } from '../../lib/request';
import { fail, ok } from '../../lib/respond';
import { readPlace } from './catalog';

/*
  SEPETİN ÇÖZÜLMÜŞ GÖRÜNÜMÜ — İKİ YÜZEY, TEK HESAP.

  Bu dosyanın varlık sebebi bir uç değil, bir DEĞİŞMEZ: aynı sepet webde ve telefonda AYNI tutarı
  göstermek zorunda. Hesabın sahibi `getCartView` (`@lezzet/application`, terfi 09.08) ve web de
  onu çağırıyor; burada yapılan tek şey isteği o kapının girdisine çevirmek, dönen görünümü
  sözleşme şekline indirgemek ve zarflamak. Fiyat, tükendi, yol, teklif tavanı, indirim, asgari
  sepet, ücretsiz kargo eşiği — hiçbiri burada hesaplanmaz (`STACK §4`).

  İSTEMCİ HESAPLASAYDI NE OLURDU: mobil kendi toplamını çıkarsa aynı sepet iki yüzeyde iki farklı
  sayı gösterirdi ve hangisinin tahsil edileceğini söyleyecek bir yer kalmazdı. Bu yüzden ad da
  fiyatı da indirimi de SUNUCU çözer; ekran biçimler.

  ── MİSAFİRİN UCU NEDEN AYRI ────────────────────────────────────────────────
  Sunucu sepeti `customerId` anahtarlıdır, yani misafirin sunucuda sepeti YOKTUR (web de öyle:
  satırları tarayıcı taşır). Görünümü yine de sunucu çözmeli — yoksa aynı sepet misafirken bir,
  girişten sonra başka bir tutar gösterirdi. `POST /cart/view` bu yüzden Bearer'SIZ yaşar:
  niyet gövdeden gelir, FİYAT gelmez.
*/

/**
 * `?locale=` — ZORUNLU ve varsayılansız (katalogun `LocaleSchema` künyesi): `resolveLocalizedText`
 * dil verilmezse kanonik sıraya düşer, yani Fransız müşteriye sessizce Türkçe ürün adı gönderirdi.
 *
 * Sepet ailesinin (girişli beş uç + misafir ucu) TEK okuması burasıdır; `cart.ts` bunu çağırır.
 * Bağlam tipi bilinçli GENİŞ (`Context`): yardımcı yalnız sorgu dizesini okur, bağlamdan bir şey
 * OKUMAZ — tek bir Hono kuşağına bağlanması onu iki dosyada birden yazdırırdı.
 */
export function localeOf(c: Context): ReturnType<typeof PreferredLanguageEnum.safeParse> {
  return PreferredLanguageEnum.safeParse(c.req.query('locale'));
}

/**
 * Görünümün TEK kuyruğu — hem girişli sepet hem misafir sepeti buradan geçer.
 *
 * Girdi farkı yalnız iki alandır (`customerId` ve `previousPrices`); geri kalan her şey — yerin
 * çözümü, kapıya geçilen seçenekler, sözleşmeye indirgeme — ORTAK. Ayrı yazılsaydı misafir ile
 * müşteri aynı sepet için farklı depo ya da farklı kupon davranışı görebilirdi.
 *
 * ── PAKET KAPISI ARTIK BESLENİYOR (09.08) ───────────────────────────────────
 * `bundles` seçeneği web'in geçtiği kapının TA KENDİSİDİR (`getPackagesByIds`, terfi 09.08 ile
 * `@lezzet/application`da): stok zinciri, yol kararı (`decideBundleAgainstWarehouse`), KDV ve
 * kargo kısıtı tek yerde duruyor — aynı paket vitrinde "var", sepette "tükendi" diyemez. Arada
 * ikinci bir dönüştürme YOK; tek fark `db`nin bağlanması (kapı `db`yi çağırandan alıyor, port
 * imzası almıyor) ve YER'in kapıya da geçmesi (web'in 19.22'deki aynı kararı: kart, sepet ve
 * checkout aynı yolu görmeli).
 *
 * Öncesi ölçülmüş bir arızaydı (21.21): mobil paket satırını YAZABİLİYOR ama çözecek kapı yoktu —
 * satır kimliğiyle ve ENGELLİ duruyordu (`getCartView` → `orphanLine`): adı boş, fiyatı `null`,
 * toplama hiç girmiyor ve `hasBlocked` doğuyordu. Webden eklenmiş paketler de mobilde öyle
 * görünüyordu.
 *
 * ── KAPIYA GEÇİLMEYEN İKİ SEÇENEK (bilinçli) ────────────────────────────────
 * · `country` / `zoneId` — ayar kapsamının ülke/bölge eksenleri (07.15). İstemciden gelen tek yer
 *   bilgisi POSTA KODUDUR ve `readPlace` ondan yalnız depo kimliklerini çözer; ülkeyi posta kodundan
 *   burada TÜRETMEK, yer çözümünün kuralını ikinci kez (ve mobilde) yazmak olurdu. Bedeli ölçülü ve
 *   dar: ülkeye/bölgeye kapsamlı yazılmış kargo tarifesi ve asgari sepet ayarları mobilde
 *   varsayılana düşer; depo kapsamlı ayarlar ÇALIŞIR. Çözümü terfi ihtiyacıdır (rapora yazıldı),
 *   burada kapatılamaz.
 */
export async function readCartView(
  db: Db,
  locale: PreferredLanguage,
  entries: readonly CartEntry[],
  opts: {
    customerId: string | null;
    /** Zam bildiriminin ÇIPASI (`storedPrices`) — misafirde yoktur, niyet listesi bilerek fiyatsız. */
    previousPrices?: ReadonlyMap<string, number>;
    couponCode: string | null;
    /** Ham posta kodu; depoya çeviren `readPlace` — istemcinin yazdığı bir depo kimliği KABUL EDİLMEZ. */
    postalCode: string | undefined;
  },
): Promise<CartRead> {
  const place = await readPlace(db, opts.postalCode);
  const view = await getCartView(db, locale, entries, {
    customerId: opts.customerId,
    previousPrices: opts.previousPrices,
    couponCode: opts.couponCode,
    warehouseId: place.warehouseId,
    shippingWarehouseId: place.shippingWarehouseId,
    // `db` bağlanır, başka hiçbir şey yapılmaz: port imzası (`CartBundlePort`) ile kapının imzası
    // `db` dışında birebir tutuyor ve dönüş şekli `CartBundleSource`un yapısal ikizi. Araya bir
    // eşleme yazmak, sepetin gördüğü paketi vitrinin gösterdiğinden ayırma riski demekti.
    bundles: (bundleIds, bundleLocale, bundlePlace) => getPackagesByIds(db, bundleIds, bundleLocale, bundlePlace),
  });
  // `parse` süzgeçtir: sunucuda kalan alanlar (KDV oranı, kargolanabilirlik, indirimin kalem
  // payları) zarfa sızamaz — eşleme onları zaten almıyor, şema ikinci kilit.
  /* ÜÇÜ BİRDEN DÖNÜYOR (24.08 · MB-63) — ve gerekçe ölçüm: sepet olayları hem ENGELİN sebebini
     (`cartBlockedAnalyticsReason`, kapının KENDİ görünümünü ister — sözleşme şekli değil) hem de
     DEPO boyutunu istiyor. İkisi de bu fonksiyonun içinde zaten hesaplanmış durumda; dışarıdan
     yeniden hesaplatmak, aynı yeri iki kez okumak ya da kuralı ikinci kez yazmak olurdu. */
  return { body: MeCartViewSchema.parse(toViewBody(view, locale)), source: view, place };
}

/**
 * Sepet okumasının TAM çıktısı: tele giden gövde + kapının kendi görünümü + çözülmüş yer.
 *
 * `body` dışındakiler SUNUCUDA KALIR — zarfa girmezler (`MeCartViewSchema.parse` zaten süzüyor);
 * çağıran onları yalnız ölçüm ve karar için kullanır.
 */
export interface CartRead {
  body: MeCartView;
  source: CartView;
  place: PlaceWarehouses;
}

/** Kapının görünümü → sözleşme şekli. `z.input` KİLİTTİR: kapı saparsa burası DERLENMEZ. */
function toViewBody(view: CartView, locale: PreferredLanguage): z.input<typeof MeCartViewSchema> {
  const fee = shippingGroupFee(view);
  return {
    lines: view.lines.map(toLineBody),
    subtotalCents: view.subtotalCents,
    discount: toDiscountBody(view.discount, locale),
    /* Elinin altındaki indirim — ad burada çözülür (sözleşme tek dize taşır, istemci üç dilli
       nesneyi hiç görmez; `labelOf` künyesi). Alan `null` ise ekran susar. */
    reachableDiscount:
      view.reachableDiscount === null
        ? null
        : { ...view.reachableDiscount, label: labelOf(view.reachableDiscount.label, locale) },
    totalCents: view.totalCents,
    itemCount: view.itemCount,
    /* MOTORUN GİRDİSİ İSTEMCİYE — ama YALNIZ kendiliğinden inen kampanyalar ve KODSUZ.
       Kupon kuralları `codes` taşıyor; onu göndermek herkese geçerli kupon listesi vermektir
       (künye: `MeCartDiscountRuleSchema`). Süzgeç BURADA, taşıma katmanında: neyin dışarı
       çıkacağına sözleşme karar verir, motor değil. */
    discountRules: view.discountRules
      .filter((rule) => rule.trigger === 'automatic')
      .map((rule) => ({
        id: rule.id,
        type: rule.type,
        percent: rule.percent ?? null,
        amountCents: rule.amountCents ?? null,
        scope: rule.scope,
        categoryId: rule.categoryId ?? null,
        collectionId: rule.collectionId ?? null,
        minBasketCents: rule.minBasketCents ?? null,
      })),
    customerDiscountPercent: view.discountContext.customerDiscountPercent,
    isFirstOrder: view.discountContext.isFirstOrder,
    hasBlocked: view.hasBlocked,
    // Asgari sepete SAYILMAYAN tutar (10.08) — kapı zaten düşerek hesapladı, burada yalnız taşınıyor
    // ki ekran "X € şu an gönderilemeyen kalemlerde" diyebilsin. İkinci bir çıkarma YAPILMAZ.
    undeliverableSubtotalCents: view.undeliverableSubtotalCents,
    minBasketOk: view.minBasketOk,
    missingForMinBasketCents: view.missingForMinBasketCents,
    minBasketCents: view.minBasketCents,
    freeShippingCents: view.freeShippingCents,
    shippingSubtotalCents: view.shippingSubtotalCents,
    shippingTariffCents: view.shippingTariffCents,
    shippingOnly: view.shippingOnly,
    /* Kargo grubunun ÇÖZÜLMÜŞ ücreti ve eşiğe kalan — kararı motor veriyor (`shippingGroupFee`,
       `@lezzet/application`), burada yalnız taşınıyor. İstemci `tarife` ile `eşik`i alıp kendi
       karşılaştırsaydı aynı kural iki yerde yaşardı ve ayrıştığı gün sepette "ücretsiz" yazıp
       kasada ücret kesilirdi. Web sepeti de aynı kapıyı çağırıyor (`cart-group.tsx`). */
    shippingGroupFeeCents: fee.feeCents,
    shippingFreeRemainingCents: fee.remainingForFreeCents,
  };
}

/**
 * Satır — iki tür, iki kimlik. `vatRate` ve `shippable` BİLEREK düşüyor: ilki kargo KDV'sinin
 * oransal bölünmesi için checkout'un işi, ikincisinin taşıdığı karar zaten `route` alanında.
 * Sözleşmenin künyesi (`cart-api.schema.ts`) bu iki düşüşün gerekçesini tutuyor.
 */
function toLineBody(line: CartLine): z.input<typeof MeCartViewSchema>['lines'][number] {
  const view = {
    slug: line.slug,
    name: line.name,
    image: line.image,
    unitLabel: line.unitLabel,
    unitPriceCents: line.unitPriceCents,
    wasCents: line.wasCents,
    limitCap: line.limitCap,
    priceChange: line.priceChange,
    lineTotalCents: line.lineTotalCents,
    blocked: line.blocked,
    route: line.route,
    // Grup KAPIDAN gelir, burada `route`tan türetilmez (10.08): türetseydik uç, ekranın yaptığı
    // hatanın aynısını bir kat aşağıda tekrarlardı — kural `cartGroupOf`ta, cevabı satır taşıyor.
    group: line.group,
    availableHere: line.availableHere,
    contents: line.contents,
  };
  return line.kind === 'bundle'
    ? { kind: 'bundle', bundleId: line.bundleId, qty: line.qty, ...view }
    : {
        kind: 'variant',
        variantId: line.variantId,
        stockId: line.stockId,
        qty: line.qty,
        // Kapsam üyeliği YALNIZ varyant satırında: paket kalemleri matraha girmiyor (DOMAIN §13).
        categoryId: line.categoryId,
        collectionIds: [...line.collectionIds],
        ...view,
      };
}

/**
 * İndirim — dört hâl aynen taşınır, iki şey değişir: kampanyanın adı SUNUCUDA çözülür (çok dilli
 * metin `resolveLocalizedText`ten geçer, katalog sözleşmesinin aynı kuralı) ve kalem payları
 * (`lineShares`/`discountId`) düşer — onlar sipariş yazımının bilgisidir, ekranın değil.
 *
 * `source`/`codeId` de düşüyor: kuponun hangi kapıdan girildiği kota kaydının izidir, müşteriye
 * söylenecek bir şey değil.
 */
function toDiscountBody(discount: CartDiscount, locale: PreferredLanguage): z.input<typeof MeCartViewSchema>['discount'] {
  switch (discount.status) {
    case 'applied':
      return { status: 'applied', code: discount.code, amountCents: discount.amountCents, label: labelOf(discount.label, locale) };
    case 'automatic':
      return { status: 'automatic', amountCents: discount.amountCents, label: labelOf(discount.label, locale), reason: discount.reason };
    case 'rejected':
      return {
        status: 'rejected',
        code: discount.code,
        reason: discount.reason,
        // Kupon tutmasa da sepete inen indirim KAYBOLMAZ — kimliğiyle birlikte taşınır, yoksa özet
        // satırı sırf bir kupon denendi diye "Baklava haftası"ndan "İndirim"e düşerdi (29.07).
        appliedInsteadCents: discount.appliedInsteadCents,
        appliedInstead: discount.appliedInstead
          ? { label: labelOf(discount.appliedInstead.label, locale), reason: discount.appliedInstead.reason }
          : null,
      };
    default:
      return { status: 'none' };
  }
}

/** Kampanyanın müşteriye görünen adı; adı yoksa `null` — ekran o hâlde kodu ya da sebebi yazar. */
function labelOf(label: LocalizedText | null, locale: PreferredLanguage): string | null {
  return resolvedOrNull(label, locale);
}

/**
 * MİSAFİRİN GÖRÜNÜM UCU — `POST /cart/view`, Bearer'SIZ.
 *
 * Mount'u router yapar (`v1.route('/cart', cartView)`) ve `bearerAuth`ın ÖNÜNDE olmalı: oturumsuz
 * kullanım = müşteri gezinmesi (02-mimari §4). Sepetini görmek için hesap açtırmak, katalogu
 * Bearer'ın arkasına koymakla aynı hata olurdu.
 *
 * NİYET GÖVDEDEN, FİYAT ASLA: gövde satırın yalnız ADRESİNİ ve adedini taşır — varyant satırında
 * `{variantId, qty, stockId}`, paket satırında `{bundleId, qty}` (21.21). Girişli kullanıcının
 * niyeti ise gövdeden ALINMAZ — onunki sunucudaki sepettir (`/me/cart`).
 *
 * `previousPrices` GEÇİLMEZ ve bu bir eksiklik değil: misafirin çıpası olamaz. Tarayıcıdan/cihazdan
 * gelen bir "önceki fiyat", müşterinin kendi belirlediği fiyat olurdu — zam bildirimi yalnız sunucu
 * sepetinde doğar (DOMAIN §5).
 */
export const cartView = new Hono();

cartView.post('/view', async (c) => {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const body = CartViewBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const read = await readCartView(serviceDb(), locale.data, body.data.items.map(entryOfWrite), {
    customerId: null,
    couponCode: body.data.couponCode,
    postalCode: c.req.query('postalCode'),
  });
  /* YALNIZ `body` tele gider. `CartRead` künyesinin dediği gibi `source` ve `place` SUNUCUDA
     KALIR — `ok()` gevşek tiplidir ve tamamını göndermek derlemede HATA VERMEZDİ. */
  return ok(c, read.body);
});

/**
 * Gövde satırı → niyet — **sepet ailesinin TEK eşlemesi** (misafir görünümü, ekleme ve devir aynı
 * kapıdan geçer; `cart.ts` bunu çağırıp `itemOfEntry` ile saklanan kaleme çevirir).
 *
 * `entryOfItem`in işi DEĞİL: o SAKLANAN satırın türünü kimlik alanının doluluğundan çözmek
 * zorundadır (jsonb'de bayrak yoktur); burada tür ŞEMANIN kendi künyesidir ve `kind` üzerinden
 * DARALTILIR (`MeCartItemWriteSchema` künyesi: `string` birim tip değildir, `bundleId` doluluğuyla
 * daraltma yapılamaz).
 *
 * İKİ TÜR de kabul edilir (21.21): paket satırı ÖNCE yazılamıyordu — paketin uuid'si paket detay
 * sözleşmesinde yoktu ve sonucu sessiz bir eksiklikti (uygulamadan eklenen paket cihazda kalıyor,
 * sunucunun çözdüğü toplama hiç girmiyordu).
 */
export function entryOfWrite(item: z.infer<typeof CartViewBodySchema>['items'][number]): CartEntry {
  return item.kind === 'bundle'
    ? { kind: 'bundle', bundleId: item.bundleId, qty: item.qty }
    : { kind: 'variant', variantId: item.variantId, qty: item.qty, stockId: item.stockId };
}
