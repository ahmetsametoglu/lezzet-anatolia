import type { ReactNode } from 'react';

/*
  YAPIŞKAN ALT BAR — native ürün, paket ve tarif detayının krem cam barının (`product-detail-screen.tsx` ·
  `package-detail-screen.tsx` · `recipe-detail-screen.tsx` `bar`) web telefon ikizi (14.09): ekranın dibine sabit,
  krem cam (`sand-50/96` + bulanıklık), üstte 1,5px mürekkep çizgi; alt dolgu güvenli alanla kendi payının BÜYÜĞÜ
  (native: ikisi toplanmaz). İçerik çağırandan — adet seçici + düğme ya da sebep satırı ya da tek düğme. Barın
  örttüğü yeri sayfa kendi sonunda boş bırakır (native `productBarSpace` · `recipeBarSpace` 108 → `h-27`).

  İki dolgu native'in iki barından: ürün ve paket (adet + düğme) 10 üst · 12 yan · alt 14; tarif (tek düğme)
  12 üst · 18 yan · alt 26 — native tarif barının "ferah yön" kararı.
*/

interface StickyBarProps {
  children: ReactNode;
  /** `tight` — ürün ve paket barı (varsayılan); `roomy` — tarif barı. */
  spacing?: 'tight' | 'roomy';
}

const SPACING: Record<NonNullable<StickyBarProps['spacing']>, string> = {
  tight: 'px-3 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))]',
  roomy: 'px-4.5 pt-3 pb-[max(26px,env(safe-area-inset-bottom))]',
};

export function StickyBar({ children, spacing = 'tight' }: StickyBarProps) {
  return (
    <div className={['fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-ink bg-sand-50/96 backdrop-blur-sm', SPACING[spacing]].join(' ')}>
      {children}
    </div>
  );
}
