import { Hono } from 'hono';
import { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { ANONYMOUS_BUYER_ID, getCatalogData, sellOnSite } from '@lezzet/application';
import { CatalogPageSchema, DEFAULT_PAGE_SIZE, OnSiteSaleRequestSchema, OnSiteSaleResponseSchema, PreferredLanguageEnum } from '@lezzet/types';
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

// Sıra güvenlik kararının kendisi (depo ucunun aynı gerekçesi): önce rol (kim), sonra depo (nerede).
sale.use('*', requireStaffRole('warehouse', 'courier', 'admin'));
sale.use('*', warehouseGuard);

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
 * ── BİLİNEN SINIR: KALAN ADET GÖRÜNMÜYOR ────────────────────────────────────
 * `BEKLEYEN(21.119)` — katalog sözleşmesi `soldOut`/`stockStatus` taşıyor ama **adet taşımıyor** ve
 * bu müşteri vitrini için doğru bir karar (stok sayısı sızdırmaz). Satış ekranı içinse eksik:
 * personel "kaç tane var" sorusunu ekrandan okuyamıyor, ancak satmayı deneyince `insufficient_here`
 * ile öğreniyor. Çare sözleşmeyi genişletmek DEĞİL — o vitrini de etkilerdi; satışa özel bir
 * okuma alanı gerekiyor ve kararı ekran yazılırken verilecek.
 */
sale.get('/catalog', async (c) => {
  const parsed = SaleCatalogQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const { locale, q } = parsed.data;

  const data = await getCatalogData(serviceDb(), {
    locale,
    query: { search: q, cursor: decodeCursor(parsed.data.cursor) },
    place: { warehouseId: c.get('warehouseId'), shippingWarehouseId: null },
    viewer: { channel: 'b2c', b2bApproved: false, customerId: null, groupPercentOff: null },
    limit: DEFAULT_PAGE_SIZE,
  });

  return ok(
    c,
    CatalogPageSchema.parse({
      products: data.products.map((p) => ({ ...p, campaign: toWireCampaign(p.campaign, locale) ?? undefined })),
      total: data.total,
      nextCursor: data.nextCursor ? encodeCursor(data.nextCursor) : null,
      activeCollection: null,
      campaign: null,
    } satisfies z.input<typeof CatalogPageSchema>),
  );
});
