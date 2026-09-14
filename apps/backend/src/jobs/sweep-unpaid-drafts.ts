import Stripe from 'stripe';
import { notifyOrderException, notifyOrderStatus, stripeGateway, sweepUnpaidDrafts, type OrderEffects } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

export const SWEEP_UNPAID_DRAFTS = 'sweep_unpaid_drafts';

/**
 * **Ödeme zamanlayıcısı** (07.18) — ödeme penceresi kapanmış kart taslaklarını sağlayıcıya sorar ve
 * netleştirir: ödendiyse onaylar, banka işliyorsa bekler, ödeme gelmeyecekse ödemeyi ve taslağı kapatır
 * (`sweepUnpaidDrafts` → `reconcileDraftPayment`; karar ve onay yolu ortak katmanda).
 *
 * Neden: siparişe dönüşün tek yolu webhook'tu. Olay gelmediğinde taslak süresiz "onaylanıyor"da kalıyor,
 * stok ayırması düşse de sipariş ne onaylanıyor ne iptal ediliyordu — parası alınmış bir sipariş kimsenin
 * listesinde görünmeden bekleyebilirdi (operasyon listesi de taslakları göstermiyor).
 *
 * **Arka uç Stripe'a YALNIZ SORAR** (kullanıcı kararı 14.09 — `ARCHITECTURE_DECISIONS` Sapma 5 notu):
 * ödeme açmak ve webhook web'de. Anahtar yoksa tur sağlayıcıya sormadan biter; "ödenmedi" sayılmaz.
 *
 * Rezervasyon süpürücüsünden AYRI iş ve bilinçli: o veritabanında satır temizler, bu dışarıya soru sorar —
 * sağlayıcı düştüğünde stok temizliği durmasın, ikisinin sağlığı da ayrı okunsun (`job_run`).
 */
let client: Stripe | null | undefined;

function stripeClient(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  client = key ? new Stripe(key) : null;
  return client;
}

export async function sweepUnpaidDraftsJob(): Promise<Record<string, unknown>> {
  const gateway = stripeGateway(stripeClient());
  if (!gateway) return { skipped: 'no_stripe_key' };

  const db = serviceDb();
  // Onayda sipariş haberi, ödeme geldiğinde mal kalmadıysa iptal haberi — web'in webhook'uyla aynı iki etki.
  const effects: OrderEffects = {
    notifyStatus: (orderId, status) => notifyOrderStatus(db, orderId, status),
    notifyException: (orderId, event, opts) => notifyOrderException(db, orderId, event, opts),
  };
  return sweepUnpaidDrafts(db, { gateway, effects });
}
