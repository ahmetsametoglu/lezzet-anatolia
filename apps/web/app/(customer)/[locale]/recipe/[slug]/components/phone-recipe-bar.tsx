'use client';

import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type recipeDetailMessages from '@lezzet/i18n/customer/recipe-detail';
import { useCart } from '@/components/customer/cart/cart-context';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { StickyBar } from '@/components/customer/phone-kit/sticky-bar';
import { useToast } from '@/components/customer/ui/toast';
import type { StorefrontRecipeItem } from '@/lib/storefront/storefront-types';
import { buyableItems } from '../recipe-types';

/*
  TARİFİN YAPIŞKAN BARI — native tarif detayının alt barının (`recipe-detail-screen.tsx` `bar`) web telefon ikizi
  (14.09): krem cam, tek blok düğme "Malzemeleri sepete ekle · {toplam}".

  · Hiçbir satır eklenemiyorsa bar ÇİZİLMEZ (native sapma 3): "… · 0,00 €" ölü ve yalancı bir düğme olurdu.
    Barın kaydırma payını da sayfa aynı koşulla bırakır.
  · Onay sayısı EKLENENİ sayar, tarifin malzemesini değil: tükenen ya da fiyatsız satır sepete girmez, sayılmaz.

  WEB'E ÖZGÜ: ekleme web sepetinin toplu kapısından (`addMany` — aynı varyant sepetteyse adet artar; eklenemeyen
  satır sayısı sepete geçer, uyarıyı orada tek bir yer karşılar). Toplam okumanın kendisinden (`totalCents`,
  eklenebilir satırların Σ adet × fiyatı); bilinmiyorsa düğme toplamsız yazılır — sıfır yazılmaz.
*/

type RecipeCopy = LocalizedCopy<typeof recipeDetailMessages>;

interface PhoneRecipeBarProps {
  copy: RecipeCopy;
  locale: Locale;
  items: readonly StorefrontRecipeItem[];
  totalCents: number | null;
}

export function PhoneRecipeBar({ copy, locale, items, totalCents }: PhoneRecipeBarProps) {
  const { addMany } = useCart();
  const toast = useToast();
  const buyable = buyableItems(items);
  if (buyable.length === 0) return null;

  const addAll = () => {
    addMany(
      buyable.map((item) => ({ kind: 'variant' as const, variantId: item.variantId, qty: item.qty, stockId: item.stockId })),
      items.length - buyable.length,
    );
    toast(copy.addAllToast.replace('{n}', String(buyable.length)));
  };

  return (
    <StickyBar spacing="roomy">
      <PrimaryButton
        shape="block"
        label={totalCents === null ? copy.addAll : `${copy.addAll} · ${formatPrice(totalCents, locale)}`}
        onClick={addAll}
      />
    </StickyBar>
  );
}
