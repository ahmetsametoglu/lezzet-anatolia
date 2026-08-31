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
  listVanCandidates,
  readVanStock,
  returnFromVan,
  takeToVan,
  vehicleWarehouseOf,
  loadBox,
  markUndelivered,
  openDayClose,
  readCourierRuns,
  readDoorCashAccountId,
  requestDeliveryProofUploadUrl,
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
  CourierVanStockMoveRequestSchema,
  CourierVanStockMoveResponseSchema,
  CourierVanStockResponseSchema,
  DepartCourierRunResponseSchema,
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
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * Kurye uçları (21.10) — mobil "Yol" bölümünün taşıma katmanı (K1 · K3–K5 · K7).
 *
 * ── SEFER EKSENİ (18.08 · `docs/feature/sefer.md`) ───────────────────────────
 * K1 artık "günü başlat" değil **"seferi başlat"**: kurye atama beklemez, ROTAYI seçer
 * (`GET /courier/routes`) ve o rotanın seferini açar (`POST /courier/day/start`). Kapanış da gün
 * değil SEFER kapatır (`runId` zorunlu) — "fark hangi seferde doğdu" sorusunun cevaplanabilmesi
 * kullanıcı kararıydı (K1, 18.08). Uç adresleri DEĞİŞMEDİ (`/day`, `/day/start`, `/day-close`):
 * istemcinin okuduğu yol aynı kaldı, öznesi netleşti — yol adını da çevirmek, aynı geçişi iki kez
 * yapmak olurdu (sözleşme geçişi eklemeli tutuldu: eski istemci Zod'un bilinmeyen alanı soymasıyla
 * kırılmaz).
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Katalog ucuyla (`catalog.ts`) aynı çizgi: parse → kapı → zarf. Teslim sırası (kanıt → mal →
 * teslim → para), kanıt zorunluluğu, nakit yasal sınırı, ulaşılamadı/red akıbeti, rota çözümü
 * (tek rotada otomatik seçim), sefer sahipliği, beklenen tahsilat ve mutabakat farkı — hiçbiri
 * burada YOK. Hepsi `@lezzet/application`ın kurye kapılarında (`courier/{day,routes,delivery,
 * day-close,proof}`), yani operasyon web ekranlarının okuduğu kararların TAM AYNISI. İki yüzey
 * arasında ayrışabilecek tek yer taşımadır ve taşıma da bu dosyanın tamamıdır.
 *
 * ── HTTP DURUMU İLE KAPI KARARI AYRI SORULARDIR ──────────────────────────────
 * Durum kodu **"isteğin kapıya ulaştı mı"** sorusunu yanıtlar (401 kimliksiz · 403 rolsüz · 400
 * biçimsiz gövde). Kapının VERDİĞİ karar ne olursa olsun **200**'dür ve gövdedeki sözleşme
 * birleşiminde durur: `stale`, `proof_required`, `forbidden`, `not_found`, `already_closed`,
 * `already_started`, `route_required`, `no_route`, `collectionDeduped`.
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
 * **Günün durakları + seferin künyesi** (K1). Gün verilmezse bugün. ("Rota" artık `delivery_zone`ın
 * adı — bu uç bir günü, o günün duraklarını ve varsa sürülen seferi taşır.)
 *
 * **Varsayılan gün BURADA çözülür ve kapıya AÇIKÇA geçirilir** — kapının kendi varsayılanına
 * bırakılıp cevabın `date` alanı ayrıca hesaplanamaz: iki hesap arasında gece yarısı geçilirse
 * ekran DÜNÜN duraklarını BUGÜNÜN tarihiyle gösterirdi. Tek yerde çözülen varsayılan bu çelişkiyi
 * yapısal olarak imkânsız kılıyor. (Kapının varsayılanı yerinde duruyor; bu yol onu hiç kullanmıyor.)
 *
 * Cevapta gün ZORUNLU: istemci "hangi günü gösteriyorum" sorusunu kendi kendine sormaz.
 *
 * ── `run` = "BAŞLADI" BAYRAĞININ SUNUCU HÂLİ (18.08) ────────────────────────
 * Ekranın "sefer başladı mı" sorusu artık yerel bir tahmin değil, bu alanın kendisi: uygulama
 * yeniden başlasa da açık sefer sunucudan gelir. `null` = kurye o gün henüz rota almadı → ekran
 * seçime (`/courier/routes`) gider. Okuma duraklardan BAĞIMSIZ, o yüzden aynı paralel demete
 * katılıyor; hangi seferin öncelikli olduğu (kapanmamış olan) KAPIDA çözülüyor — üç okuma da
 * birbirini beklemiyor.
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
  const courierId = c.get('staff').id;
  const date = query.data.date ?? new Date().toISOString().slice(0, 10);
  // Kapı kasası hesabı gün başına TEKİL ve duraklardan bağımsız; sefer künyesi de öyle — üç okuma
  // paralel gidiyor, hiçbiri ötekini beklemiyor. Ayarın anahtarı ve kullanılamaz değerin akıbeti
  // (null → tahsilat kapısı kapalı) KAPIDA yaşıyor; burada yalnız cevaba konuyor.
  /*
    ARAÇ BİR ARA DEPO (31.08) — gün cevabı artık GÜNE değil ARACA bakıyor.

    Önce araçtaki seferler okunuyor (kurulmuş + kapanmamış olanların hepsi; yarınınki de araçta
    olabilir), duraklar da o KÜMEDEN geliyor. Eskiden `listCourierDay` yalnız `date` süzgeciyle
    çağrılıyordu ve iki sefer sürüldüğünde ikisinin durakları KARIŞIK tek listede dönüyordu —
    hangi durağın hangi rotaya ait olduğu söylenemiyordu bile (durakta `runId` yoktu).

    `run` = SÜRÜLEN sefer: yola çıkmış (`departedAt` dolu) ve kapanmamış olan. Kurulmuş ama
    başlamamış sefer araçta bekler ve bu alana düşmez — özet kartı yalnız sürülenin sayımıdır
    (v3:14: *"Bu sayım yalnız sürülen sefere aittir"*).
  */
  const runs = await readCourierRuns(db, { courierId });
  const run = runs.find((candidate) => candidate.departedAt !== null) ?? null;
  const [stops, doorAccountId] = await Promise.all([
    listCourierDay(db, { courierId, date, runIds: runs.map((candidate) => candidate.runId) }),
    readDoorCashAccountId(db),
  ]);

  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü `CourierStop` sözleşmeye alan alan uymak
  // zorunda ve uymadığı gün burası DERLENMEZ (katalogdaki compile-lock deseni).
  const body: z.input<typeof CourierDayResponseSchema> = { date, run, runs, stops, doorAccountId };
  return ok(c, CourierDayResponseSchema.parse(body));
});

/**
 * **Kuryenin rota seçimi** (K1 · 18.08) — o gün koşan aktif rotalar, yükleri ve varsa açık seferin
 * künyesi. Gün verilmezse bugün, `/day`in AYNI gerekçesiyle burada çözülür (kapı `date`i zorunlu
 * istiyor ve cevaptaki gün ile sorgulanan gün tek hesaptan çıkmalı).
 *
 * ── KURYEYE SÜZÜLMEZ, DEPOYA SÜZÜLÜR (11.7 · kullanıcı kuralı 21.08) ────────
 * İki ayrı eksen: *"arayüzden kurye ataması saçma — kurye giriş yapar, ROTAYI seçer"* kararı
 * sürüyor (kurye eksenine daraltma yok; sahiplik seferi BAŞLATANIN claim'iyle doğar, başka kuryede
 * açılmış rota `run.courierId` ile görünür kalır). DEPO ekseni ise artık süzüyor: *"kurye hangi
 * depoya aitse o depoya ait rotaları görebilmeli ve alabilmeli"* — başka deponun rotası listeye
 * hiç girmez; kapsam profilden çözülür (`warehouseScope`, admin-kurye depo-üstü kalır — auth
 * künyesindeki "admin ek kapı açmaz" kuralının kapsam istisnası).
 *
 * Küme doğal tavanlıdır (operatör elle kurar) → tek turda çekilir, sayfalama yok (CLAUDE §1).
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

/**
 * **Kuryenin seçebileceği araçlar** (31.08 · v3:16) — kendi deposuna künyeli, aktif olanlar.
 * Kapsam rota listesiyle AYNI kapıdan çözülüyor: başka deponun rotasını göremeyen kurye başka
 * deponun aracını da görmemeli. Gün parametresi YOK — filo güne göre değişmiyor.
 */
courier.get('/vehicles', async (c) => {
  const staff = c.get('staff');
  const vehicles = await listCourierVehicles(serviceDb(), { scope: warehouseScope(staff.roles, staff.warehouseIds) });

  const body: z.input<typeof CourierVehiclesResponseSchema> = { vehicles };
  return ok(c, CourierVehiclesResponseSchema.parse(body));
});

/**
 * **"Seferi başlat"** (K1 · 18.08 — eski "yola çıktım — günü başlat"ın halefi). Seçilen rotanın
 * seferini açar ve o seferin HAZIR siparişlerini yola çıkarır.
 *
 * ── NEDEN SEFER BAŞINA, WEB'DE SİPARİŞ BAŞINAYKEN ───────────────────────────
 * Web emsali durak başına çalışıyor (`deliveries/[orderId]/actions.ts` → `startDeliveryAction`).
 * Mobil aynı işareti SEFER başına soruyor ve bu ekranın kaprisi değil: K1'in birincil düğmesi
 * *"Seferi başlat"* ve o düğmeye basılmadan hiçbir durak açılmıyor (kapı sırası — teslim,
 * ulaşılamadı ve red YALNIZ yoldaki siparişten yazılabilir). Kurye araca tek durak değil, seferin
 * kolilerini yükler.
 *
 * ── ROTA VE ARAÇ OPSİYONEL: KARARI KAPI VERİR ───────────────────────────────
 * `zoneId` gelmezse kapı o gün koşan rotalara bakar — tek rota varsa onu seçer ("tek adayda soru
 * sorulmaz"), birden çoksa `route_required` döner ve ekran `/courier/routes`tan seçtirir, hiç yoksa
 * `no_route`. Uç bu hesabı YAPMAZ: rota kümesini burada süzmek, ekranın gördüğü liste ile kapının
 * seçtiği rotanın ayrışabileceği ikinci bir yer açmaktı. `vehicleId` de opsiyonel — araç kaydı
 * girilmemiş kurulumda kurye kilitlenmez (zorunluluk `Setting`, kapının işi).
 *
 * ── KISMİ BAŞARI VE RET GÖVDEDE, DURUM KODUNDA DEĞİL ───────────────────────
 * Mutlu dalda dört liste dönüyor (`started` · `alreadyOut` · `stale` · `skipped`): bu ucun "yarısı
 * oldu" hâli normaldir, arıza değil. Tek bir `ok`a indirilseydi kurye hazırlanmayı bekleyen durağı
 * ancak teslim yazmayı deneyip başarısız olunca öğrenirdi. `alreadyOut` da bir hata değil — düğmeye
 * ikinci kez basmak zararsızdır ve cevabı "yeni bir şey yok"tur. Aynısı ret dalları için: rota+gün
 * başına tek sefer kuralı (K3) `already_started` diye görünür ve `mine` ile "senin seferin" mi
 * "başkasında" mı olduğunu söyler — hepsi **200**, çünkü hepsi kapının CEVABIdır, hata değil.
 *
 * Gün alanı sözleşmede serbest dize; burada `.extend` ile biçime bağlanıyor (`IsoDateSchema` ile
 * aynı gerekçe). Gövde hiç gelmezse BUGÜN kastedilmiştir: düğme günü söylemek zorunda değil.
 */
const StartDayBodySchema = StartCourierDayRequestSchema.extend({ date: IsoDateSchema.optional() });

courier.post('/day/start', async (c) => {
  const parsed = StartDayBodySchema.safeParse((await readJsonBody(c)) ?? {});
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await startCourierDay(serviceDb(), {
    courierId: c.get('staff').id,
    date: parsed.data.date,
    zoneId: parsed.data.zoneId,
    vehicleId: parsed.data.vehicleId,
    // `depart:false` = seferi KUR, yola çıkarma (31.08). Ekran önce kurar, yükler, sonra başlatır.
    depart: parsed.data.depart,
  });

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
/**
 * **Araca yükleme okutması** (23.8 · karar §1.11). Kod gövdede gider (URL'de dolaşmasın —
 * `codes/resolve` gerekçesi). Olumsuz dalların hepsi 200 + gövde: `wrong_route` kutunun HANGİ
 * siparişin malı olduğunu söyler (kurye rampada doğru yığını bulur), `not_sealed` açık kutuyu,
 * `not_loadable` siparişin durumunu. **Durum geçişi burada YAZILMAZ** (31.08): yükleme malı araca
 * geçirir, siparişi yola çıkarmaz — o iş sefer başlatmanındır. `allBoxesLoaded` yalnız "siparişin
 * tamamı araçta" der.
 */
/**
 * **Araçtaki serbest ürün** (31.08 · v3:19) — araçta ne var + depodan ne alınabilir, TEK okumada.
 *
 * İki liste ayrı uçlara bölünmedi: ekran ikisini yan yana çiziyor ve biri olmadan öteki bir karar
 * kurmuyor ("üç tane var, dört daha alabilirim"). Ayrı uçlar iki ağ turu ve iki yükleme hâli
 * demekti; rampada bekleyen kurye için o iki hâl tek bir gecikmedir.
 *
 * ÇIKIŞ DEPOSU personelin kendi deposu, ARAÇ DEPOSU kapsamındaki `kind='vehicle'` depo — ikisi de
 * profilden çözülüyor, istemciden değil (yerinde satış ucunun aynı kararı).
 */
courier.get('/van-stock', async (c) => {
  const staff = c.get('staff');
  const db = serviceDb();
  const vehicleWarehouseId = await vehicleWarehouseOf(db, staff.warehouseIds);
  const facilityId = staff.warehouseIds.find((id) => id !== vehicleWarehouseId) ?? null;
  /* ARAMA AYNI UÇTAN (v3:19 "+ Ürün ara") — ikinci bir uç açılmadı: soru aynı ("depodan ne
     alabilirim"), yalnız süzgeci var. Ayrı bir uç, aynı listeyi iki farklı sıralama ve iki farklı
     tavanla döndürmeye açık kapı bırakırdı. Boş sorgu = süzgeçsiz şerit. */
  const query = c.req.query('q')?.trim() ?? '';

  const [onVan, candidates] = await Promise.all([
    /* İki okuma da ÇIKIŞ DEPOSUNU ve ARAÇ DEPOSUNU birlikte istiyor (v3:19): araçtaki satır
       "depoda kalan"ı, şerit kartı da "araçta kaç tane var"ı yazıyor. İkisi ayrı okunsaydı ekran
       eşleştirmeyi kendi yapardı ve şerit tavanlı olduğu için (12 satır) eşleşme yarım kalırdı. */
    vehicleWarehouseId === null
      ? Promise.resolve([])
      : readVanStock(db, { vehicleWarehouseId, sourceWarehouseId: facilityId }),
    facilityId === null
      ? Promise.resolve([])
      : listVanCandidates(db, {
          warehouseId: facilityId,
          vehicleWarehouseId,
          query: query.length > 0 ? query : undefined,
          /* Arama TAVANI daha geniş: şerit bir seçki (12), arama ise kuryenin aradığını bulması
             gereken bir liste. Yine de sınırsız değil — sınırsız büyüyen bir küme sayfalama
             isterdi (CLAUDE §1) ve rampada kaydırılacak liste bu değil. */
          limit: query.length > 0 ? 40 : undefined,
        }),
  ]);

  const body: z.input<typeof CourierVanStockResponseSchema> = { vehicleWarehouseId, onVan, candidates };
  return ok(c, CourierVanStockResponseSchema.parse(body));
});

/**
 * **Araca al** — depodan araca. Sevk + kabul TEK çağrıda: rampada malı eline alıp araca koyan
 * kişi hem veren hem alandır; ayrı bir kabul adımı, kuryeye kendi koyduğu malı ikinci kez
 * onaylatmak olurdu (kapının künyesi).
 */
courier.post('/van-stock/take', async (c) => {
  const parsed = CourierVanStockMoveRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const staff = c.get('staff');
  const db = serviceDb();
  const vehicleWarehouseId = await vehicleWarehouseOf(db, staff.warehouseIds);
  const facilityId = staff.warehouseIds.find((id) => id !== vehicleWarehouseId) ?? null;
  if (facilityId === null) return ok(c, CourierVanStockMoveResponseSchema.parse({ status: 'no_vehicle' }));

  /* KOD → VARYANT ÇEVİRİSİ UÇTA (v3:19 "Barkod okut"): eşleme `variant_barcode`ta duruyor ve
     istemcinin oraya erişimi yok. Tanınmayan kod SESSİZ GEÇMEZ — kendi dalıyla döner, yoksa
     kurye okuttuğunu sanır ve mal araca hiç binmez. */
  const variantId =
    parsed.data.variantId ?? (await new VariantBarcodeService(db).findByCode(parsed.data.code ?? ''))?.variantId ?? null;
  if (variantId === null) return ok(c, CourierVanStockMoveResponseSchema.parse({ status: 'unknown_code' }));

  const result = await takeToVan(db, {
    warehouseId: facilityId,
    vehicleWarehouseId,
    variantId,
    qty: parsed.data.qty,
    actorId: staff.id,
  });
  const body: z.input<typeof CourierVanStockMoveResponseSchema> = result;
  return ok(c, CourierVanStockMoveResponseSchema.parse(body));
});

/**
 * **Depoya devret** — araçtan depoya (v3:14 "SAY VE DEVRET"). Aynı kapının aynası: kaynak ile
 * hedef yer değiştiriyor, mekanizma bir.
 */
courier.post('/van-stock/return', async (c) => {
  const parsed = CourierVanStockMoveRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const staff = c.get('staff');
  const db = serviceDb();
  const vehicleWarehouseId = await vehicleWarehouseOf(db, staff.warehouseIds);
  const facilityId = staff.warehouseIds.find((id) => id !== vehicleWarehouseId) ?? null;
  if (facilityId === null) return ok(c, CourierVanStockMoveResponseSchema.parse({ status: 'no_vehicle' }));

  /* Devret yolunda kod OKUTULMUYOR (v3:19'da yalnız alma tarafında "Barkod okut" var) — ama
     sözleşme ortak olduğu için kimlik yine iki dallı gelebiliyor; çözüm de aynı kapıdan geçer. */
  const variantId =
    parsed.data.variantId ?? (await new VariantBarcodeService(db).findByCode(parsed.data.code ?? ''))?.variantId ?? null;
  if (variantId === null) return ok(c, CourierVanStockMoveResponseSchema.parse({ status: 'unknown_code' }));

  const result = await returnFromVan(db, {
    warehouseId: facilityId,
    vehicleWarehouseId,
    variantId,
    qty: parsed.data.qty,
    actorId: staff.id,
  });
  const body: z.input<typeof CourierVanStockMoveResponseSchema> = result;
  return ok(c, CourierVanStockMoveResponseSchema.parse(body));
});

/**
 * **Seferi yola çıkar** (31.08 · v3:15) — kurulmuş seferin damgası, durakların açılması ve
 * müşteri bildiriminin gittiği an.
 *
 * Hangi sefer olduğu URL'de: araçta birden çok sefer duruyor ve kurye *istediğini* başlatıyor.
 * Kapı `startCourierDay`ın kendisi — rota ve gün seferin kaydından okunuyor, istemciden değil:
 * seferin bölgesini gövdeden almak, başka rotanın seferini bu kimlikle başlatmanın kapısı olurdu.
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
  });
  if (result.status !== 'ok') return ok(c, DepartCourierRunResponseSchema.parse({ status: 'not_found' }));

  const body: z.input<typeof DepartCourierRunResponseSchema> = result;
  return ok(c, DepartCourierRunResponseSchema.parse(body));
});

courier.post('/boxes/load', async (c) => {
  const parsed = LoadBoxRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await loadBox(serviceDb(), { code: parsed.data.code, courierId: c.get('staff').id });
  const body: z.input<typeof LoadBoxResponseSchema> = outcome;
  return ok(c, LoadBoxResponseSchema.parse(body));
});

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
 * **Sefer kapanışı taslağı** (K7 · 18.08 — eksen kurye×gün'den SEFERE indi) — seferin resmi +
 * beklenen tahsilat, yöntem başına.
 *
 * Gün burada kapının kendi varsayılanına bırakılıyor (`/day`in tersine) ve çelişki YOK: taslak
 * `date`i kendisi döndürüyor, yani cevaptaki gün ile sorgulanan gün TEK hesaptan çıkıyor.
 *
 * ── `runId` OPSİYONEL AMA ANLAMLI ──────────────────────────────────────────
 * Verilmezse kapı kuryenin o günkü seferini bulur (kapanmamış olan öncelikli). Verilirse o seferin
 * taslağı gelir ve GÜN SÜZGECİ UYGULANMAZ — dünkü seferin kapanışı bugünden açılabilmeli, çünkü
 * duraklar güne değil sefere bağlı. Sahiplik kapıda: sefer bu kuryenin değilse `run: null` döner
 * ("yok" ile "senin değil" aynı cevap — sefer kimlikleri denenerek haritalanamaz).
 *
 * `closed` doluysa sefer zaten kapanmıştır ve ekran salt-okunur gösterir — ikinci kapanış istemcinin
 * engellemesine bırakılmıyor, kapı da reddediyor (`already_closed`).
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
 * **Seferi kapat** (K7 · 18.08). Kapanış bir MUTABAKATTIR, para hareketi değil: para kapıda tahsil
 * edilirken yazıldı. Fark (sayılan − beklenen) kapıda türetilir, burada hesaplanmaz.
 *
 * ── ÖZNE ARTIK GÜN DEĞİL SEFER: `runId` ZORUNLU ────────────────────────────
 * Gövdedeki `date` alanı KALDIRILDI ve yerine sefer kimliği geldi (K1 kararı). İki sefer sürmüş
 * kurye ikisini ayrı kapatır; hangisini kapattığını istemci SÖYLER, sunucu tahmin etmez — "o günün
 * kapanışı" ifadesi iki seferli günde iki farklı kaydı işaret ediyordu. Kimlik `/day` ya da
 * `/day-close` taslağından gelir; sefer kuryenin değilse kapı `not_found` der (sahiplik kapıda).
 *
 * Sonuçlanmamış durak varken de kapatılabilir — dönen `pendingCount` uyarı, `releasedCount` ise
 * kapanışın `ready`ye düşürdüğü takılı durak sayısıdır (K4): engel değil, bilgi.
 * `ok:false` + `already_closed` bir hata DEĞİL, bir gerçektir ve 200 ile döner: kapanmış sefer
 * salt-okunurdur, ikinci çağrı ezmez.
 *
 * Gövde şeması sözleşmenin AYNISI — `.extend` ile daraltılacak bir alan kalmadı: `runId` zaten uuid
 * kapısından, sayımlar tamsayı-negatifsiz kapısından geçiyor. Yanıt da `CloseDeliveryRunResultSchema`
 * (entities): RPC dönüşünün aynası, uç onu OLDUĞU GİBİ döndürür.
 */
courier.post('/day-close', async (c) => {
  const parsed = CloseDeliveryRunRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await closeCourierDay(serviceDb(), { courierId: c.get('staff').id, ...parsed.data });

  const body: z.input<typeof CloseDeliveryRunResultSchema> = result;
  return ok(c, CloseDeliveryRunResultSchema.parse(body));
});
