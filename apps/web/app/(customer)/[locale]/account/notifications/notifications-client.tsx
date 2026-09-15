'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { BELL_EVENT, type MeNotification } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { NOTIFICATIONS_CHANGED_EVENT } from '@/components/customer/account/use-unread-notifications.hook';
import { loadNotificationsAction, markNotificationReadAction, markAllNotificationsReadAction, dismissNotificationAction } from './actions';
import type { Messages, NotificationsFeedPage, NotificationsViewProps } from './notifications-types';
import { NotificationsDesktop } from './notifications.desktop';
import { NotificationsMobile } from './notifications.mobile';

/*
  Okundu ve gizle iyimser ama yalansız: anında işler, istek düşerse geri alınır. Canlılık kişinin kendi kanalından: duyunca
  ilk sayfa sunucudan yeniden istenir, gizli sekme dönüşte bir kez tazelenir.
*/

interface NotificationsClientProps {
  t: Messages;
  locale: Locale;
  first: NotificationsFeedPage;
  /** Kişinin canlı kanal adı — sunucuda profil kimliğinden türetildi. */
  channel: string;
  device: Device;
}

export function NotificationsClient({ t, locale, first, channel, device }: NotificationsClientProps) {
  const resolved = useDevice(device);
  const [rows, setRows] = useState<MeNotification[]>(first.rows);
  const [unread, setUnread] = useState(first.unread);
  const [cursor, setCursor] = useState(first.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  /** Kaçıncı yükün geçerli olduğu — eski cevaplar sessizce düşer. */
  const generation = useRef(0);

  /** Zil bileşenine "sayın değişti, sunucuya bak" der — olay yük taşımaz. */
  const announce = useCallback(() => {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }, []);

  const refresh = useCallback(() => {
    const run = (generation.current += 1);
    void loadNotificationsAction().then((res) => {
      if (run !== generation.current || !res.data) return;
      setRows(res.data.rows);
      setUnread(res.data.unread);
      setCursor(res.data.nextCursor);
    });
  }, []);

  useEffect(() => {
    let missedWhileHidden = false;
    const onBell = () => {
      if (document.visibilityState === 'hidden') {
        missedWhileHidden = true;
        return;
      }
      refresh();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !missedWhileHidden) return;
      missedWhileHidden = false;
      refresh();
    };

    const supabase = createClient();
    const live = supabase.channel(channel).on('broadcast', { event: BELL_EVENT }, onBell).subscribe();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(live);
    };
  }, [channel, refresh]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    const run = generation.current;
    setLoadingMore(true);
    void loadNotificationsAction(cursor).then((res) => {
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (!res.data) return; // düşen kuyruk sessizce durur; düğme yeniden denenebilir
      setRows((current) => [...current, ...res.data!.rows]);
      setUnread(res.data.unread);
      setCursor(res.data.nextCursor);
    });
  }, [cursor, loadingMore]);

  const markRead = useCallback(
    (id: string) => {
      // Karar çağrı anında, kapanıştaki listeden.
      const satir = rows.find((row) => row.id === id);
      if (!satir || satir.readAt !== null) return;
      setRows((current) => current.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row)));
      setUnread((n) => Math.max(0, n - 1));
      void markNotificationReadAction(id).then((res) => {
        if (res.errorKey === null) {
          announce();
          return;
        }
        setRows((current) => current.map((row) => (row.id === id ? { ...row, readAt: null } : row)));
        setUnread((n) => n + 1);
      });
    },
    [rows, announce],
  );

  const markAllRead = useCallback(() => {
    if (unread === 0) return;
    const oncekiRows = rows;
    const oncekiUnread = unread;
    const simdi = new Date().toISOString();
    setRows((current) => current.map((row) => (row.readAt === null ? { ...row, readAt: simdi } : row)));
    setUnread(0);
    void markAllNotificationsReadAction().then((res) => {
      if (res.errorKey === null) {
        announce();
        return;
      }
      setRows(oncekiRows);
      setUnread(oncekiUnread);
    });
  }, [rows, unread, announce]);

  const dismiss = useCallback(
    (id: string) => {
      const onceki = rows;
      const satir = rows.find((row) => row.id === id);
      if (!satir) return;
      setRows((current) => current.filter((row) => row.id !== id));
      if (satir.readAt === null) setUnread((n) => Math.max(0, n - 1)); // gizlenen rozetten de düşer
      void dismissNotificationAction(id).then((res) => {
        if (res.errorKey === null) {
          announce();
          return;
        }
        setRows(onceki);
        if (satir.readAt === null) setUnread((n) => n + 1);
      });
    },
    [rows, announce],
  );

  const view: NotificationsViewProps = {
    t,
    locale,
    rows,
    unread,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore: loadMore,
    onRead: markRead,
    onReadAll: markAllRead,
    onDismiss: dismiss,
  };

  return resolved === 'mobile' ? <NotificationsMobile {...view} /> : <NotificationsDesktop {...view} />;
}
