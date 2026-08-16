'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Alt yol BİLEREK: barrel `@lezzet/application` sunucu kapılarının tamamını (ve `node:crypto`
// kullanan `bell.ts`i) çekerdi — bu dosya tarayıcıda koşuyor.
import { BELL_EVENT } from '@lezzet/application/realtime/bell-event';
import { createClient } from '@/lib/supabase/client';

/**
 * Operasyon ekranının CANLI BAĞI (16.8). Çizdiği bir şey yok — tek işi **zili duyunca sayfayı
 * sunucudan yeniden istemek**.
 *
 * ── NEDEN GEREKLİ ───────────────────────────────────────────────────────────
 * Talep yazısı üç ayrı süreçten geliyor ve üçü de operatörün tarayıcısından bağımsız: müşteri
 * mobil uygulamadan yazıyor (`apps/mobile-api`), müşteri web `/support`tan yazıyor, AI cron'u
 * taslak/cevap yazıyor (`apps/backend`). Operatör ekranı açık tutuyor ve hiçbiri görünmüyordu —
 * ancak F5'e basınca beliriyordu.
 *
 * ── NEDEN `router.refresh()` ────────────────────────────────────────────────
 * Sunucu bileşenini yeniden çalıştırır, yani kuyruk VE seçili yazışma (adresteki `?t=`) aynı turda
 * tazelenir; istemci hiçbir veriyi kendi kurmaz. Zil zaten boş: ne olduğunu söyleyen tek kaynak
 * sunucu render'ıdır (`@lezzet/application/realtime/bell` künyesi).
 *
 * ── SEKME GÖRÜNMEZKEN YENİLEME YOK ──────────────────────────────────────────
 * Arka plandaki sekme de zili duyar; her mesajda bir sunucu turu atması boşuna yüktür ve operatör
 * o an bakmıyor. Kaçırılan zil kaybolmuyor: sekmeye dönüldüğünde `visibilitychange` bir kez
 * yeniliyor — yani gecikme var, kayıp yok.
 */
export function LiveRefresh({ channel }: { channel: string }) {
  const router = useRouter();

  useEffect(() => {
    let missedWhileHidden = false;

    const refresh = () => {
      if (document.visibilityState === 'hidden') {
        missedWhileHidden = true;
        return;
      }
      router.refresh();
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !missedWhileHidden) return;
      missedWhileHidden = false;
      router.refresh();
    };

    const supabase = createClient();
    const live = supabase.channel(channel).on('broadcast', { event: BELL_EVENT }, refresh).subscribe();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(live);
    };
  }, [channel, router]);

  return null;
}
