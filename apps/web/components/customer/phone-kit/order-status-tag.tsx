import type { CustomerOrderStatus } from '@lezzet/types';

/*
  SİPARİŞ DURUM ROZETİ — native `OrderStatusTag`in (`apps/mobile/src/screens/customer-kit/order-status-tag.tsx`) web
  telefon ikizi (14.09): yumuşak zemin, koyu yazı, 2° eğik; `micro` · 700, rozet köşe, 6/12 dolgu.

  Durum kümesi şemadan (`CustomerOrderStatus`): bir durak eklendiğinde bu dosya derlemede kırılır (`satisfies`). Tonlar
  native'in tablosu — alındı zeytin · hazırlanıyor, yolda ve iade terracotta (süreç işliyor; iadeyi kapanmış ailesine
  koymak bitmiş gibi okuturdu) · teslim edildi kapanmış · iptal hata. Metin çağırandan gelir.
*/

const TONE = {
  received: 'bg-olive-bg text-olive-dark',
  preparing: 'bg-terracotta-bg text-terracotta',
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
