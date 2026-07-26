import type { HTMLAttributes } from 'react';

/**
 * Operasyon kart yüzeyi — "Veri Masası": açık kart zemini, ince çizgi, GÖLGE YOK (Envanter §0).
 * Panel/tablo/boş-durum gibi bloklar bunun üstüne kurulur; iç yerleşim çağırana aittir.
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['overflow-hidden rounded-ops-card border border-ops-line bg-ops-card', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
