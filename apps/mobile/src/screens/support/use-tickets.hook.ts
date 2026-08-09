import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchTickets, type TicketSummary } from '@/lib/api/tickets';

/*
  TALEP LİSTESİ VERİSİ — sipariş listesi hook'unun (`use-orders.hook.ts`) sayfalama deseni birebir:
  keyset + sonsuz kaydırma, eskimiş cevap koruması, "kuyruk hatası listeyi düşürmez" ayrımı.

  DÖRT HÂL ve dördü ayrı şey: `guest` (oturum yok — hata değil, kapı), `loading`, `error` (oturum
  VARKEN liste okunamadı), `ready`. İkisini tek "hata"ya indirmek, giriş yapmamış müşteriye
  "bağlantı kurulamadı" demek olurdu.

  ── ODAKTA TAZELENİR (siparişlerde OLMAYAN tek fark) ────────────────────────
  Yeni talep akışı gönderimden sonra LİSTEYE dönüyor (v3 `tnSubmit`) ve uç yalnız yeni talebin
  kimliğini veriyor — yani az önce yazılan talep, liste tazelenmezse ekranda HİÇ görünmez ve müşteri
  "gitmedi mi?" diye ikinci bir talep açar. `useFocusEffect` ilk girişte de koşar, yani tek yükleme
  yolu var; sonraki dönüşlerde iskelet gösterilmez (liste yerinde kalır, sessizce tazelenir) — yoksa
  her geri dönüş ekranı boşaltırdı. Kurye gün listesinin aynı kararı.

  SAYFALAYAN OKUMANIN TÜKETENİ VAR (CLAUDE §1): `nextCursor` saklanır ve bir sonraki istekte aynen
  geri verilir; `null` gelene kadar liste büyür. İmleç OPAKTIR ve hiçbir yere yazılmaz — paylaşılacak
  bir seçim yok, liste kaydırdıkça uzar.
*/

type TicketsStatus = 'loading' | 'guest' | 'ready' | 'error';

interface UseTicketsResult {
  status: TicketsStatus;
  tickets: TicketSummary[];
  /** Devam eden sayfa var mı (`nextCursor !== null`). */
  hasMore: boolean;
  loadingMore: boolean;
  /** Kuyruk isteği düştü — liste yerinde, devamı gelmedi. */
  tailFailed: boolean;
  refreshing: boolean;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

export function useTickets(): UseTicketsResult {
  const [status, setStatus] = useState<TicketsStatus>('loading');
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /** Kaçıncı yükün geçerli olduğu. Her yeni yük artırır; eski cevaplar sessizce düşer. */
  const generation = useRef(0);
  /** İlk yük yapıldı mı — odakta dönüşte iskelet gösterilmemesinin tek ölçütü. */
  const loaded = useRef(false);

  const load = useCallback(async (options: { silent: boolean; refresh: boolean }) => {
    const run = (generation.current += 1);
    if (options.refresh) setRefreshing(true);
    else if (!options.silent) setStatus('loading');
    setTailFailed(false);

    const result = await fetchTickets();
    if (run !== generation.current) return;

    setRefreshing(false);
    // Uçuşta kalmış bir kuyruk isteği varsa göstergesi burada kapanır: cevabı artık yazılmayacak
    // (sayaç değişti), yani gösterge kendi kendine sönmezdi.
    setLoadingMore(false);
    loaded.current = true;

    if (result.error !== null) {
      // Yerel kısa devre 401'i (oturum yok) MİSAFİRDİR; kalanı gerçek arızadır. Liste yerinde
      // bırakılmaz: oturum kapandıysa eski satırların ekranda kalması, çıkış yapmış müşteriye
      // başkasının verisi gibi görünürdü.
      setTickets([]);
      setCursor(null);
      setStatus(result.status === 401 ? 'guest' : 'error');
      return;
    }

    setTickets(result.data.tickets);
    setCursor(result.data.nextCursor);
    setStatus('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: loaded.current, refresh: false });
    }, [load]),
  );

  const refresh = useCallback(() => {
    void load({ silent: true, refresh: true });
  }, [load]);

  const retry = useCallback(() => {
    void load({ silent: false, refresh: false });
  }, [load]);

  const loadMore = useCallback(() => {
    // Liste bittiyse, zaten yükleniyorsa ya da ekranda veri yoksa kuyruk istenmez. `FlatList`
    // `onEndReached`i cömertçe tetikler; kapı burada.
    if (cursor === null || loadingMore || status !== 'ready') return;

    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchTickets(cursor).then((result) => {
      // Bu kuyruk artık BAŞKA bir listenin kuyruğu olabilir (odakta tazelendi) — yazılmaz.
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      setTickets((current) => [...current, ...result.data.tickets]);
      setCursor(result.data.nextCursor);
    });
  }, [cursor, loadingMore, status]);

  return { status, tickets, hasMore: cursor !== null, loadingMore, tailFailed, refreshing, loadMore, refresh, retry };
}
