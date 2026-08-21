import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ConversationSource } from '@lezzet/types';

import { fetchSocialInbox, type SocialRow } from '@/lib/api/social';

/*
  SOSYAL KUYRUK VERİSİ — talep listesi hook'unun (`use-tickets.hook.ts`) sayfalama deseni birebir:
  keyset + sonsuz kaydırma, eskimiş cevap koruması (`generation`), "kuyruk hatası listeyi düşürmez"
  ayrımı, odakta sessiz tazeleme.

  `guest` HÂLİ YOK ve bu bilinçli (depo hook'larının aynı kararı): bu ekran operasyon kabuğunun
  (`(operations)/_layout`) arkasında yaşar — oturumsuz kişi buraya hiç ulaşamaz. 401/403 (kapı
  kapandı, rol düştü) `error`a düşer; kabuk zaten bir sonraki `/me` okumasında dışarı alır.

  ── SÜZGEÇ HOOK'UN İÇİNDE, ADRESTE DEĞİL ────────────────────────────────────
  Web süzgeci URL'e yazıyor (paylaşılabilir adres); mobilde adres çubuğu yok ve süzgeç ekranın
  anlık hâlidir. Süzgeç değişince liste AYNI yükleme yolundan geçer — `load` süzgece bağlı, yani
  `useFocusEffect` bağımlılığı değişir ve kendiliğinden yeniden koşar; ikinci bir yükleme yolu yok.

  SAYAÇLAR İLK SAYFANIN CEVABINDAN TUTULUR: kuyruk sayfası eklerken sayaçlara dokunulmaz — sayaç
  SAYIMDIR (uç künyesi), sayfa uzunluğundan türetilirse tam da kalabalıkta yalan söylerdi.
*/

type InboxStatus = 'loading' | 'ready' | 'error';

/** Kanal daraltması — `undefined` = tüm kanallar (web `SOCIAL_CHANNELS`in "all" hâli). */
export type ChannelFilter = ConversationSource | undefined;

interface UseSocialInboxResult {
  status: InboxStatus;
  rows: SocialRow[];
  counts: { awaitingReply: number; handledByAi: number };
  awaitingOnly: boolean;
  channel: ChannelFilter;
  hasMore: boolean;
  loadingMore: boolean;
  tailFailed: boolean;
  refreshing: boolean;
  setAwaitingOnly: (value: boolean) => void;
  setChannel: (value: ChannelFilter) => void;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

export function useSocialInbox(): UseSocialInboxResult {
  const [status, setStatus] = useState<InboxStatus>('loading');
  const [rows, setRows] = useState<SocialRow[]>([]);
  const [counts, setCounts] = useState({ awaitingReply: 0, handledByAi: 0 });
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [channel, setChannel] = useState<ChannelFilter>(undefined);
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

      const result = await fetchSocialInbox({ filter: awaitingOnly ? 'awaiting' : 'all', source: channel });
      if (run !== generation.current) return;

      setRefreshing(false);
      setLoadingMore(false);
      loaded.current = true;

      if (result.error !== null) {
        setRows([]);
        setCursor(null);
        setStatus('error');
        return;
      }

      setRows(result.data.rows);
      setCounts(result.data.counts);
      setCursor(result.data.nextCursor);
      setStatus('ready');
    },
    [awaitingOnly, channel],
  );

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
    // `FlatList` `onEndReached`i cömertçe tetikler; kapı burada (talep listesinin aynı üç şartı).
    if (cursor === null || loadingMore || status !== 'ready') return;

    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchSocialInbox({ cursor, filter: awaitingOnly ? 'awaiting' : 'all', source: channel }).then((result) => {
      // Bu kuyruk artık BAŞKA bir listenin kuyruğu olabilir (süzgeç/odak değişti) — yazılmaz.
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      setRows((current) => [...current, ...result.data.rows]);
      setCursor(result.data.nextCursor);
    });
  }, [cursor, loadingMore, status, awaitingOnly, channel]);

  return {
    status,
    rows,
    counts,
    awaitingOnly,
    channel,
    hasMore: cursor !== null,
    loadingMore,
    tailFailed,
    refreshing,
    setAwaitingOnly,
    setChannel,
    loadMore,
    refresh,
    retry,
  };
}
