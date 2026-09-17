import { ListEmpty } from '@/components/customer/ui/list-empty';
import type { Messages } from '../support-types';

/**
 * Boş talep listesi: bir eksiklik değil iyi haber, bu yüzden çıkışı olan bir davet. Kabuk ekranı doldurur ki boş hâl tepeye yapışıp
 * altını boş bırakmasın.
 */
interface EmptyTicketsProps {
  t: Messages;
}

export function EmptyTickets({ t }: EmptyTicketsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10">
      <ListEmpty compact icon="chat"title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/support/new' }} />
    </div>
  );
}
