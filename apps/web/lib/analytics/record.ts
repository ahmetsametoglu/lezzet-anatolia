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
      // **BEKLEYEN(13.1): ikisinin de besleyeni yok ve bu künyeye yazılmak zorunda** (denetim P3).
      // `null` burada "ölçülmedi" demek, "bilinmiyor bir hâl" değil — okuyan ekran bunu bir kova
      // sanmamalı. Ülke IP'den türer ve IP hiçbir yerde durmuyor (`ANALYTICS §2`), yani besleyen
      // ancak kenar katmanının ülke üstbilgisi olabilir; dil ise atıcının bağlamında var ve
      // `EventContext`e eklenebilir. İkisi de "yol var, besleyen yok" sınıfına dördüncü ve beşinci
      // üye olmasın diye burada yazılı duruyor.
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

