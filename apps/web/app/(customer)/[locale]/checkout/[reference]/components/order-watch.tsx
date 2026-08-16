'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BELL_EVENT } from '@lezzet/application/realtime/bell-event';
import { orderChannelName } from '@/lib/realtime/order-channel';

/**
 * Ödeme bekleyen onay ekranının canlı bağı. Çizdiği bir şey yok — tek işi **zili duyunca sayfayı
 * sunucudan yeniden istemek**.
 *
 * İki uyandırma birden var ve ikisi de gerekli:
 *  1. **Abonelik** — webhook sonrası gelen "değişti" mesajı (`lib/realtime/order-channel`).
 *  2. **Montajdaki tek yenileme** — webhook, müşteri bu sayfaya varmadan ÖNCE de düşebilir. O
 *     durumda çalan zili duyacak kimse yoktur; ilk kare bayat kalırdı. Kaçırılan zil ihtimali
 *     gerçek ve sık, kapatması ise bir istek.
 *
 * `router.refresh()` sunucu bileşenini yeniden çalıştırır: durum yine tek kaynaktan, veritabanından
 * okunur. İstemci hiçbir zaman "ödendi" kararını kendi vermez.
 */
export function OrderWatch({ orderId }: { orderId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(orderChannelName(orderId))
      .on('broadcast', { event: BELL_EVENT }, () => router.refresh())
      .subscribe();

    router.refresh();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, router]);

  return null;
}
