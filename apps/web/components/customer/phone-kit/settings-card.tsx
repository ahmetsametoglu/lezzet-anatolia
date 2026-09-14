import type { ReactNode } from 'react';

/*
  KUM KART — native hesap ekranının `settingsCard`ı ve `pointsCard`ı (ikisi aynı yüzey: `sand-150` zemin, kart köşe,
  16 dolgu, 8 aralık, başlık kartın İÇİNDE — `apps/mobile/src/screens/account/account-screen.tsx`). Native'de tek
  ekranın stili; web'de hesabın kartları ve iki paylaşılan bileşen (adresler, bağlı sohbetler) çiziyor, o yüzden kitte.

  Başlık Lora `card-title-sm`; sağında isteğe bağlı bir yuva (puan kartının "✦ 120"si, kaydedilenlerin toplu eylemi).
  Kart içi ayraç native'in `settingsDivider`ı: üstte kesikli çizgi, satırlar yapışmasın diye üstten nefes.
*/

/** Kesikli üst çizgi — kart içi ayraçların ve menü satırlarının ortak çizgisi (native `border.base` · `sand-400`). */
export const DASHED_TOP = 'border-t-[1.5px] border-dashed border-sand-400';

interface SettingsCardProps {
  title?: string;
  /** Başlığın sağındaki yuva — tabanda hizalı. */
  aside?: ReactNode;
  children: ReactNode;
}

export function SettingsCard({ title, aside, children }: SettingsCardProps) {
  return (
    <section className="flex flex-col gap-2 rounded-card bg-sand-150 p-4">
      {title !== undefined && (
        <div className="flex items-baseline justify-between gap-2.5">
          <h2 className="font-serif text-card-title-sm text-ink">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Kart içi ayraç — native `settingsDivider` (çizgi · 10 üst dolgu · 4 üst boşluk). */
export function SettingsDivider({ children }: { children: ReactNode }) {
  return <div className={`${DASHED_TOP} mt-1 pt-2.5`}>{children}</div>;
}
