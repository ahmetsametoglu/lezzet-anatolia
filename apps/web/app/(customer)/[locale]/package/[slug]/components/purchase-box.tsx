'use client';

import { Button, buttonClass } from '@/components/customer/ui/button';
import { QtyStepper } from '@/components/customer/ui/qty-stepper';
import type { Locale } from '@lezzet/i18n';
import { useCart } from '@/components/customer/cart/cart-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { PlaceGate } from '@/components/customer/delivery/place-gate';
import type { Messages } from '../package-types';

/**
 * Paketin satın alma kontrolü — ürün detayıyla AYNI mantık (`purchase-panel.tsx`).
 *
 * Paket BÜTÜN olarak eklenir: içerik tek tek seçilemez, kalem çıkarılamaz (`musteri-paket-detay.md
 * §3`). Bu yüzden burada varyant seçimi yoktur — ürün detayındaki "boy seçin" adımının paketteki
 * karşılığı yok, seçilecek bir şey kalmamış.
 *
 * **Tek kontrol, tek kutu.** Sepette değilken "Paketi sepete ekle" düğmesi, sepetteyken AYNI YERDE
 * adet seçicisi durur — iki ayrı öğe değil, tek bir kutunun iki hâli. İkisi de satırın tamamını
 * kaplar ve aynı yüksekliktedir; çerçeve farkı düğmeye şeffaf kenarlık verilerek kapanır, yoksa
 * geçişte kutu birkaç piksel zıplıyor.
 *
 * Ekleme HER ZAMAN 1 adettir; ayarlama eklendikten sonra yapılır. Sepette olmayan bir şeyin "3
 * adedi" hiçbir yerde karşılığı olmayan bir sayıdır. "−" ile 1'den 0'a inmek paketi sepetten
 * ÇIKARIR ve düğme geri gelir (silme onayı yok, 5 sn'lik geri alma şeridi var).
 *
 * Adet tavanı YOK: teklif partisi kavramı pakette yoktur, indirim de pakete uygulanmaz (DOMAIN §13).
 *
 * Düğme TOPLAM YAZMAZ ve masaüstünde sütunun YARISINI kaplar — ürün detayıyla birebir aynı karar.
 * Toplam yazmıyor çünkü ekleme hep 1 adet: yazılan sayı hemen üstündeki fiyatın ikinci kopyası
 * olurdu. Yarım genişlik çünkü tam genişlikte hem düğme gereğinden iri duruyor hem de yerini aldığı
 * seçicinin üç bölgesi birbirinden kopuyor; kutu daralınca oran kendiliğinden düzeliyor.
 */
interface PurchaseBoxProps {
  t: Messages;
  locale: Locale;
  bundleId: string;
  soldOut: boolean;
  /**
   * Paket YALNIZ kapıya teslim edilebiliyor mu (`pack.inRouteOnly` — içinde kargolanamayan kalem
   * var). Yer bilinmiyorken satın alınabilirliğini söyleyemeyiz; eylem posta kodu isteğine bırakır.
   * Gerekçenin tamamı `PlaceGate` künyesinde.
   */
  routeOnly?: boolean;
  /**
   * Koyu zeminli mobil çubuk: kontrast tersine döner VE kontrol satırın tamamını kaplar — orada
   * çubuğun kendisi zaten dar, yarıya indirmek düğmeyi kullanılamayacak kadar küçültürdü.
   */
  onDark?: boolean;
}

export function PurchaseBox({ t, locale, bundleId, soldOut, routeOnly = false, onDark = false }: PurchaseBoxProps) {
  const { add, setQty, lineOf } = useCart();
  const { place, ready } = useDeliveryPlace();
  const inCart = soldOut ? null : lineOf({ bundleId });

  // Tükendi hâlinde adet seçici GİZLENİR (tasarım): seçilecek bir adet yok, kutu boşuna yer kaplar.
  const control = routeOnly && ready && !place ? (
    <PlaceGate locale={locale} onDark={onDark} />
  ) : soldOut ? (
    <Button variant={onDark ? 'primaryOnDark' : 'primary'} size="md" fullWidth disabled>
      {t.addToCart}
    </Button>
  ) : inCart ? (
    <QtyStepper
      value={inCart.qty}
      onChange={(next) => setQty({ kind: 'bundle', bundleId }, next)}
      min={0}
      size={onDark ? 'onDark' : 'lg'}
      fullWidth
    />
  ) : (
    <button
      type="button"
      onClick={() => add({ kind: 'bundle', bundleId, qty: 1 })}
      className={
        onDark
          ? 'w-full cursor-pointer rounded-soft border-[1.5px] border-transparent bg-olive-light px-5 py-3 font-sans text-body leading-tight font-bold text-ink'
          : buttonClass({
              variant: 'primary',
              size: 'lg',
              fullWidth: true,
              // `text-lead`in 1.6 satır aralığı bir düğme etiketinde ~9 px fazladan yükseklik demek.
              // Seçici de aynı ölçüyü kullanır, iki kutu aynı kalır.
              className: 'border-2 border-transparent !px-4 !py-3 leading-tight whitespace-nowrap',
            })
      }
    >
      {t.addToCart}
    </button>
  );

  return onDark ? control : <div className="w-1/2 min-w-56">{control}</div>;
}
