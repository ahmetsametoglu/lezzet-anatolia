import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { OrderBoxService, serviceDb, ShippingBoxService, WarehouseService } from '@lezzet/database';
import {
  adjustFulfillment,
  announceOrderShipment,
  boxLabelPayload,
  boxLabelSvg,
  confirmPreparation,
  handOverBox,
  labelPrinterFor,
  markBoxPrinted,
  learnCode,
  listInboundTransfers,
  listPendingIntakes,
  listPreparationQueue,
  listWarehouseReturns,
  openBox,
  openIntakeForm,
  quoteOrderShipment,
  readIntakeHeader,
  receiveGoods,
  receiveTransfer,
  recordAdjustment,
  resolveScannedCode,
  sealBox,
  sendcloudProvider,
  shippingProviderConfigured,
} from '@lezzet/application';
// Alt yol (paketin `./*` ihracı): arama kapısı bugün TEK yüzeyin işi — barrel'a ad eklemek, henüz
// ortak olmayan bir şeyi paketin kamu sözleşmesine yazmak olurdu. İkinci çağıran doğduğunda terfi eder.
import { searchVariantsForIntake } from '@lezzet/application/warehouse/variant-search';
import {
  AnnounceShipmentRequestSchema,
  AnnounceShipmentResponseSchema,
  BoxLabelResponseSchema,
  ConfirmPreparationRequestSchema,
  ConfirmPreparationResponseSchema,
  DispatchOptionsResponseSchema,
  HandoverRequestSchema,
  HandoverResponseSchema,
  InboundTransfersResponseSchema,
  IntakeFormResponseSchema,
  LearnCodeRequestSchema,
  LearnCodeResponseSchema,
  MarkBoxPrintedResponseSchema,
  OpenBoxRequestSchema,
  OpenBoxResponseSchema,
  PendingIntakesResponseSchema,
  VariantSearchResponseSchema,
  PreparationQueueResponseSchema,
  ReceiveGoodsRequestSchema,
  ReceiveGoodsResponseSchema,
  ReceiveTransferRequestSchema,
  ReceiveTransferResponseSchema,
  RecordAdjustmentRequestSchema,
  RecordAdjustmentResponseSchema,
  ResolveCodeRequestSchema,
  ResolveCodeResponseSchema,
  SealBoxRequestSchema,
  SealBoxResponseSchema,
  ShippingBoxesResponseSchema,
  ShippingLabelResponseSchema,
  WarehouseReturnQueueResponseSchema,
  WarehouseReturnRequestSchema,
  WarehouseReturnResponseSchema,
} from '@lezzet/types';
import { privateReadUrl } from '@lezzet/storage';
import { fail, ok } from '../../lib/respond';
import { IsoDateSchema, readJsonBody, UuidSchema } from '../../lib/request';
import { renderLabelPng } from '../../lib/label-png';
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * Depo uçları (21.11) — mobil "Depo" bölümünün taşıma katmanı (D1 · D2 · D4 · D5 · D6).
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Kurye ucuyla (`courier.ts`) aynı çizgi: parse → kapı → zarf. FEFO önerisi, çıpalı parti kilidi,
 * eksik tavsiyesi, MLOR uyarısı, beklenen–gelen farkı, olay belgesi, eksik satır reddi ve iade
 * borcunun türetimi — hiçbiri burada YOK. Hepsi `@lezzet/application`ın depo kapılarında
 * (`warehouse/{preparation,intake,adjustment,transfer}` + D6 için `order/refund`), yani operasyon
 * web ekranlarının okuduğu kararların TAM AYNISI.
 *
 * ── HTTP DURUMU İLE KAPI KARARI AYRI SORULARDIR ──────────────────────────────
 * Durum kodu **"isteğin kapıya ulaştı mı"** sorusunu yanıtlar (401 kimliksiz · 403 rolsüz/kapsam
 * dışı depo · 400 biçimsiz gövde ya da belirsiz depo · 404 olmayan depo). Kapının VERDİĞİ karar ne
 * olursa olsun **200**'dür ve gövdedeki sözleşme birleşiminde durur: `pinned_violation`,
 * `incomplete`, `stale`, `failed`, `empty`, `not_found` ve **veri düzeyindeki** `forbidden`.
 *
 * İki `forbidden`ın ayrımı bilinçli ve ölçülebilir (sözleşme künyesi + `refund.ts`): rol kapısı bir
 * YETKİ kararıdır ("sen bu bölüme giremezsin" → 403), kapının `out_of_scope`u bir KAPSAM kararıdır
 * ("bu parti/sipariş/transfer senin deponun değil" → 200 + gövde). İkincisi ekranda gösterilecek bir
 * cevaptır ve hangi `stockIds`in dışarıda kaldığını taşır; bir HTTP koduna indirgenirse operatör
 * hangi satırı sileceğini bilemez.
 *
 * ── DEPO EKRANI PARA GÖRMEZ, VE BU BİR TİP SINIRI ───────────────────────────
 * Tasarımın altın kuralı (v2: *"Depo ekranları fiyat/tutar görmez"*) burada bir arayüz disiplini
 * değil, açılan kapının kendisidir: mal kabul ucu **`receiveGoods`**e bağlı, `receivePurchase`e
 * DEĞİL. İkincisi maliyet taşıyan satır tipini (`PurchaseIntakeLine`) kabul eden admin yoludur
 * (09.14) ve mobilde hiç açılmadı — açılsaydı depocunun ekranına fiyat alanı koymanın önü teknik
 * olarak açık kalırdı. Tek istisna D6'nın YANITIDIR: kurye dönüşü bir sipariş düzeltmesidir ve iade
 * tutarını çağıran (yönetim akışı) okur; depocu ekranı o alanı çizmez.
 *
 * ── AÇILMAYAN KAPILAR: D3, SEVK, GERİ ALMA ──────────────────────────────────
 * Paket üç kapı daha veriyor (`dispatchTransfer`, `cancelTransfer`) ve D3 (yakın-SKT) için hiç kapı
 * YOK (`batch-view` terfisi defterde). Hiçbiri uç olarak açılmadı ve gerekçe ölçüldü, varsayılmadı:
 * v2'nin D5 ekranı **rampada sayım** ekranıdır ("RAMPADA SAY — GELEN ADEDİ GİR"), sevk kurgusu ya da
 * geri alma düğmesi barındırmaz; D3 ekranı ise işaretleme içermeyen bir okuma listesidir ve
 * beslendiği kapı bugün yok. Tüketicisi olmayan bir uç, ilk günden ölü koddur (CLAUDE.md §0).
 *
 * ── YAN ETKİ SINIRI: BU UÇTAN MAİL/PUAN ÇIKMAZ (kurye ucuyla aynı) ──────────
 * D6'nın kapısı (`adjustFulfillment`) müşteri haberini ve sağlayıcı iadesini PORT üzerinden alıyor
 * (`application/order/effects.ts`); portların uygulamaları henüz terfi etmedi. `effects` BİLEREK
 * geçirilmiyor: mal ve stok düzeltilir, iade borcu türetilir — **müşteriye iade maili gitmez ve
 * kart iadesi çağrılmaz.** Sessiz değil: borç yazılamadıysa cevabın `refundBlocked` alanı sebebi
 * söyler (`provider_unavailable`), ekran onu gösterir.
 *
 * ── LOG: KİMLİK EVET, İÇERİK HAYIR (CLAUDE §1) ──────────────────────────────
 * Bu dosya ayrıca kayıt düşmez; `app.ts`in istek satırı yolu ve durumu zaten yazıyor ve yolda yalnız
 * kimlikler var. Gövde HİÇBİR ZAMAN loglanmaz: sayım notu ve "stoğa dön" gerekçesi serbest metindir,
 * gideceği tek yer düzeltme kaydının kendi sütunudur.
 */

/**
 * **Depo kimliği — kapıların ZORUNLU parametresi, ve buraya koyan tek yer burası.**
 *
 * CLAUDE.md §1: *varsayılan depo YOKTUR.* Sözleşmelerin hiçbir istek gövdesinde `warehouseId` yok
 * (`warehouse-api.schema.ts` künyesi): gövdeye konsaydı depocu başka deponun kimliğini yazıp onun
 * malını düşebilirdi — yetkilendirme doğrulanmamış bir girdiye dayanamaz. Kimlik PROFİLDEN gelir.
 *
 * ── ÜÇ HÂL, TEK KURAL ───────────────────────────────────────────────────────
 * Kural tek cümle: *"kapsamda tek depo varsa o, değilse söylenmeli."*
 *
 *   1. **Kapsamda tam bir depo** → o depo. v2'nin başlığı bu hâli anlatıyor: "DEPO · STRASBOURG
 *      (SABİT)". Depocunun günlük hâli budur.
 *   2. **`?warehouseId=` verildi** → kapsamdaysa kabul; kapsam dışıysa `admin` için serbest,
 *      değilse `403 warehouse_out_of_scope`.
 *   3. **Parametre yok ve kapsam tek değil** → `400 warehouse_required`.
 *
 * ── BOŞ KAPSAM NEDEN 403 DEĞİL (ölçüldü) ────────────────────────────────────
 * `0031_warehouse.sql:151` — `user_profiles_warehouse_scope` kısıtı `warehouse`/`courier` rolüne EN
 * AZ BİR depo şart koşuyor; yani kapsamsız bir depocu veritabanında **var olamaz**. Boş kapsamın tek
 * gerçek sahibi `admin`dir ve admin depo-ÜSTÜdür (kısıtın kendi yorumu: *"kapsamı hiç okunmaz"*).
 * Ona 403 demek yanlış cevaptır — kapı ona açık, eksik olan tek şey hangi depoda çalıştığıdır. Doğru
 * cevap 400: *"hangi depo olduğunu söyle."* Sıfır ile birden fazla aynı anahtarı paylaşıyor
 * (`warehouse_required`), çünkü istemcinin çaresi ikisinde de aynı: parametreyi gönder.
 *
 * ── ADMİNİN VERDİĞİ KİMLİK DOĞRULANIR, KAPSAMDAKİ DOĞRULANMAZ ───────────────
 * Kapsamdaki kimlikler zaten bir tetikleyiciyle sınanıyor (`assert_warehouse_ids_exist`, 0031) —
 * var olmayan bir depo profile YAZILAMAZ. Sorgudan gelen kimliğin böyle bir güvencesi yok ve
 * doğrulanmasaydı yanlış yazılmış tek bir uuid **boş bir hazırlık kuyruğu** döndürürdü: hata değil,
 * geçerli bir cevap — yani sessiz bir yalan. Tek satırlık pk okuması yalnız bu dalda koşar.
 */
const WarehouseQuerySchema = z.object({ warehouseId: UuidSchema.optional() });

/**
 * Depo bölümünün bağlamı — personel profili (rol kapısından) + çözülmüş depo kimliği.
 *
 * **İhraç edildi (21.119):** yerinde satış ucu (`sale.ts`) aynı depo çözümünü kullanıyor ama ROL
 * kümesi farklı — orada kurye de satar, burada satmaz. İkinci bir kopya yazmak, kapsam kuralının
 * (kimliği doğrula · kapsamı kontrol et · belirsizse 400) iki yerde yaşaması olurdu ve ayrıştığı
 * gün biri sessizce zayıflardı.
 */
export interface WarehouseEnv {
  Variables: StaffEnv['Variables'] & { warehouseId: string };
}

export async function warehouseGuard(c: Context<WarehouseEnv>, next: Next): Promise<Response | void> {
  const profile = c.get('staff');

  const query = WarehouseQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);
  const asked = query.data.warehouseId;

  if (asked && !profile.warehouseIds.includes(asked)) {
    if (!profile.roles.includes('admin')) return fail(c, 'warehouse_out_of_scope', 403);
    if (!(await new WarehouseService(serviceDb()).getById(asked))) return fail(c, 'warehouse_not_found', 404);
  }

  const warehouseId = asked ?? (profile.warehouseIds.length === 1 ? profile.warehouseIds[0] : undefined);
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
 * **Hazırlama kuyruğu** (D1). `confirmed` + `preparing` birlikte gelir: ikincisi yarım kalan iştir ve
 * ekranda kaybolmamalıdır.
 *
 * Gün SÜZGEÇTİR, varsayılan DEĞİL — ve bu kurye ucundan (`/day`) bilinçli olarak ayrılıyor. Orada
 * gün verilmezse BUGÜN kastedilir, çünkü kuryenin rotası güne aittir. Burada gün verilmezse süzgeç
 * hiç uygulanmaz ve o deponun bekleyen HER siparişi gelir: depo işi güne değil MALA aittir — dün
 * onaylanmış ama hâlâ toplanmamış sipariş, bugünün ekranından silinemez. Sözleşme bu ayrımı taşıyor
 * (`date: string | null`) ve cevapta gün ZORUNLU döner: istemci "hangi günü gösteriyorum" sorusunu
 * kendi kendine sormaz.
 *
 * **Bilinen sınır:** kapı 50 satırla tavanlı (kendi varsayılanı) ve bu uç tavanı açmıyor — imleç de
 * yok. Kuyruk sınırsız büyüyen bir küme değil (bekleyen sipariş sayısı fiziksel gerçekle sınırlı,
 * CLAUDE §1'in "doğal tavanı olan küme" dalı) ve v2'nin hub'ı sayı değil iş listesi gösteriyor.
 * Tavanı parametreleştirmenin tüketicisi çıkarsa `limit` sorgusu bir satırla açılır.
 */
const PreparationQuerySchema = z.object({ date: IsoDateSchema.optional() });

warehouse.get('/preparation', async (c) => {
  const query = PreparationQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const orders = await listPreparationQueue(serviceDb(), {
    warehouseId: c.get('warehouseId'),
    deliveryDate: query.data.date,
  });

  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü `PreparationOrder` sözleşmeye alan alan
  // uymak zorunda ve uymadığı gün burası DERLENMEZ (katalog/kurye uçlarındaki compile-lock deseni).
  const body: z.input<typeof PreparationQueueResponseSchema> = { date: query.data.date ?? null, orders };
  return ok(c, PreparationQueueResponseSchema.parse(body));
});

/**
 * **Hazırlık onayı** (D1). Seçilen partiler yazılır; tamamı toplandıysa sipariş `ready`'e geçer.
 *
 * Dört cevabın dördü de 200 ve bu ucun asıl işi onları BOZMADAN taşımaktır:
 * `ok` + `ready:false` yarım iştir (hata değil — depocu kaldığı yerden devam eder), `pinned_violation`
 * indirimli teklifin partisine dokunulduğunu söyler ve HİÇBİR yazım yapılmamıştır, `forbidden`
 * siparişin başka deponun olduğunu, `not_found` hiç olmadığını söyler.
 *
 * `shortfalls` motorun TAVSİYESİDİR, kararı değil: v2'nin cümlesi *"Eksik bildirildi — karar yönetim
 * ekranında"* (D1 → Y2). Bu uç kimsenin yerine karar vermez, tavsiyeyi taşır — ve tavsiyenin parasal
 * ölçütü motora GİRDİ olarak verildiği için cevapta tutar yoktur.
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
  });

  const body: z.input<typeof ConfirmPreparationResponseSchema> = outcome;
  return ok(c, ConfirmPreparationResponseSchema.parse(body));
});

// ── D1 · Kutu döngüsü (23.6) ────────────────────────────────────────────────

/**
 * **Deponun kargo kutuları** (07.12) — kutu açılırken sorulan tipin listesi.
 *
 * Yalnız AÇIK tipler ve yalnız BU deponun benimsedikleri: sistem şablonu doğrudan seçilemez
 * (kopyalanarak benimsenir — `ShippingBoxSchema` künyesi), kapatılmış tip de yeni kutuya
 * konamaz. Süzgeç sunucuda; istemciye "seçme" diye işaretli bir satır göndermek, ekranın
 * gösterebileceği ama kullanamayacağı bir seçenek üretirdi.
 *
 * Sayfalama YOK ve bu bilinçli (`CLAUDE §1`): küme operatörün elle kurduğu, doğal tavanı olan
 * bir katalog — veriyle büyümüyor.
 */
warehouse.get('/shipping-boxes', async (c) => {
  const boxes = await new ShippingBoxService(serviceDb()).listForWarehouse(c.get('warehouseId'), { onlyActive: true });
  const body: z.input<typeof ShippingBoxesResponseSchema> = { boxes };
  return ok(c, ShippingBoxesResponseSchema.parse(body));
});

/**
 * **Kutu açar** (karar §1.4). Gövdede TEK alan var (`shippingBoxId`) ve o da kutunun içeriği
 * değil FİZİKSEL KİMLİĞİDİR: gönderi ağırlığı ve ölçüsü ondan çıkıyor. Numarası sipariş içi
 * sıradan, kodu üreteçten gelir. `stale` cevabın kendisidir — sipariş artık toplanabilir değilse
 * ekran hangi durumda olduğunu söyler, sessiz 4xx'e indirgemez.
 *
 * **Gövdesiz istek hâlâ geçerli** (`shippingBoxId` varsayılanı `null`): rota kulvarında tip
 * sorulmuyor ve gövde zorunlu olsaydı o akış kırılırdı.
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
  });
  const body: z.input<typeof OpenBoxResponseSchema> = outcome;
  return ok(c, OpenBoxResponseSchema.parse(body));
});

/**
 * **Kutuyu kapatır** (23.6) — içerik + parti izi + mühür tek transaction (`seal_order_box`).
 * `picks` BU kutunun dağılımıdır; çok kutulu birleşimi kapı kurar (`sealBox` künyesindeki ⚠ —
 * ekran kümülatif göndermeye çalışmaz). Cevabın olumsuz dalları da 200: `already_sealed` çift
 * dokunuştur, `missing` "yeni kutu aç" davetidir, `shortfalls` yalnız `declareShort` beyanıyla
 * dolar ve karar yine yönetim ekranındadır.
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
  });

  const body: z.input<typeof SealBoxResponseSchema> = outcome;
  return ok(c, SealBoxResponseSchema.parse(body));
});

/**
 * **Etiket içeriği** (23.7 · karar §1.9) — içerik SUNUCUDAN: tek şablon, tek yerde test. Bugünkü
 * tüketici kapanış önizlemesi; Brother SDK bağlanınca aynı içerik basılır (dosya biçimi o gün —
 * Netleşecek 2). Tutar taşımaz (karar §1.5); `not_sealed` cevabın kendisidir.
 */
warehouse.get('/boxes/:boxId/label', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const outcome = await boxLabelPayload(serviceDb(), { boxId: boxId.data, warehouseId: c.get('warehouseId') });
  // Yazıcı yalnız BAŞARILI etikete iliştirilir: telefon "basabilir miyim" sorusunu tek cevaptan
  // okur (ayrı ayar ucu açılmaz — ayarın tüketicisi bu an). `null` = tanımsız, basım hiç denenmez.
  const body: z.input<typeof BoxLabelResponseSchema> =
    outcome.status === 'ok'
      ? { ...outcome, printer: await labelPrinterFor(serviceDb(), c.get('warehouseId')) }
      : outcome;
  return ok(c, BoxLabelResponseSchema.parse(body));
});

/**
 * **Etiketin BASILACAK görseli** (23.7) — 4×6 PNG, 300 dpi. Zarfsız BİNARY cevap: tüketicisi
 * `fetch`+dosya yazımı (telefon), JSON zarfına base64 gömmek yükü %33 şişirirdi. İçerik ve görsel
 * tek yerden (`boxLabelPayload` → `boxLabelSvg`) — telefon etiketi ÇİZMEZ, basar (karar §1.9).
 */
warehouse.get('/boxes/:boxId/label.png', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const outcome = await boxLabelPayload(serviceDb(), { boxId: boxId.data, warehouseId: c.get('warehouseId') });
  if (outcome.status !== 'ok') return fail(c, outcome.status === 'forbidden' ? 'out_of_scope' : outcome.status, outcome.status === 'not_found' ? 404 : 409);

  const png = renderLabelPng(boxLabelSvg(outcome.label));
  return c.body(new Uint8Array(png), 200, { 'content-type': 'image/png' });
});

// ── D1 · Sevk: teklif + duyuru (07.12) ──────────────────────────────────────

/**
 * **SEVK SEÇENEKLERİ** — depocunun servis seçtiği liste, GERÇEK kolilere göre fiyatlı.
 *
 * Salt okuma: sağlayıcıya teklif sorar, hiçbir şey yaratmaz, **para harcamaz**. Ön koşullar
 * duyurunun kullandığı kapıdan geçiyor (`resolveDispatch`), yani burada görünen liste satın alma
 * anında da geçerli — iki ayrı hesap olsaydı listedeki seçenek duyuruda reddedilebilirdi.
 *
 * Sağlayıcı yapılandırılmamışsa ağa HİÇ çıkılmaz; ekran "teklif alınamadı" der ve elle giriş
 * yedek şeridi (`setShipment`) açık kalır.
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
 * **GÖNDERİYİ DUYUR + ETİKETLERİ AL — GERÇEK PARA HARCAR.**
 *
 * Zincirin telefondaki halkası: kutu kapandı → burası etiketi satın alır → telefon PDF'i indirip
 * Brother'a basar. Sunucudan geçmesinin sebebi ağ değil para: satın alma tek yerde, tek kayıtla
 * ve tekrar denemesiz olmalı.
 *
 * **Yeniden deneme YOK** (sağlayıcıda idempotency anahtarı yok — ikinci çağrı ikinci koli açar).
 * Bu yüzden `already_announced` bir hata değil CEVAPTIR: ekran "zaten duyurulmuş" der ve
 * operatör etiketi yeniden basmayı seçer.
 *
 * Olumsuz dalların hepsi **200** ve ADLI: ölçüsüz mal tartıya, tipsiz kutu seçime, adressiz
 * sipariş yönetime gider — tek bir 4xx bunların üçünü aynı çıkmaza çevirirdi.
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
 * **DEVİR OKUTMASI** (07.12) — kutu taşıyıcıya verildi.
 *
 * Kurye yükleme ucundan (`courier`) ayrı ve olmak zorunda: orası `order.courierId` şartına bakıyor
 * ve kargo siparişinin kuryesi YOK. Sahiplik sorusu da farklı — orada "bu kutu senin rotanın mı",
 * burada "bu kutu senin deponun mu".
 *
 * Gövde tek alan (okutulan kod); hangi kolonda aranacağını SUNUCU biliyor. Olumsuz dalların hepsi
 * 200 ve adlı: `already_handed` ikinci okutmadır ve sayaç kıpırdamaz — hata cümlesi depocuyu kendi
 * sayımından şüphelendirirdi.
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
 * **TAŞIYICININ ETİKETİ** (07.12) — duyuruda satın alınan PDF'in imzalı adresi.
 *
 * Kutu etiketinden (`/label.png`) AYRI bir uç ve ayrı bir kâğıt: kargo kulvarında bizim QR'lı
 * etiketimiz basılmaz (tasarım §4.6 — iki barkod taşıyıcının tarayıcısını şaşırtır), taşıyıcının
 * A6 etiketi basılır.
 *
 * Dosya AKITILMIYOR, imzalı adres dönüyor: PDF özel kovada ve telefon onu doğrudan indiriyor.
 * Sunucudan geçirmek her basımda VPS'i aradaki boru yapardı.
 *
 * `not_announced` ile `no_label` AYRI: birincisi "henüz satın alınmadı" (çare: duyur), ikincisi
 * "satın alındı ama dosya saklanamadı" (çare: gönderiyi iptal edip yeniden duyur — ve o bir
 * OPERATÖR kararıdır, çünkü ikinci duyuru gerçek para).
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
 * **Basım damgası** (23.7) — telefon SDK'dan "bastı" cevabını alınca çağırır; damga başarının
 * kaydıdır (05.08 sayaç dersi: niyet sayılmaz). Yeniden basım damgayı günceller.
 */
warehouse.post('/boxes/:boxId/printed', async (c) => {
  const boxId = UuidSchema.safeParse(c.req.param('boxId'));
  if (!boxId.success) return fail(c, 'invalid_box_id', 400);

  const outcome = await markBoxPrinted(serviceDb(), { boxId: boxId.data, warehouseId: c.get('warehouseId') });
  const body: z.input<typeof MarkBoxPrintedResponseSchema> = outcome;
  return ok(c, MarkBoxPrintedResponseSchema.parse(body));
});

// ── D2 · Mal kabul ──────────────────────────────────────────────────────────

/**
 * **Bekleyen sevkiyatlar** (D2'nin KONUSUZ açılışı — 21.11d). Ekran hangi siparişi kabul edeceğini
 * bilmeden açılıyordu; bu uç o boşluğu kapatıyor: referans · tedarikçi · kaç kalem.
 *
 * Adres neden `/intake` (yani PO'lu formun bir üstü): liste, formun KAPSAYICISI — aynı kaynağın
 * çoğulu. Ayrı bir ad (`/purchase-orders`) aynı şeyin ikinci adı olurdu ve depo bölümünde tedarik
 * siparişi diye ayrı bir kaynak yok; depocunun gördüğü şey "bekleyen kabul"dür.
 *
 * Bu uçtan da PARA çıkmaz: kapı fiyatı okur ama dönen tipte taşımaz (`listPendingIntakes` künyesi).
 */
warehouse.get('/intake', async (c) => {
  const intakes = await listPendingIntakes(serviceDb());

  const body: z.input<typeof PendingIntakesResponseSchema> = { intakes };
  return ok(c, PendingIntakesResponseSchema.parse(body));
});

/**
 * **Plansız kabulün ürün araması** (23.13) — "elimde mal var, kayıtta hangisi?".
 *
 * Adres `/variants`, `/intake/variants` DEĞİL: aranan şey kabulün değil KATALOĞUN kaydı; kabul
 * yalnız bugünkü tek çağıran. Boş sorgu boş liste döner (400 değil): ekran her tuşta çağırıyor ve
 * "henüz yazmadın" bir hata değil, akışın normal hâli.
 *
 * PARA ÇIKMAZ: satır şeması fiyat taşımıyor (09.14 — depo yolu fiyat görmez).
 */
warehouse.get('/variants', async (c) => {
  const variants = await searchVariantsForIntake(serviceDb(), { query: c.req.query('q') ?? '' });

  const body: z.input<typeof VariantSearchResponseSchema> = { variants };
  return ok(c, VariantSearchResponseSchema.parse(body));
});

/**
 * **Tedarik siparişinden dolu form** (D2). Boş `rows` = plansız alım; form elle doldurulur.
 *
 * Depo süzgeci YOK ve olmamalı (kapının künyesi): satın alma depo-üstüdür (K6), mal hangi kapıdan
 * gireceğini kabul anında söyler. Formu depoya süzmek, aynı siparişin ikinci deposundaki kalemleri
 * gizlerdi. Bölümün depo kapısı yine de koşuyor — depo, D2'nin değil BÖLÜMÜN bağlamıdır (v2 başlığı
 * her depo ekranında sabit depoyu yazıyor) ve fail-closed bir çözüm, unutulabilir bir çözümden
 * iyidir.
 *
 * **Künye 21.11d'de eklendi** (`purchaseOrder`): ekran başlığa *"TS-26-0114 · Gaziantep Gıda"*
 * yazamıyordu — cevapta ne referans ne tedarikçi adı vardı ve depocunun elindeki kâğıtla ekranı
 * eşleştirmesinin tek yolu buydu. İki kapı tek turda okunuyor (`Promise.all`), çünkü ikisi de aynı
 * ekranın aynı anındaki ihtiyacı; sıralı çağrı gereksiz bir gidiş-dönüş eklerdi.
 *
 * `purchaseOrder: null` "sipariş YOK" demektir ve boş `rows` ile karıştırılmaz: biri olmayan
 * siparişi, öteki kalemsiz formu anlatır.
 */
warehouse.get('/intake/:purchaseOrderId', async (c) => {
  const purchaseOrderId = UuidSchema.safeParse(c.req.param('purchaseOrderId'));
  if (!purchaseOrderId.success) return fail(c, 'invalid_purchase_order_id', 400);

  const db = serviceDb();
  const [purchaseOrder, rows] = await Promise.all([
    readIntakeHeader(db, purchaseOrderId.data),
    openIntakeForm(db, purchaseOrderId.data),
  ]);

  const body: z.input<typeof IntakeFormResponseSchema> = { purchaseOrder, rows };
  return ok(c, IntakeFormResponseSchema.parse(body));
});

/**
 * Kabul gövdesi — sözleşmeden **DARALTILARAK** türer, ikinci kez yazılmaz.
 *
 * İki daraltma var, ikisi de taşıma kararı:
 *
 *   • `purchaseOrderId` ÇIKARILDI. Sipariş kimliğinin kaynağı YOLDUR (`/intake/:purchaseOrderId/…`)
 *     ve iki kaynak bir gün çelişirdi — gövdesinde başka bir PO taşıyan istek, yolun söylediğinden
 *     farklı bir siparişi kapatırdı. Ortak sözleşme alanı yerinde duruyor çünkü kapının çağıranı
 *     yalnız bu uç değil (web köprüsü PO'yu parametre olarak veriyor).
 *   • `date` biçime bağlandı: bozuk bir gün anahtarı RPC'de patlayıp çağırana 500 dönmemeli.
 *
 * **Maliyet alanı zaten YOK** ve bu şemanın değil KAPININ kararı: `receiveGoods` fiyat kabul etmez.
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
    ...parsed.data,
    // `reprice` BİLEREK geçirilmiyor: otomatik fiyat modülü fiyat şeridinin işi ve terfi etmedi
    // (`intake.ts` künyesi). Port kayıtsız olduğu için `repricedCount` **null** döner — sıfır DEĞİL,
    // çünkü ölçülemeyen değer sıfır değildir (CLAUDE §1) ve kapı süreç başına bir kez uyarı basar.
  });

  const body: z.input<typeof ReceiveGoodsResponseSchema> = outcome;
  return ok(c, ReceiveGoodsResponseSchema.parse(body));
}

/**
 * **Mal kabul — PO'lu** (D2). Satırlar partiye dönüşür, sipariş kapanır, maliyet PO'dan eşleşir.
 *
 * SKT zorunluluğu (v2: *"SKT her satırda zorunlu — girilmeden kabul kapanmaz"*) burada bir ekran
 * kuralı değil ŞEMA kuralıdır: `IntakeFormLineSchema.expiryDate` zorunlu alan, yani tarihsiz satır
 * gövde ayrıştırmasında 400 alır ve hiçbir yazım denenmez.
 *
 * Fark ve uyarı cevabın İÇİNDEDİR, engel değil: eksik/fazla gelen mal `differences`, raf ömrü kısa
 * parti `warnings` olarak döner — kabul yine yazılır (DOMAIN §4, parçalı kabul meşrudur).
 */
warehouse.post('/intake/:purchaseOrderId/receive', async (c) => {
  const purchaseOrderId = UuidSchema.safeParse(c.req.param('purchaseOrderId'));
  if (!purchaseOrderId.success) return fail(c, 'invalid_purchase_order_id', 400);

  return receiveIntake(c, purchaseOrderId.data);
});

/**
 * **Mal kabul — PLANSIZ** (D2'nin "+ plansız kabul" yolu). Siparişsiz gelen mal da kayda girer;
 * karşılaştırılacak bir beklenti olmadığı için fark raporu üretilmez (kapının kuralı).
 *
 * Ayrı bir uç, çünkü PO'lu kabulün kimliği YOLDA: "siparişsiz" hâli aynı yola boş bir kimlikle
 * girmek olurdu ve `/intake/null/receive` gibi bir adres, olmayan bir kaynağa POST etmektir.
 * Gövde ve davranış birebir aynı (`receiveIntake`) — iki uç, tek gövde.
 */
warehouse.post('/intake/receive', async (c) => receiveIntake(c, null));

// ── D4 · Sayım / düzeltme ───────────────────────────────────────────────────

/**
 * **İmha / sayım kaydı** (D4). Bütün satırlar tek transaction'da yazılır ve tek OLAY belgesini
 * paylaşır (`result.referenceNo` — kâğıt tutanakla eşleşen numara).
 *
 * Depocuya `return_restock` SUNULMAZ ve bu bir ekran disiplini değil, tipin kendisidir: gövde şeması
 * sebebi varlık enum'undan `.exclude(['return_restock'])` ile türetiyor, yani o sebebi taşıyan istek
 * gövde ayrıştırmasında 400 alır — ekran gönderse bile geçmez (v2: *"'İade stoğa döndü' depocuya
 * açılmaz — yönetim istisnasıdır"*).
 *
 * Adet İŞARETLİDİR (+ düşüm, − geri ekleme) ve geri eklemede sebep notunu VERİTABANI zorlar; burada
 * tekrarlanmaz — iki yerde duran bir kural, bir gün tek yerde değişir. Reddi `failed` olarak,
 * mesajıyla birlikte taşınır ("partide 3 var, 5 düşülemez"); operatöre aynen gösterilir.
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
 * **"Bana ne geliyor"** (D5) — bu depoya yolda olan transferler, satırlarıyla.
 *
 * Sayfalanmaz ve bu bilinçli: küme fiziksel gerçekle sınırlı (aynı anda yolda olan sevkiyat kadar).
 * Bir sevkiyatı kaçırmak, iki depoda da görünmeyen mal demektir — bu listenin TAM olması gerekir.
 */
warehouse.get('/transfers', async (c) => {
  const transfers = await listInboundTransfers(serviceDb(), { warehouseId: c.get('warehouseId') });

  const body: z.input<typeof InboundTransfersResponseSchema> = { transfers };
  return ok(c, InboundTransfersResponseSchema.parse(body));
});

/**
 * **Transfer kabulü** (D5) — rampada sayım. Hedefte tarih/lot/alış kopyalanmış YENİ parti doğar.
 *
 * `0` ile boş satır AYRI şeylerdir ve ayrım cevabın kendisinde durur (v2: *"0 = geldi ama kayıp; boş
 * = sayılmadı — boş satır kabulü bloklar"*). Sayılmamış satır varsa kapı `incomplete` döner ve hangi
 * satırların eksik/tanınmaz olduğunu SÖYLER — depocunun rampada arayacağı bilgi tam olarak budur.
 * Bir HTTP koduna indirgenseydi o liste kaybolurdu.
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
  });

  const body: z.input<typeof ReceiveTransferResponseSchema> = outcome;
  return ok(c, ReceiveTransferResponseSchema.parse(body));
});

// ── D6 · Kurye dönüşü kabulü ────────────────────────────────────────────────

/**
 * **"Rampama ne geri geldi"** (D6'nın okuma yarısı — 21.11d). Yalnız akıbeti BEKLEYEN kalemi olan
 * dönüşler; tamamı işaretlenmiş sipariş listeden düşer (depocunun işi bitmiştir).
 *
 * ── SORGUDA `courierDayCloseId` YOK, VE BU ÖLÇÜLMÜŞ BİR KARAR ───────────────
 * Kurye gün kapanışına bağlamak ilk akla gelendi ve elendi: siparişin kapanış kaydına FK'si YOK
 * (bağ "aynı kurye + aynı gün" üzerinden dolaylı kurulurdu) ve bir kuryenin günü deponun listesi
 * değildir — aynı rampaya iki kurye döner, biri günü hiç kapatmamış olabilir, kurye atanmadan dönen
 * sipariş de hiç görünmezdi. Anahtar bölümün kendi bağlamı: DEPO (`warehouseGuard`).
 *
 * Süzgeç de yok: dönüş güne değil MALA aittir (hazırlık kuyruğuyla aynı ayrım). Dün dönmüş ama
 * akıbeti işaretlenmemiş koli, bugünün ekranından silinemez.
 */
warehouse.get('/returns', async (c) => {
  const drops = await listWarehouseReturns(serviceDb(), { warehouseId: c.get('warehouseId') });

  const body: z.input<typeof WarehouseReturnQueueResponseSchema> = { drops };
  return ok(c, WarehouseReturnQueueResponseSchema.parse(body));
});

/**
 * **Kurye dönüşü kabulü** (D6). Dönen malın akıbeti işaretlenir; sipariş düzeltilir, iade borcu
 * türetilir.
 *
 * ── KAPI YENİ DEĞİL, KAPSAM YENİ ────────────────────────────────────────────
 * `adjustFulfillment` zaten vardı ve operasyon web ekranı da onu çağırıyor; oradaki guard
 * `requireAdmin` olduğu için depo sorusu hiç sorulmuyordu. Bu uç kapıyı DEPOCUYA açıyor ve açarken
 * kapsamı geçiriyor: `warehouseScope: [depo]`. Parametre olmasaydı depocu BÜTÜN siparişleri
 * düzeltebilirdi — depo değişmezinin (CLAUDE §1) sessiz ihlali. Kapsam dışı sipariş `forbidden` /
 * `out_of_scope` ile GÖRÜNÜR döner; yazım hiç yapılmaz.
 *
 * ── MİKTAR HEDEF DEĞERDİR, FARK DEĞİL ───────────────────────────────────────
 * v2'nin cümlesi birebir: *"Miktar hedef değer olarak girilir; fark sistemde hesaplanır."* Şema bunu
 * taşıyor (`fulfilledQty` = kalan adet) ve bu uç ondan bir çıkarma yapmaz — yapsaydı aynı hesap iki
 * yerde olurdu ve ikisi bir gün ayrışırdı.
 *
 * ── ÜÇ AKIBET, ÜÇ FARKLI GERÇEK ─────────────────────────────────────────────
 * `restock` malı stoğa geri koyar (**sebep notu zorunlu** — soğuk zincir beyanı; kuralı veri zorlar),
 * `discard` fiiliden düşer, `goodwill` ise mala DOKUNMAZ (müşteride kaldı) ve yalnız kayıt düşer.
 * Üçü de aynı kalem listesinde, satır satır gelebilir — bir kolinin yarısı iade, yarısı jest olabilir.
 *
 * `effects` geçirilmiyor (dosya künyesindeki yan etki sınırı): iade borcu yazılamazsa cevabın
 * `refundBlocked` alanı sebebini söyler, sessizce sıfır dönülmez.
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

// ── Tarama · kod çözümü + öğrenen eşleme (Modül 23) ─────────────────────────

/**
 * **Okutulan kodun çözümü** — TEK tarama sözleşmesi: mal kabul, toplama, transfer ve tezgâh aynı
 * ucu çağırır, ekran kaynağın ne olduğunu bilmez (etüt 2.3). Kimlik bulur, stok/depo kararı
 * VERMEZ (CLAUDE §1 depo değişmezi) — bu uca stok okuması eklenmez.
 *
 * `unknown` bir hata değil ÖĞRENME davetidir (karar §1.3): ekran "bu kod hangi ürün?" diye sorar
 * ve cevabı aşağıdaki uca yazar. POST çünkü kod gövdede gider — URL'e konsaydı erişim loglarında
 * dolaşırdı ve `/` içeren bir kod yolu bölerdi.
 */
warehouse.post('/codes/resolve', async (c) => {
  const parsed = ResolveCodeRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await resolveScannedCode(serviceDb(), parsed.data);
  const body: z.input<typeof ResolveCodeResponseSchema> = outcome;
  return ok(c, ResolveCodeResponseSchema.parse(body));
});

/**
 * **Öğrenen eşleme** — tanınmayan kod bir varyanta bağlanır; ikinci gelişte tanınır. Öğreten kişi
 * kayda geçer (`staff.id` — iz, suçlama değil). Kod zaten bağlıysa `already_bound` cevabın
 * kendisidir: ekran kime bağlı olduğunu söyler, düzeltme web varyant editöründen.
 */
warehouse.post('/codes', async (c) => {
  const parsed = LearnCodeRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await learnCode(serviceDb(), { ...parsed.data, actorId: c.get('staff').id });
  const body: z.input<typeof LearnCodeResponseSchema> = outcome;
  return ok(c, LearnCodeResponseSchema.parse(body));
});
