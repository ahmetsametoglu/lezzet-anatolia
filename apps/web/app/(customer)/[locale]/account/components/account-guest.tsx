import type { Locale } from '@lezzet/i18n';
import accountMessages from '@lezzet/i18n/customer/account';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { LegalDirectoryView } from '../account-types';
import { LanguageCard } from './language-card';
import { LegalDirectory } from './legal-directory';

/**
 * Misafirin hesap ekranı, native hesabın misafir hâli: boş durum ve altında bilgi ve koşullar. Araya web'e özgü dil kartı girer,
 * çünkü web'de dil adresin kendisidir ve telefon görünümünde altbilgi yok; masaüstünde misafir girişe yönlenir (`page.tsx`).
 */
interface AccountGuestProps {
  locale: Locale;
  legal: LegalDirectoryView;
}

export function AccountGuest({ locale, legal }: AccountGuestProps) {
  const copy = accountMessages[locale];
  return (
    <div className="flex flex-col gap-3.5 px-4.5 pb-5">
      <EmptyState
        icon={<MobileIcon name="account" size={80} className="text-sand-600" />}
        title={copy.guest.title}
        description={copy.guest.body}
        action={<PrimaryButton href="/login" label={copy.guest.cta} />}
      />
      <LanguageCard copy={copy.language} fontCopy={copy.fontSize} locale={locale} stored={locale} />
      <LegalDirectory directory={legal} />
    </div>
  );
}
