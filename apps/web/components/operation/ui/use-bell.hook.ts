'use client';

import { useEffect, useRef } from 'react';
import { BELL_EVENT } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';

/**
 * **Canlı zil** (16.8) — kanalın zili çalınca `onBell` çağrılır. Zil boştur: ne olduğunu söyleyen tek
 * kaynak sunucudur, duyan taraf veriyi SUNUCUDAN yeniden ister (`@lezzet/application/realtime/bell` künyesi).
 *
 * **Sekme görünmezken tur yok (varsayılan):** arka plandaki sekme de zili duyar ve her mesajda sunucuya gitmek
 * boşuna yüktür. Kaçırılan zil kaybolmaz — sekmeye dönülünce `visibilitychange` bir kez çağırır: gecikme var,
 * kayıp yok. **İstisna `whileHidden: 'run'`:** yeni mesaj sesi (15.34) tam da operatör başka sekmedeyken gerekir.
 *
 * **Aynı kanala TEK abonelik (15.34):** kanal başına bir Supabase aboneliği açılır, dinleyiciler içeride
 * dağıtılır; son dinleyici ayrılınca abonelik kapanır. Önceden her kanca kendi aboneliğini açıyordu ve aynı
 * kanalı iki yerden dinlemek (sohbet sayfası + mesaj penceresinin sesi) mümkün değildi — biri ayrılırken
 * kanalı öteki için de kapatırdı. `channel` `null` ise dinlenmez: kanal henüz bilinmiyor ya da kapı kapalı.
 */

type Listener = () => void;

interface BellSubscription {
  supabase: ReturnType<typeof createClient>;
  live: ReturnType<ReturnType<typeof createClient>['channel']>;
  listeners: Set<Listener>;
}

const subscriptions = new Map<string, BellSubscription>();

function subscribeBell(channel: string, listener: Listener): () => void {
  let entry = subscriptions.get(channel);
  if (!entry) {
    const supabase = createClient();
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

interface BellOptions {
  /** Sekme görünmezken: `defer` (varsayılan) dönüşte bir kez çağırır · `run` hemen çağırır. */
  whileHidden?: 'defer' | 'run';
}

export function useBell(channel: string | null, onBell: () => void, options: BellOptions = {}): void {
  // Son çağrılabilir tutulur: abonelik kanal değişmedikçe yeniden kurulmasın, ama çağrı hep taze olsun.
  const handler = useRef(onBell);
  useEffect(() => {
    handler.current = onBell;
  });
  const whileHidden = options.whileHidden ?? 'defer';

  useEffect(() => {
    if (!channel) return;
    let missedWhileHidden = false;

    const ring = () => {
      if (whileHidden === 'defer' && document.visibilityState === 'hidden') {
        missedWhileHidden = true;
        return;
      }
      handler.current();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !missedWhileHidden) return;
      missedWhileHidden = false;
      handler.current();
    };

    const unsubscribe = subscribeBell(channel, ring);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [channel, whileHidden]);
}
