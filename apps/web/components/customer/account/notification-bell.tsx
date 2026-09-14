'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/customer/ui/icons';
import { useUnreadNotifications } from './use-unread-notifications.hook';
import messages from './account-messages.json';

/*
  HESAP ZİLİ (14.15) — hesap alanı başlığının bildirim girişi: rozetli zil, tıklanınca akış sayfası.
  Web'de müşteri bildirimi = bu zil + o liste; tarayıcı push'u YOK ve eklenmeyecek (KARARLAR 26.08:
  aynı telefonda tarayıcı aboneliği ile uygulama jetonu ayırt edilemez — çift bildirim).

  Sayı ortak kancadan (`useUnreadNotifications`) — hesap menüsü de aynı sayıyı okuyor. Rozet
  `CartBadge` kuralıyla: ilk okuma bitmeden çizilmez, yalnız >0 iken çizilir.
*/

interface NotificationBellProps {
  locale: Locale;
  /**
   * Mobil vitrin başlığının zili — native'in 46px kum dairesi (`home-screen` `bellButton`), rozeti
   * krem halkalı (14.09). Varsayılan çıplak ikon: masaüstü hesap başlığı.
   */
  circle?: boolean;
}

export function NotificationBell({ locale, circle = false }: NotificationBellProps) {
  const t = messages[locale];
  const unread = useUnreadNotifications();

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
