'use client';

import { useState } from 'react';
import { formatPrice, PACKAGE_QUANTITY_MAX } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type packageDetailMessages from '@lezzet/i18n/customer/package-detail';
import { useCart } from '@/components/customer/cart/cart-context';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { QuantityStepper } from '@/components/customer/phone-kit/quantity-stepper';
import { StickyBar } from '@/components/customer/phone-kit/sticky-bar';
import { useToast } from '@/components/customer/ui/toast';
import type { StorefrontPackageDetail } from '@/lib/storefront/storefront-types';

/*
  PAKETİN YAPIŞKAN BARI — native paket detayının alt barının (`package-detail-screen.tsx` `bar`) web telefon ikizi
  (14.09). İki hâl, native'inki:
    · tükendi → tek satır ("Bu paket şu an tükendi."); adet seçici ve düğme HİÇ çizilmez — karşılayamayacağımız
      şeyi teklif eden düğme müşteriyi sepette ya da ödemede duvara götürürdü. Pakette "haber ver" kaydı yok,
      olmayan bir söz verilmez.
    · satılabilir → adet seçici (1…20, ortak tavan `PACKAGE_QUANTITY_MAX`) + "Paketi sepete ekle · {toplam}".
  "Bu adrese gönderemiyoruz" barı DEĞİŞTİRMEZ: paket bir yerde var, yalnız bu adrese o yoldan gitmiyor — kararı
  sepet ve ödeme adımı verir (native sapma 1).

  WEB'E ÖZGÜ: ekleme web'in sepetine (`useCart().add` — paket bütün satılır, satırın kimliği paketin kimliği),
  onay bildirim hapında.
*/

type PackageCopy = LocalizedCopy<typeof packageDetailMessages>;

interface PhonePackageBarProps {
  copy: PackageCopy;
  locale: Locale;
  pack: StorefrontPackageDetail;
}

export function PhonePackageBar({ copy, locale, pack }: PhonePackageBarProps) {
  const { add } = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);

  if (pack.soldOut) {
    return (
      <StickyBar>
        <p className="py-2 text-center font-sans text-note font-bold text-muted">{copy.soldOutBar.text}</p>
      </StickyBar>
    );
  }

  const addToCart = () => {
    add({ kind: 'bundle', bundleId: pack.id, qty: quantity });
    toast(copy.addedToast);
  };

  return (
    <StickyBar>
      <div className="flex items-center gap-2.5">
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          max={PACKAGE_QUANTITY_MAX}
          decreaseLabel={copy.stepper.decrease.replace('{name}', pack.name)}
          increaseLabel={copy.stepper.increase.replace('{name}', pack.name)}
        />
        <div className="min-w-0 flex-1">
          <PrimaryButton shape="block" label={`${copy.cta.add} · ${formatPrice(pack.priceCents * quantity, locale)}`} onClick={addToCart} />
        </div>
      </div>
    </StickyBar>
  );
}
