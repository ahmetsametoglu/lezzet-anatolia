import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import type { Messages } from '../support-types';

/**
 * Boş liste (tasarım: "Talebiniz yok"). Masaüstü ve mobil aynı parçayı kullanır — metin de ölçü de
 * tasarımda tek bir kare olarak çizili, iki kopya yazmanın gerekçesi yok.
 *
 * Çıkışı olan bir boş hâl: emoji + iki cümle + davet. "Hiç talebiniz yok" bir eksiklik değil, iyi
 * haberdir; ekran onu bir hata gibi göstermez.
 */
interface EmptyTicketsProps {
  t: Messages;
}

export function EmptyTickets({ t }: EmptyTicketsProps) {
  return (
    // `h-full` + ortalama: ekranı dolduran bir yüzeydeyiz, boş hâl tepeye yapışıp altını boş
    // bırakmamalı.
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4 py-10 text-center">
      <span className="text-[32px] leading-none">💬</span>
      <span className="font-serif text-card-title-sm leading-tight font-semibold text-ink">{t.empty.title}</span>
      <span className="font-sans text-note leading-relaxed text-body">{t.empty.body}</span>
      <Link href="/support/new" className={buttonClass({ className: 'mt-1' })}>
        {t.empty.cta}
      </Link>
    </div>
  );
}
