'use client';

import { greetingOf, type HomeCopy } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/home';
import { useAccount, useWholesale } from '@/components/customer/account/account-context';
import { NotificationBell } from '@/components/customer/account/notification-bell';
import { PlaceChip } from '@/components/customer/delivery/place-chip';
import { Tag } from '@/components/customer/phone-kit/tag';

/**
 * Vitrinin başlığı — native vitrin başlığının (`apps/mobile/src/screens/home/home-screen.tsx`
 * `header`) web ikizi (kullanıcı kararı 14.09). ÇUBUK DEĞİL: içerikle birlikte akar, logo yok.
 * Solda selamlama (saate göre, girişliyse adıyla) ve altında turuncu konum satırı — dokununca yer
 * çekmecesi açılır; sağda onaylı toptancıya "TOPTAN" rozeti ve bildirim zili (yalnız girişliye:
 * misafirin bildirimi yok). Puan etiketi native'de de çizilmiyor (`/me` puan taşımıyor), web de çizmez.
 *
 * METİN VE KURAL NATIVE'LE ORTAK (14.09): cümleler `@lezzet/i18n/customer/home`da, eşikler
 * `@lezzet/helper` `greetingOf`ta — iki yüzey aynı selamlamayı kurar.
 *
 * Saat PARİS saatinden: sunucu da tarayıcı da aynı cevabı üretsin (pazar FR + DE, tek saat dilimi).
 * Yerel saatle yazılsaydı sunucunun saat dilimi ile tarayıcınınki ayrışır ve hidrasyon uyarısı
 * doğardı; saat sınırına denk gelen tek karelik fark `suppressHydrationWarning` ile karşılanır.
 * Selamlama `h1` DEĞİL — bir hitaptır; sayfanın `h1`i arama motoru için vitrinin gövdesinde.
 */
interface HomeHeaderProps {
  locale: Locale;
}

/** Paris'te saat kaç — tarayıcının ve sunucunun saat diliminden bağımsız. */
const PARIS_HOUR = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Paris' });

export function HomeHeader({ locale }: HomeHeaderProps) {
  const t: HomeCopy = messages[locale];
  const account = useAccount();
  const wholesale = useWholesale();
  const firstName = account?.name.trim().split(/\s+/)[0] || null;

  return (
    <header className="flex items-start justify-between gap-3 px-[22px] pt-[26px]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p suppressHydrationWarning className="font-serif text-page-title-sm leading-[1.15] text-ink">
          {greetingOf(t.greeting, Number(PARIS_HOUR.format(new Date())), firstName)}{' '}
          <span className="text-terracotta">✺</span>
        </p>
        <PlaceChip locale={locale} line />
      </div>
      {account && (
        <div className="flex flex-none items-center gap-2 pt-1.5">
          {/* Toptan rozeti kökteki bilgiden (`useWholesale`, 14.09) — sekme çatalıyla aynı ölçüt. */}
          {wholesale && <Tag label={t.header.wholesale} tone="ink" rotate={-3} />}
          <NotificationBell locale={locale} circle />
        </div>
      )}
    </header>
  );
}
