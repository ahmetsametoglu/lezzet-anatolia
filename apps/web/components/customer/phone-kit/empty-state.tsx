import type { ReactNode } from 'react';

/*
  BOŞ DURUM — native `EmptyState`in (`apps/mobile/src/components/ui/empty-state.tsx`) web telefon ikizi:
  ikon → Lora başlık → açıklama → eylem, ortalı; dikey nefes 70, yan 30 (native `9xl` · `8xl`).

  Bugün yalnız bir kabın İÇİNDEKİ hâli çiziliyor (native `fill={false}` — listenin boş hâli). Tam ekran
  hâli (kalan yüksekliği 4:6 paylaşan optik merkez, native 16.08) ilk çağıranıyla gelir.
*/

interface EmptyStateProps {
  /** Başlık — çeviri çağıranda çözülür. */
  title: string;
  description?: string;
  /** İkon yuvası — çağıran verir (native ölçü `emptyIcon` 80). */
  icon?: ReactNode;
  /** Eylem yuvası — genellikle birincil hap düğme. */
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-7.5 py-17.5 text-center">
      {icon}
      <h2 className="font-serif text-card-title-sm text-ink">{title}</h2>
      {description !== undefined && <p className="font-sans text-note leading-[1.6] text-muted">{description}</p>}
      {action}
    </div>
  );
}
