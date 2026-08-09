import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';

import { fetchOrders, type OrderSummary } from '@/lib/api/orders';

/*
  SİPARİŞ LİSTESİ VERİSİ — katalog hook'unun (`use-catalog.hook.ts`) sayfalama deseni birebir,
  süzgeç ekseni olmadan: siparişlerin arama/kategori/sıralaması YOK (v3 `vOrders` hiçbirini
  çizmiyor), tek eksen zamandır ve sıra sunucunun (en yeni önce).

  SAYFALAYAN OKUMANIN TÜKETENİ VAR (CLAUDE §1): `nextCursor` saklanır ve bir sonraki istekte aynen
  geri verilir; `null` gelene kadar liste büyür. İmleç OPAKTIR ve URL'e yazılmaz — paylaşılabilecek
  bir seçim yok, liste kaydırdıkça uzar.

  MİSAFİR AYRI BİR HÂLDİR, hata değil (v3 `ov.guest`): oturum yokken `authorizedFetch` ağa hiç
  çıkmaz, yerel 401 kısa devresiyle döner ve ekran giriş kapısını çizer. `error` yalnız oturum
  VARKEN listenin okunamamasıdır — ikisini tek "hata"ya indirmek, giriş yapmamış müşteriye
  "bağlantı kurulamadı" demek olurdu.

  ESKİMİŞ CEVAP KORUMASI (`generation`): yenileme ya da tekrar-dene sayacı artırır; uçuşta olan
  eski istekler döndüğünde sayacı tutmadıkları için sonuçları YAZILMAZ ("Tekrar dene"ye art arda
  basan parmağın iki uçuşu).

  KUYRUK HATASI LİSTEYİ DÜŞÜRMEZ: ilk yük düşerse ekran hata durumuna geçer; KUYRUK düşerse liste
  yerinde kalır ve sonunda tekrar-dene çıkar. İkisi ayrı şey — biri "hiç veri yok", öteki
  "devamı gelmedi".
*/

/** İlk yükün dört hâli — `guest` = oturum yok (hata değil, kapı). */
type OrdersStatus = 'loading' | 'guest' | 'ready' | 'error';

interface UseOrdersResult {
  status: OrdersStatus;
  orders: OrderSummary[];
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

export function useOrders(locale: Locale): UseOrdersResult {
  const [status, setStatus] = useState<OrdersStatus>('loading');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /** Kaçıncı yükün geçerli olduğu. Her yeni yük artırır; eski cevaplar sessizce düşer. */
  const generation = useRef(0);

  const load = useCallback(
    async (options: { refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');
      setTailFailed(false);

      const result = await fetchOrders(locale);
      if (run !== generation.current) return;

      setRefreshing(false);
      // Uçuşta kalmış bir kuyruk isteği varsa göstergesi burada kapanır: cevabı artık yazılmayacak
      // (sayaç değişti), yani gösterge kendi kendine sönmezdi.
      setLoadingMore(false);

      if (result.error !== null) {
        // Yerel kısa devre 401'i (oturum yok) MİSAFİRDİR; kalanı gerçek arızadır (`use-me.hook`ın
        // aynı ayrımı). Yenilemede liste yerinde bırakılmaz: oturum kapandıysa eski satırların
        // ekranda kalması, çıkış yapmış müşteriye başkasının verisi gibi görünürdü.
        setOrders([]);
        setCursor(null);
        setStatus(result.status === 401 ? 'guest' : 'error');
        return;
      }

      setOrders(result.data.orders);
      setCursor(result.data.nextCursor);
      setStatus('ready');
    },
    [locale],
  );

  // Açılış yükü. `load` yalnız dile bağlı olduğu için bu etki bir kez koşar.
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

    void fetchOrders(locale, cursor).then((result) => {
      // Bu kuyruk artık BAŞKA bir listenin kuyruğu olabilir (yenileme oldu) — yazılmaz.
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      setOrders((current) => [...current, ...result.data.orders]);
      setCursor(result.data.nextCursor);
    });
  }, [cursor, loadingMore, locale, status]);

  return {
    status,
    orders,
    hasMore: cursor !== null,
    loadingMore,
    tailFailed,
    refreshing,
    loadMore,
    refresh,
    retry,
  };
}
