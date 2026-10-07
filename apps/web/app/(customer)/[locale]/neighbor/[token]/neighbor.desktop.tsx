import { buttonClass } from '@/components/customer/ui/button';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import { Link } from '@/i18n/navigation';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { acceptNeighborInviteAction } from './actions';
import type { NeighborTarget, NeighborViewProps } from './neighbor-types';

/** Masaüstünde beş hâl de aynı durum bloğunu (`MessageScreen`) kullanır; üst etiket ekranın adıdır. */
export function NeighborDesktop({ locale, token, welcome, copy, desktop }: NeighborViewProps) {
  const catalogLink = (label: string) => (
    <Link href="/catalog" locale={locale} className={buttonClass({ variant: 'primary' })}>
      {label}
    </Link>
  );
  // Kabul sunucu eylemli formla gider ki JavaScript'i kapalı ziyaretçide de davet çalışsın.
  const acceptButton = (target: NeighborTarget, label: string, variant: 'primary' | 'secondary') => (
    <form action={acceptNeighborInviteAction.bind(null, locale, token, target)}>
      <button type="submit" className={buttonClass({ variant })}>
        {label}
      </button>
    </form>
  );

  switch (welcome.status) {
    case 'ok':
      return (
        <MessageScreen
          device="desktop"
          icon="truck"
          eyebrow={copy.title}
          // Ad boş olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): boş yer tutucu cümleyi bozuk okuturdu.
          title={copy.ok.title
            .replace('{name}', welcome.inviterName || copy.ok.someone)
            .replace('{day}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={copy.ok.body}
          actions={
            <>
              {acceptButton('cart', desktop.sameDay, 'primary')}
              {acceptButton('catalog', desktop.catalogFirst, 'secondary')}
            </>
          }
        />
      );
    case 'self':
      return (
        <MessageScreen
          device="desktop"
          icon="share"
          eyebrow={copy.title}
          title={copy.self.title}
          description={copy.self.body}
          actions={
            <Link href="/orders" locale={locale} className={buttonClass({ variant: 'primary' })}>
              {copy.self.primary}
            </Link>
          }
        />
      );
    case 'run_closed':
      return (
        <MessageScreen
          device="desktop"
          icon="timer"
          eyebrow={copy.title}
          title={copy.runClosed.title.replace('{day}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={copy.runClosed.body}
          actions={catalogLink(copy.runClosed.primary)}
        />
      );
    case 'full':
      return (
        <MessageScreen
          device="desktop"
          icon="user"
          eyebrow={copy.title}
          title={copy.full.title.replace('{day}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={copy.full.body}
          actions={catalogLink(copy.full.primary)}
        />
      );
    case 'unknown':
      return (
        <MessageScreen
          device="desktop"
          icon="search"
          eyebrow={copy.title}
          title={copy.unknown.title}
          description={copy.unknown.body}
          actions={catalogLink(copy.unknown.primary)}
        />
      );
  }
}
