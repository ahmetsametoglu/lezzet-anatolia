'use client';

import type { Locale } from '@lezzet/i18n';
import { useAccount } from '@/components/customer/account/account-context';
import { NotificationBell } from '@/components/customer/account/notification-bell';
import { PlaceChip } from '@/components/customer/delivery/place-chip';
import messages from './home-header-messages.json';

type Copy = (typeof messages)['tr'];

/**
 * Vitrinin başlığı — native vitrin başlığının (`apps/mobile/src/screens/home/home-screen.tsx`
 * `header`) web ikizi (kullanıcı kararı 14.09). ÇUBUK DEĞİL: içerikle birlikte akar, logo yok.
 * Solda selamlama (saate göre, girişliyse adıyla) ve altında turuncu konum satırı — dokununca yer
 * çekmecesi açılır; sağda bildirim zili (yalnız girişliye: misafirin bildirimi yok).
 *
 * Saat PARİS saatinden: sunucu da tarayıcı da aynı cevabı üretsin (pazar FR + DE, tek saat dilimi).
 * Yerel saatle yazılsaydı sunucunun saat dilimi ile tarayıcınınki ayrışır ve hidrasyon uyarısı
 * doğardı; saat sınırına denk gelen tek karelik fark `suppressHydrationWarning` ile karşılanır.
 * Selamlama `h1` DEĞİL — vitrinin başlığı kahramanın cümlesi.
 *
 * BEKLEYEN(08.58): native bu satırda puan etiketini ve toptan rozetini de taşıyor; web kökünde bu iki
 * veri yok (hesap bağlamı yalnız ad + e-posta) — vitrin turunda sayfanın okumasıyla gelecek.
 */
interface HomeHeaderProps {
  locale: Locale;
}

/** Paris'te saat kaç — tarayıcının ve sunucunun saat diliminden bağımsız. */
const PARIS_HOUR = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Paris' });

/** Native'in `greetingOf`u: 11'e kadar sabah, 18'e kadar gün, sonrası akşam; misafire hoş geldin. */
function greetingOf(t: Copy, firstName: string | null): string {
  if (firstName === null) return t.greeting.guest;
  const hour = Number(PARIS_HOUR.format(new Date()));
  const part = hour < 11 ? t.greeting.morning : hour < 18 ? t.greeting.afternoon : t.greeting.evening;
  return t.greeting.withName.replace('{greeting}', part).replace('{name}', firstName);
}

export function HomeHeader({ locale }: HomeHeaderProps) {
  const t = messages[locale];
  const account = useAccount();
  const firstName = account?.name.trim().split(/\s+/)[0] || null;

  return (
    <header className="flex items-start justify-between gap-3 px-[22px] pt-[26px]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p suppressHydrationWarning className="font-serif text-page-title-sm leading-[1.15] text-ink">
          {greetingOf(t, firstName)} <span className="text-terracotta">✺</span>
        </p>
        <PlaceChip locale={locale} line />
      </div>
      {account && (
        <div className="flex flex-none items-center gap-2 pt-1.5">
          <NotificationBell locale={locale} circle />
        </div>
      )}
    </header>
  );
}
