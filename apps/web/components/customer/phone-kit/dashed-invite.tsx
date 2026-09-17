import type { ComponentProps } from 'react';
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

interface DashedInviteProps {
  href: ComponentProps<typeof Link>['href'];
  title: string;
  description: string;
  tone?: InviteTone;
}

export function DashedInvite({ href, title, description, tone = 'terracotta' }: DashedInviteProps) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className={[
        'flex cursor-pointer items-center gap-2.5 rounded-card border-[1.5px] border-dashed px-4 py-3.5 transition-transform hover:opacity-90 active:scale-[0.98]',
        t.border,
      ].join(' ')}
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
