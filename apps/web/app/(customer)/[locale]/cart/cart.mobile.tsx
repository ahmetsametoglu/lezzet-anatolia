'use client';

import { FunnelHeader } from '@/components/customer/ui/funnel-header';
import { useCart } from '@/components/customer/cart/cart-context';
import { cartKey, splitByRoute } from '@/lib/cart/cart-types';
import { PlacePrompt } from '@/components/customer/delivery/place-prompt';
import { PlaceRestriction } from '@/components/customer/delivery/place-restriction';
import { SavedList } from '@/components/customer/delivery/saved-list';
import { CartLineRow } from './components/cart-line';
import { CartGroup } from './components/cart-group';
import { CartSummary } from './components/cart-summary';
import { PlaceChangeCard } from './components/place-change-card';
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
  const groups = splitByRoute(view.lines);
  const grouped = groups.route.length > 0 && groups.shipping.length > 0;

  return (
    <div className={['flex flex-col pt-2', empty ? '' : 'pb-28'].join(' ')}>
      {/* Huninin ORTAK başlığı (`FunnelHeader` künyesi): SARMALAYICISIZ — yapışkan bar ancak uzun
          kök konteynerin doğrudan çocuğuyken sayfa boyunca yapışır (künyedeki ders). Eyebrow
          yerinde sayaç; tekil ayrı anahtar (FR/DE'de "1 produits/Produkte" dil hatasıydı). */}
      <FunnelHeader
        backLabel={t.backLabel}
        fallback="/catalog"
        eyebrow={view.itemCount === 1 ? t.countOne : t.count.replace('{n}', String(view.itemCount))}
        title={t.title}
      />

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
            {/* Yer değişimi bildirimi en üstte: masaüstünde sağ sütunun kendi kartı, mobilde
                sütun yok — değişimin sebebi olan yer sorusu da hemen altında duruyor. */}
            <PlaceChangeCard t={t} locale={locale} compact />
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
            {/* Masaüstüyle aynı ayrım, aynı bileşen — mobilde yalnız daha dar çizilir. */}
            {grouped ? (
              <>
                <CartGroup kind="route" lines={groups.route} view={view} t={t} locale={locale} compact />
                <CartGroup kind="shipping" lines={groups.shipping} view={view} t={t} locale={locale} compact />
              </>
            ) : (
              view.lines.map((line) => <CartLineRow key={cartKey(line)} line={line} t={t} locale={locale} compact />)
            )}
            {/* K33 · Sonraya kaydedilenler; boşken hiç çizilmez. */}
            <SavedList locale={locale} compact />
            {/* Mobilde kupon özetin ÜSTÜNDE (tasarım): indirim uygulanınca özet zaten onun sonucunu
                gösteriyor — sonucu sebebinden önce okutmak sırayı tersine çevirirdi. */}
            <CartCoupon t={t} locale={locale} />
            <CartSummary view={view} t={t} locale={locale} compact grouped={grouped} />
          </div>
          {/* Alt çubuk YALNIZ kapıya grubunu taşır (tasarım): asıl akış odur, kargo grubu kendi
              kartında kendi eylemiyle durur. Tek çubukta iki tutar toplanmaz — toplandığında
              müşteri tek bir ödemeyle her ikisini de aldığını sanırdı. */}
          <CartCheckoutBar view={view} t={t} locale={locale} lines={grouped ? groups.route : view.lines} />
        </>
      )}
    </div>
  );
}
