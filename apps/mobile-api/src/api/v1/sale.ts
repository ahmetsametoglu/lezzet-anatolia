import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { StockService, WarehouseService, serviceDb } from '@lezzet/database';
import { ANONYMOUS_BUYER_ID, getCatalogData, getProductDetail, sellOnSite } from '@lezzet/application';
import {
  DEFAULT_PAGE_SIZE,
  OnSiteSaleRequestSchema,
  OnSiteSaleResponseSchema,
  PreferredLanguageEnum,
  SaleCatalogPageSchema,
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
export const sale = new Hono<WarehouseEnv>();

/**
 * **Kuryenin satış deposu ARACIDIR** — depo çözümünün satışa özel ön adımı (cihazda ölçüldü 26.08).
 *
 * `warehouseGuard`ın kuralı "kapsamda tek depo varsa o, değilse söylenmeli" ve depocu için doğru.
 * Kurye için değil: kapsamı BİLEREK çok depoludur (rota seçimi tesislere bakar — `seed/people.ts`
 * 19.25 kararı) ve ekran depo SORAMAZ (sözleşme künyesi: istemcinin dolduracağı meşru kaynak yok).
 * Ölçülen arıza: seed kuryesi {STR, COLMAR} ile `400 warehouse_required` aldı, satış ekranı hiç
 * açılamadı.
 *
 * Kural veri modelinde zaten yazılıydı, buraya yalnız uygulandı: *"yerinde satış yalnız aracın
 * KENDİ stoğundan yapılır — zaten ayrılmış mal satılamaz"* (`data-model/depo.md`, `DOMAIN §17`).
 * Yani kurye parametresiz geldiyse satış yeri kapsamındaki **tek araçtır**; araç yoksa ya da
 * birden çoksa çözüm belirsizdir ve cevap guard'ın dürüst 400'üdür. Parametre VERİLDİYSE bu adım
 * hiç karışmaz — kapsam kontrolü guard'da tek yerde kalır (depo kapısından satan kurye da böyle
 * mümkün olur: `?warehouseId=` kapsamındaki tesisi söyler).
 *
 * Depocu/admin bu adıma hiç girmez: onların çözümü guard'ın kendisidir.
 */
async function courierVehicleFirst(c: Context<WarehouseEnv>, next: Next): Promise<Response | void> {
  const profile = c.get('staff');
  const asked = c.req.query('warehouseId');
  if (!asked && profile.roles.includes('courier') && profile.warehouseIds.length > 1) {
    const service = new WarehouseService(serviceDb());
    const scoped = await Promise.all(profile.warehouseIds.map((id) => service.getById(id)));
    const vehicles = scoped.filter((w) => w?.kind === 'vehicle');
    if (vehicles.length === 1 && vehicles[0]) {
      c.set('warehouseId', vehicles[0].id);
      return next();
    }
  }
  return warehouseGuard(c, next);
}

// Sıra güvenlik kararının kendisi (depo ucunun aynı gerekçesi): önce rol (kim), sonra depo (nerede).
sale.use('*', requireStaffRole('warehouse', 'courier', 'admin'));
sale.use('*', courierVehicleFirst);

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
    query: { search: q, cursor: decodeCursor(parsed.data.cursor) },
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
      variants: detail.variants.map((v) => ({
        ...v,
        availableHere: available.get(v.id)?.availableQty ?? 0,
      })),
    } satisfies z.input<typeof SaleVariantsResponseSchema>),
  );
});
