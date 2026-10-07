import type { IconName } from '@lezzet/design-tokens/icons';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { Note } from '@/components/customer/phone-kit/note';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { errorText } from '@/lib/customer-error-text';
import type { UnsubscribeViewProps } from './unsubscribe-types';
import { useUnsubscribe } from './use-unsubscribe.hook';

const icon = (name: IconName) => <MobileIcon name={name} size={44} className="text-terracotta" />;

/** Telefonda üç hâl native'in boş durum bloğuyla çizilir; başlık çubuğunu çerçeve kurar. */
export function UnsubscribeMobile({ locale, token, state, t }: UnsubscribeViewProps) {
  if (state === 'invalid') {
    return (
      <EmptyState
        fill
        icon={icon('warning')}
        title={t.invalid.title}
        description={t.invalid.body}
        action={
          <div className="flex flex-col items-center gap-3">
            <PrimaryButton label={t.invalid.preferences} href="/account/preferences" />
            <SecondaryButton label={t.invalid.home} href="/" shape="pill" />
          </div>
        }
      />
    );
  }
  if (state === 'unsubscribed') {
    return (
      <EmptyState
        fill
        icon={icon('check-wide')}
        title={t.done.title}
        description={t.done.body}
        action={<PrimaryButton label={t.done.home} href="/" />}
      />
    );
  }
  return <PendingMobile locale={locale} token={token} t={t} />;
}

function PendingMobile({ locale, token, t }: Omit<UnsubscribeViewProps, 'state'>) {
  const { formRef, formAction, pending, errorKey } = useUnsubscribe(locale, token);
  return (
    <EmptyState
      fill
      icon={icon('mail')}
      title={t.pending.title}
      description={t.pending.body}
      action={
        <div className="flex flex-col items-center gap-3">
          {errorKey && <Note tone="terracotta" description={errorText(t.errors, errorKey)} />}
          <form ref={formRef} action={formAction}>
            <PrimaryButton label={t.pending.action} type="submit" disabled={pending} />
          </form>
        </div>
      }
    />
  );
}
