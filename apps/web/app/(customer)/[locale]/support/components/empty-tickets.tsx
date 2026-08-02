import { ListEmpty } from '@/components/customer/ui/list-empty';
import type { Messages } from '../support-types';

/**
 * Boş liste (tasarım: "Talebiniz yok"). Masaüstü ve mobil aynı parçayı kullanır — metin de ölçü de
 * tasarımda tek bir kare olarak çizili, iki kopya yazmanın gerekçesi yok.
 *
 * Çıkışı olan bir boş hâl: emoji + iki cümle + davet. "Hiç talebiniz yok" bir eksiklik değil, iyi
 * haberdir; ekran onu bir hata gibi göstermez.
 *
 * İç dizilim paylaşılan `ListEmpty`den gelir (K1); buranın işi yalnız ekranı dolduran kabuk —
 * boş hâl tepeye yapışıp altını boş bırakmamalı.
 */
interface EmptyTicketsProps {
  t: Messages;
}

export function EmptyTickets({ t }: EmptyTicketsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-10">
      <ListEmpty compact icon="💬" title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/support/new' }} />
    </div>
  );
}
