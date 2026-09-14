import type { ReactNode } from 'react';

/*
  YAPIŞKAN ALT BAR — native ürün ve paket detayının krem cam barının (`product-detail-screen.tsx` ·
  `package-detail-screen.tsx` `bar`) web telefon ikizi (14.09): ekranın dibine sabit, krem cam (`sand-50/96` +
  bulanıklık), üstte 1,5px mürekkep çizgi, 10 üst · 12 yan dolgu; alt dolgu güvenli alanla 14'ün BÜYÜĞÜ (native:
  ikisi toplanmaz). İçerik çağırandan — adet seçici + düğme ya da sebep satırı. Barın örttüğü yeri sayfa kendi
  sonunda boş bırakır (native `productBarSpace` 108 → `h-27`).
*/

interface StickyBarProps {
  children: ReactNode;
}

export function StickyBar({ children }: StickyBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-ink bg-sand-50/96 px-3 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] backdrop-blur-sm">
      {children}
    </div>
  );
}
