import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClass } from './button';

/** Bant/başlık aksiyonu — hedef, `routing.ts` pathnames'ten türeyen tipli yoldur (serbest string değil). */
interface SectionAction {
  label: string;
  href: ComponentProps<typeof Link>['href'];
}

/**
 * §3 · Yerleşim ve bantlar — K13 Bölüm Başlığı · K14 CTA Bandı · K15 B2B Bandı.
 *
 * Üçü aynı dosyada çünkü aynı işi yapıyorlar: sayfayı BÖLÜMLERE ayırmak. Anasayfada doğdular ama
 * katalog, ürün detay ve genel sayfalar da aynı ritmi kullanacak — sayfa dosyasına gömülürlerse
 * her sayfada yeniden yazılır ve ritim sessizce kayar.
 *
 * Cihaz farkı `compact` ile (Sapma 3: `md:` akışkan responsive yok).
 */

interface SectionHeadingProps {
  title: string;
  /** Başlığın yanındaki kısa not ("Stokla sınırlı") — vurgu rengiyle, ikincil ağırlıkta. */
  note?: string;
  /** Sağa yaslı bağlantı ("Tüm katalog →"). */
  action?: SectionAction;
  compact?: boolean;
}

/** K13 · Bölüm Başlığı — başlık + (yan not | sağ aksiyon). İkisi aynı anda verilmez. */
export function SectionHeading({ title, note, action, compact = false }: SectionHeadingProps) {
  return (
    <div className={['flex items-baseline', action ? 'justify-between' : 'gap-3.5'].join(' ')}>
      <h2 className={['font-serif text-ink', compact ? 'text-h2-sm' : 'text-h2'].join(' ')}>{title}</h2>
      {note && <span className={['font-sans font-semibold text-terracotta', compact ? 'text-micro' : 'text-note'].join(' ')}>{note}</span>}
      {action && (
        <Link href={action.href} className={buttonClass({ variant: 'ghost', size: compact ? 'sm' : 'md', className: '!font-bold' })}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

interface CtaBandProps {
  title: string;
  body: string;
  cta: SectionAction;
  compact?: boolean;
}

/** K14 · CTA Bandı — açık yeşil zeminli davet (keşif çağrısı). Masaüstünde yatay, mobilde dikey. */
export function CtaBand({ title, body, cta, compact = false }: CtaBandProps) {
  return (
    <div
      className={[
        'rounded-card bg-olive-bg',
        compact ? 'flex flex-col gap-2 p-[18px]' : 'flex items-center justify-between gap-6 px-10 py-8',
      ].join(' ')}
    >
      <div className="flex flex-col gap-2">
        <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{title}</span>
        <span className={['font-sans text-body/relaxed text-body', compact ? 'text-note' : ''].join(' ')}>{body}</span>
      </div>
      <Link
        href={cta.href}
        className={buttonClass({ fullWidth: compact, size: compact ? 'sm' : 'md', className: compact ? 'mt-1 !py-3' : 'flex-none' })}
      >
        {cta.label}
      </Link>
    </div>
  );
}

interface InviteBandProps {
  title: string;
  body: string;
  cta: SectionAction;
  compact?: boolean;
}

/**
 * K15 · B2B Bandı — kesikli çerçeveli, zeminsiz davet. Kesikli kenar bilinçli: bu bir kampanya
 * değil, "buraya da bakabilirsiniz" tonunda ikincil bir yol (restoran/market ziyaretçisi için).
 */
export function InviteBand({ title, body, cta, compact = false }: InviteBandProps) {
  return (
    <div
      className={[
        'rounded-card border-[1.5px] border-dashed border-sand-500',
        compact ? 'flex flex-col gap-1 p-4' : 'flex items-center justify-between px-8 py-6',
      ].join(' ')}
    >
      <div className="flex flex-col gap-1">
        <span className="font-sans text-body font-bold text-ink">{title}</span>
        <span className="font-sans text-note text-muted">{body}</span>
      </div>
      <Link
        href={cta.href}
        className={buttonClass({ variant: 'ghost', size: compact ? 'sm' : 'md', className: compact ? 'mt-0.5 w-max !font-bold' : '!font-bold' })}
      >
        {cta.label}
      </Link>
    </div>
  );
}
