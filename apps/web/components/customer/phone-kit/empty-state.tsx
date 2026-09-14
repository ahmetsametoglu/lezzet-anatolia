import type { ReactNode } from 'react';

/*
  BOŞ DURUM — native `EmptyState`in (`apps/mobile/src/components/ui/empty-state.tsx`) web telefon ikizi:
  ikon → Lora başlık → açıklama → eylem, ortalı; dikey nefes 70, yan 30 (native `9xl` · `8xl`).

  İki hâl native'in ikisi. Kabın İÇİNDEKİ hâl (listenin boş hâli) varsayılan; `fill` tam ekran hâli — blok kalan
  yüksekliği 4:6 paylaştıran iki esnek payın arasına oturur (native 16.08: optik merkez geometrik merkezin biraz
  üstündedir; oran başlığın boyuna göre kendini ayarlar). `fill` için kap `flex flex-col` ve yükseklik sahibi olmalı.
  Native'in varsayılanı `fill`dir; burada tersi çünkü telefonun ilk çağıranları kabın içindeydi.
*/

interface EmptyStateProps {
  /** Başlık — çeviri çağıranda çözülür. */
  title: string;
  description?: string;
  /** İkon yuvası — çağıran verir (native ölçü `emptyIcon` 80). */
  icon?: ReactNode;
  /** Eylem yuvası — genellikle birincil hap düğme. */
  action?: ReactNode;
  /** Kalan yüksekliği doldur, bloğu optik merkeze koy (künye). */
  fill?: boolean;
}

export function EmptyState({ title, description, icon, action, fill = false }: EmptyStateProps) {
  const content = (
    <div className="flex flex-col items-center gap-3 px-7.5 py-17.5 text-center">
      {icon}
      <h2 className="font-serif text-card-title-sm text-ink">{title}</h2>
      {description !== undefined && <p className="font-sans text-note leading-[1.6] text-muted">{description}</p>}
      {action}
    </div>
  );
  if (!fill) return content;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-[4]" />
      {content}
      <div className="flex-[6]" />
    </div>
  );
}
