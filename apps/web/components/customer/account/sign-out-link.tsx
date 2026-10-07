'use client';

import type { Locale } from '@lezzet/i18n';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { useSignOut } from './use-sign-out.hook';
import messages from './account-messages.json';

/**
 * Hesap başlığının "Çıkış" bağlantısı; davranış avatar menüsündeki çıkışla aynı kapıdan (`useSignOut`). Telefonda yeri hesabın en
 * altıdır ve biçimi native'in metin eylemidir (`TextAction`), çünkü üst bar yalnız sepeti taşır.
 */
interface SignOutLinkProps {
  locale: Locale;
  /** `link` masaüstü hesap başlığının sağ ucundaki metin; `text` telefon hesabının en altındaki metin eylemi. */
  variant?: 'link' | 'text';
}

export function SignOutLink({ locale, variant = 'link' }: SignOutLinkProps) {
  const t = messages[locale];
  const { busy, signOut } = useSignOut();
  if (variant === 'text') {
    // Metin eyleminin pasif hâli yok: ikinci basış `busy` ile kesilir (çıkış tam yenilemeyle biter).
    return (
      <TextAction
        label={t.signOut}
        tone="terracotta"
        onClick={() => {
          if (!busy) void signOut();
        }}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void signOut()}
      className="flex-none cursor-pointer font-sans text-body-sm font-semibold text-muted transition-colors hover:text-terracotta disabled:opacity-60"
    >
      {t.signOut}
    </button>
  );
}
