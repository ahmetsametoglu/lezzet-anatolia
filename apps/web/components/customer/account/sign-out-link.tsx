'use client';

import type { Locale } from '@lezzet/i18n';
import { useSignOut } from './use-sign-out.hook';
import messages from './account-messages.json';

/**
 * Hesap başlığının "Çıkış" bağlantısı (20.08) — tasarım hesap ekranında sağ üstte çiziyor
 * (`Musteri - Hesap.dc.html`: "Hesabım … Çıkış") ve bugüne kadar hiç kodlanmamıştı: hesap
 * sayfasındaki müşteri çıkmak için vitrine dönüp menüyü açmak zorundaydı.
 *
 * Davranış menüdeki çıkışla AYNI kapıdan (`useSignOut` — iki yüzey, tek davranış).
 */
interface SignOutLinkProps {
  locale: Locale;
}

export function SignOutLink({ locale }: SignOutLinkProps) {
  const t = messages[locale];
  const { busy, signOut } = useSignOut();
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
