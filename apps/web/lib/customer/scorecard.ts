import { MoneyMovementService, OrderService, SettingsService, type serviceDb } from '@lezzet/database';
import { creditPosition, isOverdue } from '@lezzet/domain-core';
import type { MoneyMovement, Order } from '@lezzet/types';

/**
 * ÖDEME KARNESİ (09.9) — vade/limit kararının dayanağı.
 *
 * **Karar desteğidir, otomasyon değildir** (tasarım §6): ekran "önerilen limit" dayatmaz, sayıyı
 * gösterir ve kararı admin verir. Bu yüzden burada bir puan/skor üretilmez — ölçüm üretilir.
 *
 * Kuralların hiçbiri BURADA yazılmaz: açık bakiye `creditPosition`'dan, gecikme ölçütü
 * `isOverdue`'dan gelir. Bu dosyanın işi motorun istediği girdiyi toplamak, ölçümü yapmak ve
 * ölçülemeyen yerde `null` dönmek.
 */

/** Vade süresi ayarı — checkout, sipariş detayı ve bu karne AYNI anahtarı okur. */
const PAYMENT_TERM_KEY = 'payment_term_days';
const PAYMENT_TERM_DEFAULT = 30;

/**
 * Karnenin baktığı sipariş penceresi.
 *
 * Tavan var ve GÖRÜNÜR: ekran "son 50 siparişte" diye yazar. Sessiz bir tavan, kaydırılmayan bir
 * listenin kuyruğunu yutmakla aynı hata olurdu (CLAUDE.md §1). Pencere ayrıca doğru olan: iki yıl
 * önceki ödeme alışkanlığı bugünün limit kararına girdi değildir.
 *
 * Açık bakiye bu pencereye BAĞLI DEĞİL — o, borcun tamamından okunur (`listOpenCreditByCustomer`).
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
   * Ortalama ödeme günü: sipariş tarihinden tahsilat gününe kaç gün geçmiş (pozitif = o kadar gün
   * sonra ödedi). **`null` = ölçülemedi** — tahsilat hareketi hiç yoksa. Sıfır YAZILMAZ: "0 gün"
   * "anında ödüyor" diye okunur ve vade kararını tam ters yöne çekerdi (CLAUDE.md §1).
   */
  avgPaymentDays: number | null;
  /** Ortalamanın kaç siparişten çıktığı — tek siparişlik bir ortalama karar dayanağı değildir. */
  paidOrderCount: number;
  /**
   * Vadeyi AŞARAK ödenmiş sipariş sayısı (pencere içinde) — "kaç kez geciktirdi".
   *
   * `overdueCount`tan AYRI ve ikisi de gerekli: o "şu an vadesi geçmiş açık borç", bu "geçmişte
   * geciktirme alışkanlığı". Yalnız ilki gösterilirse 20 gün geç ödeyip borcunu kapatmış kronik
   * gecikmeli müşteri "gecikme: yok" görünür ve limiti yükseltilir.
   */
  latePaymentCount: number;
  /** Yürürlükteki vade süresi (gün): müşteriye özel, yoksa ayardan. */
  termDays: number;
  /** Ayardan gelen GENEL varsayılan — form "boş bırakırsan bu geçerli" derken bunu yazar. */
  defaultTermDays: number;
}

type Db = ReturnType<typeof serviceDb>;

/**
 * Vadesi geçmiş açık borcu olan MÜŞTERİ kimlikleri (09.9).
 *
 * İki tüketen var ve ikisi de aynı kümeyi istiyor: başlığın "N gecikmiş vade" sayacı ve listedeki
 * kırmızı "Gecikmiş" rozeti. Sayfa ile sonraki-sayfa action'ı ayrı hesaplasaydı rozet bir sayfada
 * görünüp diğerinde kaybolurdu.
 *
 * Müşteri başına sorgu YOK: açık vadeli siparişlerin TAMAMI tek turda okunur (küme açık borçtur,
 * doğal tavanı vardır) ve gecikme ölçütü motora sorulur. Sayılan şey SİPARİŞ değil MÜŞTERİ — üç
 * siparişi geciken bir firma "3 gecikme" diye okunursa operatör üç ayrı iş sanır.
 *
 * Müşteriye özel vade süresi burada OKUNMUYOR ve bu bilinçli bir yaklaşıklık: 312 müşterinin
 * profilini yalnız bir rozet için çekmek listenin okumasını ikiye katlardı. Genel varsayılan
 * kullanılıyor; kesin sayı müşteri kartında (özel süresiyle) duruyor.
 */
export async function readOverdueCustomerIds(db: Db): Promise<Set<string>> {
  const [open, termDays] = await Promise.all([
    new OrderService(db).listOpenCredit(),
    new SettingsService(db).getNumber(PAYMENT_TERM_KEY, PAYMENT_TERM_DEFAULT),
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
    new SettingsService(db).getNumber(PAYMENT_TERM_KEY, PAYMENT_TERM_DEFAULT),
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
 * "Ne zaman ödedi" ölçümü: siparişin tarihi ile İLK tahsilat hareketinin `value_date`'i arası.
 *
 * `value_date` seçildi, `created_at` değil: paranın gerçekten hareket ettiği gün odur (şemanın kendi
 * notu). Kayıt günü geriden gelebilir ve ödeme alışkanlığını olduğundan kötü gösterirdi.
 *
 * İLK tahsilat alınıyor: kısmi ödenen siparişte müşteri ödemeye o gün başlamıştır. Son tahsilatı
 * almak, taksitle ödeyen müşteriyi "çok geç ödedi" diye damgalardı.
 *
 * Vade süresi ORTALAMAYA girmez ama gecikme SAYIMINA girer: ortalama "kaç günde ödedi"dir, sayım
 * "kaç kez vadeyi aştı". İkisi ayrı sorular ve tek sayıya sıkıştırılamaz.
 *
 * Tahsilat hareketi olmayan sipariş ORTALAMAYA GİRMEZ — henüz ödenmemiş bir siparişi "0 gün" sayarak
 * ortalamayı aşağı çekmek, karneyi olduğundan iyi gösterirdi.
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

  // Vadeyi aşarak ödenenler AYRI sayılır: ortalama "kaç günde ödedi", bu "kaç kez geciktirdi". İkisi
  // tek sayıya sıkıştırılamaz — 40 gün gecikmiş bir sipariş, dokuz zamanında ödemenin ortalamasında
  // kaybolur ama alışkanlık olarak kaybolmamalı.
  const latePaymentCount = gunler.filter((g) => g > termDays).length;
  if (gunler.length === 0) return { avgPaymentDays: null, paidOrderCount: 0, latePaymentCount: 0 };
  return {
    avgPaymentDays: Math.round(gunler.reduce((a, b) => a + b, 0) / gunler.length),
    paidOrderCount: gunler.length,
    latePaymentCount,
  };
}
