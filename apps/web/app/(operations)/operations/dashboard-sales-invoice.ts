import { parisDateOf } from '@lezzet/helper';
import type { QueueFact } from './dashboard-read';

/**
 * Onay bekleyen satış faturası panonun "Bugün" kümesinde: fatura teslimde kesilmeli, onaylanmadan geceyi geçiren fatura ertesi sabah
 * sayılır. Gün Paris takvimindedir; aynı gün açılan fatura sayılmaz.
 */
export function salesInvoiceFact(awaiting: ReadonlyArray<{ createdAt: string }>, scope: { today: string; href: string }): QueueFact | null {
  const overnight = awaiting.filter((invoice) => parisDateOf(new Date(invoice.createdAt)) < scope.today).length;
  if (overnight === 0) return null;
  return {
    key: 'sales-invoice-approval',
    group: 'today',
    count: overnight,
    title: 'Satış faturası onay bekliyor',
    stamp: 'dünden kalan',
    detail: 'Fatura teslimde kesilmeli; eksik bilgi müşteri kaydında tamamlanır',
    tone: 'amber',
    link: { label: 'Faturalar →', href: scope.href },
  };
}
