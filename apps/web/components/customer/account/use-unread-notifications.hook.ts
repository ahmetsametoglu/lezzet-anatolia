'use client';

import { useEffect, useState } from 'react';
import { BELL_EVENT } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';
import { customerNotificationBadgeAction } from '@/lib/notifications/actions';

/*
  Okunmamış bildirim sayısı, zilin ve hesap menüsünün tek kaynağı: ikisi ayrı sorsa biri canlı kanalı dinleyip öteki dinlemezdi.
  Kanal ve sayfa olayları yük taşımaz, duyulunca sayı yeniden sunucudan sorulur.
*/

/** Akış sayfası ↔ sayaç senkronu — window olayı, yüksüz: "sayın değişti, sunucuya bak". */
export const NOTIFICATIONS_CHANGED_EVENT = 'lezzet:notifications-changed';

/** İlk okuma bitmeden `null` döner, çünkü 0 "bildiriminiz yok" demektir; `enabled` yanlışken hiç sorulmaz. */
export function useUnreadNotifications(enabled = true): number | null {
  const [unread, setUnread] = useState<number | null>(null);
  const [channel, setChannel] = useState<string | null>(null);

  // Sayı ve dinlenecek kanal tek turda gelir; hata aksiyonun kendisinde izlenir ve sayı `null` kalır.
  useEffect(() => {
    if (!enabled) return;
    let acik = true;
    const sor = () => {
      void customerNotificationBadgeAction().then((res) => {
        if (!acik || !res.data) return;
        setUnread(res.data.unread);
        setChannel(res.data.channel);
      });
    };
    sor();

    const onChanged = () => sor();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => {
      acik = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, [enabled]);

  // Canlı bağ — kanal adı öğrenilince kurulur; gizli sekme tur atmaz, dönüşte bir kez sorar.
  useEffect(() => {
    if (!enabled || !channel) return;
    let missedWhileHidden = false;
    const sor = () => {
      void customerNotificationBadgeAction().then((res) => {
        if (res.data) setUnread(res.data.unread);
      });
    };
    const onBell = () => {
      if (document.visibilityState === 'hidden') {
        missedWhileHidden = true;
        return;
      }
      sor();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !missedWhileHidden) return;
      missedWhileHidden = false;
      sor();
    };

    const supabase = createClient();
    const live = supabase.channel(channel).on('broadcast', { event: BELL_EVENT }, onBell).subscribe();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(live);
    };
  }, [channel, enabled]);

  return enabled ? unread : null;
}
