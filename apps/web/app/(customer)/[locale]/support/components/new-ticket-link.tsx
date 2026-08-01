import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import type { Messages } from '../support-types';

/**
 * "+ Bize yazın" — hesap başlığının sağ ucu (tasarımın web başlığında dolu zeytin hap).
 *
 * **Mobilde de duruyor** ve bu tasarımdan bir sapma: mobil liste karesinde başlığın sağ yuvası boş
 * çizilmiş ve yeni talep girişi yalnız BOŞ listede (davet kartında) var. Yani bir talebi olan mobil
 * müşterinin ikincisini açacak yolu yok — çıkmaz sokak. Yuva zaten ayrılmış durumda (başlığın
 * ortada kalması ona bağlı), oraya web'in düğmesini koymak en küçük dürüst tamamlama.
 * Kayıt: `design/BACKLOG.md §3`.
 */
interface NewTicketLinkProps {
  label: Messages['newTicket'];
}

export function NewTicketLink({ label }: NewTicketLinkProps) {
  return (
    <Link href="/support/new" className={buttonClass({ size: 'card' })}>
      {label}
    </Link>
  );
}
