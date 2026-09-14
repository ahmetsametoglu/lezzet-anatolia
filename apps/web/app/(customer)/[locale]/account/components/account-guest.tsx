import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { focusRingClass } from '@/components/customer/ui/button';
import type { Messages } from '../account-types';
import { SiteLinks } from './site-links';

/**
 * Misafirin hesap ekranı — MOBİL WEB (v1 "Mobil · Hesap", `hs.misafir` kartı, 13.09).
 *
 * Sekme çubuğundaki "Hesabım" herkese açık; misafir girişe fırlatılmaz, buraya düşer: tek kart
 * ("Hesabınıza girin" + doğrulan düğmesi) ve altında dil + yasal bağlantılar — v1 mobilin footer'ı
 * olmadığı için misafirin o sayfalara tek yolu burası (`SiteLinks` künyesi). Masaüstünde misafir
 * hâlâ girişe yönleniyor (`page.tsx`).
 */
interface AccountGuestProps {
  t: Messages;
  locale: Locale;
}

export function AccountGuest({ t, locale }: AccountGuestProps) {
  return (
    <div className="flex flex-col gap-3.5 px-[18px] pt-4 pb-[26px]">
      <div className="flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card p-[22px]">
        <h1 className="font-serif text-[22px] font-semibold text-ink">{t.guestTitle}</h1>
        <p className="font-sans text-note leading-[1.6] text-body">{t.guestBody}</p>
        <Link
          href="/login"
          className={`cursor-pointer rounded-[24px] bg-olive py-[13px] text-center font-sans text-body-sm leading-tight font-bold text-white transition-colors hover:bg-olive-dark ${focusRingClass}`}
        >
          {t.guestCta}
        </Link>
      </div>
      <SiteLinks locale={locale} />
    </div>
  );
}
