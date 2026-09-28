import { MoneyMovementService, OrderService, SettingsService, type serviceDb } from '@lezzet/database';
import { PAYMENT_TERM_DAYS_DEFAULT, PAYMENT_TERM_DAYS_KEY, creditPosition, isOverdue } from '@lezzet/domain-core';
import type { MoneyMovement, Order } from '@lezzet/types';

/**
 * Ödeme karnesi — vade ve limit kararının dayanağı; karar desteğidir, otomasyon değil: ölçüm üretir, kararı admin verir. Kurallar
 * motordan gelir (`creditPosition`, `isOverdue`), burası girdiyi toplar ve ölçülemeyen yerde `null` döner.
 */

/**
 * Karnenin baktığı sipariş penceresi; tavan ekranda yazılır ("son 50 siparişte"), çünkü iki yıl önceki alışkanlık bugünün limit
 * kararına girdi değildir. Açık bakiye pencereye bağlı değil, borcun tamamından okunur.
 */
export const SCORECARD_WINDOW = 50;

interface CustomerScorecard {
  /** Ödenmemiş vadeli siparişlerin toplamı (kuruş) — borcun TAMAMINDAN, pencereden değil. */
  openBalanceCents: number;
  /** En az bir sipariş vadesini aştı mı — checkout freninin de ölçütü. */
  hasOverdue: boolean;
  /** Vadesi geçmiş açık sipariş sayısı. */
  overdueCount: number;
  /**
   * Ortalama ödeme günü: sipariş tarihinden tahsilat gününe geçen gün. `null` = ölçülemedi; sıfır yazılmaz, çünkü "0 gün" anında
   * ödüyor diye okunurdu.
   */
  avgPaymentDays: number | null;
  /** Ortalamanın kaç siparişten çıktığı — tek siparişlik bir ortalama karar dayanağı değildir. */
  paidOrderCount: number;
  /**
   * Vadeyi aşarak ödenmiş sipariş sayısı — geçmişteki geciktirme alışkanlığı. `overdueCount`tan ayrı, çünkü o yalnız şu anki açık
   * borcu sayar ve borcunu geç kapatan müşteri "gecikme yok" görünürdü.
   */
  latePaymentCount: number;
  /** Yürürlükteki vade süresi (gün): müşteriye özel, yoksa ayardan. */
  termDays: number;
  /** Ayardan gelen GENEL varsayılan — form "boş bırakırsan bu geçerli" derken bunu yazar. */
  defaultTermDays: number;
}

type Db = ReturnType<typeof serviceDb>;

/**
 * Vadesi geçmiş açık borcu olan müşteri kimlikleri; açık vadeli siparişlerin tamamı tek turda okunur ve sayılan şey sipariş değil
 * müşteridir. Müşteriye özel vade burada okunmaz, genel varsayılan kullanılır; kesin sayı müşteri kartında durur.
 */
export async function readOverdueCustomerIds(db: Db): Promise<Set<string>> {
  const [open, termDays] = await Promise.all([
    new OrderService(db).listOpenCredit(),
    new SettingsService(db).getNumber(PAYMENT_TERM_DAYS_KEY, PAYMENT_TERM_DAYS_DEFAULT),
  ]);
  const now = new Date();
  const gecikenler = new Set<string>();
  for (const order of open) {
    if (order.customerId && isOverdue(order, termDays, now)) gecikenler.add(order.customerId);
  }
  return gecikenler;
}

export async function readCustomerScorecard(
  db: Db,
  customerId: string,
  customerTermDays: number | null,
): Promise<CustomerScorecard> {
  const orders = new OrderService(db);

  const [openCredit, recent, termSetting] = await Promise.all([
    orders.listOpenCreditByCustomer(customerId),
    orders.listByCustomer(customerId, { limit: SCORECARD_WINDOW }),
    new SettingsService(db).getNumber(PAYMENT_TERM_DAYS_KEY, PAYMENT_TERM_DAYS_DEFAULT),
  ]);

  // Müşteriye özel vade süresi ayarı EZER: "bu firmaya 45 gün" bir anlaşmadır, genel varsayılan değil.
  const termDays = customerTermDays ?? termSetting;
  const now = new Date();

  const position = creditPosition(openCredit, termDays, now);
  const overdueCount = openCredit.filter((o) => isOverdue(o, termDays, now)).length;

  // İPTAL edilen sipariş ödeme ölçümüne girmez: tahsilatı sonradan iade edilmiş olabilir ve "şu kadar
  // günde ödedi" ölçümü orada anlamını yitirir.
  const olculebilir = recent.rows.filter((o) => o.status !== 'cancelled');
  const movements = await new MoneyMovementService(db).listByOrders(olculebilir.map((o) => o.id));
  const { avgPaymentDays, paidOrderCount, latePaymentCount } = paymentTiming(olculebilir, movements, termDays);

  return {
    openBalanceCents: position.openBalanceCents,
    hasOverdue: position.hasOverdue,
    overdueCount,
    avgPaymentDays,
    paidOrderCount,
    latePaymentCount,
    termDays,
    defaultTermDays: termSetting,
  };
}

/**
 * "Ne zaman ödedi": sipariş tarihi ile ilk tahsilatın `value_date`'i arası; ilk tahsilat, çünkü taksitle ödeyen müşteri ödemeye o gün
 * başlamıştır. Tahsilatı olmayan sipariş ortalamaya girmez, yoksa karneyi olduğundan iyi gösterirdi.
 */
export function paymentTiming(
  orders: readonly Pick<Order, 'id' | 'createdAt'>[],
  movements: readonly Pick<MoneyMovement, 'direction' | 'orderId' | 'valueDate'>[],
  termDays: number,
): { avgPaymentDays: number | null; paidOrderCount: number; latePaymentCount: number } {
  const firstCollection = new Map<string, string>();
  for (const m of movements) {
    // Yalnız İÇERİ giren hareket tahsilattır; iade (dışarı) ödeme günü değildir.
    if (m.direction !== 'in' || !m.orderId) continue;
    const current = firstCollection.get(m.orderId);
    if (!current || m.valueDate < current) firstCollection.set(m.orderId, m.valueDate);
  }

  const gunler: number[] = [];
  for (const order of orders) {
    const paidAt = firstCollection.get(order.id);
    if (!paidAt) continue;
    const gun = Math.round((new Date(paidAt).getTime() - new Date(order.createdAt).getTime()) / 86_400_000);
    // Negatif olamaz: ön ödeme siparişle aynı gün sayılır (tarih yuvarlaması eksiye düşebiliyor).
    gunler.push(Math.max(0, gun));
  }

  // Vadeyi aşarak ödenenler ayrı sayılır: geç ödenmiş tek sipariş, zamanında ödemelerin ortalamasında kaybolurdu.
  const latePaymentCount = gunler.filter((g) => g > termDays).length;
  if (gunler.length === 0) return { avgPaymentDays: null, paidOrderCount: 0, latePaymentCount: 0 };
  return {
    avgPaymentDays: Math.round(gunler.reduce((a, b) => a + b, 0) / gunler.length),
    paidOrderCount: gunler.length,
    latePaymentCount,
  };
}
