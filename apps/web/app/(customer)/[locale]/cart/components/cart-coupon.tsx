'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import { formatPrice } from '@/lib/storefront/format';
import type { CouponFailure } from '@/lib/cart/cart-types';
import type { Messages } from '../cart-types';

/**
 * Kupon kartı (tasarım: `Musteri - Sepet.dc.html` — özetin altında, mobilde akış içinde).
 *
 * **Ekranın kuponla ilgili hiçbir görüşü yok.** Kod bir NİYETTİR; geçerli mi, ne kadar indirir,
 * hatta kazanır mı — üçünün de cevabı her okumada sunucudan gelir (`resolveCartDiscount`). Bu
 * yüzden burada ne doğrulama var ne tutar hesabı: kart yalnız kodu iletir ve `view.discount`u okur.
 *
 * **"Geçersiz" ile "kazanamadı" ayrı hâllerdir** ve karıştırılmamalı: kupon geçerli olup da otomatik
 * indirim daha büyük olabilir (`outranked`). O zaman ret metni değil, "daha büyük bir indirim
 * uygulandı" denir — müşteri hem sebebi görür hem parasını kaybetmez. Ret metinleri motorun
 * sebeplerinden TÜRER; motora yeni bir koşul eklendiğinde karşılığı olmayan hâl derleme hatası verir.
 */
interface CartCouponProps {
  t: Messages;
  /** Ret cümlesindeki tutarı biçimlemek için — metin sayfanın dilinde, sayı da öyle olmalı. */
  locale: Locale;
}

export function CartCoupon({ t, locale }: CartCouponProps) {
  const { view, coupon, applyCoupon, clearCoupon } = useCart();
  /**
   * `null` = müşteri henüz yazmadı → alanda depodaki kod görünür. Yalnız yerel state tutulsaydı
   * sayfa yenilendiğinde reddedilen kod ekrandan silinir, altındaki sebep cümlesi ise kalırdı:
   * müşteri "hangi kod geçersiz?" diye sorardı.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const discount = view.discount;
  const applied = discount.status === 'applied' ? discount : null;
  const rejected = discount.status === 'rejected' ? discount : null;

  /**
   * Kod ÇİPE dönüşür mü — yalnız iki hâlde: kupon TUTTU ya da geçerliydi de kazanamadı
   * (`outranked`). Tasarım ikisini ayırıyor ve haklı: geçersiz/süresi dolmuş kodda alan **kırmızı
   * çerçeveyle açık kalır**, "Uygula" yerinde durur.
   *
   * Her ret çipe dönüşüyordu ve bu, harf hatası yapan müşteriyi çıkmaza sokuyordu: kodu düzeltmek
   * için önce ✕ ile silmesi, sonra baştan yazması gerekiyordu. Oysa "YAZ2O25" yazan müşterinin
   * ihtiyacı tek bir karakteri değiştirmek.
   */
  const locked = applied !== null || rejected?.reason === 'outranked';
  const value = draft ?? coupon ?? '';

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card p-5">
      <span className="font-sans text-body-sm font-bold text-ink">{t.coupon.title}</span>

      {locked ? (
        /* Denenmiş hâl: kod ÇİPTE durur, girdi kaybolur (tasarım). Kutuyu açık bırakmak "bir tane
           daha girebilirsin" der; oysa indirim üst üste binmez (DOMAIN §13). Çip kupon tutmasa da
           durur — kaldırma düğmesi orada olmalı ki müşteri denemesini geri alabilsin. */
        <div className="flex items-center gap-2">
          <span
            className={[
              'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-soft border px-3.5 py-2.5 font-sans text-body-sm font-bold',
              applied ? 'border-olive bg-olive-bg text-olive' : 'border-sand-300 bg-card text-muted',
            ].join(' ')}
          >
            <span className="truncate">{applied?.code ?? coupon}</span>
            <button
              type="button"
              onClick={clearCoupon}
              aria-label={t.coupon.remove}
              className="flex-none cursor-pointer font-normal transition-colors hover:text-terracotta"
            >
              ✕
            </button>
          </span>
          {applied && (
            <span className="flex-none rounded-pill border-[1.5px] border-sand-400 px-4 py-2 font-sans text-body-sm font-bold text-muted">
              {t.coupon.applied}
            </span>
          )}
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) applyCoupon(value);
          }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder={t.coupon.placeholder}
            aria-label={t.coupon.title}
            aria-invalid={rejected !== null}
            className={[
              'min-w-0 flex-1 rounded-soft border bg-card px-3.5 py-2.5 font-sans text-body-sm font-bold outline-none placeholder:font-normal placeholder:text-muted',
              // Reddedilen kod ALANIN İÇİNDE kırmızı kalır (tasarım): sebep cümlesi altta, ama
              // hangi kodun reddedildiği kodun kendi kutusunda görünür.
              rejected ? 'border-[1.5px] border-terracotta bg-terracotta-bg text-terracotta' : 'border-sand-300 text-ink focus-visible:border-olive',
            ].join(' ')}
          />
          <Button type="submit" variant="primary" size="sm" disabled={!value.trim()} className="flex-none">
            {t.coupon.apply}
          </Button>
        </form>
      )}

      {/* Sebep KODUN ALTINDA: müşteri neyi denediğini görürken cevabını da görmeli. */}
      {rejected && (
        <span
          className={[
            'font-sans text-note leading-relaxed font-semibold',
            // "Kazanamadı" bir hata değil, bir bilgi: sepete zaten daha büyük bir indirim indi.
            rejected.reason === 'outranked' ? 'text-olive' : 'text-terracotta',
          ].join(' ')}
        >
          {/* Kazanan indirimin TUTARI cümlenin içinde (tasarım: "…uygulanıyor (−10,00 €)…").
              Tutar olmadan cümle kanıtsız bir iddia: müşteri "daha büyük" denen indirimi
              göremiyor, kendi kuponunun ne kaybettirdiğini de ölçemiyordu. */}
          {t.coupon.rejected[REASON_KEY[rejected.reason]].replace(
            '{amount}',
            `−${formatPrice(rejected.appliedInsteadCents, locale)}`,
          )}
        </span>
      )}

      {/* Kapsam kuralı KALICI satır (tasarım): "kupon paket ve fırsat kalemlerine uygulanmaz".
          Matrah muafiyeti motorun kuralı (DOMAIN §5/§13) ve müşteri onu ancak burada öğrenebilir —
          yoksa 75 €'luk sepette 5 €'luk kuponun neden az indirdiğini kimse anlatmıyordu. */}
      <span className="font-sans text-micro leading-relaxed text-muted">{t.coupon.note}</span>
    </div>
  );
}

/**
 * Motorun sebebi → ekranın metni. Eşleme AÇIK yazılır (sebebi doğrudan anahtar yapmak yerine):
 * birkaç sebep müşteri için aynı cümleye çıkar — "pasif", "henüz başlamamış" ve "böyle bir kod yok"
 * arasındaki farkı müşteriye anlatmanın değeri yok, üçü de "bu kod geçerli değil"dir. Kişisel
 * kuponun başkasında olması (`not_yours`) da BİLEREK aynı cümleye düşer: varlığı sızdırılmaz.
 */
const REASON_KEY: Record<CouponFailure, keyof Messages['coupon']['rejected']> = {
  unknown_code: 'invalid',
  inactive: 'invalid',
  not_started: 'invalid',
  not_yours: 'invalid',
  expired: 'expired',
  min_basket: 'minBasket',
  first_order_only: 'firstOrderOnly',
  used_up: 'usedUp',
  outranked: 'outranked',
};
