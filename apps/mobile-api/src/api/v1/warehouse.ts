import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { OrderBoxService, serviceDb, SettingsService, ShippingBoxService, WarehouseService } from '@lezzet/database';
import {
  acceptCourierReturn,
  adjustFulfillment,
  announceOrderShipment,
  boxLabelPayload,
  boxLabelSvg,
  confirmPreparation,
  countAwaitingHandover,
  deliverPickupOrder,
  handOverBox,
  listPickupQueue,
  printersFor,
  registerPrinter,
  markBoxPrinted,
  learnCode,
  listClosedTransfers,
  listInboundTransfers,
  readTransferDetail,
  listOutboundTransfers,
  listNearExpiry,
  listPendingIntakes,
  listPreparationQueue,
  listWarehouseAreas,
  listWarehouseBatches,
  listAwaitingHandover,
  listReturningCouriers,
  listWarehouseReturns,
  markBatchSeen,
  openBox,
  openIntakeForm,
  quoteOrderShipment,
  readExpiryThresholds,
  readIntakeHeader,
  readReturningCourier,
  receiveGoods,
  receiveTransfer,
  recordAdjustment,
  resolveBatchCode,
  resolveScannedCode,
  sampleBoxLabel,
  declareOrderShort,
  sealBox,
  unsealBox,
  sendcloudProvider,
  shippingProviderConfigured,
  TRANSFER_TRANSIT_DAYS_DEFAULT,
  TRANSFER_TRANSIT_DAYS_KEY,
} from '@lezzet/application';
// Alt yol ihracı: arama kapısının tek çağıranı bu yüzey; ikinci çağıran doğunca barrel'a taşınır.
import { searchVariantsForIntake } from '@lezzet/application/warehouse/variant-search';
// Teslim haberi ve puan portu — kurye uçlarıyla aynı nesne.
import { mobileOrderEffects } from '../../lib/order-effects';
import {
  AnnounceShipmentRequestSchema,
  AnnounceShipmentResponseSchema,
  BoxLabelResponseSchema,
  ConfirmPreparationRequestSchema,
  ConfirmPreparationResponseSchema,
  DispatchOptionsResponseSchema,
  HandoverRequestSchema,
  HandoverPendingResponseSchema,
  HandoverResponseSchema,
  PickupDeliverRequestSchema,
  PickupDeliverResponseSchema,
  PickupQueueResponseSchema,
  IntakeFormResponseSchema,
  LearnCodeRequestSchema,
  LearnCodeResponseSchema,
  MarkBoxPrintedResponseSchema,
  OpenBoxRequestSchema,
  OpenBoxResponseSchema,
  NearExpiryResponseSchema,
  PendingIntakesResponseSchema,
  VariantSearchResponseSchema,
  PreparationQueueResponseSchema,
  ReceiveGoodsRequestSchema,
  ReceiveGoodsResponseSchema,
  ReceiveTransferRequestSchema,
  ReceiveTransferResponseSchema,
  RecordAdjustmentRequestSchema,
  RecordAdjustmentResponseSchema,
  ResolveBatchRequestSchema,
  ResolveBatchResponseSchema,
  ResolveCodeRequestSchema,
  ResolveCodeResponseSchema,
  SealBoxRequestSchema,
  DeclareShortResponseSchema,
  SealBoxResponseSchema,
  UnsealBoxResponseSchema,
  ShippingBoxesResponseSchema,
  ShippingLabelResponseSchema,
  WarehousePrintersResponseSchema,
  RegisterPrinterRequestSchema,
  RegisterPrinterResponseSchema,
  WarehouseAreasResponseSchema,
  MarkBatchSeenRequestSchema,
  MarkBatchSeenResponseSchema,
  WarehouseBatchesResponseSchema,
  TransferDetailResponseSchema,
  WarehouseTransfersResponseSchema,
  AcceptCourierReturnRequestSchema,
  AcceptCourierReturnResponseSchema,
  WarehouseCourierReturnResponseSchema,
  WarehouseReturningCouriersResponseSchema,
  WarehouseReturnQueueResponseSchema,
  WarehouseReturnRequestSchema,
  WarehouseReturnResponseSchema,
  UNASSIGNED_RETURNS,
} from '@lezzet/types';
import { labelSizeMm, warehouseScope } from '@lezzet/domain-core';
import { privateReadUrl } from '@lezzet/storage';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor, IsoDateSchema, readJsonBody, UuidSchema } from '../../lib/request';
import { renderLabelPng } from '../../lib/label-png';

/** Kutu yazıcısının kâğıdı — cihaz boy bildirmediğinde varsayılan. */
const DEFAULT_LABEL_MM = { widthMm: 62, heightMm: null } as const;
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * Depo uçları (mobil "Depo" bölümü): parse → kapı → zarf; kural hesaplamaz, karar `@lezzet/application`ın depo kapılarında
 * verilir ve web ile aynıdır. HTTP durumu isteğin kapıya ulaşıp ulaşmadığını, gövde kapının kararını söyler; bu yüzden `out_of_scope` gibi
 * veri düzeyindeki retler 200 ve adlı gövdedir.
 */

/**
 * Depo kimliği gövdeden değil profilden gelir, yoksa depocu başka deponun kimliğini yazıp onun malını düşebilirdi: kapsamda tek
 * depo varsa o, `?warehouseId=` kapsam dışıysa yalnız admin'e ve var olduğu doğrulanarak, ikisi de yoksa 400. Kapsamsız tek rol
 * admin'dir (veride kısıt), ona 403 değil "hangi depo" demek doğru cevaptır.
 */
const WarehouseQuerySchema = z.object({ warehouseId: UuidSchema.optional() });

/**
 * Depo bölümünün bağlamı — personel profili + çözülmüş depo. Yerinde satış ucu aynı çözümü farklı rol kümesiyle kullandığı için
 * ihraç edilir; ikinci kopya kapsam kuralını iki yerde yaşatırdı.
 */
export interface WarehouseEnv {
  Variables: StaffEnv['Variables'] & { warehouseId: string };
}

/**
 * Kapsamın tek başına çözdüğü depo; kabuğun künye ucu da tesis adını buna dayandırır ki üstbaşlıktaki ad uçların okuduğu depoyla
 * ayrışmasın. `null` = kapsam boş (admin) ya da birden çok: guard 400 döner, künye ucu adsız kalır.
 */
export function soleWarehouseIdOf(scope: readonly string[]): string | null {
  return scope.length === 1 ? (scope[0] ?? null) : null;
}

/*
   Bağlam jenerik, çünkü satış yönlendiricisi aynı guard'ı kendi bağlamıyla çağırıyor ve Hono'nun `Context`i değişmez tiplidir.
   Guard yalnız "warehouseId taşıyan bir bağlam" ister.
*/
export async function warehouseGuard<E extends WarehouseEnv>(c: Context<E>, next: Next): Promise<Response | void> {
  const profile = c.get('staff');

  const query = WarehouseQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);
  const asked = query.data.warehouseId;

  if (asked && !profile.warehouseIds.includes(asked)) {
    if (!profile.roles.includes('admin')) return fail(c, 'warehouse_out_of_scope', 403);
    if (!(await new WarehouseService(serviceDb()).getById(asked))) return fail(c, 'warehouse_not_found', 404);
  }

  const warehouseId = asked ?? soleWarehouseIdOf(profile.warehouseIds);
  if (!warehouseId) return fail(c, 'warehouse_required', 400);

  c.set('warehouseId', warehouseId);
  await next();
}

export const warehouse = new Hono<WarehouseEnv>();

// Sıra güvenlik kararının kendisidir: önce rol (kim), sonra depo (nerede). Ters olsaydı rolsüz bir
// kullanıcı depo çözümünün cevaplarını (var mı, kapsamında mı) sorgulayabilirdi.
warehouse.use('*', requireStaffRole('warehouse', 'admin'));
warehouse.use('*', warehouseGuard);

// ── D1 · Hazırlık (toplama) ─────────────────────────────────────────────────

/**
 * Hazırlama kuyruğu: `confirmed` + `preparing` birlikte gelir ki yarım kalan iş kaybolmasın. Gün verilmezse süzgeç yoktur, çünkü
 * depo işi güne değil mala aittir; dün onaylanıp toplanmamış sipariş bugünün ekranından düşmemeli.
 */
const PreparationQuerySchema = z.object({
  date: IsoDateSchema.optional(),
  /** Kuyruğun yüzü: `pending` (varsayılan) bekleyen iş, `done` son tamamlananlar; gövde aynı olduğu için ayrı uç yok. */
  scope: z.enum(['pending', 'done']).optional(),
});

warehouse.get('/preparation', async (c) => {
  const query = PreparationQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const orders = await listPreparationQueue(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    deliveryDate: query.data.date,
    scope: query.data.scope,
  });

  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü `PreparationOrder` sözleşmeye alan alan
  // uymak zorunda ve uymadığı gün burası DERLENMEZ (katalog/kurye uçlarındaki compile-lock deseni).
  const body: z.input<typeof PreparationQueueResponseSchema> = { date: query.data.date ?? null, orders };
  return ok(c, PreparationQueueResponseSchema.parse(body));
});

/**
 * Hazırlık onayı: seçilen partiler yazılır, tamamı toplandıysa sipariş `ready`e geçer. Olumsuz cevaplar 200 ve adlıdır;
 * `shortfalls` motorun tavsiyesidir, eksik kararı yönetim ekranında verilir.
 */
warehouse.post('/preparation/:orderId/confirm', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = ConfirmPreparationRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await confirmPreparation(serviceDb(), {
    orderId: orderId.data,
    warehouseId: c.get('warehouseId'),
    picks: parsed.data.picks,
    actorId: c.get('staff').id,
    // Hazır olunca haber (gel-al: "depodan alabilirsiniz"); rota/kargoda olay sessizdir.
    effects: mobileOrderEffects(serviceDb()),
  });

  const body: z.input<typeof ConfirmPreparationResponseSchema> = outcome;
  return ok(c, ConfirmPreparationResponseSchema.parse(body));
});

// ── D1 · Kutu döngüsü ───────────────────────────────────────────────────────

/**
 * Deponun yazıcı envanteri; hangisinin kullanılacağı cihazın seçimidir ve buraya gelmez. Yalnız açık satırlar döner ki sökülmüş
 * cihaz seçilemesin; küme elle kurulduğu için sayfalanmaz.
 */
warehouse.get('/printers', async (c) => {
  const printers = await printersFor(serviceDb(), c.get('warehouseId'));
  const body: z.input<typeof WarehousePrintersResponseSchema> = { printers };
  return ok(c, WarehousePrintersResponseSchema.parse(body));
});

/**
 * Telefonun ağda bulduğu yazıcıyı bu deponun envanterine yazar; adres SDK'nın keşfinden gelir, elle yazılmaz. Kâğıt boyu modelden
 * sunucuda türetilir (tanınmayan model reddedilir) ve depo bağlamdan alınır ki cihaz başka deponun envanterine yazamasın.
 */
warehouse.post('/printers', async (c) => {
  const parsed = RegisterPrinterRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await registerPrinter(serviceDb(), c.get('warehouseId'), parsed.data);
  const body: z.input<typeof RegisterPrinterResponseSchema> = outcome;
  return ok(c, RegisterPrinterResponseSchema.parse(body));
});

/**
 * "Test bas" için örnek etiket (PNG, zarfsız); yazıcı kimliği, istenen yazıcının bu deponun açık envanterinde olduğunu doğrulamak
 * için yolda. Gerçek bir kutuya bağlı değildir, basım damgası düşmez.
 */
warehouse.get('/printers/:printerId/sample-label.png', async (c) => {
  const printerId = UuidSchema.safeParse(c.req.param('printerId'));
  if (!printerId.success) return fail(c, 'invalid_printer_id', 400);

  const printers = await printersFor(serviceDb(), c.get('warehouseId'));
  const printer = printers.find((row) => row.id === printerId.data);
  if (!printer) return fail(c, 'not_found', 404);

  /* Örnek o yazıcının kâğıdında üretilir, çünkü testin sorusu bu makineden etiketin doğru çıkıp çıkmadığıdır. */
  const png = renderLabelPng(boxLabelSvg(sampleBoxLabel(), labelSizeMm(printer.labelSize) ?? DEFAULT_LABEL_MM));
  return c.body(new Uint8Array(png), 200, { 'content-type': 'image/png' });
});

/**
 * Kutu açılırken sorulan tipler: yalnız bu deponun benimsediği açık tipler, çünkü sistem şablonu kopyalanarak benimsenir ve
 * kapatılmış tip yeni kutuya konamaz. Küme elle kurulduğu için sayfalanmaz.
 */
warehouse.get('/shipping-boxes', async (c) => {
  const boxes = await new ShippingBoxService(serviceDb()).listForWarehouse(c.get('warehouseId'), { onlyActive: true });
  const body: z.input<typeof ShippingBoxesResponseSchema> = { boxes };
  return ok(c, ShippingBoxesResponseSchema.parse(body));
});

/**
 * Kutu açar; tek gövde alanı (`shippingBoxId`) kutunun fiziksel tipidir, gönderi ölçüsü ondan çıkar. Rota kulvarında tip
 * sorulmadığı için gövdesiz istek de geçerlidir.
 */
warehouse.post('/orders/:orderId/boxes', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = OpenBoxRequestSchema.safeParse((await readJsonBody(c)) ?? {});
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await openBox(serviceDb(), {
    orderId: orderId.data,
    warehouseId: c.get('warehouseId'),
    shippingBoxId: parsed.data.shippingBoxId,
    // Kutuyu açan hazırlığı başlatan kişidir; `confirmed → preparing` geçişinin izi ona yazılır.
    actorId: c.get('staff').id,
  });
  const body: z.input<typeof OpenBoxResponseSchema> = outcome;
  return ok(c, OpenBoxResponseSchema.parse(body));
});

/**
 * Kutuyu kapatır: içerik, parti izi ve mühür tek transaction'da (`seal_order_box`); `picks` bu kutunun dağılımıdır, çok kutulu
 * birleşimi kapı kurar. Olumsuz dallar 200 ve adlıdır.
 */
warehouse.post('/boxes/:boxId/seal', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const parsed = SealBoxRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await sealBox(serviceDb(), {
    boxId: boxId.data,
    warehouseId: c.get('warehouseId'),
    picks: parsed.data.picks,
    declareShort: parsed.data.declareShort,
    actorId: c.get('staff').id,
    effects: mobileOrderEffects(serviceDb()),
  });

  const body: z.input<typeof SealBoxResponseSchema> = outcome;
  return ok(c, SealBoxResponseSchema.parse(body));
});

/**
 * Kutuyu geri açar: mühür kalkar, döküm silinir, karşılanan adet kalan kutulardan yeniden yazılır. Reddin gerekçesi RPC'den gelir
 * ve ekrana aynen yazılır.
 */
warehouse.post('/boxes/:boxId/unseal', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const outcome = await unsealBox(serviceDb(), {
    boxId: boxId.data,
    warehouseId: c.get('warehouseId'),
    actorId: c.get('staff').id,
  });

  const body: z.input<typeof UnsealBoxResponseSchema> = outcome;
  return ok(c, UnsealBoxResponseSchema.parse(body));
});

/**
 * Siparişi eksik kapatır; son kutu kapandıktan sonra mühürlenecek kutu kalmadığı için kutu mühründen ayrı bir sipariş kararıdır.
 * Gövde almaz, eksik kalemler kayıttadır.
 */
warehouse.post('/orders/:orderId/declare-short', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const outcome = await declareOrderShort(serviceDb(), {
    orderId: orderId.data,
    warehouseId: c.get('warehouseId'),
    actorId: c.get('staff').id,
  });

  const body: z.input<typeof DeclareShortResponseSchema> = outcome;
  return ok(c, DeclareShortResponseSchema.parse(body));
});

/**
 * Etiket içeriği sunucudan gelir ki şablon tek yerde olsun; tutar taşımaz ve `not_sealed` cevabın kendisidir.
 */
warehouse.get('/boxes/:boxId/label', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const outcome = await boxLabelPayload(serviceDb(), { boxId: boxId.data, warehouseId: c.get('warehouseId') });
  // Yazıcı cevaba iliştirilmez: hangi yazıcının kullanılacağı cihazın seçimidir, liste `GET /warehouse/printers`ten gelir.
  const body: z.input<typeof BoxLabelResponseSchema> = outcome;
  return ok(c, BoxLabelResponseSchema.parse(body));
});

/**
 * Etiketin basılacak görseli (PNG, zarfsız), çünkü JSON zarfına base64 gömmek yükü şişirirdi. Görsel içerikle aynı kaynaktan
 * (`boxLabelPayload` → `boxLabelSvg`) üretilir; telefon çizmez, basar.
 */
warehouse.get('/boxes/:boxId/label.png', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const outcome = await boxLabelPayload(serviceDb(), { boxId: boxId.data, warehouseId: c.get('warehouseId') });
  if (outcome.status !== 'ok') return fail(c, outcome.status === 'forbidden' ? 'out_of_scope' : outcome.status, outcome.status === 'not_found' ? 404 : 409);

  /*
    Kâğıt boyunu cihaz bildirir: yazıcıyı sunucu seçmez, cihazın seçtiği yazıcının kâğıdına çizer. Boy yoksa ya da tanınmazsa
    kutu yazıcısının rulosu varsayılır.
  */
  const png = renderLabelPng(
    boxLabelSvg(outcome.label, labelSizeMm(c.req.query('labelSize') ?? '') ?? DEFAULT_LABEL_MM),
  );
  return c.body(new Uint8Array(png), 200, { 'content-type': 'image/png' });
});

// ── D1 · Sevk: teklif + duyuru ──────────────────────────────────────────────

/**
 * Sevk seçenekleri: sağlayıcıya teklif sorar, para harcamaz; ön koşullar duyurunun kapısından geçer ki listedeki seçenek duyuruda
 * reddedilmesin. Sağlayıcı yapılandırılmamışsa ağa çıkılmaz ve elle giriş yolu açık kalır.
 */
warehouse.get('/orders/:orderId/dispatch-options', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const provider = shippingProviderConfigured() ? sendcloudProvider() : null;
  if (!provider) return fail(c, 'shipping_provider_off', 503);

  const outcome = await quoteOrderShipment(serviceDb(), provider, {
    orderId: orderId.data,
    warehouseId: c.get('warehouseId'),
  });
  const body: z.input<typeof DispatchOptionsResponseSchema> = outcome;
  return ok(c, DispatchOptionsResponseSchema.parse(body));
});

/**
 * Gönderiyi duyurur ve etiketi satın alır — gerçek para harcar, bu yüzden sunucudan tek kayıtla geçer. Sağlayıcıda tekrar anahtarı
 * olmadığından yeniden deneme yoktur; `already_announced` hata değil cevaptır.
 */
warehouse.post('/orders/:orderId/announce', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = AnnounceShipmentRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const provider = shippingProviderConfigured() ? sendcloudProvider() : null;
  if (!provider) return fail(c, 'shipping_provider_off', 503);

  const outcome = await announceOrderShipment(serviceDb(), provider, {
    orderId: orderId.data,
    warehouseId: c.get('warehouseId'),
    shippingOptionCode: parsed.data.shippingOptionCode,
    servicePointId: parsed.data.servicePointId ?? undefined,
    quotedCents: parsed.data.quotedCents ?? undefined,
  });

  const body: z.input<typeof AnnounceShipmentResponseSchema> = outcome;
  return ok(c, AnnounceShipmentResponseSchema.parse(body));
});

/**
 * Kutunun taşıyıcıya devri; kurye yükleme ucundan ayrı, çünkü kargo siparişinin kuryesi yoktur ve soru "bu kutu senin deponun mu".
 * `already_handed` ikinci okutmadır, sayaç kıpırdamaz.
 */
warehouse.post('/handover', async (c) => {
  const parsed = HandoverRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await handOverBox(serviceDb(), {
    code: parsed.data.code,
    warehouseId: c.get('warehouseId'),
    actorId: c.get('staff').id,
  });
  const body: z.input<typeof HandoverResponseSchema> = outcome;
  return ok(c, HandoverResponseSchema.parse(body));
});

/**
 * Gel-al kuyruğu: bu depoda müşterisini bekleyen hazır siparişler ve tezgâhta hangi yöntemle tahsilat yazılabileceği. Hazırlığın
 * "tamamlananlar" yüzünden ayrı, çünkü burada bekleyen taşıyıcı değil müşteridir.
 */
warehouse.get('/pickup', async (c) => {
  const queue = await listPickupQueue(serviceDb(), { warehouseId: c.get('warehouseId') });
  const body: z.input<typeof PickupQueueResponseSchema> = queue;
  return ok(c, PickupQueueResponseSchema.parse(body));
});

/**
 * Gel-al teslimi: kutu okutması rota kapısıyla, tahsilat kapı tahsilatıyla aynı şarttır; teslim `ready`den yazılır.
 */
warehouse.post('/pickup/:orderId/deliver', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);
  const parsed = PickupDeliverRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);
  const outcome = await deliverPickupOrder(serviceDb(), {
    orderId: orderId.data,
    warehouseId: c.get('warehouseId'),
    actorId: c.get('staff').id,
    scannedBoxCodes: parsed.data.scannedBoxCodes,
    collection: parsed.data.collection ?? null,
    effects: mobileOrderEffects(serviceDb()),
  });
  const body: z.input<typeof PickupDeliverResponseSchema> = outcome;
  return ok(c, PickupDeliverResponseSchema.parse(body));
});

/**
 * Rampada devir bekleyen kutuların sayısı ve listesi (hub rozeti + devir ekranı); depo bağlamdan gelir ki başka deponun yığını
 * sayılmasın.
 */
warehouse.get('/handover/pending', async (c) => {
  const warehouseId = c.get('warehouseId');
  /* Sayı ve liste TEK turda ve AYNI süzgeçten: ikisi tek gerçeği söylüyor, ayrı turlarda
     okunsalardı arada bir kutu devredilir ve ekran kendi kendini yalanlardı. */
  const [boxes, waiting] = await Promise.all([
    countAwaitingHandover(serviceDb(), { warehouseId }),
    listAwaitingHandover(serviceDb(), { warehouseId }),
  ]);
  return ok(c, HandoverPendingResponseSchema.parse({ boxes, waiting }));
});

/**
 * Taşıyıcının etiketi için imzalı adres; kargo kulvarında bizim QR'lı etiketimiz basılmaz, iki barkod taşıyıcının tarayıcısını
 * şaşırtırdı. `no_label` "satın alındı ama dosya saklanamadı" demektir ve yeniden duyuru para harcadığı için operatör kararıdır.
 */
warehouse.get('/boxes/:boxId/shipping-label', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const box = await new OrderBoxService(serviceDb()).getById(boxId.data);
  // Kapsam dışı kutu "yok" sayılır — başka deponun kutusunun varlığı bile söylenmez.
  if (!box || box.warehouseId !== c.get('warehouseId')) {
    return ok(c, ShippingLabelResponseSchema.parse({ status: 'not_found' }));
  }
  if (box.shipmentId === null) return ok(c, ShippingLabelResponseSchema.parse({ status: 'not_announced' }));

  const url = await privateReadUrl(box.labelKey);
  const body: z.input<typeof ShippingLabelResponseSchema> = url === null ? { status: 'no_label' } : { status: 'ok', url };
  return ok(c, ShippingLabelResponseSchema.parse(body));
});

/**
 * Basım damgası: telefon SDK'dan "bastı" cevabını alınca çağırır, damga niyetin değil başarının kaydıdır.
 */
warehouse.post('/boxes/:boxId/printed', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const outcome = await markBoxPrinted(serviceDb(), { boxId: boxId.data, warehouseId: c.get('warehouseId') });
  const body: z.input<typeof MarkBoxPrintedResponseSchema> = outcome;
  return ok(c, MarkBoxPrintedResponseSchema.parse(body));
});

// ── D3 · Yakın-SKT turu ─────────────────────────────────────────────────────

/**
 * Karar bekleyen partiler, en acil önce; parti tek depoda olduğu için depo süzgeci zorunludur. Dönen tip fiyat taşımaz.
 */
warehouse.get('/near-expiry', async (c) => {
  const batches = await listNearExpiry(serviceDb(), c.get('warehouseId'));

  const body: z.input<typeof NearExpiryResponseSchema> = { batches };
  return ok(c, NearExpiryResponseSchema.parse(body));
});

// ── D2 · Mal kabul ──────────────────────────────────────────────────────────

/**
 * Bekleyen sevkiyatlar: referans, tedarikçi ve kalem sayısı; depocunun gördüğü "bekleyen kabul" olduğu için adres `/intake`.
 * Dönen tip fiyat taşımaz.
 */
warehouse.get('/intake', async (c) => {
  const intakes = await listPendingIntakes(serviceDb());

  const body: z.input<typeof PendingIntakesResponseSchema> = { intakes };
  return ok(c, PendingIntakesResponseSchema.parse(body));
});

/**
 * Plansız kabulün ürün araması; aranan katalog kaydı olduğu için adres `/variants`. Boş sorgu boş liste döner, çünkü ekran her
 * tuşta çağırır; satır fiyat taşımaz.
 */
warehouse.get('/variants', async (c) => {
  /* Depo süzgeci satırın STOĞU için: künye "GAZ-7120 · stok 24" diyor ve o sayı personelin
     KENDİ deposunun sayısıdır. Depo-üstü toplam yazılsaydı, başka deponun malı burada varmış
     gibi görünürdü (CLAUDE §1 — depo bir boyut değil değişmezdir). */
  const variants = await searchVariantsForIntake(serviceDb(), {
    query: c.req.query('q') ?? '',
    warehouseId: c.get('warehouseId'),
  });

  const body: z.input<typeof VariantSearchResponseSchema> = { variants };
  return ok(c, VariantSearchResponseSchema.parse(body));
});

/**
 * Tedarik siparişinden dolu kabul formu; boş `rows` plansız alımdır, `purchaseOrder: null` olmayan siparişi anlatır. Form depoya
 * süzülmez, çünkü satın alma depo-üstüdür ve süzmek aynı siparişin öteki depodaki kalemlerini gizlerdi.
 */
warehouse.get('/intake/:purchaseOrderId', async (c) => {
  const purchaseOrderId = UuidSchema.safeParse(c.req.param('purchaseOrderId'));
  if (!purchaseOrderId.success) return fail(c, 'invalid_purchase_order_id', 400);

  const db = serviceDb();
  // MLOR eşiği ayardır ve uç katmanı okur; yüzdeyi telefon SKT girildiği anda hesapladığı için cevaba konur.
  const [purchaseOrder, rows, thresholds] = await Promise.all([
    readIntakeHeader(db, purchaseOrderId.data),
    // Depo verilir: lot önerileri o deponun partilerinden okunur.
    openIntakeForm(db, purchaseOrderId.data, c.get('warehouseId')),
    readExpiryThresholds(new SettingsService(db)),
  ]);

  const body: z.input<typeof IntakeFormResponseSchema> = { purchaseOrder, rows, mlorPercent: thresholds.mlorPercent };
  return ok(c, IntakeFormResponseSchema.parse(body));
});

/**
 * Kabul gövdesi sözleşmeden daraltılarak türer: sipariş kimliğinin kaynağı yoldur, gövdedeki ikinci kimlik başka siparişi
 * kapatabilirdi; `date` biçime bağlıdır ki bozuk gün RPC'de patlamasın. Maliyet alanı yoktur, çünkü `receiveGoods` fiyat almaz.
 */
const ReceiveGoodsBodySchema = ReceiveGoodsRequestSchema.omit({ purchaseOrderId: true }).extend({
  date: IsoDateSchema.optional(),
});

async function receiveIntake(c: Context<WarehouseEnv>, purchaseOrderId: string | null): Promise<Response> {
  const parsed = ReceiveGoodsBodySchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await receiveGoods(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    purchaseOrderId,
    // Kabulü yapan oturumdaki personeldir; gövdeden gelen kimlik bir iddia olurdu.
    actorId: c.get('staff').id,
    ...parsed.data,
    // `reprice` bilerek geçirilmiyor: port kayıtsız olduğu için `repricedCount` null döner, ölçülemeyen değer sıfır değildir.
  });

  const body: z.input<typeof ReceiveGoodsResponseSchema> = outcome;
  return ok(c, ReceiveGoodsResponseSchema.parse(body));
}

/**
 * PO'lu mal kabul: satırlar partiye dönüşür, sipariş kapanır. SKT zorunluluğu şemadadır; fark ve kısa raf ömrü engel değil
 * cevabın içindedir (DOMAIN §4, parçalı kabul meşrudur).
 */
warehouse.post('/intake/:purchaseOrderId/receive', async (c) => {
  const purchaseOrderId = UuidSchema.safeParse(c.req.param('purchaseOrderId'));
  if (!purchaseOrderId.success) return fail(c, 'invalid_purchase_order_id', 400);

  return receiveIntake(c, purchaseOrderId.data);
});

/**
 * Plansız mal kabul: siparişsiz gelen mal da kayda girer, karşılaştırılacak beklenti olmadığı için fark raporu üretilmez. PO'lu
 * kabulün kimliği yolda olduğundan ayrı uçtur; gövde ve davranış aynıdır.
 */
warehouse.post('/intake/receive', async (c) => receiveIntake(c, null));

// ── D4 · Sayım / düzeltme ───────────────────────────────────────────────────

/**
 * İmha / sayım kaydı: satırlar tek transaction'da yazılır ve tek olay belgesini paylaşır. Depocuya `return_restock` sunulmaz
 * (gövde şeması onu dışlar); geri eklemede sebep notunu veritabanı zorlar, ret mesajıyla `failed` döner.
 */
warehouse.post('/adjustments', async (c) => {
  const parsed = RecordAdjustmentRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await recordAdjustment(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    ...parsed.data,
    actorId: c.get('staff').id,
  });

  const body: z.input<typeof RecordAdjustmentResponseSchema> = outcome;
  return ok(c, RecordAdjustmentResponseSchema.parse(body));
});

// ── D5 · Transfer (gelen) ───────────────────────────────────────────────────

/**
 * Bu depoya yolda olan transferler; küme fiziksel gerçekle sınırlı olduğu ve bir sevkiyatı kaçırmak iki depoda da görünmeyen mal
 * demek olduğu için sayfalanmaz.
 */
warehouse.get('/transfers', async (c) => {
  const db = serviceDb();
  const warehouseId = c.get('warehouseId');
  // Ulaşım süresi AYARDIR ve ayarı okumak uç katmanının işi (`readDispatchCandidate` ile aynı
  // kural: motor da kapı da saat/ayar okumaz). `SettingsService` süreç içinde önbellekli.
  const transitDays = await new SettingsService(db).getNumber(TRANSFER_TRANSIT_DAYS_KEY, TRANSFER_TRANSIT_DAYS_DEFAULT);

  // Üç okuma birbirini beklemez: ekran üçünü aynı anda çiziyor ve sıralı koşsalardı rampadaki
  // telefon üç turun toplamını beklerdi.
  const [transfers, outbound, closed] = await Promise.all([
    listInboundTransfers(db, { warehouseId }),
    listOutboundTransfers(db, { warehouseId, transitDays }),
    listClosedTransfers(db, { warehouseId }),
  ]);

  const body: z.input<typeof WarehouseTransfersResponseSchema> = { transfers, outbound, closed };
  return ok(c, WarehouseTransfersResponseSchema.parse(body));
});

/**
 * Tek transferin içi, salt okuma; iki uçtan biri olan depo görebilir (eksiği alan beyan eder, hesabını gönderen sorar). Değmiyorsa
 * `not_found` döner ki kimlik tahmin edene kaydın varlığı söylenmesin; durum süzülmez.
 */
warehouse.get('/transfers/:transferId', async (c) => {
  const transferId = UuidSchema.safeParse(c.req.param('transferId'));
  if (!transferId.success) return fail(c, 'invalid_transfer_id', 400);

  const detay = await readTransferDetail(serviceDb(), { transferId: transferId.data });
  if (!detay) return fail(c, 'not_found', 404);

  const warehouseId = c.get('warehouseId');
  if (detay.fromWarehouseId !== warehouseId && detay.toWarehouseId !== warehouseId) return fail(c, 'not_found', 404);

  const body: z.input<typeof TransferDetailResponseSchema> = detay;
  return ok(c, TransferDetailResponseSchema.parse(body));
});

/**
 * Transfer kabulü, rampada sayım: hedefte yeni parti doğar. `0` "geldi ama kayıp", boş satır "sayılmadı"dır; sayılmamış satır
 * varsa kapı `incomplete` ile o satırları döner.
 */
warehouse.post('/transfers/:transferId/receive', async (c) => {
  const transferId = UuidSchema.safeParse(c.req.param('transferId'));
  if (!transferId.success) return fail(c, 'invalid_transfer_id', 400);

  const parsed = ReceiveTransferRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await receiveTransfer(serviceDb(), {
    transferId: transferId.data,
    warehouseId: c.get('warehouseId'),
    lines: parsed.data.lines,
    actorId: c.get('staff').id,
    // Eksik beyanı: sebep + not; eksik varsa kayıp bu sebeple yazılır.
    declaration: parsed.data.declaration ?? null,
  });

  const body: z.input<typeof ReceiveTransferResponseSchema> = outcome;
  return ok(c, ReceiveTransferResponseSchema.parse(body));
});

// ── D6 · Kurye dönüşü kabulü ────────────────────────────────────────────────

/**
 * Rampaya dönen, akıbeti bekleyen kalemi olan siparişler; anahtar kurye günü değil depodur, çünkü aynı rampaya iki kurye döner ve
 * kuryesiz dönen sipariş de görünmeli. Gün süzgeci yoktur: dönüş mala aittir.
 */
warehouse.get('/returns', async (c) => {
  const drops = await listWarehouseReturns(serviceDb(), { warehouseId: c.get('warehouseId') });

  const body: z.input<typeof WarehouseReturnQueueResponseSchema> = { drops };
  return ok(c, WarehouseReturnQueueResponseSchema.parse(body));
});

/**
 * Rampada dönen malın akıbeti; kapı web iade penceresiyle aynıdır ve depocuya kapsamla (`warehouseScope`) açılır. `effects`
 * geçirilmez: müşteri haberi ve sağlayıcı iadesi buradan çıkmaz, yazılamayan iade `refundBlocked` ile döner.
 */
warehouse.post('/returns/:orderId', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = WarehouseReturnRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await adjustFulfillment(serviceDb(), orderId.data, parsed.data.adjustments, {
    actorId: c.get('staff').id,
    warehouseScope: [c.get('warehouseId')],
  });

  const body: z.input<typeof WarehouseReturnResponseSchema> = outcome;
  return ok(c, WarehouseReturnResponseSchema.parse(body));
});

// ── D6 · Rampa listesi + tek kuryenin dönüşü ────────────────────────────────

/**
 * Rampada bekleyen kuryeler: depocunun sorusu "hangi sipariş döndü" değil "kimden teslim alıyorum", çünkü mal kurye başına
 * devredilir. Kapsam kararını kapı verir; başka tesisin kuryesi listeye giremez.
 */
warehouse.get('/courier-return', async (c) => {
  const staff = c.get('staff');
  const couriers = await listReturningCouriers(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    scope: warehouseScope(staff.roles, staff.warehouseIds),
  });

  const body: z.input<typeof WarehouseReturningCouriersResponseSchema> = { couriers };
  return ok(c, WarehouseReturningCouriersResponseSchema.parse(body));
});

/**
 * Bir kuryenin rampadaki her şeyi: döküm, serbest ürün ve kutular tek okumada. `unassigned` kuryesiz dönüşleri verir, araç
 * bölümleri boş kalır.
 */
warehouse.get('/courier-return/:courierId', async (c) => {
  const param = c.req.param('courierId');
  const courierId = param === UNASSIGNED_RETURNS ? null : UuidSchema.safeParse(param);
  if (courierId !== null && !courierId.success) return fail(c, 'invalid_courier_id', 400);

  const staff = c.get('staff');
  const outcome = await readReturningCourier(serviceDb(), {
    courierId: courierId === null ? null : courierId.data,
    warehouseId: c.get('warehouseId'),
    scope: warehouseScope(staff.roles, staff.warehouseIds),
  });
  if ('status' in outcome) return fail(c, outcome.reason, 403);

  const body: z.input<typeof WarehouseCourierReturnResponseSchema> = outcome;
  return ok(c, WarehouseCourierReturnResponseSchema.parse(body));
});

/**
 * Dönüşün kabulü: sayılan serbest ürün araçtan depoya geçer, reddedilen kutuların araç damgası silinir. Kalemlerin akıbeti sipariş
 * işlemi olduğu için kendi ucundadır (`POST /returns/:orderId`); tek uçta birleşseler bir siparişin düşmesi bütün devri geri alırdı.
 */
warehouse.post('/courier-return/:courierId', async (c) => {
  const courierId = UuidSchema.safeParse(c.req.param('courierId'));
  if (!courierId.success) return fail(c, 'invalid_courier_id', 400);

  const parsed = AcceptCourierReturnRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const staff = c.get('staff');
  const outcome = await acceptCourierReturn(serviceDb(), {
    courierId: courierId.data,
    warehouseId: c.get('warehouseId'),
    scope: warehouseScope(staff.roles, staff.warehouseIds),
    actorId: staff.id,
    freeGoods: parsed.data.freeGoods,
  });

  const body: z.input<typeof AcceptCourierReturnResponseSchema> = outcome;
  return ok(c, AcceptCourierReturnResponseSchema.parse(body));
});

// ── Tarama · kod çözümü + öğrenen eşleme (Modül 23) ─────────────────────────

/**
 * Okutulan kodun çözümü, bütün tarama ekranlarının tek sözleşmesi: kimlik bulur, stok ve depo kararı vermez. POST, çünkü URL'deki
 * kod erişim loglarına düşer ve `/` içeren kod yolu böler; `unknown` hata değil öğrenme davetidir.
 */
warehouse.post('/codes/resolve', async (c) => {
  const parsed = ResolveCodeRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await resolveScannedCode(serviceDb(), parsed.data);
  const body: z.input<typeof ResolveCodeResponseSchema> = outcome;
  return ok(c, ResolveCodeResponseSchema.parse(body));
});

/**
 * Raftaki parti etiketinin çözümü: düzeltme daima bir partiye yazıldığı için varyant cevabı yetmez. Depo jetondan gelir; eşleşme
 * yoksa `unknown` 404 değil cevaptır ki ekran ağ arızasını "böyle parti yok"tan ayırabilsin.
 */
warehouse.post('/batches/resolve', async (c) => {
  const parsed = ResolveBatchRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await resolveBatchCode(serviceDb(), { ...parsed.data, warehouseId: c.get('warehouseId') });
  const body: z.input<typeof ResolveBatchResponseSchema> = outcome;
  return ok(c, ResolveBatchResponseSchema.parse(body));
});

/**
 * Raf listesi, okunamayan etiketin yedeği; depo jetondan gelir. `?cursor=` ile sayfalanır, `?area=` dolap süzgecidir; bozuk
 * imleç listeyi baştan verir.
 */
warehouse.get('/batches', async (c) => {
  const area = c.req.query('area');
  const areaId = area === undefined ? undefined : UuidSchema.safeParse(area);
  if (areaId !== undefined && !areaId.success) return fail(c, 'invalid_area', 400);

  const result = await listWarehouseBatches(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    query: c.req.query('q') ?? '',
    storageAreaId: areaId?.data,
    cursor: decodeCursor(c.req.query('cursor')),
  });

  const body: z.input<typeof WarehouseBatchesResponseSchema> = {
    batches: result.batches,
    nextCursor: result.nextCursor === null ? null : encodeCursor(result.nextCursor),
  };
  return ok(c, WarehouseBatchesResponseSchema.parse(body));
});

/**
 * Deponun açık alanları, sayım seçicisinin "hangi dolabın önündesin" sorusu için; küme elle kurulduğu için sayfalanmaz.
 */
warehouse.get('/areas', async (c) => {
  const areas = await listWarehouseAreas(serviceDb(), c.get('warehouseId'));
  const body: z.input<typeof WarehouseAreasResponseSchema> = { areas };
  return ok(c, WarehouseAreasResponseSchema.parse(body));
});

/**
 * **PARTİ BU ALANDA GÖRÜLDÜ** — partinin alanı "son görüldüğü yer"dir, taşıma kaydı YOK (gerekçe
 * `batch-area.ts` künyesinde). Dört cevap da 200: `invalid_area` ve `out_of_scope` operatöre
 * söylenecek cümlelerdir, ağ arızası değil.
 */
warehouse.post('/batches/:stockId/seen', async (c) => {
  const stockId = UuidSchema.safeParse(c.req.param('stockId'));
  if (!stockId.success) return fail(c, 'invalid_stock_id', 400);

  const parsed = MarkBatchSeenRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await markBatchSeen(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    stockId: stockId.data,
    storageAreaId: parsed.data.storageAreaId,
  });
  const body: z.input<typeof MarkBatchSeenResponseSchema> = outcome;
  return ok(c, MarkBatchSeenResponseSchema.parse(body));
});

/**
 * Öğrenen eşleme: tanınmayan kod bir varyanta bağlanır ve öğreten kişi kayda geçer. Kod zaten bağlıysa `already_bound` döner;
 * düzeltme web varyant editöründen.
 */
warehouse.post('/codes', async (c) => {
  const parsed = LearnCodeRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await learnCode(serviceDb(), { ...parsed.data, actorId: c.get('staff').id });
  const body: z.input<typeof LearnCodeResponseSchema> = outcome;
  return ok(c, LearnCodeResponseSchema.parse(body));
});
