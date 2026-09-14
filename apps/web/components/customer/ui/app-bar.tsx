import type { ReactNode } from 'react';

/**
 * Mobil webin BAŞLIK ÇUBUĞU — native `AppBar`ın (`apps/mobile/src/components/ui/app-bar.tsx`) web
 * ikizi (kullanıcı kararı 14.09: mobil webin başlık sistemi native'inkiyle aynı). Sol yuvada geri
 * düğmesi, ortada başlık, sağ yuvada ekranın kendi eylemi ("+ Yeni" gibi). Sepet burada DEĞİL:
 * sekme çubuğunda.
 *
 * Native'in ölçüleriyle: krem cam (%96 krem + 8px bulanıklık), altında 1,5px MÜREKKEP çizgi, 8/14
 * dolgu, 10 aralık, 17px serif başlık. Yapışkan — native'in üç durak kuralında "kaydırırken
 * erişilebilir kalması gereken" geri yolu ve eylem elin altında kalır (`design/KARARLAR.md` 16.08).
 */
interface AppBarProps {
  title: string;
  /** Sol yuva — `BackButton`. */
  left?: ReactNode;
  /** Sağ yuva — ekranın kendi eylemi. */
  right?: ReactNode;
}

export function AppBar({ title, left, right }: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex flex-none items-center gap-2.5 border-b-[1.5px] border-ink bg-cream/96 px-3.5 py-2 backdrop-blur-sm">
      {left}
      <span className="min-w-0 flex-1 truncate font-serif text-[17px] font-semibold text-ink">{title}</span>
      {right && <div className="flex flex-none items-center">{right}</div>}
    </header>
  );
}
