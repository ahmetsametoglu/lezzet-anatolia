import { useEffect, useRef } from 'react';
import { BELL_EVENT } from '@lezzet/types';

import { getSupabase } from '@lezzet/mobile-kit/src/lib/auth/supabase';

/*
  CANLI ZİL — KANAL BAŞINA TEK ABONELİK (15.35). Zil boştur (21.289 künyesi): ne olduğunu sunucu söyler,
  duyan taraf veriyi SUNUCUDAN yeniden ister.

  ── NEDEN ORTAK KAYIT ───────────────────────────────────────────────────────
  Kuyruk ekranı ve yeni mesaj sesi AYNI kanalı dinliyor. Supabase istemcisi (realtime-js 2.110) aynı adlı
  kanala ikinci `channel()` çağrısında YENİ bir abonelik açmıyor, var olanı döndürüyor: iki kanca kendi
  aboneliğini kursaydı biri ayrılırken (`removeChannel`) kanalı öteki için de kapatırdı ve ses sessizce
  kesilirdi. Burada kanal bir kez açılır, dinleyiciler içeride dağıtılır; son dinleyici ayrılınca kapanır.
  Web'in aynı kararı: `apps/web/components/operation/ui/use-bell.hook.ts` (15.34).
*/

type Listener = () => void;

interface BellSubscription {
  supabase: ReturnType<typeof getSupabase>;
  live: ReturnType<ReturnType<typeof getSupabase>['channel']>;
  listeners: Set<Listener>;
}

const subscriptions = new Map<string, BellSubscription>();

function subscribeBell(channel: string, listener: Listener): () => void {
  let entry = subscriptions.get(channel);
  if (!entry) {
    const supabase = getSupabase();
    const listeners = new Set<Listener>();
    const live = supabase
      .channel(channel)
      .on('broadcast', { event: BELL_EVENT }, () => {
        for (const notify of listeners) notify();
      })
      .subscribe();
    entry = { supabase, live, listeners };
    subscriptions.set(channel, entry);
  }
  entry.listeners.add(listener);

  return () => {
    const current = subscriptions.get(channel);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    subscriptions.delete(channel);
    void current.supabase.removeChannel(current.live);
  };
}

/** Kanalın zili çalınca `onBell`. `channel` `null` ise dinlenmez (ad henüz sunucudan gelmedi ya da kapı kapalı). */
export function useBellChannel(channel: string | null, onBell: () => void): void {
  // Son çağrılabilir tutulur: abonelik kanal değişmedikçe yeniden kurulmasın, ama çağrı hep taze olsun.
  const handler = useRef(onBell);
  useEffect(() => {
    handler.current = onBell;
  });

  useEffect(() => {
    if (channel === null) return;
    return subscribeBell(channel, () => handler.current());
  }, [channel]);
}
