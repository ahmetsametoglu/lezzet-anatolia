'use client';

import { useEffect, useState } from 'react';
import { BELL_EVENT } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';
import { customerNotificationBadgeAction } from '@/lib/notifications/actions';

/*
  OKUNMAMIŞ BİLDİRİM SAYISI (14.15) — zilin ve başlıktaki hesap menüsünün TEK kaynağı.

  Zilin içinden çıkarıldı (13.09): v1 tasarımında masaüstü başlığında zil yok, sayı hesap menüsünde
  ve avatarın rozetinde okunuyor. Aynı sayıyı iki bileşen ayrı ayrı sorsaydı biri canlı kanalı
  dinleyip öteki dinlemezdi.

  ── SAYI SUNUCUDAN ──────────────────────────────────────────────────────────
  İlk okuma bitmeden `null` döner (0 göstermek "bildiriminiz yok" derdi — ölçülemeyen değer sıfır
  değildir). Canlılık kişinin kendi kanalından (adı sunucuda profil kimliğinden türedi, aksiyon
  söyler); kanal yükü boş — duyunca sayı SUNUCUDAN yeniden istenir. Aynı sekmedeki akış sayfası
  okundu işaretleyince `NOTIFICATIONS_CHANGED_EVENT` atar; o olay da yük taşımaz, sayının tek
  kaynağı hep aynı kapı.
*/

/** Akış sayfası ↔ sayaç senkronu — window olayı, yüksüz: "sayın değişti, sunucuya bak". */
export const NOTIFICATIONS_CHANGED_EVENT = 'lezzet:notifications-changed';

export function useUnreadNotifications(): number | null {
  const [unread, setUnread] = useState<number | null>(null);
  const [channel, setChannel] = useState<string | null>(null);

  // İlk soru: sayı + dinlenecek kanal tek turda. Hata sessiz ama izli (aksiyon funnel'ı kaydeder);
  // sayı `null` kalır — girişli yüzeyde tek sebebi süresi dolan oturumdur.
  useEffect(() => {
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
  }, []);

  // Canlı bağ — kanal adı öğrenilince kurulur; gizli sekme tur atmaz, dönüşte bir kez sorar.
  useEffect(() => {
    if (!channel) return;
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
  }, [channel]);

  return unread;
}
