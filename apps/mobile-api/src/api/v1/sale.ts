import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { ProductVariantService, StockService, VariantBarcodeService, serviceDb } from '@lezzet/database';
import {
  ANONYMOUS_BUYER_ID,
  getCatalogData,
  getProductDetail,
  listRecentDoorSales,
  sellOnSite,
  vehicleWarehouseOf,
} from '@lezzet/application';
import {
  DEFAULT_PAGE_SIZE,
  OnSiteSaleRequestSchema,
  OnSiteSaleResponseSchema,
  PreferredLanguageEnum,
  RecentSalesResponseSchema,
  SalePlaceEnum,
  SaleCatalogPageSchema,
  SaleScanResponseSchema,
  SaleVariantsResponseSchema,
} from '@lezzet/types';
import { captureError, SOURCES } from '@lezzet/observability';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor, readJsonBody } from '../../lib/request';
import { toWireCampaign } from '../../lib/campaign-wire';

import { requireStaffRole } from './auth';
import { warehouseGuard, type WarehouseEnv } from './warehouse';

/**
 * **YERİNDE SATIŞ UCU** (21.119) — depo kapısı ve kuryenin aracı, tek çağrı.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Depo/kurye uçlarıyla aynı çizgi: parse → kapı → zarf. Fiyat çözümü, pazarlık izi, stok kontrolü,
 * FEFO, referans üretimi ve tahsilat — hiçbiri burada YOK; hepsi `sellOnSite`ta.
 *
 * ── NEDEN AYRI BİR YÖNLENDİRİCİ, `warehouse.ts`İN İÇİNDE DEĞİL ──────────────
 * Depo yönlendiricisinin rol kapısı `warehouse`/`admin`; **kurye oraya giremez ve girmemeli**
 * (hazırlık kuyruğu, mal kabul, kutu mühürleme onun işi değil). Ama yerinde satışı KURYE DE yapar —
 * `DOMAIN §17`: *"satan kişi, malın yanında duran personeldir."* Rol kümesi farklı olduğu için kapı
 * da ayrı; paylaşılan tek şey depo çözümü (`warehouseGuard` ihraç edildi, kopyalanmadı).
 *
 * ── DEPO VE MÜŞTERİ GÖVDEDE YOK ─────────────────────────────────────────────
 * Depo personelin künyesinden geliyor (kapsam kontrolüyle), müşteri ise anonim alıcıdır — kimlik
 * SORULMUYOR (kullanıcı kararı 26.08). İkisini de istemciden almak, kararı istemciye vermek olurdu;
 * `placeOrder`ın *"müşteri kimliği istemciden ASLA alınmaz"* kuralının aynısı.
 */
/**
 * Satışın kendi bağlamı: depo kapısının değişkenlerine **satış yeri** eklenir. Yer, çözülen deponun
 * kimliğinden ÇIKARILAMAZ (aynı kimlik "seçtiğim tesis" de olabilir) ve katalog okuması buna göre
 * daralıyor — bu yüzden ayrı bir değişken, türetilmiş bir tahmin değil.
 */
interface SaleEnv {
  Variables: WarehouseEnv['Variables'] & { salePlace: 'facility' | 'van' };
}

export const sale = new Hono<SaleEnv>();

/**
 * **SATIŞ YERİ — YÜZEYİN BEYANI, KAPSAMIN İZNİ** (01.09 · kullanıcı kararı, cihazda ölçüldü).
 *
 * ── ÖNCEKİ ÖRTÜK KURAL NEDEN ÇÖKTÜ ──────────────────────────────────────────
 * Burada `courierVehicleFirst` duruyordu: *"kurye PARAMETRESİZ geldiyse satış yeri aracıdır."*
 * Kural doğruydu ama sinyali YOKLUKTU ve yokluk bir gün doldu — mobil istemci 30.08'de cihazdaki
 * depo seçimini her satış isteğine yazmaya başladı (`withWarehouseChoice`). O günden beri adım hiç
 * çalışmıyordu: kurye "Strasbourg — ana depo"yu seçtiği için kendi ekranında ana deponun katalogunu
 * görüyordu (ölçüldü 01.09: araçta 4 kalem, ekranda 154 partilik tesis; "kalan 23" birebir
 * Strasbourg'un stoğu). Kural sunucuda yazılıydı, istemci onu sessizce iptal ediyordu.
 *
 * ── YERİNE: AÇIK BEYAN ──────────────────────────────────────────────────────
 * Yüzey artık `?place=van` diyerek NEREDEN sattığını SÖYLER. Beyan bir yetki değil bir sorudur;
 * cevabı kapsam verir — araç, personelin kendi `warehouseIds`i içindeki `kind='vehicle'` depodur
 * (`vehicleWarehouseOf`). İstemci hangi aracı istediğini seçemez, yalnız "aracımdan" diyebilir.
 * Beyansız istek eskisi gibi guard'a gider: depo kapısından satan depocu da, `?warehouseId=` ile
 * tesisini söyleyen kurye de aynen çalışır (`DOMAIN §17` — satan kişi malın yanındaki personeldir).
 *
 * Kuralın kendisi veri modelinde: *"yerinde satış yalnız aracın KENDİ stoğundan yapılır — zaten
 * ayrılmış mal satılamaz"* (`data-model/depo.md`, `DOMAIN §17`).
 */
async function salePlaceGuard(c: Context<SaleEnv>, next: Next): Promise<Response | void> {
  const raw = c.req.query('place');
  const declared = raw === undefined ? 'facility' : SalePlaceEnum.safeParse(raw);
  if (declared !== 'facility' && !declared.success) return fail(c, 'invalid_place', 400);
  const place = declared === 'facility' ? 'facility' : declared.data;

  /* `facility` beyanı ile BEYANSIZ istek aynı yola gider — ikisi de "kapıdayım" demektir ve depoyu
     guard çözer (`?warehouseId=` ya da kapsamın tek deposu). Ayrı bir dal yazmak, aynı cevabı iki
     yerde yaşatmak olurdu. */
  if (place === 'facility') {
    c.set('salePlace', 'facility');
    return warehouseGuard(c, next);
  }

  const profile = c.get('staff');
  /* Rol kapısı satışa `warehouse|courier|admin` diyor; "aracımdan" diyebilen yalnız KURYE.
     Admin'e de açık bırakmak, hiç aracı olmayan bir role kapsam dışı bir depo çözdürmek olurdu. */
  if (!profile.roles.includes('courier')) return fail(c, 'not_courier', 403);

  const vehicleWarehouseId = await vehicleWarehouseOf(serviceDb(), profile.warehouseIds);
  /* Araç yoksa cevap DÜRÜST bir redditir, guard'ın "hangi depo" 400'ü değil: kurye bir depo seçmedi,
     aracından satmak istedi ve aracı yok. Ekran bunu kendi cümlesiyle söyleyebilsin. */
  if (vehicleWarehouseId === null) return fail(c, 'no_vehicle', 400);

  c.set('warehouseId', vehicleWarehouseId);
  c.set('salePlace', 'van');
  await next();
}

// Sıra güvenlik kararının kendisi (depo ucunun aynı gerekçesi): önce rol (kim), sonra depo (nerede).
sale.use('*', requireStaffRole('warehouse', 'courier', 'admin'));
sale.use('*', salePlaceGuard);

/**
 * Satış — tek çağrıda kapanır. **Kapının kararı ne olursa olsun 200**; "satış oldu mu" gövdede.
 *
 * `sale_failed` gövdeye AYRINTISIZ iniyor ve bu bilinçli: kapanış reddinin sebepleri (yarış,
 * geçiş kuralı, yazım anında biten parti) personelin yapabileceği bir şeye çevrilemiyor — ekranda
 * tek cümle, ayrıntı logda. Yetersiz stok ise AYRI ve ayrıntılı, çünkü onun bir karşılığı var:
 * adedi düşür ya da müşteriye kalanı söyle.
 */
sale.post('/on-site', async (c) => {
  const parsed = OnSiteSaleRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await sellOnSite(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    staffId: c.get('staff').id,
    customerId: ANONYMOUS_BUYER_ID,
    lines: parsed.data.lines,
    paymentMethod: parsed.data.paymentMethod,
    collectedAmountCents: parsed.data.collectedAmountCents,
  });

  if (outcome.status === 'ok' || outcome.status === 'insufficient_here' || outcome.status === 'blocked_lines') {
    const body: z.input<typeof OnSiteSaleResponseSchema> = outcome;
    return ok(c, OnSiteSaleResponseSchema.parse(body));
  }

  // `empty` ve `warehouse_not_found` buraya ULAŞAMAZ: ilkini şema (`min(1)`), ikincisini guard eler.
  // Kalan tek hâl kapanış reddi — sebebi ekranın işine yaramaz ama BİZİM işimize yarar, o yüzden
  // sessizce yutulmuyor: kimlikle loglanır, gövdeye tek kelime iner.
  captureError(new Error(`yerinde satış kapanmadı: ${outcome.status}`), {
    source: SOURCES.mobileApiHttp,
    context: { route: 'sale/on-site', warehouseId: c.get('warehouseId'), staffId: c.get('staff').id, outcome },
  });
  const body: z.input<typeof OnSiteSaleResponseSchema> = { status: 'failed' };
  return ok(c, OnSiteSaleResponseSchema.parse(body));
});

const SaleCatalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().optional(),
  locale: PreferredLanguageEnum.default('tr'),
});

/**
 * **BU DEPODA NE VAR** — satış ekranının listesi.
 *
 * Katalog okumasının TA KENDİSİ (`getCatalogData`), yalnız YERİ değişiyor: `place.warehouseId`
 * personelin o anki deposu. Ayrı bir "araç stoğu" okuması YAZILMADI ve yazılmamalı — depo bazlı
 * `available_stock` aracı zaten aynen gösteriyor (`available_stock_total` araçları dışlıyor, ama
 * bu okuma toplamı değil DEPOYU soruyor). İkinci bir okuma, vitrinle satış ekranının aynı ürün
 * için farklı "tükendi" demesine açık kapı bırakırdı.
 *
 * **Kargo deposu bilerek `null`:** yerinde satışta kargo yok, o yüzden "burada yok ama kargoyla
 * gelir" hâli de yok. Personel elinde olanı satar.
 *
 * **`b2c` görüşü:** alıcı anonim, kanal perakende. Toptan kademe kimliğe bağlıdır ve burada kimlik
 * yok — onaysız şirketin B2C'ye düşmesiyle aynı kural.
 *
 * ── KALAN ADET SATIŞA ÖZEL ALANDAN GELİR (21.119, BEKLEYEN kapandı) ─────────
 * Katalog sözleşmesi adet TAŞIMAZ ve taşımamalı (müşteriye stok sayısı sızdırılmaz — `soldOut`
 * yeter). Personelin ihtiyacı farklı: müşterinin yüzüne "kaç tane var" diyebilmek. Cevap vitrin
 * sözleşmesini genişletmek değil, satış zarfına alan eklemek oldu (`SaleCatalogProductSchema.
 * availableHere`) — kaynağı `getAvailableMap`, yani sepet doğrulamasının okuduğu görünümün
 * TA KENDİSİ. İkinci bir stok gerçeği yok: ekranın gösterdiği sayı ile satışın reddettiği sayı
 * aynı satırdan çıkıyor.
 */
sale.get('/catalog', async (c) => {
  const parsed = SaleCatalogQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const { locale, q } = parsed.data;

  const db = serviceDb();
  const data = await getCatalogData(db, {
    locale,
    query: {
      search: q,
      cursor: decodeCursor(parsed.data.cursor),
      /* ARAÇ BİR VİTRİN DEĞİL (01.09): kurye elinde ne varsa onu satar. Tesis kapısında kural
         tersine dönüyor ve öyle kalmalı — depocu katalogu tarayıp "burada yok" cevabını da alabilir.
         Gerekçenin tamamı `listStockedProductIds` künyesinde. */
      onlyStockedHere: c.get('salePlace') === 'van',
    },
    place: { warehouseId: c.get('warehouseId'), shippingWarehouseId: null },
    viewer: { channel: 'b2c', b2bApproved: false, customerId: null, groupPercentOff: null },
    limit: DEFAULT_PAGE_SIZE,
  });

  // Sayfanın satılabilir boyları TEK sorguda — kart başına ayrı okuma N+1 doğururdu. `variantId`
  // olmayan kartın stoğu SORULMAZ: cevabı `null`dur ("satılacak birim yok"), `0` değil.
  const variantIds = data.products.map((p) => p.variantId).filter((id): id is string => id !== null);
  const available = await new StockService(db).getAvailableMap(c.get('warehouseId'), variantIds);

  return ok(
    c,
    SaleCatalogPageSchema.parse({
      products: data.products.map((p) => ({
        ...p,
        campaign: toWireCampaign(p.campaign, locale) ?? undefined,
        availableHere: p.variantId === null ? null : (available.get(p.variantId)?.availableQty ?? 0),
      })),
      total: data.total,
      nextCursor: data.nextCursor ? encodeCursor(data.nextCursor) : null,
    } satisfies z.input<typeof SaleCatalogPageSchema>),
  );
});

/**
 * **Çok boylu ürünün boy çekmecesi** — kartta tek boy taşınır (vitrinle aynı karar), seçim burada.
 *
 * Kaynak `getProductDetail`in ta kendisi (yer = personelin deposu, görüş `b2c`): fiyat, indirim ve
 * `soldOut` vitrinle aynı motordan çıkar. Buraya ikinci bir fiyat yolu yazılsaydı, çekmece ile
 * satışın faturası bir gün ayrışırdı. Kalan adet katalogla aynı gerekçeyle ekleniyor (üst künye).
 */
sale.get('/catalog/:slug/variants', async (c) => {
  const locale = PreferredLanguageEnum.default('tr').safeParse(c.req.query('locale') ?? undefined);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  /* Yer beyanı listedekiyle AYNI parametreden okunuyor (`?place=`) — istemci onu her satış
     isteğine ekliyor (`saleFetch`), yani çekmece ile liste aynı kaynağa bakıyor. */
  const yer = SalePlaceEnum.safeParse(c.req.query('place')).data ?? 'facility';

  const db = serviceDb();
  const detail = await getProductDetail(db, {
    locale: locale.data,
    slug: c.req.param('slug'),
    place: { warehouseId: c.get('warehouseId'), shippingWarehouseId: null },
    viewer: { channel: 'b2c', b2bApproved: false, customerId: null, groupPercentOff: null },
  });
  if (!detail) return fail(c, 'product_not_found', 404);

  const available = await new StockService(db).getAvailableMap(
    c.get('warehouseId'),
    detail.variants.map((v) => v.id),
  );

  return ok(
    c,
    SaleVariantsResponseSchema.parse({
      productId: detail.id,
      name: detail.name,
      /*
        ARAÇTA OLMAYAN BOY ÇEKMECEDE DE GÖRÜNMEZ (kullanıcı bulgusu 02.09).

        Liste ve kart araca göre süzülüyor (`onlyStockedHere`), ama boy çekmecesi ürünün TÜM
        boylarını döndürüyordu ve araçta olmayanlar orada "kalan 0" diye duruyordu — kurye
        satamayacağı bir boyu seçebiliyordu. Aynı cümlenin devamı: **araç bir vitrin değil, bir
        yüktür** (`DOMAIN §17`).

        Süzgeç YALNIZ araçta: depo kapısında satış tesisin katalogundan yapılıyor ve orada "bu boy
        şu an yok" bilgisi kendisi de bir cevaptır (vitrinin "süzülmez, işaretlenir" kuralı).
      */
      variants: detail.variants
        .filter((v) => yer !== 'van' || (available.get(v.id)?.availableQty ?? 0) > 0)
        .map((v) => ({
          ...v,
          availableHere: available.get(v.id)?.availableQty ?? 0,
        })),
    } satisfies z.input<typeof SaleVariantsResponseSchema>),
  );
});

/*
  ── BARKOD OKUTMA (kullanıcı kararı 02.09) ─────────────────────────────────────

  Kod → varyant → ürün → KART. Cevap kartın kendisi çünkü ekran okutmadan sonra kartla açılan
  aynı çekmeceyi açıyor (adet · boy · fiyat) ve o çekmece kartı ister. Kart katalog motorundan
  (`getCatalogData` + `productIds`), boy ise detay motorundan (`getProductDetail`) — listeyle ve
  boy çekmecesiyle AYNI iki kaynak; ikinci bir fiyat/kalan yolu açılmıyor.

  ARAÇTA "BURADA DURAN MAL" KURALI OKUTMADA DA GEÇERLİ: `onlyStockedHere` kartı süzüyor ve süzülen
  ürün `not_here` diye döner — kurye araçta olmayan bir ürünü okutup sepete alamaz. Tesis kapısında
  kural yok (vitrin kuralı) ama okutulan BOYUN kendisi bu depoda sıfırsa yine `not_here`: sıfır
  kalanla sepete alınan bir satır, satışta zaten reddedilirdi — erken söylemek daha dürüst.

  Kalem sayısı `qtyPerCode` ile döner (koli barkodu 1'den büyük taşır); çekmece o adetle açılır.
*/
sale.get('/scan', async (c) => {
  const locale = PreferredLanguageEnum.default('tr').safeParse(c.req.query('locale') ?? undefined);
  if (!locale.success) return fail(c, 'invalid_locale', 400);
  const code = (c.req.query('code') ?? '').trim();
  if (code.length === 0) return fail(c, 'code_required', 400);
  const yer = c.get('salePlace');

  const db = serviceDb();
  const match = await new VariantBarcodeService(db).findByCode(code);
  if (match === null) return ok(c, SaleScanResponseSchema.parse({ status: 'unknown_code' }));

  const variant = await new ProductVariantService(db).getById(match.variantId);
  if (variant === null) return ok(c, SaleScanResponseSchema.parse({ status: 'unknown_code' }));

  const place = { warehouseId: c.get('warehouseId'), shippingWarehouseId: null };
  const viewer = { channel: 'b2c' as const, b2bApproved: false, customerId: null, groupPercentOff: null };

  const page = await getCatalogData(db, {
    locale: locale.data,
    query: { productIds: [variant.productId], onlyStockedHere: yer === 'van' },
    place,
    viewer,
    limit: 1,
  });
  const card = page.products[0];
  if (card === undefined) {
    /* Kart yoksa iki sebep var ve ayrılmalı: ürün pasif/kanalsız (satışa kapalı) ya da araçta
       değil. İkincisi yalnız araçta doğar (`onlyStockedHere`); adı söylenir ki kurye elindeki
       paketin ne olduğunu bilsin. Ürünün adı için süzgeçsiz ikinci bir okuma yapılıyor — nadir
       dal, mutlu yol hiçbir şey ödemiyor. */
    if (yer === 'van') {
      const plain = await getCatalogData(db, { locale: locale.data, query: { productIds: [variant.productId] }, place, viewer, limit: 1 });
      const adsiz = plain.products[0];
      if (adsiz !== undefined) return ok(c, SaleScanResponseSchema.parse({ status: 'not_here', name: adsiz.name }));
    }
    return ok(c, SaleScanResponseSchema.parse({ status: 'not_sellable' }));
  }

  const detail = await getProductDetail(db, { locale: locale.data, slug: card.slug, place, viewer });
  const boy = detail?.variants.find((v) => v.id === variant.id);
  if (boy === undefined || boy.priceCents === null) return ok(c, SaleScanResponseSchema.parse({ status: 'not_sellable' }));

  const available = await new StockService(db).getAvailableMap(c.get('warehouseId'), [variant.id]);
  const availableHere = available.get(variant.id)?.availableQty ?? 0;
  if (availableHere === 0) return ok(c, SaleScanResponseSchema.parse({ status: 'not_here', name: card.name }));

  return ok(
    c,
    SaleScanResponseSchema.parse({
      status: 'ok',
      product: {
        ...card,
        campaign: toWireCampaign(card.campaign, locale.data) ?? undefined,
        availableHere: card.variantId === null ? null : (available.get(card.variantId)?.availableQty ?? availableHere),
      },
      variant: { ...boy, availableHere },
      qtyPerCode: match.qtyPerCode,
    } satisfies z.input<typeof SaleScanResponseSchema>),
  );
});

/**
 * **Son satışlar** — "az önce yazdığım kayıt ne oldu, kim yazmış" kontrolü (kullanıcı isteği
 * 26.08). Depo yine künyeden: kurye ARACININ satışlarını, depocu TESİSİNİN satışlarını görür.
 * Karar hesaplanmaz; okuma `listRecentDoorSales`ın kendisi.
 */
sale.get('/recent', async (c) => {
  const sales = await listRecentDoorSales(serviceDb(), c.get('warehouseId'));
  return ok(c, RecentSalesResponseSchema.parse({ sales } satisfies z.input<typeof RecentSalesResponseSchema>));
});
