import type { IconName } from '@lezzet/design-tokens/icons';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { acceptInviteAction } from './actions';
import type { InviteTarget, InviteViewProps } from './invite-types';

/** Dört hâl native'in boş durum bloğuyla çizilir; başlık çubuğunu çerçeve kurar. */
export function InviteMobile({ locale, code, welcome, copy }: InviteViewProps) {
  const icon = (name: IconName) => <MobileIcon name={name} size={44} className="text-terracotta" />;
  // Kabul sunucu eylemli formla gider ki JavaScript'i kapalı ziyaretçide de davet çalışsın.
  const accept = (target: InviteTarget) => acceptInviteAction.bind(null, locale, code, target);

  switch (welcome.status) {
    case 'ok':
      return (
        <EmptyState
          fill
          icon={icon('coupon')}
          // Ad boş olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): boş yer tutucu cümleyi bozuk okuturdu.
          title={copy.ok.title.replace('{name}', welcome.referrerName || copy.ok.someone)}
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
          action={<PrimaryButton label={copy.self.primary} href="/account" />}
        />
      );
    case 'already_customer':
      return (
        <EmptyState
          fill
          icon={icon('check-wide')}
          title={copy.alreadyCustomer.title}
          description={copy.alreadyCustomer.body}
          action={<PrimaryButton label={copy.alreadyCustomer.primary} href="/catalog" />}
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
