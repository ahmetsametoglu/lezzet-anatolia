import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPointsHistory, type PointsHistoryEntry } from '@/lib/api/points';

/*
  PUAN GEÇMİŞİ VERİSİ — sipariş listesi hook'unun (`use-orders.hook.ts`) sayfalama deseni birebir,
  dil ekseni olmadan: defter satırının çevrilecek bir içeriği yok (sebep bir ANAHTAR, cümleyi ekran
  kurar) ve sıra sunucunun — en yeni önce, tek eksen zaman.

  SAYFALAYAN OKUMANIN TÜKETENİ VAR (CLAUDE §1): `nextCursor` saklanır ve bir sonraki istekte aynen
  geri verilir; `null` gelene kadar liste büyür. Defter veriyle SINIRSIZ büyüyen bir küme — günde
  bir ziyaret puanı yazan müşteride bile satır sayısı yıllarla artar.

  ÜÇ AYRI HÂL, TEK "HATA" DEĞİL:
  · `guest`  — oturum yok; `authorizedFetch` ağa hiç çıkmadan yerel 401 döner.
  · `denied` — uç 403 `not_eligible` dedi: profil PROGRAM DIŞI (B2B). Boş listeye indirseydik ekran
               "hiç hareketiniz yok" derdi; doğrusu "bu program size açık değil" (CLAUDE §1).
               Pratikte buraya gelinmez — geçmişin kapısı puan kartının içinde ve kart B2B'de hiç
               çizilmiyor — ama ekran ikinci kapıyı kendi ölçütüyle tutar, çağıranın hatırlamasına
               güvenmez.
  · `error`  — gerçek arıza (ağ, sözleşme).

  KUYRUK HATASI LİSTEYİ DÜŞÜRMEZ: ilk yük düşerse ekran hata durumuna geçer; KUYRUK düşerse liste
  yerinde kalır ve sonunda tekrar-dene çıkar. Biri "hiç veri yok", öteki "devamı gelmedi".
*/

type PointsHistoryStatus = 'loading' | 'guest' | 'denied' | 'ready' | 'error';

/* İhraç EDİLMEZ (knip): ekran dönüşü çıkarımla okuyor — bugün dışarıdan adıyla anan yok. İlk dış
   tüketici çıkınca açılır (kitin öteki hook'larında da aynı hüküm). */
interface UsePointsHistoryResult {
  status: PointsHistoryStatus;
  entries: PointsHistoryEntry[];
  loadingMore: boolean;
  /** Kuyruk isteği düştü — liste yerinde, devamı gelmedi. */
  tailFailed: boolean;
  refreshing: boolean;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

export function usePointsHistory(): UsePointsHistoryResult {
  const [status, setStatus] = useState<PointsHistoryStatus>('loading');
  const [entries, setEntries] = useState<PointsHistoryEntry[]>([]);
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

    const result = await fetchPointsHistory();
    if (run !== generation.current) return;

    setRefreshing(false);
    // Uçuşta kalmış bir kuyruk isteğinin göstergesi burada kapanır: cevabı artık yazılmayacak.
    setLoadingMore(false);

    if (result.error !== null) {
      // Yenilemede liste YERİNDE BIRAKILMAZ: oturum kapandıysa eski satırların ekranda kalması,
      // çıkış yapmış müşteriye başkasının defterini göstermek olurdu.
      setEntries([]);
      setCursor(null);
      setStatus(result.status === 401 ? 'guest' : result.status === 403 ? 'denied' : 'error');
      return;
    }

    setEntries(result.data.entries);
    setCursor(result.data.nextCursor);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load({ refresh: false });
  }, [load]);

  const refresh = useCallback(() => {
    void load({ refresh: true });
  }, [load]);

  const retry = useCallback(() => {
    void load({ refresh: false });
  }, [load]);

  const loadMore = useCallback(() => {
    // Liste bittiyse, zaten yükleniyorsa ya da ekranda veri yoksa kuyruk istenmez. `FlatList`
    // `onEndReached`i cömertçe tetikler; kapı burada.
    if (cursor === null || loadingMore || status !== 'ready') return;

    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchPointsHistory(cursor).then((result) => {
      // Bu kuyruk artık BAŞKA bir listenin kuyruğu olabilir (yenileme oldu) — yazılmaz.
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      setEntries((current) => [...current, ...result.data.entries]);
      setCursor(result.data.nextCursor);
    });
  }, [cursor, loadingMore, status]);

  return { status, entries, loadingMore, tailFailed, refreshing, loadMore, refresh, retry };
}
