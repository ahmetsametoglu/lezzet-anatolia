'use client';

import { useEffect, useState } from 'react';
import { formatPrice, type PlaceMark } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import placeMessages from '@lezzet/i18n/customer/place';
import type productMessages from '@lezzet/i18n/customer/product';
import type { StorefrontVariant } from '@lezzet/application';
import { useAccount } from '@/components/customer/account/account-context';
import { useCart } from '@/components/customer/cart/cart-context';
import { NoticeDialog } from '@/components/customer/delivery/notice-dialog';
import webPlaceMessages from '@/components/customer/delivery/place-messages.json';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { QuantityStepper } from '@/components/customer/phone-kit/quantity-stepper';
import { useToast } from '@/components/customer/ui/toast';
import { recordVariantStockNoticeAction } from '@/lib/delivery/notice-actions';
import { capOf } from './purchase-panel';

/*
  YAPIŞKAN SATIN ALMA BARI — native ürün detayının alt barının (`product-detail-screen.tsx`, v3:1228-1252) web
  telefon ikizi (14.09): krem cam (`sand-50/96` + bulanıklık), üstte 1,5px mürekkep çizgi, alt güvenli alan
  barın İÇİNDE (dolguyla toplanmaz, ikisinin büyüğü). Dört hâl, native'in sırasıyla:
    · tükendi ya da bölgede şu an yok → sebep satırı + "Stok gelince haber ver" (kayıt alınınca "✓ Not aldık");
    · kapalı kapı (rota dışı soğuk zincir) → yalnız sebep satırı; satın alma öğesi YOK ve "Buraya da gelin"
      burada tekrarlanmaz — mesele bu ürün değil bölge;
    · fiyatsız → "Bu ürün şu an satışa kapalı";
    · satılabilir → adet seçici + "Sepete ekle · {toplam}".

  ── WEB'E ÖZGÜ AKIŞLAR ───────────────────────────────────────────────────────
  · Sepete ekleme web'in sepetine (`useCart().add` — niyet anında, fiyat sunucudan); onay bildirim hapında.
    Asgari sepet hatırlatması native'deki gibi SUNUCUNUN cevabıyla: eklemenin anındaki kalem sayısı saklanır,
    görünüm değişince ikinci bir cümle (tahmini rakam yazılmaz).
  · "Haber ver" web'in kaydı (`recordVariantStockNoticeAction`): e-postası bilinen girişli müşteri tek dokunuş,
    öteki herkes web'in e-posta penceresi (native misafirde kodla hesap açıyor). Yer bilinmiyorsa düğme yok —
    nereye haber verileceği bilinmeden kayıt alınmaz (kapının kuralı).
*/

type ProductCopy = LocalizedCopy<typeof productMessages>;

interface PhonePurchaseBarProps {
  copy: ProductCopy;
  locale: Locale;
  productName: string;
  /** Seçili boy — `null` = aktif boy yok; o hâlde bar çizilmez. */
  variant: StorefrontVariant | null;
  /** Yer işareti — bilgi tonu (kargo) elenmiş hâli; `null` = söylenecek bir şey yok. */
  placeMark: PlaceMark | null;
  /** Çözülmüş yerin posta kodu — "haber ver" kaydının anahtarı; `null` = yer bilinmiyor, düğme çizilmez. */
  postalCode: string | null;
}

/** Barın kabuğu — native `bar`. */
const SHELL =
  'fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-ink bg-sand-50/96 px-3 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] backdrop-blur-sm';
/** Sebep satırı — native `soldOutText`. */
const NOTE = 'min-w-0 flex-1 font-sans text-note leading-[1.4] font-semibold text-muted';
/** "Haber ver" hapı — native `alertButton` (zeytin dolgu, zeytin çizgisi, hap köşe). */
const ALERT = 'flex-none rounded-pill border-[1.5px] border-olive-line px-3 py-2 font-sans text-note font-bold';

export function PhonePurchaseBar({ copy, locale, productName, variant, placeMark, postalCode }: PhonePurchaseBarProps) {
  const { add, view } = useCart();
  const toast = useToast();
  const account = useAccount();
  const [quantity, setQuantity] = useState(1);
  /** Eklemenin ANINDAKİ kalem sayısı — sunucunun cevabını bu sayının değişmesinden anlıyoruz (native 16.08). */
  const [awaitingHint, setAwaitingHint] = useState<number | null>(null);
  /** "Haber ver" kaydının hâli — bar boy değişince yeniden kurulur (çağıranın `key`i), yani kayıt BOY başına. */
  const [notice, setNotice] = useState<'sending' | 'done' | null>(null);
  const [asking, setAsking] = useState(false);

  /* Asgari sepet hatırlatması: sayı değişmeden konuşulmaz (eski görünüm eski rakamı yazardı); eşiği geçen
     sepette ve eşik bilinmezken (`0`, sözleşmenin "bilinmiyor" hâli) susulur — native'in kuralı. */
  useEffect(() => {
    if (awaitingHint === null || view.itemCount === awaitingHint) return;
    setAwaitingHint(null);
    if (view.minBasketOk || view.minBasketCents === 0) return;
    toast(copy.minimumHint.replace('{missing}', formatPrice(view.missingForMinBasketCents, locale)));
  }, [awaitingHint, view, locale, copy.minimumHint, toast]);

  if (variant === null) return null;

  const price = variant.priceCents;
  const alertBar = variant.soldOut || placeMark?.tone === 'pending';
  // Filigranın iki satırlık cümlesi barda tek satıra iner — barın yüksekliği tasarımın kararı (native).
  const barNote = variant.soldOut ? copy.soldOutBar.text : (placeMark?.label.replace('\n', ' ') ?? null);

  const request = async () => {
    const email = account?.email ?? null;
    if (email === null) {
      setAsking(true);
      return;
    }
    setNotice('sending');
    const { errorKey } = await recordVariantStockNoticeAction(variant.id, email);
    if (errorKey) {
      // Kayıt alınmadıysa düğme geri gelir ki müşteri yeniden deneyebilsin — alınmamış bir bekleyişi
      // alınmış gibi göstermek sözü bozmak olurdu (native kural).
      setNotice(null);
      const placeCopy = placeMessages[locale].placeNotice;
      toast(errorKey === 'place_unknown' ? placeCopy.placeUnknown : placeCopy.failed);
      return;
    }
    setNotice('done');
    toast(copy.stockNotice.recorded.replace('{code}', postalCode ?? ''));
  };

  const addToCart = () => {
    if (price === null) return;
    add({ kind: 'variant', variantId: variant.id, qty: quantity, stockId: variant.stockId });
    toast(copy.addedToast);
    setAwaitingHint(view.itemCount);
  };

  let content;
  if (alertBar) {
    content = (
      <div className="flex items-center gap-2.5">
        <p className={NOTE}>{barNote}</p>
        {notice === 'done' ? (
          <span className={`${ALERT} bg-olive-bg text-olive-dark`}>{copy.soldOutBar.alertOn}</span>
        ) : postalCode === null ? null : (
          <button
            type="button"
            onClick={() => void request()}
            disabled={notice === 'sending'}
            className={`${ALERT} cursor-pointer bg-olive text-card transition-[scale,opacity] active:scale-[0.97] disabled:cursor-progress disabled:opacity-60`}
          >
            {copy.soldOutBar.alert}
          </button>
        )}
      </div>
    );
  } else if (placeMark !== null) {
    content = <p className={NOTE}>{barNote}</p>;
  } else if (price === null) {
    content = <p className={NOTE}>{copy.cta.closed}</p>;
  } else {
    content = (
      <div className="flex items-center gap-2.5">
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          max={capOf(variant)}
          decreaseLabel={copy.stepper.decrease.replace('{name}', productName)}
          increaseLabel={copy.stepper.increase.replace('{name}', productName)}
        />
        <div className="min-w-0 flex-1">
          <PrimaryButton shape="block" label={`${copy.cta.add} · ${formatPrice(price * quantity, locale)}`} onClick={addToCart} />
        </div>
      </div>
    );
  }

  const web = webPlaceMessages[locale];
  return (
    <>
      <div className={SHELL}>{content}</div>
      {asking && postalCode !== null && (
        <NoticeDialog
          locale={locale}
          title={web.stockNoticeTitle}
          body={web.stockNoticeBody.replace('{product}', productName).replace('{code}', postalCode)}
          doneText={web.stockNoticeDone.replace('{code}', postalCode)}
          onSubmit={async (email) => {
            const result = await recordVariantStockNoticeAction(variant.id, email);
            if (!result.errorKey) setNotice('done');
            return result;
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}
