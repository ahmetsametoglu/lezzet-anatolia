import { useCallback, useEffect, useRef, useState } from 'react';
import { BELL_EVENT, notificationsChannelName } from '@lezzet/types';

import {
  dismissNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/lib/api/notifications';
import { getSupabase } from '@/lib/auth/supabase';

/*
  BİLDİRİM AKIŞI — puan geçmişi hook'unun sayfalama deseni birebir (`use-points-history`), üstüne
  üç şey: rozet (listeyle AYNI zarfta gelir — iki uç tek tanımdan sayar), CANLILIK (kişinin kendi
  kanalı: boş yüklü zil, duyunca sunucudan yeniden iste — `use-ticket.hook` kalıbı) ve İYİMSER
  yazımlar.

  ── İYİMSER YAZIM, AMA YALANSIZ ─────────────────────────────────────────────
  Okundu/gizle dokunuşu ekranı BEKLETMEZ: satır anında düşer/söner, istek arkadan gider. İstek
  DÜŞERSE geri alınır — ekranda "okundu" duran ama sunucuda okunmamış satır, rozetin başka
  cihazda yalan söylemesi demekti (aynı hesap: telefon + tablet).
*/

type NotificationsStatus = 'loading' | 'guest' | 'ready' | 'error';

interface UseNotificationsResult {
  status: NotificationsStatus;
  rows: NotificationRow[];
  unread: number;
  loadingMore: boolean;
  tailFailed: boolean;
  refreshing: boolean;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
}

export function useNotifications(profileId: string | null): UseNotificationsResult {
  const [status, setStatus] = useState<NotificationsStatus>('loading');
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /** Kaçıncı yükün geçerli olduğu — eski cevaplar sessizce düşer (sipariş hook'unun deseni). */
  const generation = useRef(0);

  const load = useCallback(async (options: { refresh: boolean }) => {
    const run = (generation.current += 1);
    if (options.refresh) setRefreshing(true);
    else setStatus('loading');
    setTailFailed(false);

    // Env'siz ortamda `authorizedFetch` kurulamadan fırlar — hata hâline İNER, kabuğu düşürmez.
    const result = await fetchNotifications().catch(() => ({ error: 'client_unavailable', status: 0, data: null }) as const);
    if (run !== generation.current) return;

    setRefreshing(false);
    setLoadingMore(false);

    if (result.error !== null) {
      // Çıkış yapılmışsa eski satırlar ekranda KALMAZ — başkasının akışını göstermek olurdu.
      setRows([]);
      setUnread(0);
      setCursor(null);
      setStatus(result.status === 401 ? 'guest' : 'error');
      return;
    }

    setRows(result.data.notifications);
    setUnread(result.data.unread);
    setCursor(result.data.nextCursor);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load({ refresh: false });
  }, [load]);

  /* CANLILIK — kişinin kendi kanalı (doğal sır: profil UUID'si), yük daima boş: duyunca sunucudan
     yeniden istenir, kanaldan içerik geçmez (`bell.ts` sözleşmesi). Profil yoksa (misafir) abone
     olunmaz; kimlik değişince eski kanal kapanır. */
  useEffect(() => {
    if (profileId === null) return;
    // Kanal kurulamazsa akış çek-yenile ile yaşar (rozet hook'unun aynı künyeli yutması).
    try {
      const channel = getSupabase()
        .channel(notificationsChannelName(profileId))
        .on('broadcast', { event: BELL_EVENT }, () => void load({ refresh: true }))
        .subscribe();
      return () => {
        void channel.unsubscribe();
      };
    } catch {
      return undefined;
    }
  }, [profileId, load]);

  const refresh = useCallback(() => void load({ refresh: true }), [load]);
  const retry = useCallback(() => void load({ refresh: false }), [load]);

  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore || status !== 'ready') return;
    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchNotifications(cursor).then((result) => {
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      setRows((current) => [...current, ...result.data.notifications]);
      setUnread(result.data.unread);
      setCursor(result.data.nextCursor);
    });
  }, [cursor, loadingMore, status]);

  const markRead = useCallback(
    (id: string) => {
      /* Karar ÇAĞRI ANINDA, kapanıştaki listeden — güncelleyicinin içinde değil: React güncelleyiciyi
         sonradan koşturur, orada kurulan bayrak çağrı anında hep boş kalır ve erken dönüş rozeti hiç
         düşürmezdi (hook'un kendi testinin yakaladığı kusur — belirti: okundu işareti sessizce işlemez). */
      const satir = rows.find((row) => row.id === id);
      if (!satir || satir.readAt !== null) return; // zaten okunmuş — sunucuya boşuna gidilmez, rozet oynamaz
      setRows((current) => current.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row)));
      setUnread((n) => Math.max(0, n - 1));
      void markNotificationRead(id).then((result) => {
        if (result.error === null) return;
        // Geri al: ekranda "okundu" duran ama sunucuda okunmamış satır, öteki cihazda yalan söyler.
        setRows((current) => current.map((row) => (row.id === id ? { ...row, readAt: null } : row)));
        setUnread((n) => n + 1);
      });
    },
    [rows],
  );

  const markAllRead = useCallback(() => {
    const oncekiler = rows;
    const oncekiSayac = unread;
    if (oncekiSayac === 0) return;
    const simdi = new Date().toISOString();
    setRows((current) => current.map((row) => (row.readAt === null ? { ...row, readAt: simdi } : row)));
    setUnread(0);
    void markAllNotificationsRead().then((result) => {
      if (result.error === null) return;
      setRows(oncekiler);
      setUnread(oncekiSayac);
    });
  }, [rows, unread]);

  const dismiss = useCallback(
    (id: string) => {
      const onceki = rows;
      const satir = rows.find((row) => row.id === id);
      if (!satir) return;
      setRows((current) => current.filter((row) => row.id !== id));
      if (satir.readAt === null) setUnread((n) => Math.max(0, n - 1)); // gizlenen rozetten de düşer
      void dismissNotification(id).then((result) => {
        if (result.error === null) return;
        setRows(onceki);
        if (satir.readAt === null) setUnread((n) => n + 1);
      });
    },
    [rows],
  );

  return { status, rows, unread, loadingMore, tailFailed, refreshing, loadMore, refresh, retry, markRead, markAllRead, dismiss };
}
