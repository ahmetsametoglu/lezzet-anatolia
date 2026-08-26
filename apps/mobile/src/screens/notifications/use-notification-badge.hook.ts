import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { BELL_EVENT, notificationsChannelName } from '@lezzet/types';

import { fetchNotificationBadge } from '@/lib/api/notifications';
import { getSupabase } from '@/lib/auth/supabase';

/*
  VİTRİN ZİLİNİN ROZETİ — sayı gerçek uçtan (`/me/notifications/badge`), liste çekilmeden.

  ÜÇ TAZELEME ANI, üçü de ucuz:
  · Odak: vitrin öne gelince (bildirim ekranından dönüş dahil — okunan satırın rozeti anında düşer).
  · Zil: kişinin kendi kanalı (boş yük, `use-ticket.hook` kalıbı) — sunucu satır yazınca çalar.
  · Kimlik değişimi: misafirde sıfırlanır, girişte yeniden okunur.

  ROZET YALAN SÖYLEMEZ: hata anında sayı SIFIRA DÜŞÜRÜLMEZ, son bilinen değerde kalır — "0"
  okunacak bir şey olmadığını iddia eder ve bozuk ölçümü sağlıklı gibi okutur (CLAUDE §1:
  ölçülemeyen değer sıfır değildir). Misafir hâli bunun istisnası DEĞİL: orada gerçek sıfırdır,
  gösterilecek akış yoktur.
*/
export function useNotificationBadge(profileId: string | null): number {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (profileId === null) {
      setUnread(0);
      return;
    }
    // Reddi yutulur (künyeli): env'siz ortamda `authorizedFetch` kurulamadan fırlar ve rozet bir
    // hızlandırıcıdır — sayı son bilinen değerde kalır (yukarıdaki "rozet yalan söylemez" kuralı).
    void fetchNotificationBadge()
      .then((result) => {
        if (result.error === null) setUnread(result.data.unread);
      })
      .catch(() => undefined);
  }, [profileId]);

  useFocusEffect(refresh);

  useEffect(() => {
    if (profileId === null) return;
    // Kanal kurulamazsa (env'siz test, kısıtlı ortam) rozet ODAK tazelemesiyle yaşamaya devam
    // eder — canlılık bir hızlandırıcıdır, yokluğu sayacı öldürmez (künyeli yutma).
    try {
      const channel = getSupabase()
        .channel(notificationsChannelName(profileId))
        .on('broadcast', { event: BELL_EVENT }, refresh)
        .subscribe();
      return () => {
        void channel.unsubscribe();
      };
    } catch {
      return undefined;
    }
  }, [profileId, refresh]);

  return unread;
}
