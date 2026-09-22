import { useEffect, useState } from 'react';

import { confirmationPhaseOf, confirmationToneOf } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import { BELL_EVENT, type CheckoutOrderStatus } from '@lezzet/types';

import { getSupabase } from '@lezzet/mobile-kit/src/lib/auth/supabase';
import { fetchCheckoutOrderStatus } from '@/lib/api/checkout';

/** İlk soru ödeme sayfası kapanır kapanmaz, ikincisi kısa arayla: ödeme mesajı çoğu zaman bu arada gelmiştir. */
const FIRST_ASK_MS = 4_000;
/** Banka işliyorsa sonuç dakikalar sürebilir. */
const ASK_EVERY_MS = 20_000;
/** Sonrasını sunucunun ödeme zamanlayıcısı netleştirir; zil ekranı yine uyandırır. */
const ASK_FOR_MS = 30 * 60_000;

/** Sonuç belli mi: kesinleşti ya da reddedildi; beklemedeki hâller sorulmaya devam eder. */
function isSettled(status: CheckoutOrderStatus): boolean {
  const phase = confirmationPhaseOf(status);
  return phase === 'placed' || confirmationToneOf(phase) === 'failed';
}

/**
 * Kart ödemesi beklenen siparişin canlı durumu, web `order-watch`ın ikizi: sunucu her soruda sağlayıcıya sorup siparişi netleştirir.
 * Sipariş kanalının zili çalınca yeniden sorulur; `orderId` `null` ise hiç sorulmaz.
 */
export function useOrderStatus(orderId: string | null, locale: Locale): CheckoutOrderStatus | null {
  const [status, setStatus] = useState<CheckoutOrderStatus | null>(null);
  const [channel, setChannel] = useState<string | null>(null);

  useEffect(() => {
    if (orderId === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    // Düşen istek (ağ koptu) bir sonraki turda yeniden sorulur; sunucu arızası uçta iz bırakır.
    const ask = async (next: number | null) => {
      const result = await fetchCheckoutOrderStatus(locale, orderId);
      if (stopped) return;
      if (result.error === null) {
        setStatus(result.data);
        setChannel(result.data.channel);
        if (isSettled(result.data)) return;
      }
      if (next === null || Date.now() - startedAt > ASK_FOR_MS) return;
      timer = setTimeout(() => void ask(ASK_EVERY_MS), next);
    };
    void ask(FIRST_ASK_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, locale]);

  // Zil yalnız "değişti" der; durum yine sunucudan okunur.
  useEffect(() => {
    if (orderId === null || channel === null) return;
    const supabase = getSupabase();
    const subscription = supabase
      .channel(channel)
      .on('broadcast', { event: BELL_EVENT }, () => {
        void fetchCheckoutOrderStatus(locale, orderId).then((result) => {
          if (result.error === null) setStatus(result.data);
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [orderId, channel, locale]);

  return status;
}
