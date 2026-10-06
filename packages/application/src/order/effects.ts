import { logger } from '@lezzet/observability';
import type { OrderStatus, WrittenReturn } from '@lezzet/types';

/**
 * Sipariş orkestrasyonlarının yüzeye bağlı yan etkileri: müşteri haberi ve sağlayıcı iadesi. Port kayıt yeri değil karar yeridir;
 * varsayılan olsaydı her geçiş, fikstür kuran testler dahil, mail göndermeye kalkardı.
 */

/** İstisna haberleri durum geçişine değil para çözümüne bağlıdır; gelmeyen kart ödemesi de sipariş oluşmadığı için buradadır. */
export type OrderExceptionEvent = 'order_cancelled' | 'order_shortfall' | 'order_refunded' | 'order_payment_incomplete';

export type ProviderRefundOutcome =
  | { status: 'ok'; refundId: string }
  /** Sağlayıcı reddetti ya da ulaşılamadı — **hareket YAZILMAZ**, borç açıkta kalır. */
  | { status: 'failed'; error: string }
  /** Anahtar yok (yerel/geliştirme). "İade edildi" demekle karıştırılmaz. */
  | { status: 'unavailable' };

export interface ProviderRefundInput {
  /** Paranın geldiği sağlayıcı ödemesi — tahsilat hareketinin künyesinden okunur. */
  paymentRef: string;
  amountCents: number;
  /**
   * Aynı iadenin iki kez gönderilmesini sağlayıcı tarafında engelleyen anahtar. Çağrı geçip hareket
   * yazılamazsa operatör tekrar dener; o ikinci deneme AYNI anahtarla gider ve sağlayıcı ilk
   * iadenin sonucunu döner — para iki kez çıkmaz.
   */
  idempotencyKey: string;
}

export type ProviderRefunder = (input: ProviderRefundInput) => Promise<ProviderRefundOutcome>;

/** Çağıranın sağladığı etkiler; hepsi opsiyonel ve hata fırlatmamalıdır, yine de `runEffect` yakalar. */
/** İstisna haberinin ayrıntısı: kapının fiilen yazdığı iade tutarı ve iadede bu düzeltmenin yazdığı olaylar. */
export interface OrderExceptionDetail {
  refundedAmountCents?: number | null;
  returns?: readonly WrittenReturn[];
}

export interface OrderEffects {
  /** Durum haberi; web karşılığı `notifyOrderStatus`. */
  notifyStatus?: (orderId: string, status: OrderStatus) => Promise<unknown>;
  /** İstisna haberi; web karşılığı `notifyOrderException`. */
  notifyException?: (orderId: string, event: OrderExceptionEvent, opts: OrderExceptionDetail) => Promise<unknown>;
  /** Sağlayıcıya iade; web karşılığı `revolutRefunder()`. */
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
 * Etkiyi koşturur; yoksa uyarır, patlarsa kaydeder. Sarılmasaydı kötü davranan bir port, stoktan düşmüş bir teslimatın üstüne
 * hata fırlatır ve istemci "olmadı" sanıp yeniden denerdi.
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
  opts: OrderExceptionDetail = {},
): Promise<void> {
  return runEffect('notifyException', orderId, effects?.notifyException && (() => effects.notifyException!(orderId, event, opts)));
}

/** İşi yanıt gönderildikten sonra koşturan kapı: web'de `after`, uzun yaşayan süreçte doğrudan başlatma. */
export type BackgroundRunner = (task: () => Promise<void>) => void;

/**
 * Haberleri yanıttan sonraya bırakır: haberin kurulması ve gönderilmesi müşteriyi onay düğmesinde bekletmesin. İade bırakılmaz,
 * çünkü sonucu çağıranın kararını değiştirir.
 */
export function deferredNotices(effects: OrderEffects, runLater: BackgroundRunner): OrderEffects {
  return {
    ...effects,
    notifyStatus:
      effects.notifyStatus &&
      (async (orderId, status) => {
        runLater(() => notifyStatusEffect(effects, orderId, status));
      }),
    notifyException:
      effects.notifyException &&
      (async (orderId, event, opts) => {
        runLater(() => notifyExceptionEffect(effects, orderId, event, opts));
      }),
  };
}

/**
 * Kayıtlı değilse `unavailable` döner, "iade edildi" ile karıştırılmaz ve çağırana `refundBlocked: 'provider_unavailable'` olarak
 * görünür. Uyarı yine basılır, çünkü eksik anahtar ile kayıtsız port ayrı arızalardır.
 */
export function providerRefunder(effects: OrderEffects | undefined): ProviderRefunder {
  if (effects?.refunder) return effects.refunder;
  warnMissing('refunder');
  return async () => ({ status: 'unavailable' });
}
