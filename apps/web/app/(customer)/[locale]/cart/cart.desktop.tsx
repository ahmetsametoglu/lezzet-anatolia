'use client';

import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/customer/ui/filter-controls';
import { useCart } from '@/components/customer/cart/cart-context';
import { CartLineRow } from './components/cart-line';
import { CartSummary } from './components/cart-summary';
import type { CartViewProps } from './cart-types';

/**
 * Sepet — masaüstü düzeni (tasarım: `Musteri - Sepet.dc.html`, "Sepet Web").
 * Başlık + "alışverişe devam" → engel uyarısı → kalemler (sol) | özet (sağ).
 *
 * İlk okuma tamamlanmadan boş durum GÖSTERİLMEZ: sepette ürün varken bir an "sepetiniz boş" yazıp
 * sonra dolması, müşteriye sepetini kaybettiğini düşündürür.
 */
export function CartDesktop({ t, locale }: CartViewProps) {
  const { view, ready } = useCart();
  if (!ready) return <div className="min-h-[40vh]" />;

  return (
    <div className="flex flex-col px-12 py-9">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-page-title text-ink">{t.title}</h1>
        <Link href="/catalog" className="cursor-pointer font-sans text-body font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
      </div>

      {view.lines.length === 0 ? (
        <div className="pt-8">
          <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🧺" />
        </div>
      ) : (
        <>
          {view.hasBlocked && (
            <div className="mt-5 rounded-soft border border-terracotta-line bg-terracotta-bg px-4 py-3 font-sans text-body-sm text-terracotta">
              {t.blockedNotice}
            </div>
          )}
          <section className="mt-5 grid grid-cols-[1.6fr_1fr] items-start gap-8">
            <div className="flex flex-col gap-3">
              {view.lines.map((line) => (
                <CartLineRow key={`${line.variantId}:${line.stockId ?? ''}`} line={line} t={t} locale={locale} />
              ))}
            </div>
            <CartSummary view={view} t={t} locale={locale} />
          </section>
        </>
      )}
    </div>
  );
}
