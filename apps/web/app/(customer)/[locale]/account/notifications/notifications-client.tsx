'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale, NotificationVisualTone } from '@lezzet/i18n';
import { notificationSentence, notificationVisual } from '@lezzet/i18n';
import { BELL_EVENT, type MeNotification } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';
import { Link } from '@/i18n/navigation';
import { LoadMore } from '@/components/customer/ui/load-more';
import { NOTIFICATIONS_CHANGED_EVENT } from '@/components/customer/account/notification-bell';
import { loadNotificationsAction, markNotificationReadAction, markAllNotificationsReadAction, dismissNotificationAction } from './actions';
import { notificationTarget } from './notification-target';
import type { Messages, NotificationsFeedPage } from './notifications-types';

/*
  Bildirim akışı (14.15) — cümle SÖZLÜKTEN kurulur (`notificationSentence`, mobille aynı kaynak:
  satır metin taşımaz, 14.12), davranış kararları mobil akış hook'unun aynıları
  (`apps/mobile … use-notifications.hook` künyesi):

  · İYİMSER AMA YALANSIZ — okundu/gizle anında işler, istek düşerse GERİ ALINIR: ekranda "okundu"
    duran ama sunucuda okunmamış satır, rozetin başka cihazda yalan söylemesi demekti.
  · AKIŞ ≠ GELEN KUTUSU — okunan satır listeden kaybolmaz, yalnız vurgusu düşer.
  · CANLILIK — kişinin kendi kanalı, yükü daima boş: duyunca İLK SAYFA sunucudan yeniden istenir
    ve liste BAŞTAN kurulur (istemci hiçbir satırı kendi uydurmaz). Gizli sekme tur atmaz;
    dönüşte bir kez tazelenir (LiveRefresh'in aynı kararı).

  Kabuktaki zil ayrı bir komponent; ikisi `NOTIFICATIONS_CHANGED_EVENT` ile aynı sekmede senkron
  kalır — sayı yine SUNUCUDAN okunur, olay yalnız "bak" der (zil kanalının aynı felsefesi).
*/

/*
  TÜRÜN GÖRSEL KİMLİĞİ (kullanıcı kararı 26.08): satır tek tip metin değil — ikon dairesi + tür
  etiketi + cümle. Anlam paylaşılan sözlükten (`notificationVisual`), renk BURADA token'a çevrilir
  (semantik ton → müşteri paleti; sipariş durum hapının aynı aileleri).
*/
const TONE_BG: Record<NotificationVisualTone, string> = {
  positive: 'bg-olive-bg',
  attention: 'bg-honey-bg',
  issue: 'bg-terracotta-bg',
  neutral: 'bg-sand-100',
};

const TONE_TEXT: Record<NotificationVisualTone, string> = {
  positive: 'text-olive-dark',
  attention: 'text-honey',
  issue: 'text-terracotta-bright',
  neutral: 'text-muted',
};

interface NotificationsClientProps {
  t: Messages;
  locale: Locale;
  first: NotificationsFeedPage;
  /** Kişinin canlı kanal adı — sunucuda profil kimliğinden türetildi (doğal sır). */
  channel: string;
}

export function NotificationsClient({ t, locale, first, channel }: NotificationsClientProps) {
  const [rows, setRows] = useState<MeNotification[]>(first.rows);
  const [unread, setUnread] = useState(first.unread);
  const [cursor, setCursor] = useState(first.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  /** Kaçıncı yükün geçerli olduğu — eski cevaplar sessizce düşer (mobil hook'un deseni). */
  const generation = useRef(0);

  /** Zil komponentine "sayın değişti, sunucuya bak" der — olay yük taşımaz. */
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

  /* Canlı bağ — LiveRefresh'in gizli-sekme kuralıyla: arka planda tur atılmaz, dönüşte bir kez. */
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
      if (!res.data) return; // düşen kuyruk sessizce durur; düğme durur, yeniden denenebilir
      setRows((current) => [...current, ...res.data!.rows]);
      setUnread(res.data.unread);
      setCursor(res.data.nextCursor);
    });
  }, [cursor, loadingMore]);

  const markRead = useCallback(
    (id: string) => {
      // Karar ÇAĞRI ANINDA, kapanıştaki listeden (mobil hook'un testinin yakaladığı kusurun dersi).
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

  const dateOf = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
      {unread > 0 && (
        <button
          type="button"
          onClick={markAllRead}
          className="self-end cursor-pointer font-sans text-body-sm font-semibold text-olive transition-colors hover:text-olive-dark"
        >
          {t.markAll}
        </button>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-card border border-sand-200 bg-card px-4 py-6">
          <span className="font-sans text-body-sm font-semibold text-ink">{t.empty.title}</span>
          <span className="font-sans text-body-sm text-muted">{t.empty.body}</span>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-sand-100 rounded-card border border-sand-200 bg-card px-4">
          {rows.map((row) => {
            const target = notificationTarget(row);
            const sentence = notificationSentence(row, locale);
            const visual = notificationVisual(row);
            const inner = (
              <>
                {/* İkon dairesi: türün yüzü — renk ailesi durum haplarıyla aynı anlamda. */}
                <span
                  aria-hidden
                  className={['flex h-9 w-9 flex-none items-center justify-center rounded-full text-icon-sm', TONE_BG[visual.tone]].join(' ')}
                >
                  {visual.icon}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={['font-sans text-micro font-bold uppercase tracking-[0.05em]', TONE_TEXT[visual.tone]].join(' ')}>
                      {visual.label(locale)}
                    </span>
                    <span className="font-sans text-micro text-muted">{dateOf.format(new Date(row.createdAt))}</span>
                    {/* Okunmamış nokta: satırın hâli — okununca söner, satır kalır. */}
                    {row.readAt === null && <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-olive" />}
                  </span>
                  <span className={['font-sans text-body-sm text-ink', row.readAt === null ? 'font-semibold' : ''].join(' ')}>
                    {sentence}
                  </span>
                </span>
              </>
            );
            return (
              <div key={row.id} className="flex items-start gap-2 py-3">
                {target ? (
                  <Link
                    href={target}
                    onClick={() => markRead(row.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 transition-opacity hover:opacity-80"
                  >
                    {inner}
                  </Link>
                ) : (
                  /* Hedefsiz satır (davet): tık yalnız okundu işaretler — ölü görünen satır olmasın. */
                  <button
                    type="button"
                    onClick={() => markRead(row.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-left transition-opacity hover:opacity-80"
                  >
                    {inner}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(row.id)}
                  aria-label={t.dismiss}
                  title={t.dismiss}
                  className="flex-none cursor-pointer px-1 font-sans text-body-sm text-muted transition-colors hover:text-terracotta"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <LoadMore hasMore={cursor !== null} loading={loadingMore} onLoadMore={loadMore} label={t.loadMore} loadingLabel={t.loading} />
    </div>
  );
}
