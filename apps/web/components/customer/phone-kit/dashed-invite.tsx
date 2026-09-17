import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/*
  Native kesikli davet kutusunun web ikizi: liste öğesi değil davet. `terracotta` yeni bir şey teklif eder, `olive` başka bir
  yüzeye çağırır; ayrım "biri sönük" diye değil "ikisi ayrı yere götürüyor" diye kurulu.
*/

type InviteTone = 'terracotta' | 'olive';

const TONE: Record<InviteTone, { border: string; ink: string }> = {
  terracotta: { border: 'border-terracotta', ink: 'text-terracotta' },
  olive: { border: 'border-olive-line', ink: 'text-olive-dark' },
};

const BOX = 'rounded-card border-[1.5px] border-dashed px-4 py-3.5';

interface InviteText {
  title: string;
  description: string;
  tone?: InviteTone;
}

/** `href` verilirse metin solda, işaret sağda ve kutunun tamamı basılır; `action` verilirse üçü alt alta durur ve eylem düğmededir. */
type DashedInviteProps = InviteText & ({ href: ComponentProps<typeof Link>['href'] } | { action: ReactNode });

export function DashedInvite(props: DashedInviteProps) {
  const { title, description, tone = 'terracotta' } = props;
  const t = TONE[tone];
  if ('action' in props) {
    return (
      <div className={`flex flex-col gap-2 ${BOX} ${t.border}`}>
        <div className="flex flex-col gap-1">
          <span className={`font-sans text-control ${t.ink}`}>{title}</span>
          <span className="font-sans text-body-sm leading-[1.6] text-muted">{description}</span>
        </div>
        <span className="self-start">{props.action}</span>
      </div>
    );
  }
  const { href } = props;
  return (
    <Link
      href={href}
      className={`flex cursor-pointer items-center gap-2.5 transition-transform hover:opacity-90 active:scale-[0.98] ${BOX} ${t.border}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={['font-sans text-control', t.ink].join(' ')}>{title}</span>
        <span className="font-sans text-body-sm leading-[1.6] text-muted">{description}</span>
      </span>
      <span aria-hidden className={['font-sans text-icon-sm leading-none', t.ink].join(' ')}>
        ›
      </span>
    </Link>
  );
}
