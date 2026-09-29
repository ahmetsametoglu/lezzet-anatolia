import type { CustomerOrderStatus } from '@lezzet/types';

/*
  Sipariş durum rozeti, native `OrderStatusTag`in web telefon ikizi: yumuşak zemin, koyu yazı, 2° eğik. Durum kümesi şemadan gelir
  ve `satisfies` yeni durağı derlemede yakalar; tonlar native'in tablosu, metin çağırandan.
*/

const TONE = {
  awaiting_payment: 'bg-honey-bg text-honey',
  received: 'bg-olive-bg text-olive-dark',
  preparing: 'bg-terracotta-bg text-terracotta',
  ready_for_pickup: 'bg-terracotta-bg text-terracotta',
  on_the_way: 'bg-terracotta-bg text-terracotta',
  delivered: 'bg-closed-bg text-closed',
  cancelled: 'bg-error-bg text-error',
  returning: 'bg-terracotta-bg text-terracotta',
} as const satisfies Record<CustomerOrderStatus, string>;

interface OrderStatusTagProps {
  status: CustomerOrderStatus;
  /** Durumun okunur adı — çeviri çağıranda çözülür. */
  label: string;
}

export function OrderStatusTag({ status, label }: OrderStatusTagProps) {
  return (
    <span className={['inline-block flex-none rotate-2 rounded-badge px-3 py-1.5 font-sans text-micro font-bold', TONE[status]].join(' ')}>
      {label}
    </span>
  );
}
