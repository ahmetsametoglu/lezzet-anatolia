import { notifyOrderStatus, type OrderEffects } from '@lezzet/application';
import type { Db } from '@lezzet/database';

/**
 * Durum geçişinin yan etkileri — webin `webOrderEffects`inin mobil ikizi (`apps/web/lib/order/
 * transition.ts`). İkisi de AYNI paket kapılarını çağırıyor; ayrışan bir kural yok, yalnız `db`
 * bağlanıyor (`placeOrder`ın `bundles` portundaki desen).
 *
 * ── TEK YERDE, ÇÜNKÜ ÜÇ UÇ OKUYOR (03.09) ───────────────────────────────────
 * `checkout.ts`in içinde doğdu; kurye uçları (sefer başlatma · geç kutu yükleme · kapıda teslim)
 * de aynı portu geçirmeye başlayınca dosyanın dışına çıktı. İki yüzeyin ikisi de kendi nüshasını
 * tutsaydı biri bir gün ötekinden ayrılırdı (CLAUDE §1) — ve ayrıştığı gün müşteri hangi uçtan
 * sipariş verdiğine göre farklı haber alırdı.
 *
 * `refunder` BİLEREK yok: sağlayıcı iadesi `stripe` istemcisi ister ve sipariş AÇMA ile kapıda
 * teslim zincirinde iade diye bir adım yoktur. Kayıtsız port sessiz kalmaz — kapı süreç başına bir
 * kez uyarır (`application/order/effects.ts` → `warnMissing`).
 *
 * **`rewardDelivered` PORTU KALKTI (17.9 · web şeridi).** Sipariş puanı kaldırıldı (kullanıcı
 * kararı 11.08) ve getirenin ödülü teslimattan ÖDEMEYE taşındı; ödül artık
 * `application/order/payment.ts` → `finalize` içinde, yani bu uçlardan geçen ödemeli siparişte de
 * kendiliğinden yazılıyor. Gerekçe: `docs/talep/not-mobil-davet-baglantisi.md`.
 */
export function mobileOrderEffects(db: Db): OrderEffects {
  return {
    notifyStatus: (orderId, status) => notifyOrderStatus(db, orderId, status),
  };
}
