'use client';

import type { Locale } from '@lezzet/i18n';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { useSignOut } from './use-sign-out.hook';
import messages from './account-messages.json';

/**
 * Hesap başlığının "Çıkış" bağlantısı (20.08) — tasarım hesap ekranında sağ üstte çiziyor
 * (`Musteri - Hesap.dc.html`: "Hesabım … Çıkış") ve bugüne kadar hiç kodlanmamıştı: hesap
 * sayfasındaki müşteri çıkmak için vitrine dönüp menüyü açmak zorundaydı.
 *
 * Davranış avatar menüsündeki çıkışla AYNI kapıdan (`useSignOut` — iki yüzey, tek davranış).
 *
 * Telefon görünümünde yeri hesabın EN ALTI ve biçimi native'in terracotta metin eylemi (`TextAction`,
 * 14.09): üst bar yalnız sepeti taşıyor.
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
