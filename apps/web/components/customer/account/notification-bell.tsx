'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/customer/ui/icons';
import { useUnreadNotifications } from './use-unread-notifications.hook';
import messages from './account-messages.json';

/** Bildirim akışının girişi: rozetli zil. Rozet ilk okuma bitmeden ve sayı sıfırken çizilmez. */
interface NotificationBellProps {
  locale: Locale;
  /** Mobil vitrin başlığının kum dairesi, native vitrin zilinin ikizi; verilmezse masaüstü hesap başlığının çıplak ikonu. */
  circle?: boolean;
  /** Okunmamış sayısı sorulsun mu; misafirin bildirim akışı olmadığından ona sorulmaz. */
  counted?: boolean;
}

export function NotificationBell({ locale, circle = false, counted = true }: NotificationBellProps) {
  const t = messages[locale];
  const unread = useUnreadNotifications(counted);

  return (
    <Link
      href="/account/notifications"
      aria-label={t.notifications}
      title={t.notifications}
      className={
        circle
          ? 'relative grid size-[46px] flex-none cursor-pointer place-items-center rounded-full bg-cream-deep text-ink transition-colors hover:bg-sand-200'
          : 'relative cursor-pointer text-ink'
      }
    >
      <Icon name="bell" size={22} />
      {unread !== null && unread > 0 && (
        <span
          className={[
            'absolute rounded-soft bg-terracotta px-1.5 py-px font-sans text-micro font-bold text-white',
            circle ? '-top-1 -right-1 border-[1.5px] border-cream' : '-top-1.5 -right-2',
          ].join(' ')}
        >
          {/* Tavan gizleme değil sığdırma: "99+" yine "çok" der, gerçek sayı akış sayfasında. */}
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
