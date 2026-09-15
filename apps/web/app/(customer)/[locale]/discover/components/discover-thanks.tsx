import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { Link } from '@/i18n/navigation';

interface DiscoverThanksProps {
  title: string;
  body: string;
  likesLabel: string;
  /** Kazanılan puan cümlesi; puan yazılmadıysa `null` ve rozet çizilmez. */
  award: string | null;
  catalog: string;
}

/** Girişli müşterinin tur sonu (tasarımın bitiş hâli): teşekkür, beğeni sayısı, kazanılan puan ve kataloğa dönüş. */
export function DiscoverThanks({ title, body, likesLabel, award, catalog }: DiscoverThanksProps) {
  return (
    <div className="flex flex-col items-center gap-3.5 px-9 py-20 text-center">
      <span className="grid size-22 animate-[pop_0.5s_ease] place-items-center rounded-full bg-olive-bg text-ink">
        <Icon name="sparkle" size={38} />
      </span>
      <h1 className="font-serif text-h2-sm text-ink">{title}</h1>
      <p className="font-sans text-helper font-bold text-olive-dark">{likesLabel}</p>
      <p className="font-sans text-note leading-[1.55] text-body">{body}</p>
      {award !== null && <span className="rounded-card bg-terracotta-bg px-4.5 py-2.25 font-sans text-note font-bold text-terracotta">{award}</span>}
      <Link href="/catalog" className={buttonClass({ size: 'md', className: 'mt-1.5' })}>
        {catalog}
      </Link>
    </div>
  );
}
