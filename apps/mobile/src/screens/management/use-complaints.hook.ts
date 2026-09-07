import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ComplaintRow, TicketType } from '@lezzet/types';

import type { ApiFail } from '@/lib/api/client';
import { fetchComplaints } from '@/lib/api/management';

/*
  Y1 · TALEP LİSTESİ VERİSİ (21.281) — sosyal gelen kutusu kancasının (`use-social-inbox.hook.ts`)
  sayfalama deseni birebir: keyset + sonsuz kaydırma, eskimiş cevap koruması (`generation`),
  "kuyruk hatası listeyi DÜŞÜRMEZ" ayrımı, odakta sessiz tazeleme.

  Desen kopyalanmadı, İZLENDİ: iki kanca aynı şekli konuşuyor ama farklı uçları ve farklı süzgeç
  eksenlerini taşıyor. Ortak bir "sayfalı liste" kancasına indirmek, iki ekranın süzgeç kavramını
  tek bir soyutlamanın ortak paydası yapardı — üçüncü ekran geldiğinde o payda ya şişer ya yalan
  söyler. Sabit olan şey desen; paylaşılan şey `fetchComplaints`in kendisi.

  ── SÜZGEÇ TEK SEÇİMLİ, ÇÜNKÜ ŞERİT TEK SEÇİMLİ ────────────────────────────
  Tasarımda (v3:29) her an TAM BİR çip koyu. Süzgeci iki bağımsız duruma (tür + hâl) bölmek
  ekranda çizilmeyen bir kombinasyonu (`bozuk` + `top bizde`) temsil ederdi; uç ikisini ayrı
  taşıyor (orada meşru bir daralma) ama EKRANIN hâli tek değerdir.

  ── SAYAÇLAR SÜZGEÇTEN BAĞIMSIZ ─────────────────────────────────────────────
  Şeridin sayıları her cevapta aynı gelir (uç künyesi): çip "bozuk · 3" derken bu sayı seçili
  süzgece göre değişseydi operatör o çipe basmadan oradaki sayıyı hiç göremezdi.
*/

/** Şeridin seçili çipi — tasarımda her an tam biri koyu. */
export type ComplaintFilter = { kind: 'all' } | { kind: 'awaiting' } | { kind: 'resolved' } | { kind: 'type'; type: TicketType };

/** İki süzgeç aynı çipi mi gösteriyor — çipin koyu çizilip çizilmeyeceği. */
export function sameFilter(a: ComplaintFilter, b: ComplaintFilter): boolean {
  return a.kind === 'type' && b.kind === 'type' ? a.type === b.type : a.kind === b.kind;
}

/** Süzgecin tele giden hâli — `type` seçiliyse uç onu daha dar soru sayar (uç künyesi). */
function wireOf(filter: ComplaintFilter): { filter?: 'all' | 'awaiting' | 'resolved'; type?: TicketType } {
  return filter.kind === 'type' ? { type: filter.type } : { filter: filter.kind };
}

type ComplaintsStatus = 'loading' | 'ready' | 'error';

/** Şerit sayaçları — sözleşmenin `counts` alanı; ekran çiplerin üstünde yazar. */
interface ComplaintCounts {
  all: number;
  byType: Partial<Record<TicketType, number>>;
  awaiting: number;
  resolved: number;
}

const EMPTY_COUNTS: ComplaintCounts = { all: 0, byType: {}, awaiting: 0, resolved: 0 };

interface UseComplaintsResult {
  status: ComplaintsStatus;
  /** `status === 'error'` iken düşen çağrının kendisi — ekran sebep cümlesini ondan kurar. */
  failure: ApiFail | null;
  rows: ComplaintRow[];
  counts: ComplaintCounts;
  filter: ComplaintFilter;
  hasMore: boolean;
  loadingMore: boolean;
  /** Kuyruk sayfası düştü — LİSTE yerinde durur, ekran yalnız dipte söyler. */
  tailFailed: boolean;
  refreshing: boolean;
  setFilter: (value: ComplaintFilter) => void;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

export function useComplaints(): UseComplaintsResult {
  const [status, setStatus] = useState<ComplaintsStatus>('loading');
  const [failure, setFailure] = useState<ApiFail | null>(null);
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [counts, setCounts] = useState<ComplaintCounts>(EMPTY_COUNTS);
  const [filter, setFilter] = useState<ComplaintFilter>({ kind: 'all' });
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /** Kaçıncı yükün geçerli olduğu — süzgeç değişimi de yeni bir yüktür; eski cevaplar sessizce düşer. */
  const generation = useRef(0);
  const loaded = useRef(false);

  const load = useCallback(
    async (options: { silent: boolean; refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else if (!options.silent) setStatus('loading');
      setTailFailed(false);

      const result = await fetchComplaints(wireOf(filter));
      if (run !== generation.current) return;

      setRefreshing(false);
      setLoadingMore(false);
      loaded.current = true;

      if (result.error !== null) {
        setRows([]);
        setCursor(null);
        setFailure(result);
        setStatus('error');
        return;
      }

      setRows(result.data.rows);
      setCounts(result.data.counts);
      setCursor(result.data.nextCursor);
      setFailure(null);
      setStatus('ready');
    },
    [filter],
  );

  /* Odakta tazelenir ve bu liste için ŞART: operatör bir talebi açıp cevaplayıp geri döner —
     "top bizde" rozeti ile şeridin sayacı o anda değişmiş olur. Sessiz, çünkü ekranı karartmak
     zaten okunan bir listeyi geri alırdı (21.119'un dersi). */
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
    // `FlatList` `onEndReached`i cömertçe tetikler; kapı burada (sosyal kuyruğun aynı üç şartı).
    if (cursor === null || loadingMore || status !== 'ready') return;

    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchComplaints({ cursor, ...wireOf(filter) }).then((result) => {
      // Bu kuyruk artık BAŞKA bir listenin kuyruğu olabilir (süzgeç/odak değişti) — yazılmaz.
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      /* Sayaçlara DOKUNULMAZ: devam sayfası da onları taşıyor ama bayat olabilir (ilk sayfadan
         bu yana biri cevaplanmış olabilir) ve taze listeyle karıştırmak şeridi yalancı yapar. */
      setRows((current) => [...current, ...result.data.rows]);
      setCursor(result.data.nextCursor);
    });
  }, [cursor, loadingMore, status, filter]);

  return {
    status,
    failure,
    rows,
    counts,
    filter,
    hasMore: cursor !== null,
    loadingMore,
    tailFailed,
    refreshing,
    setFilter,
    loadMore,
    refresh,
    retry,
  };
}
