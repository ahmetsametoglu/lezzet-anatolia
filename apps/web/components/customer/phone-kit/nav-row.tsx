import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { DASHED_TOP } from './settings-card';

/*
  GEÇİŞ SATIRI — native müşteri kitinin `NavRow`unun (`apps/mobile/src/screens/customer-kit/nav-row.tsx`) web telefon
  ikizi (14.09): "ikon · başlık · ›". Hesap ekranının menü kartı dört kez kullanıyor. Kartın İÇİNDE durur: ilk satır
  hariç hepsinin üstünde kesikli ayraç (`divider`) — ayraç satırın kendisinde, listenin ilk öğesini bilme sorumluluğu
  çağırana dağılmasın.

  Satır BAĞDIR (başka sayfaya gider; native'de `onPress` + gezinme). Basılı geri bildirim zemin tonu (native `tint`).
  İşaret (›) metindir ve ekran okuyucuya gitmez — bağın adı başlıktır.
*/

interface NavRowProps {
  label: string;
  href: ComponentProps<typeof Link>['href'];
  /** Sol yuva — genellikle bir ikon. */
  icon?: ReactNode;
  /** Üstünde kesikli ayraç (listenin ilk satırı hariç hepsi). */
  divider?: boolean;
}

export function NavRow({ label, href, icon, divider = false }: NavRowProps) {
  return (
    <Link
      href={href}
      className={[
        'flex cursor-pointer items-center gap-2.5 px-4 py-4 transition-colors hover:bg-sand-300/50 active:bg-sand-300',
        divider ? DASHED_TOP : '',
      ].join(' ')}
    >
      {icon}
      <span className="min-w-0 flex-1 font-sans text-control text-ink">{label}</span>
      <span aria-hidden className="font-sans text-icon-sm leading-none text-sand-600">
        ›
      </span>
    </Link>
  );
}
