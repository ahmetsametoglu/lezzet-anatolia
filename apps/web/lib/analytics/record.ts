import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { AnalyticsEventService, AnalyticsSessionService, UserProfileService, serviceDb } from '@lezzet/database';
import { AnalyticsInputSchema, type AnalyticsEventInsert, type AnalyticsInput } from '@lezzet/types';
import { logger } from '@lezzet/observability';
import { scrubMessage } from '@lezzet/observability/mask';
import { getSessionUser } from '@/lib/guard';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { readPlaceAnswer, readPlaceWarehouses } from '@/lib/delivery/read-place';
import { detectDevice } from '@/lib/device';
import { routePattern } from './route-pattern';
import { clientIp, dailySalt, sessionKeyOf } from './session-key';
import { normalizeUtm } from './utm';

/**
 * **OLAY KAPISI** (13.1) — atıcıların çağırdığı TEK fonksiyon. Kurallar `ANALYTICS.md`'de.
 *
 * ── ATICI NE OLDUĞUNU SÖYLER, KAPI NEYİN SAYILACAĞINA KARAR VERİR ────────────
 * Atıcı yalnız `AnalyticsInput` verir. Bağlamı (oturum · yol · kanal · yer · cihaz · ülke · dil) ve
 * düşürme kurallarını kapı çözer. Kural atıcılara dağıtılsaydı biri unuturdu ve **unutulduğunda
 * hata vermezdi** — yalnız payda sessizce şişerdi (bu oturumda aynı sınıftan dört hata görüldü).
 *
 * ── ÖLÇÜM ASLA AKIŞI KESMEZ ──────────────────────────────────────────────────
 * Fonksiyon fırlatmaz ve çağıranın beklemesi gerekmez (`void record(...)`). Hata yutulur ama
 * SESSİZ DEĞİL: `logger.warn` ile iz bırakır (`CLAUDE §1` — sessiz catch yok; künye bir tur
 * `console.warn` diyordu, kod hep doğruydu — denetim P3). Emsal:
 * `recordDemand`'ın gerekçeli catch'i.
 */

/** Ölçüm dışı bırakılan tarayıcı imzaları — kimsenin bakmadığı görüntüleme. */
const BOT = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|preview|monitor|curl|wget|python-requests/i;

/**
 * ── TEKİLLEŞTİRME YOK, VE BU BİR KARAR (04.08) ──────────────────────────────
 * Bir tur "oturum başına bir kez `order_placed`" kuralı yazıldı, sonra KALDIRILDI. Gerekçesi
 * kayda değer çünkü ikinci kez yazılmaya aday:
 *
 * Kural, olayın dönüş SAYFASINDAN atılacağı varsayımıyla kurulmuştu — o sayfa her yenilemede
 * yeniden render olur, yani dönüşüm oranı %100'ü aşardı. Ama kullanıcı kararı ölçünün tanımını
 * değiştirdi: *"ödemenin gerçekleştiğine bakmamıza gerek yok, biz bir NİYET ölçüyoruz."* Olay artık
 * iki SUNUCU EYLEMİNDEN atılıyor (`confirmCheckoutAction`), hiçbiri render değil — yenileme sorunu
 * ortadan kalktı.
 *
 * **Kural kalsaydı zarar verirdi:** sepeti bölünen müşterinin ikinci siparişini ve kartı reddedilip
 * tekrar deneyen müşterinin ikinci denemesini sessizce yutardı. İkisi de gerçek birer niyettir.
 * Sipariş/ciro SAYISI zaten `order` tablosunun yetkisinde (`ANALYTICS §4`); defterin işi niyeti
 * saymak.
 */

/**
 * Personel mi — **istek başına bir kez** sorulur (`cache`), olay başına DEĞİL.
 *
 * Personel kendi vitrinini de geziyor ve küçük hacimde bu oranları hissedilir biçimde oynatır
 * (müşteri şeridinin tespiti, 04.08). Prefetch/bot ile aynı yerde, aynı gerekçeyle düşer.
 *
 * **Oturumsuz ziyaretçide HİÇ sorgu yok** — ziyaretçilerin ezici çoğunluğu odur.
 */
const isStaffRequest = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user) return false;
  return new UserProfileService(serviceDb()).isStaff(user.id);
});

/**
 * **Atıcının BİLDİĞİ bağlam** — bugün tek alan: sayfanın iç rota kalıbı.
 *
 * ── NEDEN ATICIDAN GELİYOR (düzeltme 04.08 · denetim P1, KIRMIZI) ───────────
 * Künye *"atıcı yol göndermez, kapı üstbilgiden okur"* diyordu; gerekçesi sağlamdı ama DAYANDIĞI
 * VARSAYIM yanlıştı. Kapının okuduğu `x-invoke-path` Next 15'te YOK (repoda tek kullanıcısı bu
 * satırdı) ve müşteri dalı middleware'den erken dönüyor, yani yol üstbilgisi de yazılmıyor. Geriye
 * `referer` kalıyordu — o da ziyaret edilen sayfayı değil **GELİNEN sayfayı** söyler.
 *
 * Denetim canlıda ölçtü: `/fr/produit/fistikli-baklava` ziyareti deftere `path=/catalogue` yazmış.
 * Rota boyutu — günlük özet dâhil — baştan yanlıştı ve hiçbir yerde hata vermiyordu.
 *
 * **Sayfa kendi kalıbını DERLEME ZAMANINDA bilir; kapı çalışma zamanında tahmin ediyordu.** Bilen
 * taraf söylemeli. Bu, "atıcı ne olduğunu söyler, neyin sayılacağına kapı karar verir" ilkesiyle
 * çelişmiyor: rota kalıbı bir OLGU, bir karar değil — kapı hâlâ düşürme, temizleme ve
 * normalleştirme kararlarının tek sahibi.
 *
 * Verilmezse eski türetim **emniyet ağı** olarak sürüyor: yanlış ama boş değil, ve atıcılar tek tek
 * geçtikçe kendiliğinden doğruya döner.
 */
interface EventContext {
  /** İç rota kalıbı — `/product/[slug]`. Dilsiz ve slug'sız; kapı yine `routePattern`'dan geçirir. */
  path?: string;
}

/**
 * Sitenin o anki dili — çözülemezse `null`.
 *
 * `getLocale()` bir İSTEK BAĞLAMI ister ve ölçüm her yerden çağrılabiliyor (bağlamın kurulmadığı
 * bir yol, bir arka plan işi). Fırlatmasına izin verseydik dil uğruna **olayın tamamı** düşerdi —
 * ölçüm akışı kesmez ilkesinin küçük hâli. `null` burada "dil ölçülemedi" demek ve bu dürüst:
 * uydurulmuş bir dil, boş dilden kötüdür.
 */
async function currentLocale(): Promise<Locale | null> {
  try {
    const locale = await getLocale();
    // Doğrulama şart: `getLocale()` bir dize döner, tipimiz ise kapalı bir küme. Doğrulamasaydık
    // sözlük dışı bir değer enum kolonuna gider ve yazma **veritabanında** patlardı.
    return LOCALES.includes(locale as Locale) ? (locale as Locale) : null;
  } catch {
    return null;
  }
}

/** Serbest metnin tek girdiği yer — temizlik TEK kapıda (atıcı ham yazar). */
const SEARCH_QUERY_MAX = 100;
function cleanQuery(raw: string): string {
  return scrubMessage(raw.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ')).slice(0, SEARCH_QUERY_MAX);
}

/**
 * Olayı kaydeder. **Fırlatmaz, beklenmesi gerekmez.**
 *
 * Çağrı biçimi: `void recordEvent({ type: 'product_view', … })`
 */
export async function recordEvent(input: AnalyticsInput, context: EventContext = {}): Promise<void> {
  try {
    const girdi = AnalyticsInputSchema.parse(input);
    const h = await headers();
    const ua = h.get('user-agent') ?? '';

    // ── DÜŞÜRME KURALLARI: üçü de "kimsenin bakmadığı görüntüleme" ──────────────
    // Kural burada, tek yerde. Atıcılara dağıtılsaydı biri unutur ve payda sessizce şişerdi.
    if (h.get('next-router-prefetch') === '1' || h.get('purpose') === 'prefetch') return;
    if (!ua || BOT.test(ua)) return; // UA'sız istek = ISR/arka plan yeniden üretimi ya da bot
    // **E2E koşuları deftere yazıyordu** (denetim gözlemi, 05.08). Playwright cihaz profilleri
    // GERÇEK tarayıcı UA'sı taşır — `BOT` süzgeci onları görmez ve göremez. Her duman koşusu
    // ziyaret, ürün görüntülemesi ve sipariş niyeti üretiyordu: paydayı da payı da şişiriyor, yani
    // dönüşüm oranını sessizce bozuyordu. Üstbilgiyi e2e gönderir, düşürmeyi kapı yapar — kural
    // öteki üçüyle aynı yerde durur.
    if (h.get('x-e2e') === '1') return;
    if (await isStaffRequest()) return;

    const [salt, viewer, place] = await Promise.all([dailySalt(), readPricingViewer(), readPlaceWarehouses()]);
    const ip = clientIp(h);

    const sessionKey = sessionKeyOf(salt, ip, ua);
    const events = new AnalyticsEventService(serviceDb());

    const satir: AnalyticsEventInsert = {
      type: girdi.type,
      sessionKey,
      // Yol ROTA KALIBI olarak yazılır. Atıcı kendi kalıbını veriyorsa O kullanılır (denetim P1);
      // vermiyorsa `referer`'dan türetilen emniyet ağı devreye girer — o da GELİNEN sayfayı yazar,
      // yani yanlıştır ama boş değildir. Her iki hâlde `routePattern`'dan geçer: atıcı yanlışlıkla
      // somut bir yol gönderse bile slug ve jeton deftere giremez.
      path: routePattern(context.path ?? h.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ?? '/'),
      channel: viewer.channel,
      // `null` bir KOVADIR (yer seçilmemiş), eksik veri değil — huninin ilk adımı orada.
      warehouseId: place.warehouseId,
      device: await detectDevice(),
      /**
       * YÜZEY sabittir ve SABİT OLMASI doğrudur (24.08 · MB-63): bu kapı yalnız web'den çağrılır,
       * native kendi kapısını kullanır (`apps/mobile-api/src/lib/analytics.ts`). Alan zorunlu —
       * `default 'web'` yazmak, yüzeyi söylemeyi unutan bir yazımın sessizce web sayılması demekti
       * ve MB-63'ün arızası (`analytics_daily` yalnız web'i sayarken ekranın "toplam" demesi) tam
       * olarak öyle doğmuştu.
       */
      surface: 'web',
      /**
       * ── ÜLKE: IP'den DEĞİL, ÇÖZÜLMÜŞ YERDEN (07.08 · `ANALYTICS §2` düzeltildi) ──────────
       * Künye "IP saklanmaz, yalnız `country` türetilir" diyordu ve bu **hiç uygulanmadı**; sebebi
       * de kolonun kendi TİPİNDE yazılıydı: `CountryEnum = ['FR','DE']`. IP'den türeyen bir ülke
       * kolonu tam ISO listesi ister — Belçika'dan gelen bir ziyaretçi bu kolona **yazılamazdı
       * bile.** Yani belgelenen anlam, seçilen tiple baştan çelişiyordu.
       *
       * Doğru besleyen zaten elimizde: müşterinin posta koduyla çözdüğü YER. Ticari olarak anlamlı
       * eksen de bu — "hangi ülkenin bölgesine bakıyor", "nereden IP alıyor" değil. Okuma istek
       * başına önbellekli (`cache`), yani ek sorgu yok.
       *
       * **`null` gerçek bir KOVADIR:** yer henüz çözülmedi. Huninin ilk adımı tam olarak orada ve
       * `warehouseId` de aynı hâli aynı sebeple taşıyor.
       */
      country: (await readPlaceAnswer())?.country ?? null,
      /** Sitenin o anki dili — ziyaretçinin beyanı (`/fr/…` öneki), tarayıcı tahmini değil. */
      language: await currentLocale(),
      ...contextOf(girdi),
    };

    // Kampanya künyesi oturumun İLK olayında bir kez düşer; ikinci yazım sessizce yutulur.
    // Olayın kendisiyle birlikte gidiyor (ayrı kapı yok) — atıcının iki şeyi hatırlaması gerekseydi
    // biri unutulur ve kampanya raporu sessizce eksik kalırdı.
    if (girdi.type === 'page_view') {
      const utm = normalizeUtm(girdi.utm);
      // Künye BOŞSA yazılmaz: doğrudan gelen ziyaretçi için satır açmak, oturum tablosunu defterin
      // ikinci kopyasına çevirirdi. Kaynak dökümünde doğrudan trafiğin görünme yolu bu tablo değil,
      // özetin sol birleşimidir (`build_analytics_daily_source`).
      if (utm || girdi.source) {
        await new AnalyticsSessionService(serviceDb()).remember({
          sessionKey: satir.sessionKey,
          utm,
          source: girdi.source ?? null,
        });
      }
    }

    await events.record(satir);
  } catch (err) {
    // Yutuluyor ama SESSİZ DEĞİL (`CLAUDE §1`). `captureError` DEĞİL `logger.warn`: kapı istek
    // başına çalışıyor ve bir sağlayıcı arızasında her olay bir `error_log` satırı yazsaydı, ölçüm
    // arızası hata defterini boğardı — teşhis edilmesi gereken asıl arızalar arasında kaybolurdu.
    logger.warn({ job: 'analytics_record', type: input.type, reason: (err as Error).message }, 'olay yazılamadı');
  }
}

/** Girdi tipine özel alanlar — ayrık birlik burada satıra iner. */
function contextOf(girdi: AnalyticsInput): Partial<AnalyticsEventInsert> {
  switch (girdi.type) {
    /* Sayfa görüntülemesinin öznesi İSTEĞE BAĞLI (08.57): tarif sayfası hangi tarife bakıldığını
       söylüyor, öznesi olmayan sayfalar hiçbir şey geçmiyor. `undefined` alanlar satıra `null`
       olarak iner — ayrı bir dal yazmaya gerek yok. */
    case 'page_view':
      return { subjectType: girdi.subjectType, subjectId: girdi.subjectId };
    case 'product_view':
      return { subjectType: girdi.subjectType, subjectId: girdi.subjectId, productId: girdi.productId, availability: girdi.availability };
    case 'add_to_cart':
      return { subjectType: girdi.subjectType, subjectId: girdi.subjectId, productId: girdi.productId, meta: { qty: girdi.qty } };
    case 'share':
      return { subjectType: girdi.subjectType, subjectId: girdi.subjectId, productId: girdi.productId, meta: { method: girdi.method } };
    case 'search':
      return { meta: { query: cleanQuery(girdi.query), resultCount: girdi.resultCount, zeroResultKind: girdi.zeroResultKind ?? null } };
    case 'place_resolved':
      return { meta: { resolved: girdi.resolved } };
    case 'cart_blocked':
    case 'checkout_blocked':
      return { blockedReason: girdi.reason };
    default:
      return {};
  }
}

