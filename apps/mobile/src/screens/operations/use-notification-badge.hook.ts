import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchNotificationBadge } from '@/lib/api/notifications';

/*
  HUB ZİLİNİN SAYISI (05.09) — üç bölüm kökü (depo · kurye · yönetim) bunu okur.

  NEDEN AYRI BİR KANCA: üç hub, bir SAYI için bildirim akışının tamamını çekiyordu
  (`useOperationsNotifications().unread`) — her hub odağında 30 satırlık bir tur. Üstelik sayı o
  30 satırdan yeniden hesaplandığı için sayfa boyu rozetin tavanıydı: 40 okunmamışı olan kişide
  rozet 30 diyordu. `/badge` ucu bunun için zaten vardı ve operasyonda hiç çağrılmıyordu.

  SAYI TÜM BÖLÜMLERİN TOPLAMIDIR (kullanıcı kararı 05.09), bölüm başına değil: çok şapkalı
  personel "toplam kaç iş bekliyor" sorusunun cevabını her hub'da okuyabilsin. Bölüm ayrımını
  bildirim ekranının süzgeç çipleri yapıyor.

  `null` = HENÜZ ÖLÇÜLMEDİ ve bu sıfırdan farklıdır (CLAUDE §1): ölçüm düşerse rozet çizilmez,
  "0" yazılmaz — bozuk bir ölçümü "iş yok" diye okutmak, dolu bir kuyruktan uzaklaştırır.
*/
export function useOperationsNotificationBadge(): number | null {
  const [unread, setUnread] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      void fetchNotificationBadge('staff')
        .catch(() => null)
        .then((result) => {
          // Hata/misafirde son bilinen değer korunur; sıfıra düşürmek bozuk ölçümü sağlıklı gösterirdi.
          if (result === null || result.error !== null) return;
          setUnread(result.data.unread);
        });
    }, []),
  );

  return unread;
}
