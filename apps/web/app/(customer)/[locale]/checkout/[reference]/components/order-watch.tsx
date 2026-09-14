'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BELL_EVENT } from '@lezzet/application/realtime/bell-event';
import { orderChannelName } from '@/lib/realtime/order-channel';
import { verifyPaymentAction } from '../actions';

/** İlk soru — Stripe dönüşünden hemen sonra: webhook çoğu zaman bu arada çoktan gelmiştir. */
const FIRST_VERIFY_MS = 4_000;
/** Sonraki sorular — banka işliyorsa sonuç dakikalar sürebilir. */
const VERIFY_EVERY_MS = 20_000;
/** Soru bu kadar sürer; sonra ödeme zamanlayıcısı (arka uç) netleştirir ve zil ekranı yine uyandırır. */
const VERIFY_FOR_MS = 30 * 60_000;

/**
 * Ödeme bekleyen onay ekranının canlı bağı. Çizdiği bir şey yok — iki işi var: **zili duyunca sayfayı
 * sunucudan yeniden istemek** ve **ödeme olayı gecikirse sağlayıcıya sordurmak**.
 *
 * Uyandırmalar:
 *  1. **Abonelik** — webhook sonrası gelen "değişti" mesajı (`lib/realtime/order-channel`).
 *  2. **Montajdaki tek yenileme** — webhook, müşteri bu sayfaya varmadan ÖNCE de düşebilir; o durumda
 *     çalan zili duyacak kimse yoktur, ilk kare bayat kalırdı.
 *  3. **Sağlayıcıya sor (07.18)** — webhook HİÇ gelmezse (tünel kapalı, uç yanlış yapılandırılmış)
 *     ekran süresiz "onaylanıyor"da kalıyordu. Birkaç saniyede bir sunucunun eylemi sağlayıcıya sorar ve
 *     cevaba göre siparişi webhook'la AYNI yoldan onaylar ya da ödeme gelmeyecekse kapatır; sonra sayfa
 *     yeniden istenir. Sipariş netleşince ya da süre dolunca sorular biter.
 *
 * `router.refresh()` sunucu bileşenini yeniden çalıştırır: durum yine tek kaynaktan, veritabanından ve
 * sağlayıcıdan okunur. İstemci hiçbir zaman "ödendi" kararını kendi vermez.
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

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const verifyAfter = (delay: number) => {
      timer = setTimeout(async () => {
        // İstek düşerse (ağ koptu) sessizce bırakılmaz: bir sonraki tur aynı soruyu yeniden sorar;
        // sunucu tarafındaki arıza zaten eylemin hata kapısında iz bırakıyor (`customerErrorKey`).
        const result = await verifyPaymentAction(orderId).catch(() => null);
        if (stopped) return;
        router.refresh();
        if (result?.data?.settled || Date.now() - startedAt > VERIFY_FOR_MS) return;
        verifyAfter(VERIFY_EVERY_MS);
      }, delay);
    };
    verifyAfter(FIRST_VERIFY_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [orderId, router]);

  return null;
}
