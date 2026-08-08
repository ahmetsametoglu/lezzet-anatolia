'use client';

import { RATIO_SQUARE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { useCart } from '@/components/customer/cart/cart-context';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontRecipeItem } from '@/lib/storefront/storefront-types';
import type { Messages } from '../recipe-types';

/**
 * **Tarifin tek malzeme satırı** (08.24) — görsel + ad + boy/fiyat + "+ Sepete".
 *
 * ── SATIR ÜRÜNE GİDER, DÜĞME SEPETE EKLER ───────────────────────────────────
 * Tasarımın etkileşim sözleşmesi: *"Malzeme satırına dokunmak ürünün detay sayfasına gider;
 * '+ Sepete' yalnız o malzemeyi ekler."* İkisi ayrı hedef olduğu için düğme bağın İÇİNDE değil
 * YANINDA duruyor — bağ içinde düğme hem erişilebilirlikte geçersiz hem de tıklama ikisinden
 * hangisine gideceği belirsiz olurdu.
 *
 * ── TÜKENMİŞ SATIR KALIR, DÜĞMESİ GİDER ─────────────────────────────────────
 * Malzeme listeden silinmiyor: tarif "1 ürün" derken sıfır satır göstermek tarifi eksik anlatmak
 * olurdu. Satır soluklaşır, düğmenin yerini "Tükendi" alır. Toplamdan düşmesi ayrı bir karar ve
 * okumada veriliyor (`lib/storefront/recipe.ts`).
 *
 * ── "SEPETTE" ETİKETİ TASARIMDA YOK, BİLİNÇLİ EKLENDİ ───────────────────────
 * Çizimde düğme tek hâlli. Ama eklemenin tek geri bildirimi başlıktaki sepet rozeti olsaydı, aynı
 * satıra ikinci kez basan müşteri hiçbir şey olmadığını sanıp üçüncü kez basardı. Katalog kartı bu
 * hâlde adet seçicisine dönüyor; burada seçici DEĞİL yalnız etiket değişiyor — tarif sayfasında
 * karar "bu malzeme lazım mı", "kaç tane" değil (adet tarifin kendisinden geliyor).
 */
interface IngredientRowProps {
  item: StorefrontRecipeItem;
  locale: Locale;
  t: Messages;
  /** Mobil web: daha küçük görsel ve daralan boşluklar (tasarım). */
  compact?: boolean;
}

export function IngredientRow({ item, locale, t, compact = false }: IngredientRowProps) {
  const { add, lineOf } = useCart();
  const inCart = lineOf({ variantId: item.variantId }) !== null;

  return (
    <div
      className={[
        'flex items-center rounded-soft border border-sand-200 bg-card',
        compact ? 'gap-3 px-3 py-2.5' : 'gap-3.5 px-3.5 py-2.5',
        item.soldOut ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Slug'ı çözülemeyen kalem BAĞLANMAZ (okuma künyesi: satır kalır, satılamaz görünür) —
          boş bir slug'a bağlanmak müşteriyi 404'e götürürdü. */}
      {item.productSlug ? (
        <Link
          href={{ pathname: '/product/[slug]', params: { slug: item.productSlug } }}
          className={['flex flex-1 cursor-pointer items-center', compact ? 'gap-3' : 'gap-3.5'].join(' ')}
        >
          <RowFace item={item} locale={locale} compact={compact} />
        </Link>
      ) : (
        <div className={['flex flex-1 items-center', compact ? 'gap-3' : 'gap-3.5'].join(' ')}>
          <RowFace item={item} locale={locale} compact={compact} />
        </div>
      )}

      {item.soldOut ? (
        <span className="flex-none rounded-pill bg-closed-bg px-3 py-1.5 font-sans text-micro font-semibold text-body">
          {t.soldOut}
        </span>
      ) : (
        <button
          type="button"
          disabled={inCart}
          onClick={() => add({ kind: 'variant', variantId: item.variantId, qty: item.qty, stockId: item.stockId })}
          className={[
            'flex-none rounded-pill border-[1.5px] font-sans font-bold transition-colors',
            compact ? 'px-3 py-1.5 text-micro' : 'px-3.5 py-2 text-note',
            inCart
              ? 'border-olive-line bg-olive-bg text-olive-dark'
              : 'cursor-pointer border-olive-line text-olive-dark hover:bg-olive-bg',
          ].join(' ')}
        >
          {inCart ? t.inCart : t.addOne}
        </button>
      )}
    </div>
  );
}

/** Satırın okunan yüzü — bağlı ve bağsız hâlde aynı, iki kez yazılmasın. */
function RowFace({ item, locale, compact }: { item: StorefrontRecipeItem; locale: Locale; compact: boolean }) {
  return (
    <>
      <div className={['flex-none', compact ? 'w-12' : 'w-14'].join(' ')}>
        <FramedImage src={item.image.url} alt={item.name} ratio={RATIO_SQUARE} crop={item.image.crop} />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body-sm'].join(' ')}>{item.name}</span>
        <span className="font-sans text-micro text-muted">
          {/* Adet YALNIZ birden çoksa yazılır: "1 ×" her satıra gürültü ekler ve tarifin çoğu
              malzemesi tektir. Fiyat çözülemediyse satır boyla yetinir — 0,00 € yazmak kalemi
              bedava gösterirdi (`CLAUDE §1`). */}
          {item.qty > 1 && `${item.qty} × `}
          {item.unitLabel}
          {item.unitPriceCents !== null && ` · ${formatPrice(item.unitPriceCents, locale)}`}
        </span>
      </div>
    </>
  );
}
