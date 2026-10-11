'use client';

import { greetingOf, type HomeCopy } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/home';
import { useAccount, useWholesale } from '@/components/customer/account/account-context';
import { NotificationBell } from '@/components/customer/account/notification-bell';
import { PlaceChip } from '@/components/customer/delivery/place-chip';
import { Tag } from '@/components/customer/phone-kit/tag';

/**
 * Vitrinin başlığı, native vitrin başlığının web ikizi; çubuk değildir, içerikle akar. Tasarımdaki puan etiketi iki yüzeyde de
 * çizilmez, çünkü `/me` puan taşımıyor.
 */
interface HomeHeaderProps {
  locale: Locale;
}

/** Selamlama saati Paris'ten okunur: sunucu ile tarayıcı aynı metni üretmezse hidrasyon uyuşmazlığı doğar. */
const PARIS_HOUR = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Paris' });

export function HomeHeader({ locale }: HomeHeaderProps) {
  const t: HomeCopy = messages[locale];
  const account = useAccount();
  const wholesale = useWholesale();
  const firstName = account?.name.trim().split(/\s+/)[0] || null;

  return (
    <header className="flex items-start justify-between gap-3 px-[22px] pt-[26px]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Selamlama bir hitaptır, sayfanın h1'i vitrinin gövdesinde. Saat sınırına denk gelen tek karelik fark için uyarı susturulur. */}
        <p suppressHydrationWarning className="font-serif text-page-title-sm leading-[1.15] text-ink">
          {greetingOf(t.greeting, Number(PARIS_HOUR.format(new Date())), firstName)}{' '}
          <span className="text-terracotta">✺</span>
        </p>
        <PlaceChip locale={locale} line />
      </div>
      <div className="flex flex-none items-center gap-2 pt-1.5">
        {/* Rozet sekme çatalıyla aynı ölçütten okunur. */}
        {wholesale && <Tag label={t.header.wholesale} tone="ink" rotate={-3} />}
        {/* Misafir de zili görür: bildirim sayfası ona giriş davetini gösterir. */}
        <NotificationBell locale={locale} circle counted={account !== null} />
      </div>
    </header>
  );
}
