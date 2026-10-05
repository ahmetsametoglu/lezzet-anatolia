import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { LocalizedCopy } from '@lezzet/i18n';
import type notificationsMessages from '@lezzet/i18n/customer/notifications';

interface NotificationsGuestProps {
  copy: LocalizedCopy<typeof notificationsMessages>['guest'];
  /** Doğrulanınca dönülecek adres — bu sayfa. */
  next: string;
}

/** Misafirin bildirim sayfası: liste yerine doğrulama daveti. */
export function NotificationsGuest({ copy, next }: NotificationsGuestProps) {
  return (
    <EmptyState
      icon={<MobileIcon name="bell" size={42} className="text-sand-600" />}
      title={copy.title}
      description={copy.body}
      action={<PrimaryButton shape="raised" label={copy.cta} href={{ pathname: '/login', query: { next } }} />}
    />
  );
}
