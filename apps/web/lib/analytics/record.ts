import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { AnalyticsEventService, AnalyticsSessionService, UserProfileService, serviceDb } from '@lezzet/database';
import { AnalyticsInputSchema, type AnalyticsEventInsert, type AnalyticsInput } from '@lezzet/types';
import { logger } from '@lezzet/observability';
import { scrubMessage } from '@lezzet/observability/mask';
import { getSessionUser } from '@/lib/guard';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
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
 * SESSİZ DEĞİL: `console.warn` ile iz bırakır (`CLAUDE §1` — sessiz catch yok). Emsal:
 * `recordDemand`'ın gerekçeli catch'i.
 */

/** Ölçüm dışı bırakılan tarayıcı imzaları — kimsenin bakmadığı görüntüleme. */
const BOT = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|preview|monitor|curl|wget|python-requests/i;

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
export async function recordEvent(input: AnalyticsInput): Promise<void> {
  try {
    const girdi = AnalyticsInputSchema.parse(input);
    const h = await headers();
    const ua = h.get('user-agent') ?? '';

    // ── DÜŞÜRME KURALLARI: üçü de "kimsenin bakmadığı görüntüleme" ──────────────
    // Kural burada, tek yerde. Atıcılara dağıtılsaydı biri unutur ve payda sessizce şişerdi.
    if (h.get('next-router-prefetch') === '1' || h.get('purpose') === 'prefetch') return;
    if (!ua || BOT.test(ua)) return; // UA'sız istek = ISR/arka plan yeniden üretimi ya da bot
    if (await isStaffRequest()) return;

    const [salt, viewer, place] = await Promise.all([dailySalt(), readPricingViewer(), readPlaceWarehouses()]);
    const ip = clientIp(h);

    const satir: AnalyticsEventInsert = {
      type: girdi.type,
      sessionKey: sessionKeyOf(salt, ip, ua),
      // Yol ROTA KALIBI olarak yazılır; atıcı yol göndermez, kapı üstbilgiden okur.
      path: routePattern(h.get('x-invoke-path') ?? h.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ?? '/'),
      channel: viewer.channel,
      // `null` bir KOVADIR (yer seçilmemiş), eksik veri değil — huninin ilk adımı orada.
      warehouseId: place.warehouseId,
      device: await detectDevice(),
      country: null,
      language: null,
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

    await new AnalyticsEventService(serviceDb()).record(satir);
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

