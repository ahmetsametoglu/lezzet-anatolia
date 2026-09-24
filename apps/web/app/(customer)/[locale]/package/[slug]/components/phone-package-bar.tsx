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
  Paketin yapışkan barı, native paket detayının alt barının web telefon ikizi: tükendide ve yer biliniyorken bu adrese gelemeyen pakette
  adet seçici ve düğme çizilmez, yerine tek satır durur, çünkü karşılayamayacağımız bir teklif müşteriyi sepette ya da ödemede duvara
  götürür. Pakette "haber ver" kaydı yoktur.
*/

type PackageCopy = LocalizedCopy<typeof packageDetailMessages>;

interface PhonePackageBarProps {
  copy: PackageCopy;
  locale: Locale;
  pack: StorefrontPackageDetail;
  /** Paketin bu adrese gelemediğini söyleyen yer notu; `null` ise yer bilinmiyor ya da paket gelebiliyor. */
  placeNote: string | null;
}

export function PhonePackageBar({ copy, locale, pack, placeNote }: PhonePackageBarProps) {
  const { add } = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);

  if (pack.soldOut || placeNote !== null) {
    return (
      <StickyBar>
        <p className="py-2 text-center font-sans text-note font-bold text-muted">{pack.soldOut ? copy.soldOutBar.text : placeNote}</p>
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
