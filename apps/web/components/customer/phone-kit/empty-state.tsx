import type { ReactNode } from 'react';

/*
  Native `EmptyState`in web telefon ikizi; `fill` hâli kalan yüksekliği 4:6 paylaştıran iki esnek payın arasına oturur, çünkü optik
  merkez geometrik merkezin biraz üstündedir. Varsayılan kap içi hâldir; `fill` için kap `flex flex-col` ve yükseklik sahibi olmalı.
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
      {description !== undefined && <p className="font-sans text-note leading-[1.6] text-body">{description}</p>}
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
