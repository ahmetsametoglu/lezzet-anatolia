'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import { useRouter } from '@/i18n/navigation';
import { reorderAction } from '../actions';
import reorderCopy from './reorder-messages.json';

/**
 * "↻ Tekrar sipariş" — **kendi durumunu taşıyan** düğme.
 *
 * Ayrı bir bileşen olmasının sebebi konum: tasarımda bu düğme sipariş detayında **başlığın içinde**
 * (`SiteFrame accountChrome.right`), mobilde ise sayfanın en altında tam genişlikte. Başlık sunucuda
 * çiziliyor, yani düğmenin durumu sayfanın client bileşeninde tutulamıyor — kendi içinde tutuyor.
 *
 * **Sepete yazan yer istemci** (`addMany`): sepet ziyaretçide tarayıcıda, girişli müşteride sunucuda
 * yaşıyor ve ikisini `CartProvider` birleştiriyor. Sunucu doğrudan yazsaydı ekrandaki sepet sayısı
 * eski kalırdı. Eklenemeyen kalem sayısı da sepete geçiyor — uyarı orada karşılıyor.
 *
 * Hiçbir kalem eklenemezse sepete GİDİLMEZ: boş bir sepete götürmek, müşteriye olmayan bir başarı
 * göstermek olurdu. Hata da sessiz — sayfa yerinde kalır, düğme yeniden denenebilir.
 *
 * ── METİNLERİ KENDİ TAŞIR (08.20) ────────────────────────────────────────────
 * Etiketler prop olarak geliyordu ve aynı iki kelime İKİ sözlükte birden duruyordu (`orders` ve
 * `orders/[reference]`) — üstelik üç yerde çiziliyorlar. Kelimeler onları çizen komponente ait
 * (`site-frame` emsali): tek kaynak, sıfır plumbing. Ekleme sırasındaki etiket de burada, çünkü
 * "meşgul" hâli düğmenin kendi hâli — çağıranın bilmesi gereken bir şey değil.
 */
interface ReorderButtonProps {
  locale: Locale;
  orderId: string;
  fullWidth?: boolean;
}

export function ReorderButton({ locale, orderId, fullWidth }: ReorderButtonProps) {
  const t = reorderCopy[locale];
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    if (busy) return;
    setBusy(true);
    void reorderAction(locale, orderId)
      .then(({ data, errorKey }) => {
        if (errorKey || !data || data.entries.length === 0) return;
        cart.addMany(data.entries, data.skipped.length);
        router.push('/cart');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Button variant="outlineOlive" size="sm" fullWidth={fullWidth} disabled={busy} onClick={onClick} className={fullWidth ? '' : 'flex-none'}>
      {busy ? t.reordering : t.reorder}
    </Button>
  );
}
