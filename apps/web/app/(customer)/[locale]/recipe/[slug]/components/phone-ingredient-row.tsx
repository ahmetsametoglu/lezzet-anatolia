'use client';

import { recipeRowMetaOf } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type recipeDetailMessages from '@lezzet/i18n/customer/recipe-detail';
import { useCart } from '@/components/customer/cart/cart-context';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { useToast } from '@/components/customer/ui/toast';
import { Link } from '@/i18n/navigation';
import type { StorefrontRecipeItem } from '@/lib/storefront/storefront-types';

/*
  TARİFİN MALZEME SATIRI — native tarif detayının satırının (`recipe-detail-screen.tsx` `row`) web telefon ikizi
  (14.09): 46'lık daire fotoğraf · ad (kontrol kademesi) · "{adet} × {boy} · {fiyat}" · sağda + kutusu. Satırlar
  arası kesikli kum çizgi.

  · Satır ürüne gider, + sepete ekler: iki ayrı hedef, düğme bağın İÇİNDE değil YANINDA (bağ içinde düğme
    erişilebilirlikte geçersiz). Ürünü çözülemeyen satır bağlanmaz — boş bir adrese bağ müşteriyi 404'e götürür.
  · + kutusu native'in: 38'lik kare, 1,5 mürekkep çerçeve, krem zemin, 2'lik sert gölge; basılınca gölgeyi yutar.
    Gölge mürekkep token'ından yerinde kurulur — native'de de öyle (kitte yalnız 3'lük `hard` durağı var).
  · Tükenmiş satır solmaz, +'nın yerini "Tükendi" alır; fiyatsız (satışa kapalı) satırda + çizilmez.
  · Alt metin iki yüzeyin ortak kurucusundan (`recipeRowMetaOf`).

  WEB'E ÖZGÜ: ekleme web'in sepetine (`useCart().add`, adet tarifin istediği kadar), onay bildirim hapında.
*/

type RecipeCopy = LocalizedCopy<typeof recipeDetailMessages>;

interface PhoneIngredientRowProps {
  item: StorefrontRecipeItem;
  copy: RecipeCopy;
  locale: Locale;
}

export function PhoneIngredientRow({ item, copy, locale }: PhoneIngredientRowProps) {
  const { add } = useCart();
  const toast = useToast();

  const face = (
    <>
      <CirclePhoto image={item.image} initial={item.name.slice(0, 1)} size={46} initialClassName="text-screen-title text-muted" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-sans text-control text-ink">{item.name}</span>
        <span className="truncate font-sans text-micro text-muted">
          {recipeRowMetaOf({ qty: item.qty, label: item.unitLabel, priceCents: item.unitPriceCents }, locale)}
        </span>
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-3 border-b-[1.5px] border-dashed border-sand-400 py-2.5">
      {item.productSlug ? (
        <Link
          href={{ pathname: '/product/[slug]', params: { slug: item.productSlug } }}
          aria-label={copy.row.open.replace('{name}', item.name)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 transition-opacity hover:opacity-80 active:opacity-70"
        >
          {face}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{face}</span>
      )}

      {item.soldOut ? (
        <span className="flex-none font-sans text-micro font-bold text-muted">{copy.row.soldOut}</span>
      ) : item.unitPriceCents === null ? null : (
        <button
          type="button"
          onClick={() => {
            add({ kind: 'variant', variantId: item.variantId, qty: item.qty, stockId: item.stockId });
            toast(copy.addedToast);
          }}
          aria-label={copy.row.add.replace('{name}', item.name)}
          className="flex size-9.5 flex-none cursor-pointer items-center justify-center rounded-badge border-[1.5px] border-ink bg-sand-50 font-sans text-icon-sm text-ink shadow-[2px_2px_0_var(--color-ink)] transition-[translate,box-shadow] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          +
        </button>
      )}
    </li>
  );
}
