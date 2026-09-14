'use client';

import { useEffect, useRef } from 'react';
import { BELL_EVENT } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';

/**
 * **Canlı zil** (16.8) — kanalın zili çalınca `onBell` çağrılır. Zil boştur: ne olduğunu söyleyen tek
 * kaynak sunucudur, duyan taraf veriyi SUNUCUDAN yeniden ister (`@lezzet/application/realtime/bell` künyesi).
 *
 * **Sekme görünmezken tur yok:** arka plandaki sekme de zili duyar ve her mesajda sunucuya gitmek boşuna
 * yüktür. Kaçırılan zil kaybolmaz — sekmeye dönülünce `visibilitychange` bir kez çağırır: gecikme var,
 * kayıp yok.
 *
 * Aynı diziliş üç yerde yazılıydı (canlı yenileme, bildirim zili — üçüncüsü mesaj penceresi olacaktı);
 * 15.32'de tek kancaya indi. `channel` `null` ise dinlenmez: kanal henüz bilinmiyor ya da kapı kapalı.
 * Aynı kanala iki abonelik AÇILMAMALI — tek yerde dinlenip içeride dağıtılır.
 */
export function useBell(channel: string | null, onBell: () => void): void {
  // Son çağrılabilir tutulur: abonelik kanal değişmedikçe yeniden kurulmasın, ama çağrı hep taze olsun.
  const handler = useRef(onBell);
  useEffect(() => {
    handler.current = onBell;
  });

  useEffect(() => {
    if (!channel) return;
    let missedWhileHidden = false;

    const ring = () => {
      if (document.visibilityState === 'hidden') {
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

    const supabase = createClient();
    const live = supabase.channel(channel).on('broadcast', { event: BELL_EVENT }, ring).subscribe();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(live);
    };
  }, [channel]);
}
