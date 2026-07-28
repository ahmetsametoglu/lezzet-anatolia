'use client';

import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/customer/ui/filter-controls';
import { useCart } from '@/components/customer/cart/cart-context';
import { CartLineRow } from './components/cart-line';
import { CartSummary } from './components/cart-summary';
import type { CartViewProps } from './cart-types';

/**
 * Sepet — mobil düzeni (tasarım: `Musteri - Sepet.dc.html`, "Sepet Mobil").
 * Tek sütun: geri → başlık + adet → engel uyarısı → kalemler → özet.
 *
 * Tasarımda alt toplam çubuğu ekrana sabitlenir. Bugün sabitlenmiyor: ödeme adımı yok (07.4/07.5),
 * yani çubuğun taşıyacağı aksiyon pasif. Sürekli görünen ama basılamayan bir çubuk, ekranın
 * altını kalıcı olarak yer ve hiçbir şey kazandırmaz — ödeme bağlanınca sabitlenir.
 */
export function CartMobile({ t, locale }: CartViewProps) {
  const { view, ready } = useCart();
  if (!ready) return <div className="min-h-[40vh]" />;

  return (
    <div className="flex flex-col px-4 py-5">
      <Link href="/catalog" className="cursor-pointer font-sans text-body-sm font-bold text-olive">
        {t.back}
      </Link>

      <div className="mt-3 flex items-baseline gap-2.5">
        <h1 className="font-serif text-page-title-sm text-ink">{t.title}</h1>
        {view.itemCount > 0 && (
          <span className="font-sans text-note text-muted">{t.count.replace('{n}', String(view.itemCount))}</span>
        )}
      </div>

      {view.lines.length === 0 ? (
        <div className="pt-6">
          <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🧺" />
        </div>
      ) : (
        <>
          {view.hasBlocked && (
            <div className="mt-4 rounded-soft border border-terracotta-line bg-terracotta-bg px-3.5 py-2.5 font-sans text-note text-terracotta">
              {t.blockedNotice}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2.5">
            {view.lines.map((line) => (
              <CartLineRow key={`${line.variantId}:${line.stockId ?? ''}`} line={line} t={t} locale={locale} compact />
            ))}
          </div>
          <div className="mt-4">
            <CartSummary view={view} t={t} locale={locale} compact />
          </div>
        </>
      )}
    </div>
  );
}
