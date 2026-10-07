import { buttonClass } from '@/components/customer/ui/button';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import { Link } from '@/i18n/navigation';
import { acceptInviteAction } from './actions';
import type { InviteTarget, InviteViewProps } from './invite-types';

/**
 * Masaüstünde dört hâl de aynı bloğu (`MessageScreen`) kullanır: sayfa bir durum ekranıdır, 404 ve 500'ün kardeşi. Üst etiket
 * ekranın adıdır; hesaba dönen çağrı her hâlde aynı sözdür.
 */
export function InviteDesktop({ locale, code, welcome, copy }: InviteViewProps) {
  const catalogLink = (label: string, variant: 'primary' | 'secondary') => (
    <Link href="/catalog" locale={locale} className={buttonClass({ variant })}>
      {label}
    </Link>
  );
  const accountLink = (label: string, variant: 'primary' | 'secondary') => (
    <Link href="/account" locale={locale} className={buttonClass({ variant })}>
      {label}
    </Link>
  );
  // Kabul sunucu eylemli formla gider ki JavaScript'i kapalı ziyaretçide de davet çalışsın.
  const acceptButton = (target: InviteTarget, label: string, variant: 'primary' | 'secondary') => (
    <form action={acceptInviteAction.bind(null, locale, code, target)}>
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
          icon="sparkle"
          eyebrow={copy.title}
          // Ad boş olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): boş yer tutucu cümleyi bozuk okuturdu.
          title={copy.ok.title.replace('{name}', welcome.referrerName || copy.ok.someone)}
          description={copy.ok.body}
          actions={
            <>
              {acceptButton('catalog', copy.ok.primary, 'primary')}
              {acceptButton('login', copy.ok.secondary, 'secondary')}
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
          actions={accountLink(copy.self.primary, 'primary')}
        />
      );
    case 'already_customer':
      return (
        <MessageScreen
          device="desktop"
          icon="user"
          eyebrow={copy.title}
          title={copy.alreadyCustomer.title}
          description={copy.alreadyCustomer.body}
          actions={
            <>
              {catalogLink(copy.alreadyCustomer.primary, 'primary')}
              {accountLink(copy.self.primary, 'secondary')}
            </>
          }
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
          actions={catalogLink(copy.unknown.primary, 'primary')}
        />
      );
  }
}
