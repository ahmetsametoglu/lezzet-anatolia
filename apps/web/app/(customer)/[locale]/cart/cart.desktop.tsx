'use client';

import { Link } from '@/i18n/navigation';
import { useCart } from '@/components/customer/cart/cart-context';
import { cartKey, splitByRoute } from '@/lib/cart/cart-types';
import { PlaceRestriction } from '@/components/customer/delivery/place-restriction';
import { SavedList } from '@/components/customer/delivery/saved-list';
import { CartLineRow } from './components/cart-line';
import { CartGroup } from './components/cart-group';
import { CartSummary } from './components/cart-summary';
import { CartIdentity } from './components/cart-identity';
import { PlaceChangeCard } from './components/place-change-card';
import { AwaitingPaymentNotice } from './components/awaiting-payment-notice';
import { CartCoupon } from './components/cart-coupon';
import { EmptyCart } from './components/empty-cart';
import { CartUnreachable } from './components/cart-unreachable';
import { CartSkeleton } from './components/cart-skeleton';
import type { CartViewProps } from './cart-types';

/**
 * Sepetin masaüstü düzeni: kalemler solda, özet sağda ve yapışkan, çünkü uzun sepette toplam ve tek eylem ekrandan çıkmamalı.
 * İlk okuma bitmeden boş durum gösterilmez, yoksa müşteri sepetini kaybettiğini sanırdı.
 */
export function CartDesktop({ t, locale, emptyContext, awaitingPayment }: CartViewProps) {
  const { view, ready, failed, addSkipped } = useCart();
  // İlk kare BOŞ bırakılmaz: iskelet gerçek yerleşimin ölçüsünü taşır, içerik gelince zıplama olmaz.
  if (!ready) return <CartSkeleton t={t} />;

  // Okuma DÜŞTÜYSE boş ekran çizilmez: sepet boş değil, ulaşılamıyor (`CartUnreachable`).
  if (failed) return <CartUnreachable t={t} />;

  // Boş sepet kendi ekranıdır; ölçüt niyetin de olmaması, çünkü satırlar sunucudan dönmeden "sepetiniz boş" yazılsaydı üstteki
  // rozetle çelişirdi, arada iskelet durur.
  if (view.lines.length === 0) {
    return view.itemCount > 0 ? <CartSkeleton t={t} /> : <EmptyCart t={t} locale={locale} context={emptyContext} />;
  }

  const groups = splitByRoute(view.lines);
  const grouped = groups.route.length > 0 && groups.shipping.length > 0;

  return (
    // Başlık ve uyarı sol sütunun içinde: özet kartı sayfanın tepesinden başlar ve "Sepetim" ile aynı hizada durur, üste
    // alınsaydı sağ sütun başlık kadar aşağı kayardı.
    <section className="grid grid-cols-[1.6fr_1fr] items-start gap-10 px-12 pt-9 pb-12">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-page-title text-ink">{t.title}</h1>
          <Link href="/catalog" className="cursor-pointer font-sans text-body-sm font-bold text-olive hover:text-olive-dark">
            {t.back}
          </Link>
        </div>

        {/* Ödemesi beklenen kart siparişi bantların ilkidir: sepet yalnız onayda boşalır ve yeniden ödemeye hazırlanan müşteri önce
            öncekinin ne olduğunu bilmeli. */}
        {awaitingPayment && <AwaitingPaymentNotice t={t} locale={locale} awaiting={awaitingPayment} />}

        {/* Yer değişimi bildirimi listenin üstünde, kalem uyarılarının ilki: aşağıdaki engel ve kısıt blokları çoğu zaman onun
            sonucudur. */}
        <PlaceChangeCard t={t} locale={locale} />

        {/* Stok uyarısı BAL tonundadır, terracotta değil: müşteri hata yapmadı, dünya değişti.
            Kırmızı bir bant onu suçlu gösterir; asıl kırmızı, çıkarılacak satırın düğmesindedir. */}
        {view.hasBlocked && (
          <div className="rounded-soft border border-honey-line bg-honey-bg px-4.5 py-3 font-sans text-body-sm font-semibold text-honey">
            {t.blockedNotice}
          </div>
        )}

        {/* Tekrar siparişin eksik geldiği BURADA söylenir (tasarım: "sepette tek cümleyle bildirilir").
            Uyarıyı doğuran boş sepet ekranı ekleme anında söküldüğü için orada gösterilemez. */}
        {addSkipped !== null && (
          <div className="rounded-soft border border-honey-line bg-honey-bg px-4.5 py-3 font-sans text-body-sm font-semibold text-honey">
            {t.empty.skipped.replace('{n}', String(addSkipped))}
          </div>
        )}

        {/* Teslimat kısıtı satırların üstünde, müşteri etkilenen kalemleri listeyi gezmeden görsün diye; kısıt yoksa çizilmez.
            Posta kodu burada sorulmaz, tek soru yeri başlıktaki haptır. */}
        <PlaceRestriction locale={locale} lines={view.lines} minBasketCents={view.minBasketCents} freeShippingCents={view.freeShippingCents} />

        {/* Sepet iki yola bölündüyse her grup kendi başlığı, toplamı ve eylemiyle durur; tek yol
            varsa hiçbir şey değişmez — ayrım ancak ayrılacak bir şey varken bilgidir. */}
        {grouped ? (
          <>
            <CartGroup kind="route" lines={groups.route} view={view} t={t} locale={locale} />
            <CartGroup kind="shipping" lines={groups.shipping} view={view} t={t} locale={locale} />
          </>
        ) : (
          view.lines.map((line) => <CartLineRow key={cartKey(line)} line={line} t={t} locale={locale} />)
        )}

        {/* K33 · Sonraya kaydedilenler — sepetin ALTINDA, boşken hiç çizilmez. */}
        <SavedList locale={locale} />
      </div>

      <div className="sticky top-5 flex flex-col gap-3.5">
        {/* Kim ve nereye özetin en üstünde: ödemeye geçmenin iki ön şartı tutardan önce okunur. */}
        <CartIdentity t={t} locale={locale} />
        <CartSummary view={view} t={t} locale={locale} grouped={grouped} />
        <CartCoupon t={t} locale={locale} />
      </div>
    </section>
  );
}
