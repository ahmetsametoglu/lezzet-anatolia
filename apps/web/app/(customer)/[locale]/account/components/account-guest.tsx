import type { Locale } from '@lezzet/i18n';
import accountMessages from '@lezzet/i18n/customer/account';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { LegalDirectoryView } from '../account-types';
import { LanguageCard } from './language-card';
import { LegalDirectory } from './legal-directory';

/**
 * Misafirin hesap ekranı — telefon görünümü, native hesabın misafir hâli (14.09): boş durum (hesap ikonu · karşılama ·
 * tek cümle · "hızlı doğrulama" hap düğmesi) ve altında bilgi ve koşullar (native'in misafir duvarının altındaki
 * bilgi kapısı). Araya web'e özgü dil kartı girer: native'de dil cihazdan gelir, web'de adresin kendisidir ve telefon
 * görünümünde footer yok. Masaüstünde misafir hâlâ girişe yönleniyor (`page.tsx`).
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
      <LanguageCard copy={copy.language} locale={locale} stored={locale} />
      <LegalDirectory directory={legal} />
    </div>
  );
}
