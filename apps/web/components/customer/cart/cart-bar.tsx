'use client';

import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import { useCart } from './cart-context';
import messages from './cart-messages.json';

/**
 * K21 · Sepet Özet Çubuğu (mobil) — "alışverişi kesintisiz sürdürme aracı".
 *
 * Gezinirken sepetin ne kadar dolduğunu görmek için listenin başına dönmek gerekmemeli: adet ve
 * tutar ekranın altında durur, ekleme yapıldıkça canlı güncellenir.
 *
 * **Sepet boşken hiç çizilmez.** Boş bir çubuk ekranın altını kalıcı olarak yer ve hiçbir şey
 * söylemez; dolduğu an belirmesi zaten "bir şey oldu" demenin en sade yolu.
 *
 * NEREDE DURUR: gezinme sayfaları (anasayfa · katalog) — envanter "sepetli tüm gezinme
 * sayfalarında beklenir" diyor. Ürün detayda ve sepette YOKTUR ve olmamalı: ikisinin de ekran
 * altında kendi çubuğu var (satın alma çubuğu · toplam çubuğu). İki sabit çubuk üst üste binerdi.
 *
 * Alt satır teslimat seçeneklerini VAAT ETMEZ, nerede sorulacağını söyler ("seçenekler sepette") —
 * ücret teslimat türüne, tür adrese bağlı ve ikisi de burada bilinmiyor.
 */
interface CartBarProps {
  locale: Locale;
}

export function CartBar({ locale }: CartBarProps) {
  const { view, ready } = useCart();
  const t = messages[locale];

  if (!ready || view.itemCount === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <Link
        href="/cart"
        className="mx-auto flex max-w-[430px] cursor-pointer items-center justify-between gap-3 rounded-card bg-ink px-4.5 py-3.5"
      >
        <span className="flex flex-col">
          <span className="font-sans text-body-sm font-bold text-cream">
            {t.summary.replace('{n}', String(view.itemCount)).replace('{total}', formatPrice(view.subtotalCents, locale))}
          </span>
          <span className="font-sans text-micro text-closed-line">{t.deliveryNote}</span>
        </span>
        <span className="flex-none rounded-soft bg-olive-light px-4.5 py-2.5 font-sans text-note font-bold text-ink">{t.goToCart}</span>
      </Link>
    </div>
  );
}
