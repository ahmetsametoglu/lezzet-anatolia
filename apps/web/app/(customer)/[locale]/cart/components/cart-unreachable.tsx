'use client';

import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import type { Messages } from '../cart-types';

/**
 * Sepet okunamadı — **boş sepetle karıştırılmaması gereken** hâl.
 *
 * Boş sepet bir durumdur ve kendi yön veren ekranı vardır; ulaşılamayan sepet bir arızadır. İkisi
 * aynı ekrana düştüğünde müşteri kalemlerini gerçekten kaybettiğini sanıyordu — başlıktaki rozet
 * "4" derken sayfa "sepetiniz boş" yazıyor, aradaki çelişkiyi kimse açıklamıyordu (28.07).
 *
 * Kalemler SİLİNMEZ: tarayıcıdaki niyet listesi elimizdeki tek gerçek, okuma düştü diye onu
 * temizlemek arızayı kalıcı veri kaybına çevirirdi. Bu yüzden ekranın tek eylemi "tekrar dene".
 */
export function CartUnreachable({ t, compact = false }: { t: Messages; compact?: boolean }) {
  const { reload } = useCart();

  return (
    <section
      className={[
        'flex flex-col items-start gap-3 rounded-card border border-honey-line bg-honey-bg',
        compact ? 'mx-4 my-5 px-4 py-4' : 'mx-12 my-10 px-6 py-5',
      ].join(' ')}
    >
      {/* Bal tonu, terracotta değil: müşteri bir hata yapmadı ve kaybedilmiş bir şey yok. */}
      <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{t.unreachable.title}</span>
      <p className="font-sans text-body-sm leading-relaxed text-body">{t.unreachable.body}</p>
      <Button size="sm" compact={compact} onClick={reload}>
        {t.unreachable.retry}
      </Button>
    </section>
  );
}
