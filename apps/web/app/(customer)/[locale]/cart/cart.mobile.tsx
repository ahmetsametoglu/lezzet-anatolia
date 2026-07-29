'use client';

import { Link } from '@/i18n/navigation';
import { useCart } from '@/components/customer/cart/cart-context';
import { cartKey } from '@/lib/cart/cart-types';
import { PlacePrompt } from '@/components/customer/delivery/place-prompt';
import { PlaceRestriction } from '@/components/customer/delivery/place-restriction';
import { SavedList } from '@/components/customer/delivery/saved-list';
import { CartLineRow } from './components/cart-line';
import { CartSummary } from './components/cart-summary';
import { CartCoupon } from './components/cart-coupon';
import { CartCheckoutBar } from './components/cart-checkout-bar';
import { EmptyCart } from './components/empty-cart';
import { CartUnreachable } from './components/cart-unreachable';
import { CartSkeleton } from './components/cart-skeleton';
import type { CartViewProps } from './cart-types';

/**
 * Sepet — mobil düzeni (tasarım: `Musteri - Sepet.dc.html`, "Sepet Mobil" + "Bos Sepet Mobil").
 *
 * Üst satır ÜÇ PARÇADIR: geri · başlık · kalem sayısı. Uygulama hissiyatının taşıyıcısı bu satır —
 * masaüstündeki gibi alt alta dizilseydi ekranın üçte biri başlığa giderdi. Satır boş sepette de
 * KALIR (masaüstünde kalkar): mobilde geri dönüş yolu ekranın üstündedir, kahramanın içinde değil.
 * Geri bağlantısının metni bağlama göre değişir — dolu sepette "devam et" (alışverişe), boş sepette
 * doğrudan "katalog" (gidilecek yeri adıyla söyler).
 *
 * Toplam ve tek aksiyon ekranın altındaki koyu çubukta sabit durur (`CartCheckoutBar`); tutar
 * dökümü akıştaki özet kartında kalır. Boş sepette çubuk HİÇ YOKTUR — sabitlenecek tutar yok.
 */
export function CartMobile({ t, locale, emptyContext }: CartViewProps) {
  const { view, ready, failed, addSkipped } = useCart();
  // İlk kare BOŞ bırakılmaz: iskelet gerçek yerleşimin ölçüsünü taşır, içerik gelince zıplama olmaz.
  if (!ready) return <CartSkeleton t={t} compact />;

  // Okuma DÜŞTÜYSE boş ekran çizilmez: sepet boş değil, ulaşılamıyor (`CartUnreachable`).
  if (failed) return <CartUnreachable t={t} compact />;

  // Tekrar siparişten sonra satırlar henüz dönmemişken boş ekran çizilmez: üst satır "3 ürün"
  // derken ortanın "Sepetiniz şu an boş" demesi ekranı kendisiyle çeliştiriyordu (29.07 denetimi).
  if (view.lines.length === 0 && view.itemCount > 0) return <CartSkeleton t={t} compact />;

  const empty = view.lines.length === 0;

  return (
    <div className={['flex flex-col', empty ? '' : 'pb-28'].join(' ')}>
      <div className={['flex items-center justify-between gap-3 px-4 py-3', empty ? 'border-b border-sand-100' : ''].join(' ')}>
        <Link href="/catalog" className="cursor-pointer font-sans text-body font-bold text-olive">
          {empty ? t.backCatalog : t.backShort}
        </Link>
        <h1 className="font-serif text-card-title-sm text-ink">{t.title}</h1>
        <span className="font-sans text-note text-muted">{t.count.replace('{n}', String(view.itemCount))}</span>
      </div>

      {empty ? (
        <EmptyCart t={t} locale={locale} context={emptyContext} compact />
      ) : (
        <>
          {/* Bal tonu: müşteri hata yapmadı, stok değişti (masaüstüyle aynı gerekçe). */}
          {view.hasBlocked && (
            <div className="mx-4 rounded-soft border border-honey-line bg-honey-bg px-3.5 py-2.5 font-sans text-note font-semibold text-honey">
              {t.blockedNotice}
            </div>
          )}
          {/* Tekrar siparişin eksik geldiği sepette söylenir — masaüstüyle aynı gerekçe. */}
          {addSkipped !== null && (
            <div className="mx-4 rounded-soft border border-honey-line bg-honey-bg px-3.5 py-2.5 font-sans text-note font-semibold text-honey">
              {t.empty.skipped.replace('{n}', String(addSkipped))}
            </div>
          )}
          <div className="flex flex-col gap-2.5 px-4 py-3.5">
            {/* K32 · Teslimat kısıtı satırların ÜSTÜNDE — masaüstüyle aynı sıra, aynı bileşen. */}
            {/* Yer bilinmiyorsa soru, biliniyorsa kısıt — ikisi birbirini dışlar. */}
            <PlacePrompt locale={locale} scope="cart" />
            <PlaceRestriction
              locale={locale}
              lines={view.lines}
              minBasketCents={view.minBasketCents}
              freeShippingCents={view.freeShippingCents}
              compact
            />
            {view.lines.map((line) => (
              <CartLineRow key={cartKey(line)} line={line} t={t} locale={locale} compact />
            ))}
            {/* K33 · Sonraya kaydedilenler; boşken hiç çizilmez. */}
            <SavedList locale={locale} compact />
            {/* Mobilde kupon özetin ÜSTÜNDE (tasarım): indirim uygulanınca özet zaten onun sonucunu
                gösteriyor — sonucu sebebinden önce okutmak sırayı tersine çevirirdi. */}
            <CartCoupon t={t} locale={locale} />
            <CartSummary view={view} t={t} locale={locale} compact />
          </div>
          <CartCheckoutBar view={view} t={t} locale={locale} />
        </>
      )}
    </div>
  );
}
