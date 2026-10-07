import type { IconName } from '@lezzet/design-tokens/icons';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { acceptNeighborInviteAction } from './actions';
import type { NeighborTarget, NeighborViewProps } from './neighbor-types';

/** Beş hâl native'in boş durum bloğuyla çizilir; gün her hâlde yazılır, başlık çubuğunu çerçeve kurar. */
export function NeighborMobile({ locale, token, welcome, copy }: NeighborViewProps) {
  const icon = (name: IconName) => <MobileIcon name={name} size={44} className="text-terracotta" />;
  // Kabul sunucu eylemli formla gider ki JavaScript'i kapalı ziyaretçide de davet çalışsın.
  const accept = (target: NeighborTarget) => acceptNeighborInviteAction.bind(null, locale, token, target);

  switch (welcome.status) {
    case 'ok':
      return (
        <EmptyState
          fill
          icon={icon('truck')}
          // Ad boş olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): boş yer tutucu cümleyi bozuk okuturdu.
          title={copy.ok.title
            .replace('{name}', welcome.inviterName || copy.ok.someone)
            .replace('{day}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={copy.ok.body}
          action={
            <div className="flex flex-col items-center gap-3">
              <form action={accept('catalog')}>
                <PrimaryButton label={copy.ok.primary} type="submit" />
              </form>
              <form action={accept('login')}>
                <SecondaryButton label={copy.ok.secondary} shape="pill" type="submit" />
              </form>
            </div>
          }
        />
      );
    case 'self':
      return (
        <EmptyState
          fill
          icon={icon('check-wide')}
          title={copy.self.title}
          description={copy.self.body}
          action={<PrimaryButton label={copy.self.primary} href="/orders" />}
        />
      );
    case 'run_closed':
      return (
        <EmptyState
          fill
          icon={icon('coupon')}
          title={copy.runClosed.title.replace('{day}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={copy.runClosed.body}
          action={<PrimaryButton label={copy.runClosed.primary} href="/catalog" />}
        />
      );
    case 'full':
      return (
        <EmptyState
          fill
          icon={icon('coupon')}
          title={copy.full.title.replace('{day}', formatDeliveryDate(welcome.deliveryDate, locale))}
          description={copy.full.body}
          action={<PrimaryButton label={copy.full.primary} href="/catalog" />}
        />
      );
    case 'unknown':
      return (
        <EmptyState
          fill
          icon={icon('coupon')}
          title={copy.unknown.title}
          description={copy.unknown.body}
          action={<PrimaryButton label={copy.unknown.primary} href="/catalog" />}
        />
      );
  }
}
