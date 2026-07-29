import type { OrderStatus } from '@lezzet/types';
import { allowedTransitions, isTerminal } from './status-machine';

/**
 * Siparişte **hangi kararın verilebileceği** — SAF karar, DB'siz (09.7 · "Kararlar" bloğu).
 *
 * Durum geçişinden ayrı bir soru: geçiş "sipariş nereye gidebilir"i, karar "operatör ne yapabilir"i
 * söyler. İkisi bazen aynı yere çıkar (iptal hem karar hem geçiştir), bazen çıkmaz — kısmi karşılama
 * durumu HİÇ değiştirmez, yalnız malın ve paranın gerçeğini düzeltir.
 *
 * **Ayıran çizgi teslimdir**, çünkü mal nerede olduğuna göre iki farklı iş yapılıyor:
 * - mal daha çıkmadıysa → **kısmi karşılama**: eksik gideni yazarsın, ayrılan stok serbest kalır,
 *   tahsil edilecek tutar düşer (para henüz alınmamışsa hiç hareket olmaz)
 * - mal çıktıysa → **iade**: para geri gider ve malın akıbeti ayrıca kararlaştırılır (raf/imha/
 *   müşteride, DOMAIN §8)
 *
 * Aynı ekranda ikisini birden sunmak, operatöre "bu mal gitti mi?" sorusunu her seferinde kendi
 * kafasından yanıtlatırdı; kayıt zaten biliyor.
 */
export type OrderDecision = 'partial_fulfillment' | 'refund' | 'cancel';

/** Malın müşteriye ULAŞMIŞ sayıldığı durumlar — iade eksenini açan çizgi. */
const DELIVERED_STATUSES: readonly OrderStatus[] = ['delivered', 'completed', 'returned'];

export function allowedDecisions(status: OrderStatus): readonly OrderDecision[] {
  // Taslak bir sipariş değil, yarım bir sepettir: üzerinde karar verilmez.
  if (status === 'draft') return [];

  const decisions: OrderDecision[] = [];

  if (DELIVERED_STATUSES.includes(status)) {
    // Kapanmış kayıtta bile iade açık kalır: şikâyet teslimden günler sonra gelir ve kaydın
    // kapanmış olması paranın geri gitmesini engellemez (DOMAIN §8).
    decisions.push('refund');
  } else if (!isTerminal(status)) {
    decisions.push('partial_fulfillment');
  }

  // İptal bir GEÇİŞTİR; izni burada yeniden yazmayız, makineye sorarız.
  if (allowedTransitions(status).includes('cancelled')) decisions.push('cancel');

  return decisions;
}
