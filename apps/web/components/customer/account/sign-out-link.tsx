'use client';

import type { Locale } from '@lezzet/i18n';
import { useSignOut } from './use-sign-out.hook';
import messages from './account-messages.json';

/**
 * Hesap başlığının "Çıkış" bağlantısı (20.08) — tasarım hesap ekranında sağ üstte çiziyor
 * (`Musteri - Hesap.dc.html`: "Hesabım … Çıkış") ve bugüne kadar hiç kodlanmamıştı: hesap
 * sayfasındaki müşteri çıkmak için vitrine dönüp menüyü açmak zorundaydı.
 *
 * Davranış avatar menüsündeki çıkışla AYNI kapıdan (`useSignOut` — iki yüzey, tek davranış).
 *
 * Mobil webde yeri hesabın EN ALTI (v1 mobil "Çıkış yap", 13.09): üst bar yalnız sepeti taşıyor.
 */
interface SignOutLinkProps {
  locale: Locale;
  /** `link` masaüstü hesap başlığının sağ ucundaki metin; `button` mobil hesabın çerçeveli düğmesi. */
  variant?: 'link' | 'button';
}

export function SignOutLink({ locale, variant = 'link' }: SignOutLinkProps) {
  const t = messages[locale];
  const { busy, signOut } = useSignOut();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void signOut()}
      className={
        variant === 'button'
          ? 'w-full cursor-pointer rounded-[22px] border-[1.5px] border-sand-300 bg-card py-[13px] text-center font-sans text-control leading-tight font-bold text-terracotta transition-colors hover:border-terracotta-line disabled:opacity-60'
          : 'flex-none cursor-pointer font-sans text-body-sm font-semibold text-muted transition-colors hover:text-terracotta disabled:opacity-60'
      }
    >
      {t.signOut}
    </button>
  );
}
