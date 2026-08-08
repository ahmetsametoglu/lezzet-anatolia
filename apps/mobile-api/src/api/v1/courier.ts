import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { serviceDb, UserProfileService } from '@lezzet/database';
import {
  closeCourierDay,
  confirmDoorDelivery,
  listCourierDay,
  markUndelivered,
  openDayClose,
  requestDeliveryProofUploadUrl,
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
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

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
 * Rol kapısı — `bearerAuth`ın ARDINDAN koşar ve iki işi birden yapar: yetkiyi sorar, kimliği çözer.
 *
 * ── KURYE KİMLİĞİ JETONDAN GELİR, GÖVDEDEN ASLA ─────────────────────────────
 * Sözleşmelerin hiçbirinde `courierId` yok ve bu bilinçliydi (`courier-api.schema.ts` künyesi):
 * gövdeye konsaydı kurye başkasının kimliğini yazıp onun durağını kapatabilirdi. Kapılar `courierId`
 * ZORUNLU parametre alıyor ("yalnız kendi teslimatları" imzada durur) ve o değeri buraya koyan tek
 * yer bu ara katmandır.
 *
 * ── HANGİ KİMLİK: `user_profiles.id`, `auth.users.id` DEĞİL ─────────────────
 * Ölçüldü, varsayılmadı: `order.courier_id` sütunu `references public.user_profiles (id)`
 * (`0012_order.sql:103`), yani kapılara verilecek kimlik PROFİL kimliğidir. Auth kullanıcısının
 * kimliği profil satırında AYRI bir sütunda (`auth_user_id`) durur — ikisi farklı uuid'lerdir
 * (`apps/web/lib/guard.ts` künyesi: *"auth kimliği ≠ müşteri kimliği"*). Jetondan çıkan auth
 * kimliğini doğrudan `listCourierDay`e vermek hiçbir siparişle eşleşmez ve kurye **boş bir gün**
 * görürdü — hata da vermezdi, çünkü boş liste geçerli bir cevaptır. Zincir bu yüzden katalogun
 * `readViewer`'ıyla aynı: auth kullanıcısı → `findByAuthUserId` → profil.
 *
 * ── TEK OKUMA, İKİ CEVAP ────────────────────────────────────────────────────
 * Rol de kurye kimliği de AYNI profil satırındadır (`roles` dizisi + `id`). `hasRole` çağırıp sonra
 * ayrıca profili okumak aynı satırı iki kez getirirdi; bir okuma ikisini birden veriyor.
 *
 * ── `admin` DE GEÇER ────────────────────────────────────────────────────────
 * Rol kümesi `courier` YA DA `admin`. Yönetici kendi üstüne atanmış bir durağı kapatabilmelidir
 * (küçük ekipte aynı kişi hem yönetici hem kuryedir) ve `roles` bir DİZİDİR — çok şapkalı kişi
 * zaten iki rolü birden taşır. `admin` ek bir kapı AÇMIYOR: kapılar yine yalnız `courier_id` o kişiye
 * eşit siparişleri döndürür, yani yönetici başkasının rotasını buradan göremez.
 *
 * ── ROLSÜZ İLE PROFİLSİZ AYNI CEVABI ALIR ───────────────────────────────────
 * `403 forbidden` — `bearerAuth`ın "token yok ile token çöp aynı cevabı alır" kararıyla aynı
 * gerekçe: ayrım çağırana bir şey kazandırmaz. Profil satırının hiç olmaması (trigger boşluğu) bir
 * altyapı arızasıdır ve `/me` onu 404 ile ayrıca söylüyor; kurye kapısının cevabı ise her iki hâlde
 * de aynıdır: bu kapı sana kapalı.
 *
 * **İkinci tüketicisi çıktığında taşınır:** depo bölümü (21.11) aynı şekle ihtiyaç duyacak
 * (`roles` süzgeci + profil kimliği). O gün ortak parça `auth.ts`e, `bearerAuth`ın yanına iner —
 * paketin kendi terfi ölçütü ("en az iki çağıran") bugün karşılanmıyor, tek çağıranlı bir
 * soyutlama ise erken.
 */
interface CourierEnv {
  Variables: V1Env['Variables'] & { courierId: string };
}

async function courierGuard(c: Context<CourierEnv>, next: Next): Promise<Response | void> {
  const authUser = c.get('authUser');
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(authUser.id);
  if (!profile) return fail(c, 'forbidden', 403);
  if (!profile.roles.includes('courier') && !profile.roles.includes('admin')) return fail(c, 'forbidden', 403);

  c.set('courierId', profile.id);
  await next();
}

/**
 * Gün anahtarı — `YYYY-MM-DD`. Biçim kontrolü bir iş kuralı değil, taşımanın ödevi: doğrulanmamış
 * bir dize `date` sütununa gidince PostgreSQL "invalid input syntax" fırlatır ve çağıran, kendi
 * gönderdiği bozuk parametre için **500** görür. 400 doğru cevaptır — soru istemciye geri verilir.
 */
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const DateQuerySchema = z.object({ date: IsoDateSchema.optional() });

/** Yol parametresi — uuid olmayan bir kimlik de sorguya inmeden 400 alır (aynı gerekçe). */
const OrderIdSchema = z.string().uuid();

export const courier = new Hono<CourierEnv>();

courier.use('*', courierGuard);

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

  const date = query.data.date ?? new Date().toISOString().slice(0, 10);
  const stops = await listCourierDay(serviceDb(), { courierId: c.get('courierId'), date });

  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü `CourierStop` sözleşmeye alan alan uymak
  // zorunda ve uymadığı gün burası DERLENMEZ (katalogdaki compile-lock deseni).
  const body: z.input<typeof CourierDayResponseSchema> = { date, stops };
  return ok(c, CourierDayResponseSchema.parse(body));
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
  const orderId = OrderIdSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = ConfirmDoorDeliveryRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await confirmDoorDelivery(serviceDb(), {
    orderId: orderId.data,
    courierId: c.get('courierId'),
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
  const orderId = OrderIdSchema.safeParse(c.req.param('orderId'));
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
    courierId: c.get('courierId'),
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
  const orderId = OrderIdSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'invalid_order_id', 400);

  const parsed = DeliveryProofUploadRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await requestDeliveryProofUploadUrl(serviceDb(), {
    orderId: orderId.data,
    courierId: c.get('courierId'),
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

  const draft = await openDayClose(serviceDb(), { courierId: c.get('courierId'), date: query.data.date });

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

  const result = await closeCourierDay(serviceDb(), { courierId: c.get('courierId'), ...parsed.data });

  const body: z.input<typeof CourierDayCloseResultSchema> = result;
  return ok(c, CourierDayCloseResultSchema.parse(body));
});

/**
 * Gövdeyi ham okur — **çözülemeyen gövde bir istisna değil, geçersiz bir istektir.**
 *
 * `c.req.json()` bozuk/boş gövdede fırlatır; yakalanmasaydı `app.onError` onu bir SUNUCU hatası gibi
 * kaydeder (500 + `error_log` satırı) ve hata defteri istemci kaynaklı gürültüyle dolardı. `undefined`
 * dönüyor: kararı şemaya bırakıyoruz — gövdesi hiç olmayan bir isteğin cevabı da `safeParse`ten
 * çıkan 400'dür, ayrı bir dal gerekmiyor.
 */
async function readJsonBody(c: Context<CourierEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
