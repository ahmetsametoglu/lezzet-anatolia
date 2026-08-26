'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { BELL_EVENT } from '@lezzet/types';
import { createClient } from '@/lib/supabase/client';
import { Link } from '@/i18n/navigation';
import { customerNotificationBadgeAction } from '@/lib/notifications/actions';
import messages from './account-messages.json';

/*
  HESAP ZİLİ (14.15) — hesap alanı başlığının bildirim girişi: rozetli 🔔, tıklanınca akış sayfası.
  Web'de müşteri bildirimi = bu zil + o liste; tarayıcı push'u YOK ve eklenmeyecek (KARARLAR 26.08:
  aynı telefonda tarayıcı aboneliği ile uygulama jetonu ayırt edilemez — çift bildirim).

  ── SAYI SUNUCUDAN, GÖRÜNÜM CartBadge KURALIYLA ─────────────────────────────
  İlk okuma bitmeden rozet ÇİZİLMEZ (0 göstermek "bildiriminiz yok" derdi — ölçülemeyen değer
  sıfır değildir); sayı yalnız >0 iken çizilir. Canlılık kişinin kendi kanalından (adı sunucuda
  profil kimliğinden türedi, aksiyon söyler); kanal yükü boş — duyunca sayı SUNUCUDAN yeniden
  istenir. Aynı sekmedeki akış sayfası okundu işaretleyince `NOTIFICATIONS_CHANGED_EVENT` atar;
  o olay da yük taşımaz, zil yine sunucuya sorar — sayının tek kaynağı hep aynı kapı.
*/

/** Akış sayfası ↔ zil senkronu — window olayı, yüksüz: "sayın değişti, sunucuya bak". */
export const NOTIFICATIONS_CHANGED_EVENT = 'lezzet:notifications-changed';

interface NotificationBellProps {
  locale: Locale;
  /** Mobil hesap başlığında ikon bir tık küçük (FunnelHeader'ın sağ yuvası — CartBadge'in aynı ayrımı). */
  compact?: boolean;
}

export function NotificationBell({ locale, compact = false }: NotificationBellProps) {
  const t = messages[locale];
  const [unread, setUnread] = useState<number | null>(null);
  const [channel, setChannel] = useState<string | null>(null);

  // İlk soru: sayı + dinlenecek kanal tek turda. Hata sessiz ama izli (aksiyon funnel'ı kaydeder);
  // zil rozetsiz kalır — girişli hesap sayfasında tek sebebi süresi dolan oturumdur.
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

  return (
    <Link href="/account/notifications" aria-label={t.notifications} title={t.notifications} className="relative cursor-pointer">
      <span className={['font-sans text-ink', compact ? 'text-icon-sm' : 'text-icon'].join(' ')}>🔔</span>
      {unread !== null && unread > 0 && (
        <span className="absolute -top-1.5 -right-2 rounded-soft bg-terracotta px-1.5 py-px font-sans text-micro font-bold text-white">
          {/* Tavan gizleme değil sığdırma: "99+" yine "çok" der, gerçek sayı akış sayfasında. */}
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
