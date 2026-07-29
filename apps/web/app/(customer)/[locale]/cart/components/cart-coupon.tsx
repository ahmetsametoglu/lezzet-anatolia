'use client';

import { useState } from 'react';
import { Button } from '@/components/customer/ui/button';
import type { Messages } from '../cart-types';

/**
 * Kupon kartı (tasarım: `Musteri - Sepet.dc.html` — özetin altında, mobilde akış içinde).
 *
 * **Bugün BAĞLANMAMIŞ, ama çizili.**
 * BEKLEYEN(BACKLOG §1): kupon kodu uygulama akışı — kutu çizili, "Uygula" bağlanmadı. Alan tasarımdaki
 * yerinde ve ölçüsünde durur, "Uygula" pasiftir ve SEBEBİ yazılıdır. Bilinçli bir karar: ekranın
 * bütününü her seferinde tasarıma dönüp yeniden kurmak yerine yerleşim şimdi oturur, motor gelince
 * yalnız bu dosyanın içi dolar.
 *
 * Girdi ÇALIŞIR (yazılabilir) ama gönderilmez: kilitli bir kutu "bu alan size kapalı" der, oysa
 * mesele müşteri değil, henüz açılmamış bir özellik. Yazıp deneyen müşteri tek cümlelik cevabı görür.
 *
 * Tasarımın dört ret hâli (süresi dolmuş · geçersiz · alt sınır · otomatik indirim daha büyük)
 * motorla birlikte gelir — uydurma ret metni göstermek, çalışan bir kupon alanı taklidi olurdu.
 */
interface CartCouponProps {
  t: Messages;
}

export function CartCoupon({ t }: CartCouponProps) {
  const [code, setCode] = useState('');

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card p-5">
      <span className="font-sans text-body-sm font-bold text-ink">{t.coupon.title}</span>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t.coupon.placeholder}
          aria-label={t.coupon.title}
          className="min-w-0 flex-1 rounded-soft border border-sand-300 bg-card px-3.5 py-2.5 font-sans text-body-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-muted focus-visible:border-olive"
        />
        <Button variant="primary" size="sm" disabled title={t.coupon.pending} className="flex-none">
          {t.coupon.apply}
        </Button>
      </div>
      <span className="font-sans text-micro text-muted">{t.coupon.pending}</span>
    </div>
  );
}
