import { Hono } from 'hono';
import { z } from 'zod';
import { DeliveryRunService, VariantBarcodeService, serviceDb } from '@lezzet/database';
import { warehouseScope } from '@lezzet/domain-core';
import {
  closeCourierDay,
  confirmDoorDelivery,
  listCourierDay,
  listCourierRoutes,
  listCourierVehicles,
  listStrandedStops,
  listVanCandidates,
  readVanStock,
  setVanQty,
  takeToVan,
  courierVanContext,
  loadBox,
  markUndelivered,
  openDayClose,
  readCourierRuns,
  readDoorCollection,
  requestDeliveryProofUploadUrl,
  discardCourierRun,
  startCourierDay,
} from '@lezzet/application';
import {
  CloseDeliveryRunRequestSchema,
  CloseDeliveryRunResultSchema,
  ConfirmDoorDeliveryRequestSchema,
  ConfirmDoorDeliveryResponseSchema,
  CourierDayResponseSchema,
  CourierRoutesResponseSchema,
  CourierVehiclesResponseSchema,
  CourierVanStockScanRequestSchema,
  CourierVanStockSetRequestSchema,
  CourierVanStockMoveResponseSchema,
  CourierVanStockResponseSchema,
  DepartCourierRunResponseSchema,
  DiscardCourierRunResponseSchema,
  DayCloseDraftSchema,
  DeliveryProofUploadRequestSchema,
  DeliveryProofUploadResponseSchema,
  LoadBoxRequestSchema,
  LoadBoxResponseSchema,
  MarkUndeliveredRequestSchema,
  MarkUndeliveredResponseSchema,
  StartCourierDayRequestSchema,
  StartCourierDayResponseSchema,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { IsoDateSchema, readJsonBody, UuidSchema } from '../../lib/request';
import { mobileOrderEffects } from '../../lib/order-effects';
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * Kurye uçları: parse → kapı → zarf; kural burada hesaplanmaz, karar `@lezzet/application`ın kurye kapılarındadır ki operasyon web
 * ekranıyla ayrışmasın. Kapının kararı 200 ile gövdedeki ayrımlı birleşimde döner, çünkü HTTP koduna indirgenen ret taşıdığı bilgiyi
 * kaybederdi (`stale` siparişin şu anki durumunu da söyler).
 */

/**
 * Kurye kimliği jetondan gelir, gövdeden asla: gövdeye konsaydı kurye başkasının kimliğini yazıp onun durağını kapatabilirdi. Değeri
 * koyan tek yer rol kapısıdır (`requireStaffRole`).
 */
const DateQuerySchema = z.object({ date: IsoDateSchema.optional() });

export const courier = new Hono<StaffEnv>();

courier.use('*', requireStaffRole('courier', 'admin'));

/**
 * Günün durakları ve seferin künyesi; varsayılan gün burada çözülüp kapıya açıkça geçirilir, yoksa gece yarısında ekran dünün duraklarını
 * bugünün tarihiyle gösterirdi. Mesaj dili sorulmaz, çünkü "yoldayım" bağlantısı müşterinin dilindedir ve kapı `fr`e düşer.
 */
courier.get('/day', async (c) => {
  const query = DateQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const db = serviceDb();
  const courierId = c.get('staff').id;
  const date = query.data.date ?? new Date().toISOString().slice(0, 10);
  // Duraklar araçtaki seferlerden gelir (kurulmuş ve kapanmamış hepsi), çünkü gün süzgeci iki seferin durağını karışık döndürürdü.
  // `run` sürülen seferdir: yola çıkmış ve kapanmamış olan.
  const runs = await readCourierRuns(db, { courierId });
  const run = runs.find((candidate) => candidate.departedAt !== null) ?? null;
  const [stops, doorCollection, stranded] = await Promise.all([
    listCourierDay(db, { courierId, date, runIds: runs.map((candidate) => candidate.runId) }),
    readDoorCollection(db),
    // Askıda kalanlar: teslim günü geçmiş, sonuçlanmamış; kurye kutuyu neden taşıdığını bilsin.
    listStrandedStops(db, { courierId, today: date }),
  ]);

  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü `CourierStop` sözleşmeye alan alan uymak
  // zorunda ve uymadığı gün burası DERLENMEZ (katalogdaki compile-lock deseni).
  const body: z.input<typeof CourierDayResponseSchema> = { date, run, runs, stops, doorCollection, stranded };
  return ok(c, CourierDayResponseSchema.parse(body));
});

/**
 * Kuryenin rota seçimi: o gün koşan aktif rotalar, yükleri ve açık seferin künyesi; gün `/day` ile aynı gerekçeyle burada çözülür. Liste
 * kuryeye değil depoya süzülür (`warehouseScope`): kurye rotayı seçer, sahiplik seferi başlatanındır.
 */
courier.get('/routes', async (c) => {
  const query = DateQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const staff = c.get('staff');
  const date = query.data.date ?? new Date().toISOString().slice(0, 10);
  const routes = await listCourierRoutes(serviceDb(), { date, scope: warehouseScope(staff.roles, staff.warehouseIds) });

  const body: z.input<typeof CourierRoutesResponseSchema> = { date, routes };
  return ok(c, CourierRoutesResponseSchema.parse(body));
});

/** Kuryenin seçebileceği araçlar: kendi deposuna künyeli ve aktif olanlar; kapsam rota listesiyle aynı kapıdan çözülür. */
courier.get('/vehicles', async (c) => {
  const staff = c.get('staff');
  const vehicles = await listCourierVehicles(serviceDb(), { scope: warehouseScope(staff.roles, staff.warehouseIds) });

  const body: z.input<typeof CourierVehiclesResponseSchema> = { vehicles };
  return ok(c, CourierVehiclesResponseSchema.parse(body));
});

/**
 * Seferi başlat: seçilen rotanın seferini açar ve hazır siparişlerini yola çıkarır; rota verilmezse kararı kapı verir (tek rotada otomatik
 * seçim, birden çoksa `route_required`). Kısmi başarı ve ret gövdede döner, çünkü kurye bekleyen durağı teslim yazmayı denemeden öğrenmeli.
 */
const StartDayBodySchema = StartCourierDayRequestSchema.extend({ date: IsoDateSchema.optional() });

courier.post('/day/start', async (c) => {
  const parsed = StartDayBodySchema.safeParse((await readJsonBody(c)) ?? {});
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const result = await startCourierDay(db, {
    courierId: c.get('staff').id,
    date: parsed.data.date,
    zoneId: parsed.data.zoneId,
    vehicleId: parsed.data.vehicleId,
    // `depart:false` seferi kurar ama yola çıkarmaz: ekran önce kurar, yükler, sonra başlatır.
    depart: parsed.data.depart,
    effects: mobileOrderEffects(db),
  });

  const body: z.input<typeof StartCourierDayResponseSchema> = result;
  return ok(c, StartCourierDayResponseSchema.parse(body));
});

/**
 * Araçtaki serbest ürün: araçta ne var ve depodan ne alınabilir tek okumada, çünkü ekran ikisini yan yana çizer ve biri olmadan öteki
 * karar kurmaz. Çıkış deposu seferin rotasından, araç deposu seferin aracından çözülür, istemciden değil.
 */
courier.get('/van-stock', async (c) => {
  const staff = c.get('staff');
  const db = serviceDb();
  /* Araç deposu seferin aracından, çıkış tesisi seferin rotasından çözülür; kapsamdan çözülse iki araçlı kuryede ikisi de yanlış olurdu. */
  const { vehicleWarehouseId, facilityId } = await courierVanContext(db, { courierId: staff.id });
  /* Arama aynı uçtan, çünkü soru aynıdır ("depodan ne alabilirim"); ayrı uç aynı listeyi iki sıralama ve iki tavanla döndürmeye kapı
     açardı. Boş sorgu süzgeçsiz seçkidir. */
  const query = c.req.query('q')?.trim() ?? '';

  const [onVan, candidates] = await Promise.all([
    /* İki okuma da çıkış ve araç deposunu birlikte ister: ayrı okunsaydı eşleştirmeyi ekran yapar ve tavanlı seçkide eşleşme yarım
       kalırdı. */
    vehicleWarehouseId === null
      ? Promise.resolve([])
      : readVanStock(db, { vehicleWarehouseId, sourceWarehouseId: facilityId }),
    facilityId === null
      ? Promise.resolve([])
      : listVanCandidates(db, {
          warehouseId: facilityId,
          vehicleWarehouseId,
          query: query.length > 0 ? query : undefined,
          /* Arama tavanı seçkiden geniştir ama sınırsız değildir; rampada kaydırılacak liste sayfalanacak bir küme değil. */
          limit: query.length > 0 ? 40 : undefined,
        }),
  ]);

  const body: z.input<typeof CourierVanStockResponseSchema> = { vehicleWarehouseId, onVan, candidates };
  return ok(c, CourierVanStockResponseSchema.parse(body));
});

/**
 * Araçtaki adedi yaz: alma da devretme de "araçta şu kadar olsun" kararıdır ve yönü sunucu ölçerek bulur (`setVanQty`). Fark istemcinin
 * bayat tabanından hesaplansaydı çift yazım doğardı.
 */
courier.post('/van-stock/set', async (c) => {
  const parsed = CourierVanStockSetRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const staff = c.get('staff');
  const db = serviceDb();
  /* Araç deposu seferin aracından, çıkış tesisi seferin rotasından çözülür; kapsamdan çözülse iki araçlı kuryede ikisi de yanlış olurdu. */
  const { vehicleWarehouseId, facilityId } = await courierVanContext(db, { courierId: staff.id });
  if (facilityId === null) return ok(c, CourierVanStockMoveResponseSchema.parse({ status: 'no_vehicle' }));

  const result = await setVanQty(db, {
    warehouseId: facilityId,
    vehicleWarehouseId,
    variantId: parsed.data.variantId,
    targetQty: parsed.data.targetQty,
    observedQty: parsed.data.observedQty,
    actorId: staff.id,
    idempotencyKey: parsed.data.idempotencyKey,
  });
  const body: z.input<typeof CourierVanStockMoveResponseSchema> = result;
  return ok(c, CourierVanStockMoveResponseSchema.parse(body));
});

/**
 * Okut ve bir tane al: istemci kodun hangi varyant olduğunu bilmediği için mutlak hedef yoktur ve tekrar korunmaz, çünkü "aynı paketi
 * yeniden okuttum" ile "ikinci paketi okuttum" ayırt edilemez. Kod → varyant çevirisi uçtadır ve tanınmayan kod kendi dalıyla döner.
 */
courier.post('/van-stock/scan', async (c) => {
  const parsed = CourierVanStockScanRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const staff = c.get('staff');
  const db = serviceDb();
  const { vehicleWarehouseId, facilityId } = await courierVanContext(db, { courierId: staff.id });
  if (facilityId === null) return ok(c, CourierVanStockMoveResponseSchema.parse({ status: 'no_vehicle' }));

  const variantId = (await new VariantBarcodeService(db).findByCode(parsed.data.code))?.variantId ?? null;
  if (variantId === null) return ok(c, CourierVanStockMoveResponseSchema.parse({ status: 'unknown_code' }));

  const result = await takeToVan(db, {
    warehouseId: facilityId,
    vehicleWarehouseId,
    variantId,
    qty: 1,
    actorId: staff.id,
  });
  /* Cevap ortak şekilde konuşur (`movedQty` → `delta`); okutma daima artırır ve ayrı bir cevap şekli aynı dalları iki yerde bakmak
     olurdu. */
  const body: z.input<typeof CourierVanStockMoveResponseSchema> =
    result.status === 'ok'
      ? { status: 'ok', variantId: result.variantId, delta: result.movedQty, vanQty: result.vanQty }
      : result;
  return ok(c, CourierVanStockMoveResponseSchema.parse(body));
});

/**
 * Seferi yola çıkar: hangi sefer olduğu URL'dedir, çünkü araçta birden çok sefer durur. Rota ve gün seferin kaydından okunur; gövdeden
 * alınsa başka rotanın seferi bu kimlikle başlatılabilirdi.
 */
courier.post('/runs/:runId/depart', async (c) => {
  const runId = UuidSchema.safeParse(c.req.param('runId'));
  if (!runId.success) return fail(c, 'invalid_run_id', 400);

  const courierId = c.get('staff').id;
  const db = serviceDb();
  const run = await new DeliveryRunService(db).getById(runId.data);
  // "Yok" ile "senin değil" AYNI cevap: sefer kimlikleri haritalanamaz (kapanış kapısının kuralı).
  if (!run || run.courierId !== courierId) {
    return ok(c, DepartCourierRunResponseSchema.parse({ status: 'not_found' }));
  }

  const result = await startCourierDay(db, {
    courierId,
    date: run.deliveryDate,
    zoneId: run.deliveryZoneId,
    vehicleId: run.vehicleId,
    effects: mobileOrderEffects(db),
  });
  /* "Başka sefer sürülüyor" hata değil cevabın kendisidir ve künyesiyle döner: kurye önce hangisini kapatacağını bilmeli, `not_found`a
     yıkılsaydı ekran "sefer kayboldu" derdi. */
  if (result.status === 'another_running') {
    const running: z.input<typeof DepartCourierRunResponseSchema> = {
      status: 'another_running',
      runId: result.runId,
      referenceNo: result.referenceNo,
    };
    return ok(c, DepartCourierRunResponseSchema.parse(running));
  }
  if (result.status !== 'ok') return ok(c, DepartCourierRunResponseSchema.parse({ status: 'not_found' }));

  const body: z.input<typeof DepartCourierRunResponseSchema> = result;
  return ok(c, DepartCourierRunResponseSchema.parse(body));
});

/** Seferi araçtan çıkar; `depart` ile aynı kapı: sefer URL'de, kimlik jetondan, "yok" ile "senin değil" aynı cevap. */
courier.post('/runs/:runId/discard', async (c) => {
  const runId = UuidSchema.safeParse(c.req.param('runId'));
  if (!runId.success) return fail(c, 'invalid_run_id', 400);

  const outcome = await discardCourierRun(serviceDb(), { runId: runId.data, courierId: c.get('staff').id });
  if (outcome.ok) {
    const body: z.input<typeof DiscardCourierRunResponseSchema> = {
      status: 'ok',
      releasedOrders: outcome.releasedOrders ?? 0,
      unloadedBoxes: outcome.unloadedBoxes ?? 0,
    };
    return ok(c, DiscardCourierRunResponseSchema.parse(body));
  }
  const reason = outcome.reason === 'already_departed' ? 'already_departed' : 'not_found';
  return ok(c, DiscardCourierRunResponseSchema.parse({ status: reason }));
});

/**
 * Araca yükleme okutması: kod gövdede gider ki URL'de dolaşmasın ve olumsuz dallar 200 ile gövdede döner (`wrong_route` kutunun hangi
 * siparişin malı olduğunu söyler). Yükleme durum geçişi yazmaz; siparişi yola çıkarmak sefer başlatmanın işidir.
 */
courier.post('/boxes/load', async (c) => {
  const parsed = LoadBoxRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  // Sefer yoldaysa son kutu durağı açar ve haber gider; port bu yüzden burada da geçer.
  const outcome = await loadBox(db, { code: parsed.data.code, courierId: c.get('staff').id, effects: mobileOrderEffects(db) });
  const body: z.input<typeof LoadBoxResponseSchema> = outcome;
  return ok(c, LoadBoxResponseSchema.parse(body));
});

/**
 * Kapıda teslim: kanıt, eksik kalem ve tahsilat tek istekte, çünkü üç uca bölünse ağın koptuğu an yarısı yazılmış bir teslimat kalırdı.
 * `idempotencyKey` istemcide üretilir ki çevrimdışı kuyruğun tekrarı parayı iki kez yazmasın.
 */
courier.post('/stops/:orderId/deliver', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = ConfirmDoorDeliveryRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const outcome = await confirmDoorDelivery(db, {
    orderId: orderId.data,
    courierId: c.get('staff').id,
    ...parsed.data,
    // Müşterinin "teslim edildi" haberi bu porttan gider.
    effects: mobileOrderEffects(db),
  });

  const body: z.input<typeof ConfirmDoorDeliveryResponseSchema> = outcome;
  return ok(c, ConfirmDoorDeliveryResponseSchema.parse(body));
});

/**
 * Ulaşılamadı ya da reddedildi: `unreachable` malı araçta bırakır (`ready`), `refused` depoya döndürür (`returned`). Not bu uçta zorunludur,
 * sözleşmede değil, çünkü web ekranı notsuz da işaretleyebilir; not geçişle atomik `order_status_log.note`a yazılır ve loglanmaz.
 */
const MarkUndeliveredBodySchema = MarkUndeliveredRequestSchema.extend({ note: z.string().trim().min(1) });

courier.post('/stops/:orderId/undelivered', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const raw = await readJsonBody(c);
  const parsed = MarkUndeliveredBodySchema.safeParse(raw);
  if (!parsed.success) {
    // Eksik notu ayrı bir anahtarla söylüyoruz: ekran onu bir alan hatası olarak gösterebilsin.
    // Sonuç değeri de bozuksa (`outcome`) genel biçim hatası döner — sıra bilinçli, çünkü not
    // eksikliği kullanıcının düzeltebileceği tek durumdur.
    const noteFailed = parsed.error.issues.some((issue) => issue.path[0] === 'note');
    return fail(c, noteFailed ? 'note_required' : 'invalid_body', 400);
  }

  const outcome = await markUndelivered(serviceDb(), {
    orderId: orderId.data,
    courierId: c.get('staff').id,
    outcome: parsed.data.outcome,
    note: parsed.data.note,
  });

  const body: z.input<typeof MarkUndeliveredResponseSchema> = outcome;
  return ok(c, MarkUndeliveredResponseSchema.parse(body));
});

/**
 * Kanıt yükleme izni: dosya sunucudan geçmez, cihaz kovaya yükler ve sunucu yalnız yetkiyi doğrulayıp kısa ömürlü izin yazar. Sipariş
 * kimliği yolda durur ki gövde sözleşmeyle birebir kalsın; `alreadyRequested` tavanı istemciden gelir, gerçek kilit iznin kısa ömrüdür.
 */
courier.post('/stops/:orderId/proof-upload', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = DeliveryProofUploadRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await requestDeliveryProofUploadUrl(serviceDb(), {
    orderId: orderId.data,
    courierId: c.get('staff').id,
    ...parsed.data,
  });

  const body: z.input<typeof DeliveryProofUploadResponseSchema> = result;
  return ok(c, DeliveryProofUploadResponseSchema.parse(body));
});

/**
 * Sefer kapanışı taslağı: seferin resmi ve yöntem başına beklenen tahsilat. `runId` verilirse gün süzgeci uygulanmaz, çünkü dünkü seferin
 * kapanışı bugünden açılabilmeli; sefer kuryenin değilse "yok" ile "senin değil" aynı cevaptır.
 */
const DayCloseQuerySchema = DateQuerySchema.extend({ runId: UuidSchema.optional() });

courier.get('/day-close', async (c) => {
  const query = DayCloseQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const draft = await openDayClose(serviceDb(), {
    courierId: c.get('staff').id,
    runId: query.data.runId,
    date: query.data.date,
  });

  const body: z.input<typeof DayCloseDraftSchema> = draft;
  return ok(c, DayCloseDraftSchema.parse(body));
});

/**
 * Seferi kapat: para kapıda tahsil edilirken yazıldığı için kapanış bir mutabakattır, yalnız nakit farkı kasa hesabına hareket olarak
 * yazılır. Özne seferdir (`runId` zorunlu) ki iki seferli günde hangisinin kapandığını istemci söylesin; `already_closed` hata değil, 200'dür.
 */
courier.post('/day-close', async (c) => {
  const parsed = CloseDeliveryRunRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await closeCourierDay(serviceDb(), { courierId: c.get('staff').id, ...parsed.data });

  const body: z.input<typeof CloseDeliveryRunResultSchema> = result;
  return ok(c, CloseDeliveryRunResultSchema.parse(body));
});
