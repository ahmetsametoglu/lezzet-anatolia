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
 * Olay kapısı, web atıcılarının çağırdığı tek fonksiyon: atıcı ne olduğunu söyler, bağlamı ve neyin sayılacağını kapı çözer, çünkü
 * atıcılara dağılan kural unutulduğunda hata vermez, payda sessizce şişer. Ölçüm akışı kesmez: fonksiyon fırlatmaz, hata `logger.warn` ile
 * iz bırakır.
 */

/** Ölçüm dışı bırakılan tarayıcı imzaları — kimsenin bakmadığı görüntüleme. */
const BOT = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|preview|monitor|curl|wget|python-requests/i;

/**
 * `order_placed` oturum başına tekilleştirilmez: olay render'dan değil sunucu eyleminden atılır, bölünen sepetin ikinci siparişi ve
 * reddedilip yeniden denenen ödeme de gerçek birer niyettir. Sipariş ve ciro sayısının yetkisi `order` tablosundadır, defter niyeti sayar.
 */

/**
 * Personel ölçülmez, çünkü kendi vitrinini gezen personel küçük hacimde oranları oynatır; soru olay başına değil istek başına bir kez
 * sorulur (`cache`) ve oturumsuz ziyaretçide hiç sorgu atılmaz.
 */
const isStaffRequest = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user) return false;
  return new UserProfileService(serviceDb()).isStaff(user.id);
});

/**
 * Atıcının bildiği bağlam, bugün yalnız sayfanın iç rota kalıbı: kalıbı sayfa derleme zamanında bilir, kapının üstbilgiden türettiği yol
 * ise ziyaret edilen değil gelinen sayfadır (`referer`). Verilmezse o türetim emniyet ağı olarak kalır: yanlış ama boş değil.
 */
interface EventContext {
  /** İç rota kalıbı — `/product/[slug]`. Dilsiz ve slug'sız; kapı yine `routePattern`'dan geçirir. */
  path?: string;
}

/**
 * Sitenin o anki dili, çözülemezse `null`: `getLocale()` istek bağlamı ister ve fırlatmasına izin verilse dil uğruna olayın tamamı
 * düşerdi. Uydurulmuş dil boş dilden kötüdür.
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
    // E2E koşusu düşer: Playwright cihaz profilleri gerçek tarayıcı UA'sı taşıdığı için `BOT` süzgeci onları görmez ve her duman koşusu
    // ziyaret ile sipariş niyeti yazardı. Üstbilgiyi e2e gönderir, düşürmeyi kapı yapar.
    if (h.get('x-e2e') === '1') return;
    if (await isStaffRequest()) return;

    const [salt, viewer, place] = await Promise.all([dailySalt(), readPricingViewer(), readPlaceWarehouses()]);
    const ip = clientIp(h);

    const sessionKey = sessionKeyOf(salt, ip, ua);
    const events = new AnalyticsEventService(serviceDb());

    const satir: AnalyticsEventInsert = {
      type: girdi.type,
      sessionKey,
      // Yol rota kalıbı olarak yazılır: atıcının verdiği kalıp, yoksa `referer`'dan türetilen emniyet ağı. İkisi de `routePattern`'dan
      // geçer ki somut bir yol gelse bile slug ve jeton deftere giremez.
      path: routePattern(context.path ?? h.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ?? '/'),
      channel: viewer.channel,
      // `null` bir KOVADIR (yer seçilmemiş), eksik veri değil — huninin ilk adımı orada.
      warehouseId: place.warehouseId,
      business: place.business,
      device: await detectDevice(),
      /**
       * Yüzey sabittir, çünkü bu kapı yalnız web'den çağrılır, native kendi kapısını kullanır. Alanın varsayılanı yoktur ki yüzeyi
       * söylemeyi unutan yazım sessizce web sayılmasın.
       */
      surface: 'web',
      /**
       * Ülke IP'den değil çözülmüş yerden gelir: kolon yalnız hizmet ülkelerini alır ve ticari soru "hangi ülkenin bölgesine bakıyor"dur.
       * `null` gerçek bir kovadır, yer henüz çözülmedi; okuma istek başına önbelleklidir.
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
    /* Sayfa görüntülemesinin öznesi isteğe bağlıdır: öznesi olmayan sayfa hiçbir şey geçmez, `undefined` alan satıra `null` iner. */
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

