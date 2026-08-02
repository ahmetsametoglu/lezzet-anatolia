'use client';

import { RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatComparison } from '@/lib/storefront/format';
import type { StorefrontCategory, StorefrontOffer, StorefrontPackage, StorefrontProduct } from '@/lib/storefront/storefront-types';
import { useCart } from '@/components/customer/cart/cart-context';
import { StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import { Badge } from './badge';
import { buttonClass } from './button';
import { Price } from './price';
import { QtyStepper } from './qty-stepper';

/**
 * §2 · Kartlar — K7 Ürün · K8 Fırsat · K9 Kategori · K10 Paket. Anasayfada doğdular ama katalog ve
 * ürün detay da bunları tüketecek, bu yüzden sayfa klasöründe değil ortak dizindeler (`STACK §7`).
 * Dördü aynı dosyada çünkü aynı ailedir: aynı çerçeve oranı, aynı kenarlık dili, aynı fiyat bloğu.
 *
 * Kart kendi fiyatını BİÇİMLENDİRMEZ (K6 `Price`), kendi rozetini BOYAMAZ (K5 `Badge`) — ikisi de
 * ortak karardır. Kartın işi yerleşim.
 *
 * Cihaz farkı `compact` ile taşınır (Sapma 3: `md:` akışkan responsive YOK). Kompakt = mobil
 * ölçüleri; düzenin kendisi (kaç sütun, hangi sırada) çağıran sayfanın işidir.
 *
 * Görsel her zaman `FramedImage` — kırpma künyesi (odak + zoom) kaynaktan gelir, kart kendi
 * kırpmasını uydurmaz; görsel yoksa placeholder zemin kalır (05.11 · envanter §0B).
 */

/**
 * Ürün kartının hedefi — detay sayfası (08.11 ile açıldı). Slug dil-bağımsızdır, `Link` segment
 * kelimesini dile göre çevirir (`/urun/...` · `/produit/...` · `/produkt/...`).
 */
const productHref = (slug: string) => ({ pathname: '/product/[slug]' as const, params: { slug } });

/** Paket detayının hedefi (05.5) — ürünle aynı kural: slug dil-bağımsız, segment kelimesi çevrilir. */
const packageHref = (slug: string) => ({ pathname: '/package/[slug]' as const, params: { slug } });

interface CategoryCardProps {
  category: StorefrontCategory;
  /** Mobil şeritte kategori dairesi (kırpma yine kare) — envanter O15. */
  circle?: boolean;
}

export function CategoryCard({ category, circle = false }: CategoryCardProps) {
  return (
    <Link
      // Kategori kartı kataloğu SÜZGEÇLİ açar; seçim URL'de yaşar (paylaşılabilir, geri tuşu çalışır).
      href={{ pathname: '/catalog', query: { category: category.slug } }}
      className={[
        'flex cursor-pointer flex-col items-center gap-2.5 text-center transition-colors',
        circle ? 'w-[86px] flex-none' : 'rounded-card border border-sand-200 bg-card p-3.5 hover:border-olive-line',
      ].join(' ')}
    >
      <FramedImage
        src={category.image.url}
        alt={category.name}
        ratio={RATIO_SOURCE}
        crop={category.image.crop}
        circle={circle}
        className={circle ? 'w-[86px]' : 'w-full'}
      />
      <span className={['font-sans font-bold text-ink', circle ? 'text-micro' : 'text-body'].join(' ')}>{category.name}</span>
    </Link>
  );
}

/**
 * Kart etiketleri — çağıran sayfa `messages.json`'undan geçer; komponent metin taşımaz.
 *
 * **İstisna: yer işaretleri** (19.7). "📦 Kargoyla gönderilir" ve "Bölgenizde şu an yok" dört
 * sayfada birden aynı cümledir ve kartın değil YER ailesinin metnidir — dört `messages.json`'a
 * kopyalamak yerine `StockMark` kendi sözlüğünü taşır (`place-chip` ile aynı desen).
 */
interface ProductCardLabels {
  addToCart: string;
  /** Çok varyantlı ürün: listeden eklenemez, detayda seçilir. */
  options: string;
  /** Çok varyantlıda fiyatın altındaki not ("başlangıç fiyatı — boy detayda seçilir"). */
  priceFrom: string;
  offer: string;
  soldOut: string;
  /** "En fazla {n} adet" — sayısı yerleştirilmiş hâli. */
  limit?: string | null;
}

interface ProductCardProps {
  product: StorefrontProduct;
  locale: Locale;
  labels: ProductCardLabels;
  compact?: boolean;
}

/**
 * K7 · Ürün Kartı — vitrin ve katalog listesinin ortak parçası. Dört durumu vardır ve dördü de
 * tasarımın "Etkileşim sözleşmesi" bölümünden gelir:
 *   normal        → "Sepete ekle" (tek varyant, listeden eklenir)
 *   sepette       → buton YERİNDE K19 adet seçicisine dönüşür; 1'de "−" ürünü çıkarır, buton geri gelir
 *   çok varyantlı → "Seçenekler →" (varyant seçimi ATLANAMAZ, detaya götürür)
 *   fırsat        → "Fırsat" rozeti + üstü çizili eski fiyat + varsa adet sınırı
 *   tükendi       → aksiyon pasif, görsel soluk; KART yine detaya tıklanabilir (geri gelecek beklentisi)
 *
 * "Sepette" hâli süs değil, listeden alışverişin ta kendisi: müşteri kataloğu gezerken adet
 * ayarlamak için sepete gidip geri dönmez. Buton kalıp "Eklendi ✓" deseydi ikinci tıklama ikinci
 * adet mi, yoksa hiçbir şey mi belli olmazdı.
 *
 * ── YER EKSENİ (19.7) ────────────────────────────────────────────────────────
 * Bunların ÜSTÜNE, yere bağlı bir işaret dili biner (`stockStatus`, tasarım §3): kargoyla gelen
 * ürün işaretlenir, bölgede olmayan solar ve birincil eylemi "Gelince haber ver" olur. İkisi
 * dikey eksendir — kargoyla gelen bir ürün de fırsatlı olabilir, sepette de olabilir.
 *
 * `soldOut` ile `stockStatus` çakışmaz: `soldOut` artık YALNIZ `out_of_stock` hâlinde true
 * (19.10). Bir dönem "senin deponda yok" anlamına kaymıştı ve kargoyla gönderebileceğimiz ürünü
 * "Tükendi" gösteriyordu — sistem müşteriyi tanıdıkça daha az satıyordu.
 */
export function ProductCard({ product, locale, labels, compact = false }: ProductCardProps) {
  const isOffer = product.wasCents !== undefined;
  const { add, setQty, lineOf } = useCart();
  // "Bölgenizde şu an yok": ürün ağda var, müşterinin yerine ulaşamıyor. Tükendi DEĞİL — görsel
  // yarı solar (tamamen değil: ürün gerçek ve geri gelecek), fiyat sessizleşir, ad ink kalır.
  const away = product.stockStatus === 'elsewhere';
  // Tek boylu ürün listeden eklenir; teklif kalemi ÇIPALI PARTİSİYLE girer (DOMAIN §5).
  const addToCart = () => {
    if (!product.variantId) return;
    add({ kind: 'variant', variantId: product.variantId, qty: 1, stockId: product.stockId });
  };
  const inCart = product.variantId ? lineOf({ variantId: product.variantId }) : null;
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-sand-200 bg-card">
      <Link href={productHref(product.slug)} className="relative cursor-pointer">
        <FramedImage
          src={product.image.url}
          alt={product.name}
          ratio={RATIO_SOURCE}
          crop={product.image.crop}
          className={['!rounded-none', product.soldOut ? 'opacity-60 grayscale' : away ? 'opacity-85 grayscale-[.55]' : ''].join(' ')}
        />
        {/* Durum rozeti — tükendi fırsatı ezer: satın alınamayan üründe indirim vurgusu yanıltır. */}
        {(product.soldOut || isOffer) && (
          <span
            className={[
              'pointer-events-none absolute top-3 left-3 rounded-soft px-3 py-1 font-sans text-micro font-bold text-white',
              product.soldOut ? 'bg-ink' : 'bg-terracotta',
            ].join(' ')}
          >
            {product.soldOut ? labels.soldOut : labels.offer}
          </span>
        )}
      </Link>
      <div className={['flex flex-col gap-1.5', compact ? 'p-2.5' : 'px-4 pt-3.5 pb-4'].join(' ')}>
        <Link
          href={productHref(product.slug)}
          className={[
            'cursor-pointer font-sans font-bold transition-colors hover:text-olive',
            compact ? 'text-note' : 'text-body',
            product.soldOut ? 'text-muted' : 'text-ink',
          ].join(' ')}
        >
          {product.name}
        </Link>
        <span className={['font-sans text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>
          {[product.unitLabel, product.comparisonCents !== null ? formatComparison(product.comparisonCents, locale) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {/* Yer işareti künyenin ALTINDA, fiyatın üstünde (tasarım): ürünün ne olduğu okunduktan
            sonra, satın alma kararından önce. Tükendi hâli burada değil görselin köşesinde. */}
        <StockMark status={product.stockStatus} locale={locale} />
        {labels.limit && (
          <Badge tone="offer" variant={compact ? 'plain' : 'tint'}>
            {labels.limit}
          </Badge>
        )}
        <div className={['flex items-center justify-between gap-2', compact ? 'mt-0.5' : 'mt-1'].join(' ')}>
          <Price
            cents={product.priceCents}
            wasCents={product.wasCents}
            locale={locale}
            size={compact ? 'sm' : 'lg'}
            tone={away ? 'muted' : 'default'}
            stacked={compact}
          />
          {product.soldOut ? (
            <span
              aria-disabled
              className={buttonClass({
                size: compact ? 'cardSm' : 'card',
                className: '!bg-disabled-fill !text-white cursor-not-allowed',
              })}
            >
              {labels.addToCart}
            </span>
          ) : away ? (
            /* Kartta TEK eylem "Gelince haber ver" (tasarım): dar kartta iki düğme sığmaz ve bu
               hâlde müşterinin sorusu "alabilir miyim" değil, "ne zaman alabilirim". Sepete ekleme
               yolu kapanmıyor — ürün detayında "sonraya kaydet" ile sürüyor. */
            <StockNoticeButton variantId={product.variantId} productName={product.name} locale={locale} />
          ) : product.purchaseMode === 'options' ? (
            /* Mobilde düğme belirgin şekilde küçülür (tasarım: 11px · 5/9 ped): dar kartta fiyatla
               aynı satırı paylaşıyor, masaüstü ölçüsüyle kalınca kartın dışına taşıyordu. `nowrap`
               şart — "Seçenekler" ile "→" iki satıra bölününce düğme kartı dikey olarak da şişiriyordu. */
            <Link
              href={productHref(product.slug)}
              className={buttonClass({
                variant: 'secondary',
                size: compact ? 'cardSm' : 'card',
                className: '!border-olive !text-olive flex-none whitespace-nowrap',
              })}
            >
              {labels.options}
            </Link>
          ) : inCart ? (
            /* K19 — buton yerine adet seçici. `min={0}`: 1'deyken "−" ürünü sepetten ÇIKARIR ve
               düğme geri gelir (envanter K19: "1'de − sepetten çıkarır"). Tavan sunucunun çözdüğü
               fırsat sınırıdır; dolunca "+" pasifleşir ve çerçeve nötrleşir. */
            <QtyStepper
              value={inCart.qty}
              onChange={(next) => product.variantId && setQty({ kind: 'variant', variantId: product.variantId, stockId: inCart.stockId }, next)}
              min={0}
              max={inCart.limitCap}
              size={compact ? 'xs' : 'md'}
            />
          ) : compact ? (
            <button
              type="button"
              onClick={addToCart}
              disabled={!product.variantId}
              aria-label={labels.addToCart}
              // Görsel daire 26px KALIR (tasarım), dokunma alanı 44px'e çıkar: dış kutu şeffaf ve
              // `size-11`, daire içeride. Bu düğme yerini adet seçicisine bırakıyor ve seçicinin
              // yeni tabanı da `min-h-11` — ikisi aynı yüksekliği paylaştığı için kart eklemede
              // zıplamıyor. Yatay eksen kartın genişliğine bağlı, kalıntı `design/BACKLOG §4`te.
              className="group flex size-11 flex-none cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="grid size-6.5 place-items-center rounded-full bg-olive font-sans text-body-sm font-bold text-white transition-colors group-hover:bg-olive-dark">
                +
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={addToCart}
              disabled={!product.variantId}
              className={buttonClass({ size: 'card', className: 'disabled:cursor-not-allowed disabled:opacity-50' })}
            >
              {labels.addToCart}
            </button>
          )}
        </div>
        {/* "başlangıç fiyatı" notu tasarımda YALNIZ masaüstü kartında var: mobilde kart zaten dar,
            iki satırlık bir açıklama ızgarayı düzensizleştirir ve "Seçenekler →" aynı şeyi söyler. */}
        {!compact && product.purchaseMode === 'options' && !product.soldOut && (
          <span className="font-sans text-micro text-muted">{labels.priceFrom}</span>
        )}
      </div>
    </div>
  );
}

interface OfferCardProps {
  offer: StorefrontOffer;
  locale: Locale;
  /** "En fazla {n} adet" — sayı yerleştirilmiş hâli çağırandan gelir (i18n şablonu sayfada çözülür). */
  limitLabel: string | null;
  compact?: boolean;
}

export function OfferCard({ offer, locale, limitLabel, compact = false }: OfferCardProps) {
  return (
    <Link
      href={productHref(offer.slug)}
      className={['flex cursor-pointer items-center bg-card', compact ? 'gap-3 rounded-soft p-3' : 'gap-4 rounded-card p-4'].join(' ')}
    >
      <FramedImage
        src={offer.image.url}
        alt={offer.name}
        ratio={1}
        crop={offer.image.crop}
        className={compact ? 'size-[72px] flex-none' : 'size-24 flex-none'}
      />
      <div className="flex flex-col gap-1">
        <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body'].join(' ')}>
          {compact ? `${offer.name} · ${offer.unitLabel}` : offer.name}
        </span>
        {!compact && <span className="font-sans text-note text-muted">{offer.unitLabel}</span>}
        <Price cents={offer.priceCents} wasCents={offer.wasCents} locale={locale} size={compact ? 'sm' : 'lg'} />
        {limitLabel && (
          <Badge tone="offer" variant={compact ? 'plain' : 'tint'}>
            {limitLabel}
          </Badge>
        )}
      </div>
    </Link>
  );
}

interface PackageCardProps {
  pack: StorefrontPackage;
  locale: Locale;
  badgeLabel: string;
  itemsLabel: string;
  ctaLabel: string;
  compact?: boolean;
}

export function PackageCard({ pack, locale, badgeLabel, itemsLabel, ctaLabel, compact = false }: PackageCardProps) {
  return (
    <div className={['flex items-center rounded-card bg-ink text-cream', compact ? 'gap-3.5 p-4' : 'gap-5 p-6'].join(' ')}>
      <FramedImage
        src={pack.image.url}
        alt={pack.name}
        ratio={1}
        crop={pack.image.crop}
        className={compact ? 'size-[84px] flex-none' : 'size-[130px] flex-none'}
      />
      <div className="flex flex-col gap-2">
        <span className={['font-sans text-olive-light uppercase', compact ? 'text-eyebrow-sm' : 'text-eyebrow'].join(' ')}>
          {badgeLabel} · {itemsLabel}
        </span>
        <span className={['font-serif', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{pack.name}</span>
        {!compact && <span className="font-sans text-note/relaxed text-neutral-400">{pack.description}</span>}
        <div className={['flex items-center', compact ? 'mt-0.5 gap-2.5' : 'mt-1 gap-3.5'].join(' ')}>
          <Price cents={pack.priceCents} locale={locale} tone="onDark" size={compact ? 'sm' : 'lg'} />
          <Link
            href={packageHref(pack.slug)}
            className={buttonClass({ variant: 'secondaryOnDark', size: compact ? 'cardSm' : 'card' })}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
