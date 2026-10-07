import { buttonClass } from '@/components/customer/ui/button';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import { Link } from '@/i18n/navigation';
import { errorText } from '@/lib/customer-error-text';
import type { UnsubscribeViewProps } from './unsubscribe-types';
import { useUnsubscribe } from './use-unsubscribe.hook';

/** Masaüstünde üç hâl de durum bloğuyla çizilir; sayfa davet ve 404 sayfalarının kardeşidir. */
export function UnsubscribeDesktop({ locale, token, state, t }: UnsubscribeViewProps) {
  const home = (label: string, variant: 'primary' | 'secondary') => (
    <Link href="/" locale={locale} className={buttonClass({ variant })}>
      {label}
    </Link>
  );

  if (state === 'invalid') {
    return (
      <MessageScreen
        device="desktop"
        icon="warning"
        eyebrow={t.eyebrow}
        title={t.invalid.title}
        description={t.invalid.body}
        actions={
          <>
            <Link href="/account/preferences" locale={locale} className={buttonClass({ variant: 'primary' })}>
              {t.invalid.preferences}
            </Link>
            {home(t.invalid.home, 'secondary')}
          </>
        }
      />
    );
  }
  if (state === 'unsubscribed') {
    return (
      <MessageScreen
        device="desktop"
        icon="mail"
        eyebrow={t.eyebrow}
        title={t.done.title}
        description={t.done.body}
        actions={home(t.done.home, 'primary')}
      />
    );
  }
  return <PendingDesktop locale={locale} token={token} t={t} />;
}

function PendingDesktop({ locale, token, t }: Omit<UnsubscribeViewProps, 'state'>) {
  const { formRef, formAction, pending, errorKey } = useUnsubscribe(locale, token);
  return (
    <MessageScreen
      device="desktop"
      icon="mail"
      eyebrow={t.eyebrow}
      title={t.pending.title}
      description={t.pending.body}
      actions={
        <form ref={formRef} action={formAction}>
          <button type="submit" disabled={pending} className={buttonClass({ variant: 'primary' })}>
            {t.pending.action}
          </button>
        </form>
      }
    >
      {errorKey && (
        <p role="alert" className="font-sans text-note font-semibold text-error">
          {errorText(t.errors, errorKey)}
        </p>
      )}
    </MessageScreen>
  );
}
