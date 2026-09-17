import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClass } from './button';
import { Icon } from './icons';

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
  /** Başlığın üstündeki küçük etiket ("SOFRADAN FİKİRLER"); verilmezse başlık tek satırdır. */
  eyebrow?: string;
  /** Başlığın solunda, aynı satırdaki dolu rozet ("STOKLA SINIRLI") — tonun rengini alır. */
  badge?: string;
  /** Renk tonu — fırsat bölümü turuncu, koyu bant (`onDark`) açık yeşil etiket ve krem başlıkla konuşur. */
  tone?: 'olive' | 'terracotta' | 'onDark';
  /** Sağa yaslı bağlantı ("Tüm katalog →"). */
  action?: SectionAction;
  compact?: boolean;
}

/** K13 · Bölüm Başlığı — (üst etiket +) başlık solda, bağlantı sağda. */
export function SectionHeading({ title, eyebrow, badge, tone = 'olive', action, compact = false }: SectionHeadingProps) {
  const accent = tone === 'terracotta' ? 'text-terracotta' : tone === 'onDark' ? 'text-olive-light' : 'text-olive';
  const actionTone =
    tone === 'terracotta' ? '!text-terracotta hover:!text-terracotta-bright' : tone === 'onDark' ? '!text-olive-light hover:!text-sand-50' : '';
  const heading = (
    <h2 className={['font-serif', tone === 'onDark' ? 'text-sand-50' : 'text-ink', compact ? 'text-h2-sm' : 'text-h2'].join(' ')}>{title}</h2>
  );

  return (
    <div className={`flex justify-between gap-3.5 ${badge ? 'items-center' : 'items-baseline'}`}>
      {badge ? (
        <div className="flex items-center gap-4">
          <span
            className={`flex-none rounded-badge px-3.25 py-1.5 font-sans text-caps-label font-bold tracking-[0.1em] text-white uppercase ${tone === 'terracotta' ? 'bg-terracotta' : 'bg-olive'}`}
          >
            {badge}
          </span>
          {heading}
        </div>
      ) : eyebrow ? (
        <div className="flex flex-col gap-1">
          <span className={`font-sans text-note font-semibold tracking-[0.12em] uppercase ${accent}`}>{eyebrow}</span>
          {heading}
        </div>
      ) : (
        heading
      )}
      {action && (
        <Link href={action.href} className={buttonClass({ variant: 'ghost', size: compact ? 'sm' : 'md', className: `flex-none !font-bold ${actionTone}` })}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

interface BandProps {
  /** Ekran genişliğine yayılan zemin ve çizgi sınıfları (`bg-*`, `border-*`). */
  surface: string;
  /** Bölümün kendi yerleşimi — boşluk ve akış; içerik sayfa kabuğunun (1360px) içinde kalır. */
  className?: string;
  children: ReactNode;
}

/**
 * Tam genişlik bant — zemin ve çizgi ekranın iki kenarına uzanır, içerik kabukta kalır. Arka katman `100vw`
 * olduğu için kaydırma çubuğu kadar taşar; taşmayı çerçevenin kökündeki `overflow-x-clip` keser.
 */
export function Band({ surface, className = '', children }: BandProps) {
  return (
    <section className={`relative isolate ${className}`}>
      <span aria-hidden className={`absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 ${surface}`} />
      {children}
    </section>
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
        'rounded-card border border-olive-line bg-olive-bg',
        compact ? 'flex flex-col gap-2 p-[18px]' : 'flex items-center justify-between gap-6 px-10 py-8',
      ].join(' ')}
    >
      <div className="flex flex-col gap-2">
        <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{title}</span>
        <span className={['font-sans text-body/relaxed text-body', compact ? 'text-note' : ''].join(' ')}>{body}</span>
      </div>
      <Link
        href={cta.href}
        /* `!py-3` KALDIRILDI (03.08): sabit `h-*` yanında dikey ped ölü yazıdır — butonun kendi
           künyesi de bu tuzağı anlatıyor. Mobil yükseklik artık kademeden geliyor (K2 → 48px). */
        className={buttonClass({ compact, fullWidth: compact, size: compact ? 'sm' : 'md', className: compact ? 'mt-1' : 'flex-none' })}
      >
        {cta.label}
        <Icon name="sparkle" size={16} />
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
 * Bandın tamamı bağlantıdır; sağdaki çağrı onun etiketidir, bağ içinde bağ kurulmaz.
 */
export function InviteBand({ title, body, cta, compact = false }: InviteBandProps) {
  return (
    <Link
      href={cta.href}
      className={[
        'group cursor-pointer rounded-card border-[1.5px] border-dashed border-sand-500 transition-colors hover:border-olive',
        compact ? 'flex flex-col gap-1 p-4' : 'flex items-center justify-between px-8 py-6',
      ].join(' ')}
    >
      <span className="flex flex-col gap-1">
        <span className={['font-sans font-bold text-ink', compact ? 'text-body' : 'text-lead leading-tight'].join(' ')}>{title}</span>
        <span className={['font-sans text-muted', compact ? 'text-note' : 'text-body-sm'].join(' ')}>{body}</span>
      </span>
      <span className={['font-sans font-bold text-olive transition-colors group-hover:text-olive-dark', compact ? 'mt-0.5 text-body-sm' : 'text-body'].join(' ')}>
        {cta.label}
      </span>
    </Link>
  );
}
