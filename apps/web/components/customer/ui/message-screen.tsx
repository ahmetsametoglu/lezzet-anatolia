import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { Skeleton, SkeletonRegion } from './skeleton';

/**
 * Sayfanın kendisi bir durum ekranı olduğunda (404, 500, davet karşılaması) gövde: simge, üst etiket, başlık, açıklama, eylemler.
 * Liste içindeki boş hâl bu blok değildir, `ui/list-empty.tsx`tir: burası `<h1>` çizer ve sayfada ikinci başlık doğardı.
 */
interface MessageScreenProps {
  device: 'mobile' | 'desktop';
  icon: IconName;
  /** Küçük büyük-harf üst etiket ("404 · Sayfa bulunamadı"). */
  eyebrow: string;
  title: string;
  description: string;
  /** Birincil/ikincil butonlar (CTA satırı). */
  actions: ReactNode;
  /** Ek içerik: güvence bandı, çipler vb. */
  children?: ReactNode;
}

/** Kap; iskelet de bununla çizilir ki hâl gelince ekran yerinden oynamasın. */
function screenClass(device: MessageScreenProps['device']): string {
  return ['flex flex-1 flex-col items-center gap-5 text-center', device === 'mobile' ? 'px-6 py-12' : 'px-12 py-20'].join(' ');
}

export function MessageScreen({ device, icon, eyebrow, title, description, actions, children }: MessageScreenProps) {
  const isMobile = device === 'mobile';
  return (
    <div className={screenClass(device)}>
      <Icon name={icon} size={isMobile ? 36 : 48} className="text-olive" />
      <div className="flex flex-col items-center gap-2.5">
        <span className="font-sans text-eyebrow uppercase text-muted">{eyebrow}</span>
        <h1
          className={[
            'max-w-[660px] text-balance font-serif font-semibold leading-tight text-ink',
            isMobile ? 'text-page-title-sm' : 'text-page-title',
          ].join(' ')}
        >
          {title}
        </h1>
        <p className="max-w-[540px] text-pretty font-sans text-base leading-relaxed text-body">{description}</p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      {children}
    </div>
  );
}

/** Hâli veriden gelen durum ekranının yükleme karesi: hangi simge ve cümlenin geleceği bilinmez, yerleşim bilinir. */
export function MessageScreenSkeleton({ device }: { device: MessageScreenProps['device'] }) {
  const isMobile = device === 'mobile';
  return (
    <SkeletonRegion>
      <div className={screenClass(device)}>
        <Skeleton className={isMobile ? 'size-9 !rounded-full' : 'size-12 !rounded-full'} />
        <div className="flex w-full flex-col items-center gap-2.5">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className={isMobile ? 'h-8 w-4/5' : 'h-11 w-[480px]'} />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <div className="mt-1 flex gap-3">
          <Skeleton className="h-12 w-40 !rounded-pill" />
          <Skeleton className="h-12 w-40 !rounded-pill" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
