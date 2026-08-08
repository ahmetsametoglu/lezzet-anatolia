import { Hono } from 'hono';
import { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import {
  closeCourierDay,
  confirmDoorDelivery,
  listCourierDay,
  markUndelivered,
  openDayClose,
  readDoorCashAccountId,
  requestDeliveryProofUploadUrl,
  startCourierDay,
} from '@lezzet/application';
import {
  CloseCourierDayRequestSchema,
  ConfirmDoorDeliveryRequestSchema,
  ConfirmDoorDeliveryResponseSchema,
  CourierDayCloseResultSchema,
  CourierDayResponseSchema,
  DayCloseDraftSchema,
  DeliveryProofUploadRequestSchema,
  DeliveryProofUploadResponseSchema,
  MarkUndeliveredRequestSchema,
  MarkUndeliveredResponseSchema,
  StartCourierDayRequestSchema,
  StartCourierDayResponseSchema,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { IsoDateSchema, readJsonBody, UuidSchema } from '../../lib/request';
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * Kurye uçları (21.10) — mobil "Yol" bölümünün taşıma katmanı (K1 · K3–K5 · K7).
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Katalog ucuyla (`catalog.ts`) aynı çizgi: parse → kapı → zarf. Teslim sırası (kanıt → mal →
 * teslim → para), kanıt zorunluluğu, nakit yasal sınırı, ulaşılamadı/red akıbeti, beklenen tahsilat
 * ve mutabakat farkı — hiçbiri burada YOK. Hepsi `@lezzet/application`ın kurye kapılarında
 * (`courier/{day,delivery,day-close,proof}`), yani operasyon web ekranlarının okuduğu kararların TAM
 * AYNISI. İki yüzey arasında ayrışabilecek tek yer taşımadır ve taşıma da bu dosyanın tamamıdır.
 *
 * ── HTTP DURUMU İLE KAPI KARARI AYRI SORULARDIR ──────────────────────────────
 * Durum kodu **"isteğin kapıya ulaştı mı"** sorusunu yanıtlar (401 kimliksiz · 403 rolsüz · 400
 * biçimsiz gövde). Kapının VERDİĞİ karar ne olursa olsun **200**'dür ve gövdedeki sözleşme
 * birleşiminde durur: `stale`, `proof_required`, `forbidden`, `not_found`, `already_closed`,
 * `collectionDeduped`.
 *
 * Gerekçe doc 04'ün omurgasında yazılı: *"bayat geçiş reddi GÖRÜNÜR olmalı — app bu reddi YUTMAZ,
 * ekrana taşır"*. Bir HTTP koduna indirgenen ret, taşıdığı bilgiyi kaybeder: `stale` yalnız
 * "olmadı" demez, siparişin ŞU AN hangi durumda olduğunu da söyler ve kurye "teslim ettim" sanırken
 * sistemin `cancelled` dediğini ancak o alan sayesinde görür. Aynısı `proof_required` (hangi kanal)
 * ve `forbidden` (hangi sebep) için de geçerli. Sözleşme şemaları bu yüzden ayrımlı birleşim
 * (`discriminatedUnion`) — ret dalları da cevabın kendisidir, hata gövdesi değil.
 *
 * ── YAN ETKİ SINIRI: BU UÇTAN MAİL/PUAN ÇIKMAZ (defter 08.08) ────────────────
 * `confirmDoorDelivery` müşteri haberini ve sadakat puanını PORT üzerinden alıyor
 * (`application/order/effects.ts`) ve o portların uygulamaları (`@lezzet/notify` + bildirim verisi,
 * `rewardCompletedOrder`) henüz terfi etmedi — terfileri defterde ayrı pozisyon. Uçlar bu sınırla
 * AÇILIYOR: kapıda teslim yazılır, stok düşer, para defterine hareket girer; **müşteriye teslim
 * maili gitmez ve sipariş puanı yazılmaz.** Sessiz değil: port takılmadığı için kapı süreç başına
 * bir kez `logger.warn` basıyor. Port terfi ettiği gün burada değişecek tek şey `confirmDoorDelivery`
 * çağrısına bir `effects` nesnesi eklenmesidir.
 *
 * ── LOG: KİMLİK EVET, İÇERİK HAYIR (CLAUDE §1) ──────────────────────────────
 * Bu dosya ayrıca kayıt düşmez; `app.ts`in istek satırı yolu ve durumu zaten yazıyor ve yolda yalnız
 * `orderId` var — o bir kimliktir. Gövde HİÇBİR ZAMAN loglanmaz: kuryenin kapıda yazdığı not
 * ("zil bozuk", "kabul etmedi") serbest metindir ve müşteri hakkında bilgi taşıyabilir; gideceği tek
 * yer `order_status_log.note` sütunudur.
 */

/**
 * **Kurye kimliği JETONDAN gelir, gövdeden ASLA.**
 *
 * Sözleşmelerin hiçbirinde `courierId` yok ve bu bilinçliydi (`courier-api.schema.ts` künyesi):
 * gövdeye konsaydı kurye başkasının kimliğini yazıp onun durağını kapatabilirdi. Kapılar `courierId`
 * ZORUNLU parametre alıyor ("yalnız kendi teslimatları" imzada durur) ve o değeri buraya koyan tek
 * yer rol kapısıdır (`requireStaffRole` — 21.11'de `auth.ts`e taşındı; hangi kimlik, neden profil ve
 * `admin`in neden ek kapı açmadığı orada yazılı).
 */
const DateQuerySchema = z.object({ date: IsoDateSchema.optional() });

export const courier = new Hono<StaffEnv>();

courier.use('*', requireStaffRole('courier', 'admin'));

/**
 * **Günün rotası** (K1). Gün verilmezse bugün.
 *
 * **Varsayılan gün BURADA çözülür ve kapıya AÇIKÇA geçirilir** — kapının kendi varsayılanına
 * bırakılıp cevabın `date` alanı ayrıca hesaplanamaz: iki hesap arasında gece yarısı geçilirse
 * ekran DÜNÜN duraklarını BUGÜNÜN tarihiyle gösterirdi. Tek yerde çözülen varsayılan bu çelişkiyi
 * yapısal olarak imkânsız kılıyor. (Kapının varsayılanı yerinde duruyor; bu yol onu hiç kullanmıyor.)
 *
 * Cevapta gün ZORUNLU: istemci "hangi günü gösteriyorum" sorusunu kendi kendine sormaz.
 *
 * Mesaj dili sorulmuyor: "yoldayım" bağlantısı MÜŞTERİNİN dilindedir, kuryenin değil, ve gün
 * sorgusunda müşteri başına dil bilgisi yok — kapı bu yüzden `fr`e düşüyor ve operasyon web ekranı
 * da tam olarak aynısını yapıyor (`deliveries/page.tsx`). Uca bir `locale` parametresi koymak,
 * kuryenin cihaz dilini müşterinin diliymiş gibi göstermek olurdu.
 */
courier.get('/day', async (c) => {
  const query = DateQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const db = serviceDb();
  const date = query.data.date ?? new Date().toISOString().slice(0, 10);
  // Kapı kasası hesabı gün başına TEKİL ve duraklardan bağımsız — iki okuma paralel gidiyor, biri
  // ötekini beklemiyor. Ayarın anahtarı ve kullanılamaz değerin akıbeti (null → tahsilat kapısı
  // kapalı) KAPIDA yaşıyor; burada yalnız cevaba konuyor.
  const [stops, doorAccountId] = await Promise.all([
    listCourierDay(db, { courierId: c.get('staff').id, date }),
    readDoorCashAccountId(db),
  ]);

  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü `CourierStop` sözleşmeye alan alan uymak
  // zorunda ve uymadığı gün burası DERLENMEZ (katalogdaki compile-lock deseni).
  const body: z.input<typeof CourierDayResponseSchema> = { date, stops, doorAccountId };
  return ok(c, CourierDayResponseSchema.parse(body));
});

/**
 * **"Yola çıktım" — günü başlat** (K1). Günün HAZIR siparişlerini yola çıkarır.
 *
 * ── NEDEN GÜN BAŞINA, WEB'DE SİPARİŞ BAŞINAYKEN ─────────────────────────────
 * Web emsali durak başına çalışıyor (`deliveries/[orderId]/actions.ts` → `startDeliveryAction`).
 * Mobil v2 aynı işareti gün başına soruyor ve bu ekranın kaprisi değil: K1'in birincil düğmesi
 * *"Yola çıktım — günü başlat"* ve o düğmeye basılmadan hiçbir durak açılmıyor (kapı sırası —
 * teslim, ulaşılamadı ve red YALNIZ yoldaki siparişten yazılabilir). Kurye araca tek durak değil,
 * günün kolilerini yükler.
 *
 * ── KISMİ BAŞARI GÖVDEDE, DURUM KODUNDA DEĞİL ───────────────────────────────
 * Dört liste dönüyor (`started` · `alreadyOut` · `stale` · `skipped`) ve hepsi **200**'dür: bu ucun
 * "yarısı oldu" hâli normaldir, arıza değil. Tek bir `ok`a indirilseydi kurye hazırlanmayı bekleyen
 * durağı ancak teslim yazmayı deneyip başarısız olunca öğrenirdi. `alreadyOut` da bir hata değil —
 * düğmeye ikinci kez basmak zararsızdır ve cevabı "yeni bir şey yok"tur.
 *
 * Gün alanı sözleşmede serbest dize; burada `.extend` ile biçime bağlanıyor (`IsoDateSchema` ile
 * aynı gerekçe). Gövde hiç gelmezse BUGÜN kastedilmiştir: düğme günü söylemek zorunda değil.
 */
const StartDayBodySchema = StartCourierDayRequestSchema.extend({ date: IsoDateSchema.optional() });

courier.post('/day/start', async (c) => {
  const parsed = StartDayBodySchema.safeParse((await readJsonBody(c)) ?? {});
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await startCourierDay(serviceDb(), { courierId: c.get('staff').id, date: parsed.data.date });

  const body: z.input<typeof StartCourierDayResponseSchema> = result;
  return ok(c, StartCourierDayResponseSchema.parse(body));
});

/**
 * **Kapıda teslim** (K3 + K4) — kanıt, eksik kalem ve tahsilat TEK istekte.
 *
 * İstemci sırayı kurmaz ve kuramaz: sıra (kanıt kapısı → mal → teslim → para) kapının içindedir ve
 * kuralın kendisidir. Üç ayrı uca bölünseydi ağın koptuğu her an yarısı yazılmış bir teslimat
 * bırakırdı — malı düşmüş ama teslim görünmeyen, ya da teslim olmuş ama parası yazılmamış sipariş.
 *
 * `idempotencyKey` gövdededir (`collection` içinde) ve İSTEMCİDE üretilir: çevrimdışı kuyruk aynı
 * isteği tekrar gönderdiğinde aynı anahtarla gelir ve para iki kez yazılmaz. Sunucu tarafındaki
 * sınırı (oku-sonra-yaz; atomik değil) `application/order/payment.ts` künyesinde yazılı.
 */
courier.post('/stops/:orderId/deliver', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = ConfirmDoorDeliveryRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await confirmDoorDelivery(serviceDb(), {
    orderId: orderId.data,
    courierId: c.get('staff').id,
    ...parsed.data,
    // `effects` BİLEREK geçirilmiyor — dosya künyesindeki yan etki sınırı.
  });

  const body: z.input<typeof ConfirmDoorDeliveryResponseSchema> = outcome;
  return ok(c, ConfirmDoorDeliveryResponseSchema.parse(body));
});

/**
 * **Ulaşılamadı / reddedildi** (K5). İki ayrı işaret, iki ayrı akıbet: `unreachable` malı araçta
 * bırakır (`ready`), `refused` depoya döndürür (`returned`).
 *
 * ── NOT BU UÇTA ZORUNLU, SÖZLEŞMEDE DEĞİL ───────────────────────────────────
 * Ortak sözleşme notu `nullish` bırakıyor çünkü kapının İKİ çağıranı var ve operasyon web ekranı
 * notsuz da işaretleyebiliyor. Mobil kapının kuralı v2 tasarımının onay ekranından geliyor: kurye
 * sonucu seçtikten sonra notsuz devam EDEMİYOR. Gövde şeması bu yüzden ikinci kez yazılmadı,
 * sözleşmeden `.extend` ile DARALTILDI — alan adı ya da sonuç kümesi yarın değişirse burası da
 * onunla değişir.
 *
 * Notun gideceği yer `order_status_log.note`: kuryenin kapıda girdiği tek serbest bilgi geçişle
 * ATOMİK yazılır. Loglanmaz (dosya künyesi).
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
 * **Kanıt yükleme izni** (K3). Dosya sunucudan GEÇMEZ: cihaz doğrudan kovaya yükler, sunucu yalnız
 * yetkiyi doğrulayıp kısa ömürlü bir izin yazar ve anahtarı KENDİ seçer.
 *
 * ── YOL DURAĞA BAĞLI, GÖVDE SÖZLEŞMENİN AYNISI ──────────────────────────────
 * Talep edilen adres `/courier/proof-upload` idi; uç `/courier/stops/:orderId/proof-upload` olarak
 * açıldı ve sebebi ölçülebilir: kapı `orderId` ZORUNLU istiyor (yetki sorusu "bu sipariş senin mi"
 * onun üstünden soruluyor) ama sözleşmenin istek şemasında `orderId` YOK — yalnız `filename` ve
 * `alreadyRequested` var. Kimliği gövdeye eklemek sözleşmenin ikinci bir sürümünü yazmak, sorgu
 * dizesine koymak ise bir kaynağı POST'ta parametreye gömmek olurdu. Yola alınınca gövde sözleşmeyle
 * BİREBİR kalıyor ve adres kardeş uçlarla aynı kalıba oturuyor (`/stops/:orderId/…`).
 *
 * ── TAVANI ÇAĞIRAN TAŞIR (bilinen sınır, 21.10a raporu) ─────────────────────
 * `alreadyRequested` istemciden gelir; sunucu bu teslimat için daha önce KAÇ izin verdiğini
 * saymıyor (sayacak bir kayıt yok — izinler hiçbir yere yazılmıyor). Yani 0 gönderen bir istemci
 * tavanı (5) hiç görmez. Sınır bilinçli kabul edildi: tavan kötü niyete karşı bir kilit değil,
 * kazara yığılmaya karşı bir frendir ve gerçek kilit imzalı adresin kısa ömrü ile kapının yetki
 * sorusudur — başkasının siparişine izin ÜRETİLEMEZ. Gerçek sayaç, izinlerin kayda geçmesini ister
 * (şema işi; bu görevin alanı dışında, rapora yazıldı).
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
 * **Gün kapanışı taslağı** (K7) — günün resmi + beklenen tahsilat, yöntem başına.
 *
 * Gün burada kapının kendi varsayılanına bırakılıyor (`/day`in tersine) ve çelişki YOK: taslak
 * `date`i kendisi döndürüyor, yani cevaptaki gün ile sorgulanan gün TEK hesaptan çıkıyor.
 *
 * `closed` doluysa gün zaten kapanmıştır ve ekran salt-okunur gösterir — ikinci kapanış istemcinin
 * engellemesine bırakılmıyor, kapı da reddediyor (`already_closed`).
 */
courier.get('/day-close', async (c) => {
  const query = DateQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const draft = await openDayClose(serviceDb(), { courierId: c.get('staff').id, date: query.data.date });

  const body: z.input<typeof DayCloseDraftSchema> = draft;
  return ok(c, DayCloseDraftSchema.parse(body));
});

/**
 * **Günü kapat** (K7). Kapanış bir MUTABAKATTIR, para hareketi değil: para kapıda tahsil edilirken
 * yazıldı. Fark (sayılan − beklenen) kapıda türetilir, burada hesaplanmaz.
 *
 * Sonuçlanmamış durak varken de kapatılabilir — dönen `pendingCount` uyarı içindir, engel değil.
 * `ok:false` + `already_closed` bir hata DEĞİL, bir gerçektir ve 200 ile döner: kapanmış gün
 * salt-okunurdur, ikinci çağrı ezmez.
 *
 * Gün alanı sözleşmede serbest dize; burada `.extend` ile biçime bağlanıyor — aynı gerekçe
 * (`IsoDateSchema`): bozuk bir gün anahtarı RPC'de patlayıp çağırana 500 olarak dönmemeli.
 */
const CloseDayBodySchema = CloseCourierDayRequestSchema.extend({ date: IsoDateSchema });

courier.post('/day-close', async (c) => {
  const parsed = CloseDayBodySchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await closeCourierDay(serviceDb(), { courierId: c.get('staff').id, ...parsed.data });

  const body: z.input<typeof CourierDayCloseResultSchema> = result;
  return ok(c, CourierDayCloseResultSchema.parse(body));
});
