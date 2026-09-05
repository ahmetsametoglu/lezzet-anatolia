import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationsPage,
} from '@/lib/api/notifications';
import { toOperationsNotification, type OperationsNotification } from './notification-map';

/*
  BİLDİRİM AKIŞI — kabuğun TEK bildirim kaynağı (14.13). Satırlar `/me/notifications`tan; personel
  de aynı uçtan okur çünkü fan-out satırı zaten KİŞİYE yazıyor (0049).

  ── BÖLÜM SÜZGECİ SÖKÜLDÜ (kullanıcı kararı 05.09) ─────────────────────────
  Kanca satırları `visibleNotifications` ile bir kez daha süzüyordu ve o süzgeç, sunucunun
  *rol × depo* kararıyla örtüşmediği için kişiye YAZILAN satırları ekrandan siliyordu (gerekçe ve
  ölçüm `lib/operations/sections.ts` künyesinde). Kitleyi artık yalnız sunucu belirler; bölüm
  satırın rengi ve süzgeç çipidir, kapısı değil.

  ── ROZET SUNUCUDAN (05.09) ────────────────────────────────────────────────
  Uç zarfında `unread` zaten geliyordu ve ATILIYORDU: rozet çekilmiş SAYFADAN yeniden sayılıyordu,
  yani sayfa boyu (30) rozetin tavanıydı. Artık zarftaki sayı okunuyor — tanım tek yerde
  (`AppNotificationService.UNREAD`), iki yüzey aynı sayıyı söylüyor.

  ── OKUNDU: AÇILIŞTA DEĞİL, DOKUNUNCA VE ÇIKARKEN ──────────────────────────
  Eski hâl mount'ta `markAllSeen` çağırıyordu ve o çağrı HİÇ ÇALIŞMIYORDU: effect veriden önce
  atıyor, `raw === null` olduğu için erken dönüyor, bağımlılık dizisi boş olduğu için bir daha
  koşmuyordu — istek hiç gitmedi, rozet hiç sönmedi. Düzeltmenin tek başına yapılması durumu
  KÖTÜLEŞTİRİRDİ: `read-all` bölüm/sayfa tanımıyordu ve ekranda hiç çizilmemiş satırları da okundu
  yapardı (sonra saklama süpürmesi onları "görülmüş" sayıp silerdi).

  Bu yüzden iki değişiklik BİRLİKTE: (a) beyan artık `since` ile GÖRÜLENLE sınırlı — çizilen en
  eski satırın damgası; (b) beyanın anı açılış değil ÇIKIŞ (odak kaybı). Böylece noktalar ziyaret
  boyunca ekranda durur — tasarımın karışık tablosu (kimi satır noktalı, kimi değil) ancak böyle
  doğar; açılışta işaretlense ilk kareden sonra hiçbir nokta kalmazdı.
  Satıra dokunmak da o satırı okundu yapar (iyimser, düşerse bir sonraki tazeleme gerçeği getirir).
*/

/** Ayrık durum birliği — "yükleniyor" ile "boş" ve "hata" birbirine karışmaz. */
type FeedState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: OperationsNotification[]; nextCursor: string | null; unread: number };

interface UseOperationsNotificationsResult {
  state: FeedState;
  /** Rol süzmesinden sonraki OKUNMAMIŞ sayısı — zilin rozeti; ölçülmediyse `null`. */
  unread: number | null;
  /** Kuyruğun devamı; imleç yoksa ya da tur sürüyorsa `null` (ekran düğmeyi çizmez). */
  loadMore: (() => void) | null;
  /** Kuyruk turu DÜŞTÜ — ekran "devamı gelmedi" der; liste yerinde kalır. */
  tailFailed: boolean;
  retry: () => void;
  markRead: (id: string) => void;
  /** Odak kaybında çağrılır: çizilen satırlar "görüldü" sayılır. */
  markSeen: () => void;
}

export function useOperationsNotifications(): UseOperationsNotificationsResult {
  const [state, setState] = useState<FeedState>({ status: 'loading' });
  const [tailFailed, setTailFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /* Kuşak sayacı: tazeleme sürerken ekran yeniden odaklanırsa eski turun cevabı yenisini EZMEZ. */
  const kusak = useRef(0);

  const load = useCallback(() => {
    const benim = ++kusak.current;
    setTailFailed(false);
    void fetchNotifications(undefined, 'staff')
      .catch(() => null)
      .then((result) => {
        if (benim !== kusak.current) return;
        /* HATA HÂLİ ARTIK VAR: eskiden `raw` `null` kalıyordu ve `loading: raw === null` olduğu
           için ekran SONSUZA KADAR iskelet çiziyordu — çevrimdışı açılışta kurtuluş yolu yoktu. */
        if (result === null || result.error !== null) {
          setState((onceki) => (onceki.status === 'ready' ? onceki : { status: 'error' }));
          return;
        }
        setState(sayfadan(result.data));
      });
  }, []);

  useFocusEffect(load);

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || state.nextCursor === null || loadingMore) return;
    const benim = kusak.current;
    setLoadingMore(true);
    setTailFailed(false);
    void fetchNotifications(state.nextCursor, 'staff')
      .catch(() => null)
      .then((result) => {
        if (benim !== kusak.current) return;
        setLoadingMore(false);
        if (result === null || result.error !== null) {
          setTailFailed(true);
          return;
        }
        const ek = sayfadan(result.data);
        setState((onceki) =>
          onceki.status === 'ready'
            ? { status: 'ready', rows: [...onceki.rows, ...ek.rows], nextCursor: ek.nextCursor, unread: ek.unread }
            : ek,
        );
      });
  }, [state, loadingMore]);

  const markRead = useCallback((id: string) => {
    /* İyimser: satır anında sönsün. Düşerse bir sonraki odak tazelemesi gerçeği geri getirir —
       rozeti sıfıra düşürmek yerine son bilinen değerde kalmak da aynı ilkenin parçası. */
    setState((onceki) => {
      if (onceki.status !== 'ready') return onceki;
      const satir = onceki.rows.find((row) => row.id === id);
      if (satir === undefined || satir.readAt !== null) return onceki;
      return {
        ...onceki,
        rows: onceki.rows.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row)),
        unread: Math.max(0, onceki.unread - 1),
      };
    });
    void markNotificationRead(id).catch(() => undefined);
  }, []);

  const markSeen = useCallback(() => {
    if (state.status !== 'ready' || state.rows.length === 0) return;
    if (!state.rows.some((row) => row.readAt === null)) return;
    /* Sınır ÇİZİLEN EN ESKİ satırın damgası: liste `created_at desc` sıralı, yani o damgadan
       yenisi = ekranda gerçekten görülenler. Sayfanın arkasında kalanı okundu yapmak, kimsenin
       görmediği bir işi rozetten düşürmek ve 90 gün sonra süpürmeye yem etmek olurdu. */
    const enEski = state.rows[state.rows.length - 1]!.createdAt;
    void markAllNotificationsRead('staff', enEski).catch(() => undefined);
  }, [state]);

  return useMemo(
    () => ({
      state,
      unread: state.status === 'ready' ? state.unread : null,
      loadMore: state.status === 'ready' && state.nextCursor !== null && !loadingMore ? loadMore : null,
      tailFailed,
      retry: load,
      markRead,
      markSeen,
    }),
    [state, loadingMore, loadMore, tailFailed, load, markRead, markSeen],
  );
}

/** Uç zarfı → ekranın şekli. Sayı da satır da AYNI turdan gelir; ikisi ayrışamaz. */
function sayfadan(page: NotificationsPage): Extract<FeedState, { status: 'ready' }> {
  return {
    status: 'ready',
    rows: page.notifications.map(toOperationsNotification),
    nextCursor: page.nextCursor,
    unread: page.unread,
  };
}
