import { logger } from '@lezzet/observability';
import type { OrderStatus } from '@lezzet/types';

/**
 * **Sipariş orkestrasyonlarının YÜZEY-ÜSTÜ yan etkileri** (terfi 21.10) — müşteri haberi, sadakat
 * puanı ve sağlayıcıya iade çağrısı.
 *
 * ── NEDEN PORT, NEDEN TERFİ DEĞİL ────────────────────────────────────────────
 * Terfi edilen dört kurye kapısı ve `refund` üç şeye dokunuyordu ve üçü de BAŞKA modülün dosyası:
 *   • `apps/web/lib/order/notify.ts` → `notification-data.ts` (319 satır, modül 14) — `@lezzet/notify`
 *     ve `@lezzet/i18n` bağımlılığı ister; ikisi de `@lezzet/application`ın bağımlılığı DEĞİL.
 *   • `apps/web/lib/feedback/points.ts` (298 satır, modül 17) — `rewardCompletedOrder` yalnız 20
 *     satır ama `pointsSettings()` üstünde duruyor; parçasını almak o yardımcıyı İKİ KEZ yazmaktı.
 *   • `apps/web/lib/order/provider-refund.ts` + `lib/stripe.ts` — `stripe` npm bağımlılığı ister.
 * Üçünü de buraya kopyalamak, sahibi başka şerit olan üç modülü habersiz çatallamak olurdu; paketin
 * kabul ölçütü de ("en az iki yüzeyin çağırdığı orkestrasyon", `index.ts`) bunları kapsamıyor.
 * Bağımlılık eklemek ayrıca kök `pnpm-lock.yaml`a dokunmak demek — bu şeridin yazı alanı dışı.
 *
 * ── SESSİZ ATLAMA YOK ────────────────────────────────────────────────────────
 * Kayıtsız bir etki HİÇBİR ŞEY yapmaz ama bunu SÖYLER: süreç başına bir kez `logger.warn`. Sessiz
 * no-op, "müşteriye teslim maili gitmiyor" arızasını aylarca görünmez kılardı — CLAUDE §1'in
 * "belirtiyi susturan düzeltme çözüm değildir" kuralının tam karşılığı. Uyarı bir kez basılır:
 * her teslimatta basılsaydı gürültüye dönüşür, gürültü de görünmezliğin ikinci hâlidir.
 *
 * **`@lezzet/notify` + `notification-data` + `rewardCompletedOrder` terfisi mobil ucun ÖN ŞARTIDIR**
 * (rapor edildi): o terfi olmadan `/api/v1/courier/*` teslimatı müşteriye haber vermez.
 */

/** İstisna haberleri (14.5) — iptal, eksik karşılanma, iade. Durum geçişine değil PARA çözümüne bağlı. */
export type OrderExceptionEvent = 'order_cancelled' | 'order_shortfall' | 'order_refunded';

export type ProviderRefundOutcome =
  | { status: 'ok'; refundId: string }
  /** Sağlayıcı reddetti ya da ulaşılamadı — **hareket YAZILMAZ**, borç açıkta kalır. */
  | { status: 'failed'; error: string }
  /** Anahtar yok (yerel/geliştirme). "İade edildi" demekle karıştırılmaz. */
  | { status: 'unavailable' };

export interface ProviderRefundInput {
  /** Paranın GELDİĞİ ödeme niyeti — tahsilat hareketinin künyesinden okunur. */
  paymentIntentId: string;
  amountCents: number;
  /**
   * Aynı iadenin iki kez gönderilmesini sağlayıcı tarafında engelleyen anahtar. Çağrı geçip hareket
   * yazılamazsa operatör tekrar dener; o ikinci deneme AYNI anahtarla gider ve sağlayıcı ilk
   * iadenin sonucunu döner — para iki kez çıkmaz.
   */
  idempotencyKey: string;
}

export type ProviderRefunder = (input: ProviderRefundInput) => Promise<ProviderRefundOutcome>;

/**
 * Çağıran yüzeyin sağladığı etkiler. Hepsi opsiyonel ve hepsi **hata FIRLATMAMALIDIR**: kaynak
 * uygulamalar (`notifyOrderEvent`, `rewardCompletedOrder`) hatayı kendi içinde yutuyor. Yine de
 * burada yakalanıyorlar — gerekçesi `runEffect`in künyesinde.
 */
export interface OrderEffects {
  /** Durum haberi (14.5) — web karşılığı `notifyOrderStatus`. */
  notifyStatus?: (orderId: string, status: OrderStatus) => Promise<unknown>;
  /** İstisna haberi (14.5) — web karşılığı `notifyOrderException`. */
  notifyException?: (
    orderId: string,
    event: OrderExceptionEvent,
    opts: { refundedAmountCents?: number | null },
  ) => Promise<unknown>;
  /** Sipariş puanı (17.4) — web karşılığı `rewardCompletedOrder`. */
  rewardDelivered?: (orderId: string) => Promise<unknown>;
  /** Sağlayıcıya iade (07.11) — web karşılığı `stripeRefunder()`. */
  refunder?: ProviderRefunder;
}

/** Süreç başına tek uyarı: aynı eksik etki her çağrıda bağırırsa kimse duymaz olur. */
const warnedEffects = new Set<string>();

function warnMissing(effect: string): void {
  if (warnedEffects.has(effect)) return;
  warnedEffects.add(effect);
  logger.warn(
    { context: 'application/order-effects', effect },
    'sipariş yan etkisi KAYITLI DEĞİL — çağıran yüzey portu geçirmedi, etki atlandı',
  );
}

/**
 * Etkiyi koşturur; yoksa uyarır, patlarsa kaydeder.
 *
 * **Yakalama `transitionOrder`ın ölçülmüş davranışıdır**, uydurma değil: web'de aynı iki etki
 * (`notifyOrderStatus` · `rewardCompletedOrder`) orada `try/catch` + `logger.warn` ile sarılı ve
 * gerekçesi yazılı — "bildirim yokluğu siparişi bozmaz". `deliverOrder` sarmıyordu, çünkü çağırdığı
 * iki fonksiyon hatayı zaten içeride yutuyordu; burada uygulama ÇAĞIRANIN olduğu için o garanti
 * kalkıyor. Sarmasaydık kötü davranan bir port, malı stoktan düşmüş bir teslimatın üstüne istisna
 * fırlatır — istemci "olmadı" sanıp tekrar dener ve `stale` alırdı (kayıt doğru, ekran yanlış).
 */
async function runEffect(effect: string, orderId: string, run: (() => Promise<unknown>) | undefined): Promise<void> {
  if (!run) {
    warnMissing(effect);
    return;
  }
  try {
    await run();
  } catch (err) {
    // Sessiz DEĞİL (CLAUDE §1): etki düştü, iş sürüyor — ama izi burada duruyor. Bağlam KİMLİK
    // taşır (`orderId`), içerik değil (OBSERVABILITY §5).
    logger.warn(
      { context: 'application/order-effects', effect, orderId, err: err instanceof Error ? err.message : String(err) },
      'sipariş yan etkisi koşarken hata — iş geri alınmadı',
    );
  }
}

export function notifyStatusEffect(effects: OrderEffects | undefined, orderId: string, status: OrderStatus): Promise<void> {
  return runEffect('notifyStatus', orderId, effects?.notifyStatus && (() => effects.notifyStatus!(orderId, status)));
}

export function notifyExceptionEffect(
  effects: OrderEffects | undefined,
  orderId: string,
  event: OrderExceptionEvent,
  opts: { refundedAmountCents?: number | null } = {},
): Promise<void> {
  return runEffect('notifyException', orderId, effects?.notifyException && (() => effects.notifyException!(orderId, event, opts)));
}

export function rewardDeliveredEffect(effects: OrderEffects | undefined, orderId: string): Promise<void> {
  return runEffect('rewardDelivered', orderId, effects?.rewardDelivered && (() => effects.rewardDelivered!(orderId)));
}

/**
 * Sağlayıcı iadesi portu. Kayıtlı değilse **`unavailable`** — "iade edildi" demekle karıştırılmaz
 * ve çağırana `refundBlocked: 'provider_unavailable'` olarak GÖRÜNÜR döner (web'in anahtarsız
 * yerel ortamdaki davranışının aynısı). Uyarı yine basılır: eksikliğin sebebi env değil, kayıtsız
 * port olabilir ve ikisi ayrı arızadır.
 */
export function providerRefunder(effects: OrderEffects | undefined): ProviderRefunder {
  if (effects?.refunder) return effects.refunder;
  warnMissing('refunder');
  return async () => ({ status: 'unavailable' });
}
