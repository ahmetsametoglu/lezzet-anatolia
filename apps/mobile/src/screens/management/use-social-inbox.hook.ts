import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { BELL_EVENT, type ConversationHandler, type ConversationSource } from '@lezzet/types';

import { getSupabase } from '@/lib/auth/supabase';
import type { ApiFail } from '@/lib/api/client';
import { fetchSocialInbox, type SocialRow } from '@/lib/api/social';

/*
  SOSYAL KUYRUK VERİSİ — talep listesi hook'unun (`use-tickets.hook.ts`) sayfalama deseni birebir:
  keyset + sonsuz kaydırma, eskimiş cevap koruması (`generation`), "kuyruk hatası listeyi düşürmez"
  ayrımı, odakta sessiz tazeleme.

  `guest` HÂLİ YOK ve bu bilinçli (depo hook'larının aynı kararı): bu ekran operasyon kabuğunun
  (`(operations)/_layout`) arkasında yaşar — oturumsuz kişi buraya hiç ulaşamaz. 401/403 (kapı
  kapandı, rol düştü) `error`a düşer; kabuk zaten bir sonraki `/me` okumasında dışarı alır.

  ── DÜŞEN ÇAĞRININ SEBEBİ SAKLANIR, ATILMAZ (06.09'da ölçüldü) ──────────────
  Hata dalı yalnız `status: 'error'` yazıyordu ve anahtar çöpe gidiyordu; ekran da her sebebe
  "Bağlantıyı kontrol edin" diyordu. Cihazda arıza tam da bu yüzden yanlış okundu: oturum ölmüştü
  (`401`, istek ağa hiç çıkmadı) ama operatörün gördüğü cümle wifi'yi işaret ediyordu. Sonucun
  kendisi tutuluyor — sebebi ekranın sözlüğü söyleyecek (`operationsFailureText`).

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
  /** `status === 'error'` iken düşen çağrının kendisi — ekran sebep cümlesini ondan kurar. */
  failure: ApiFail | null;
  rows: SocialRow[];
  counts: { awaitingReply: number; handledByAi: number };
  awaitingOnly: boolean;
  channel: ChannelFilter;
  /** Yürütücü süzgeci (21.289) — `undefined` = hepsi. */
  handler: ConversationHandler | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  tailFailed: boolean;
  refreshing: boolean;
  setAwaitingOnly: (value: boolean) => void;
  setChannel: (value: ChannelFilter) => void;
  setHandler: (value: ConversationHandler | undefined) => void;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

export function useSocialInbox(): UseSocialInboxResult {
  const [status, setStatus] = useState<InboxStatus>('loading');
  const [failure, setFailure] = useState<ApiFail | null>(null);
  const [rows, setRows] = useState<SocialRow[]>([]);
  const [counts, setCounts] = useState({ awaitingReply: 0, handledByAi: 0 });
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [channel, setChannel] = useState<ChannelFilter>(undefined);
  const [handler, setHandler] = useState<ConversationHandler | undefined>(undefined);
  /* Canlı zilin ADI sunucudan gelir (sözleşme künyesi): istemci onu hesaplayamaz, çünkü operasyon
     kuyruğunun adı sunucu sırrından türetiliyor. İlk sayfa gelene kadar abone olunacak bir şey de
     yok — o yüzden `null` başlar ve zincir kendiliğinden sıraya girer. */
  const [bellChannel, setBellChannel] = useState<string | null>(null);
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

      const result = await fetchSocialInbox({
        filter: awaitingOnly ? 'awaiting' : 'all',
        source: channel,
        handledBy: handler,
      });
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
      setBellChannel(result.data.channel);
      setFailure(null);
      setStatus('ready');
    },
    [awaitingOnly, channel, handler],
  );

  useFocusEffect(
    useCallback(() => {
      void load({ silent: loaded.current, refresh: false });
    }, [load]),
  );

  const refresh = useCallback(() => {
    void load({ silent: true, refresh: true });
  }, [load]);

  /*
    CANLI GELEN KUTUSU (21.289 · kullanıcı bulgusu 07.09) — **kapı zili, veri borusu değil.**

    ── ÇÖZÜLEN ARIZA ───────────────────────────────────────────────────────────
    Ekran açıkken gelen yeni bir konuşma listeye HİÇ düşmüyordu; ölçüldü: veritabanında beş
    konuşma varken ekranda dört satır ve altında "Liste bitti" yazıyordu. Tazelenmenin iki yolu
    vardı ve ikisi de operatörün bir şey yapmasını bekliyordu (ekrana geri dönmek · aşağı çekmek).
    Sunucu zili ZATEN çalıyordu (`ringConversationsBell` — webhook · özerk ajan · cevap ucu) ve
    web onu dinliyordu (`LiveRefresh`); dinlemeyen yalnız mobildi.

    ── KANALDAN VERİ GEÇMEZ ────────────────────────────────────────────────────
    Zil boş bir "changed" yayınlar, ekran duyunca kuyruğu SUNUCUDAN yeniden ister — talep
    yazışmasının aynı deseni (`use-ticket.hook`). Projede RLS yok ve her okuma sunucuda
    service-role ile yapılıyor; istemciyi `conversation` tablosuna abone etmek o duvarda ilk delik
    olurdu.

    ── SESSİZ TAZELEME ─────────────────────────────────────────────────────────
    `refresh` iskelet çizmez (`silent`), çünkü operatör listeye BAKIYOR olabilir: gelen bir mesaj
    yüzünden ekranı boşaltıp yeniden çizmek, okunan satırı parmağın altından çekmek olurdu.
  */
  useEffect(() => {
    if (bellChannel === null) return;

    const supabase = getSupabase();
    const subscription = supabase
      .channel(bellChannel)
      .on('broadcast', { event: BELL_EVENT }, () => refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [bellChannel, refresh]);

  const retry = useCallback(() => {
    void load({ silent: false, refresh: false });
  }, [load]);

  const loadMore = useCallback(() => {
    // `FlatList` `onEndReached`i cömertçe tetikler; kapı burada (talep listesinin aynı üç şartı).
    if (cursor === null || loadingMore || status !== 'ready') return;

    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchSocialInbox({
      cursor,
      filter: awaitingOnly ? 'awaiting' : 'all',
      source: channel,
      handledBy: handler,
    }).then((result) => {
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
  }, [cursor, loadingMore, status, awaitingOnly, channel, handler]);

  return {
    status,
    failure,
    rows,
    counts,
    awaitingOnly,
    channel,
    handler,
    hasMore: cursor !== null,
    loadingMore,
    tailFailed,
    refreshing,
    setAwaitingOnly,
    setChannel,
    setHandler,
    loadMore,
    refresh,
    retry,
  };
}
