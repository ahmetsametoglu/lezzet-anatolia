import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { ProductVariantService, StockService, VariantBarcodeService, WarehouseService, serviceDb } from '@lezzet/database';
import {
  ANONYMOUS_BUYER_ID,
  getCatalogData,
  getProductDetail,
  listRecentDoorSales,
  sellOnSite,
  toWireCampaign,
  vehicleWarehouseOf,
  type PlaceWarehouses,
} from '@lezzet/application';
import { customerBusinessOf } from '@lezzet/domain-core';
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

import { requireStaffRole } from './auth';
import { warehouseGuard, type WarehouseEnv } from './warehouse';

/**
 * Yerinde satış ucu, depo kapısı ve kuryenin aracı için tek çağrı: kural hesaplamaz, hepsi `sellOnSite`tadır. Ayrı yönlendiricidir,
 * çünkü yerinde satışı kurye de yapar ve depo yönlendiricisinin rol kapısına giremez; depo personelin künyesinden, alıcı anonimdir.
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

/** Satışın yeri satıcının deposudur; alıcı anonimdir ve anonim alıcı Lezzet'tir. */
function salePlaceOf(warehouseId: string): PlaceWarehouses {
  return { warehouseId, shippingWarehouseId: null, business: customerBusinessOf(null) };
}

/**
 * Satış yeri yüzeyin açık beyanıdır (`?place=van`), izni sefer verir: araç kuryenin sürdüğü seferin yazdığı araçtır
 * (`vehicleWarehouseOf`) ve istemci hangi aracı istediğini seçemez. Beyansız istek guard'a gider, depocu ve tesisini söyleyen kurye
 * aynen çalışır.
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

  const vehicleWarehouseId = await vehicleWarehouseOf(serviceDb(), { courierId: profile.id });
  /* Araç yoksa cevap DÜRÜST bir redditir, guard'ın "hangi depo" 400'ü değil: kurye bir depo seçmedi,
     aracından satmak istedi ve aracı yok. Ekran bunu kendi cümlesiyle söyleyebilsin. */
  if (vehicleWarehouseId === null) return fail(c, 'no_vehicle', 400);

  c.set('warehouseId', vehicleWarehouseId);
  c.set('salePlace', 'van');
  await next();
}

/**
 * QUALITE deposundan anonim kapı satışı yapılmaz: satışın alıcısı anonimdir ve anonim alıcı Lezzet'tir (docs/feature/iki-is.md,
 * karar 10). Ekran bu cevapla sebebi söyler, liste ve okutma açılmaz.
 */
async function doorSaleOpen(c: Context<SaleEnv>, next: Next): Promise<Response | void> {
  const warehouse = await new WarehouseService(serviceDb()).getById(c.get('warehouseId'));
  if (warehouse !== null && warehouse.business !== customerBusinessOf(null)) return fail(c, 'door_sale_closed', 403);
  await next();
}

// Sıra güvenlik kararının kendisidir: önce rol (kim), sonra depo (nerede), en son o depoda kapı satışı açık mı.
sale.use('*', requireStaffRole('warehouse', 'courier', 'admin'));
sale.use('*', salePlaceGuard);
sale.use('*', doorSaleOpen);

/**
 * Satış tek çağrıda kapanır ve kapının kararı ne olursa olsun 200 döner; `sale_failed` ayrıntısızdır, çünkü sebepleri personelin
 * yapabileceği bir şeye çevrilemez. Yetersiz stok ayrı ve ayrıntılıdır, karşılığı adedi düşürmektir.
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
 * Bu depoda ne var, satış ekranının listesi: katalog okumasının kendisidir, yalnız yer personelin o anki deposudur ve kargo deposu
 * yoktur; görüş `b2c`, çünkü alıcı anonimdir. Kalan adet satışa özel alandan (`availableHere`) gelir, kaynağı sepet doğrulamasının
 * okuduğu görünümdür.
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
      /* Araç bir vitrin değildir, kurye elindekini satar; tesis kapısında kural tersinedir (`listStockedProductIds`). */
      onlyStockedHere: c.get('salePlace') === 'van',
    },
    place: salePlaceOf(c.get('warehouseId')),
    viewer: { channel: 'b2c', b2bApproved: false, customerId: null, groupPercentOff: null, professional: false },
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
 * Çok boylu ürünün boy çekmecesi: kaynak `getProductDetail`in kendisidir (yer personelin deposu, görüş `b2c`), fiyat ve `soldOut`
 * vitrinle aynı motordan çıkar. Kalan adet katalogla aynı gerekçeyle eklenir.
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
    place: salePlaceOf(c.get('warehouseId')),
    viewer: { channel: 'b2c', b2bApproved: false, customerId: null, groupPercentOff: null, professional: false },
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
        Araçta olmayan boy çekmecede de görünmez, çünkü araç bir yüktür ve kurye satamayacağı boyu seçememeli. Süzgeç yalnız
        araçtadır, depo kapısında "bu boy şu an yok" bilgisi kendisi bir cevaptır.
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
  Barkod okutma: kod → varyant → ürün → kart; ekran okutmadan sonra kartla açılan aynı çekmeceyi açar ve kaynaklar listeyle aynıdır.
  Araçta olmayan ürün ve bu depoda kalanı sıfır olan boy `not_here` döner; kalem sayısı `qtyPerCode` ile gelir.
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

  const place = salePlaceOf(c.get('warehouseId'));
  const viewer = { channel: 'b2c' as const, b2bApproved: false, customerId: null, groupPercentOff: null, professional: false };

  const page = await getCatalogData(db, {
    locale: locale.data,
    query: { productIds: [variant.productId], onlyStockedHere: yer === 'van' },
    place,
    viewer,
    limit: 1,
  });
  const card = page.products[0];
  if (card === undefined) {
    /* Kart yoksa ürün satışa kapalıdır ya da araçta değildir; ikincisinde adı söylenir ki kurye elindeki paketi bilsin, ad için
       süzgeçsiz ikinci okuma yalnız bu nadir dalda yapılır. */
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
 * Son satışlar, "az önce yazdığım kayıt ne oldu" kontrolü: depo künyeden gelir, kurye aracının, depocu tesisinin satışlarını
 * görür.
 */
sale.get('/recent', async (c) => {
  const sales = await listRecentDoorSales(serviceDb(), c.get('warehouseId'));
  return ok(c, RecentSalesResponseSchema.parse({ sales } satisfies z.input<typeof RecentSalesResponseSchema>));
});
