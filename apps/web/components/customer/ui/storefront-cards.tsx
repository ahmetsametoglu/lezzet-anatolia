'use client';

import { RATIO_BAND, RATIO_PORTRAIT, RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatComparison } from '@/lib/storefront/format';
import type { StorefrontProduct } from '@lezzet/application';
import type { StorefrontCollection, StorefrontHomeCategory, StorefrontOffer, StorefrontPackage } from '@/lib/storefront/storefront-types';
import { useCart } from '@/components/customer/cart/cart-context';
import { StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import { Badge } from './badge';
import { buttonClass } from './button';
import { Price } from './price';
import { QtyStepper } from './qty-stepper';

/**
 * Ürün, fırsat, kategori, koleksiyon ve paket kartları: aynı çerçeve oranı, kenarlık dili ve fiyat bloğunu paylaştıkları için
 * tek dosyada. Kart fiyatını `Price`, rozetini `Badge` ile çizer; cihaz farkı `compact` ile taşınır, düzen çağıranın işidir.
 */

/** Ürün kartının hedefi; slug dil bağımsız, `Link` segment kelimesini dile göre çevirir. */
const productHref = (slug: string) => ({ pathname: '/product/[slug]' as const, params: { slug } });

/** Paket detayının hedefi; ürünle aynı kural. */
const packageHref = (slug: string) => ({ pathname: '/package/[slug]' as const, params: { slug } });

/**
 * Kapaksız kartın yedek çizimi, ad baş harfi: kapaksızlık beklenen bir hâl ve boş gri kutu "bozuk" diye okunur. Baş harf kod
 * noktası bazında alınır, çünkü `name[0]` "Ş" gibi çok baytlı bir karakterin yarısını kesebilirdi.
 */
function InitialMark({ name }: { name: string }) {
  const initial = [...name.trim()][0]?.toLocaleUpperCase('tr') ?? '';
  return (
    <span className="absolute inset-0 grid place-items-center bg-sand-100 font-serif text-h2 font-medium text-olive" aria-hidden>
      {initial}
    </span>
  );
}

/** Adın okunması için fotoğrafın alt kısmını karartan örtü; ton `--color-ink-deep` üzerinden kurulur. */
const CATEGORY_SCRIM = 'linear-gradient(180deg, transparent 38%, color-mix(in srgb, var(--color-ink-deep) 78%, transparent) 100%)';

interface CategoryCardProps {
  category: StorefrontHomeCategory;
  /** Sayaç satırı şablonu ("{n} ürün") — komponent metin taşımaz. */
  itemsLabel: string;
}

export function CategoryCard({ category, itemsLabel }: CategoryCardProps) {
  return (
    <Link
      // Kategori kartı kataloğu SÜZGEÇLİ açar; seçim URL'de yaşar (paylaşılabilir, geri tuşu çalışır).
      href={{ pathname: '/catalog', query: { category: category.slug } }}
      className="relative block cursor-pointer overflow-hidden rounded-card bg-sand-250 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-menu"
      style={{ aspectRatio: RATIO_PORTRAIT }}
    >
      <FramedImage
        src={category.image.url}
        alt={category.name}
        ratio={RATIO_PORTRAIT}
        crop={category.image.crop}
        frames={category.image.frames}
        // 6 sütunlu ızgarada ~197 px (içerik 1360 px'te durur).
        sizes="200px"
        className="absolute inset-0 h-full w-full !rounded-none"
        placeholder={<InitialMark name={category.name} />}
      />
      <span className="pointer-events-none absolute inset-0" style={{ background: CATEGORY_SCRIM }} />
      <span className="pointer-events-none absolute inset-x-3.5 bottom-3.5 flex flex-col gap-0.5">
        <span className="font-serif text-card-title-sm leading-tight text-on-image">{category.name}</span>
        <span className="font-sans text-micro font-bold tracking-[0.08em] text-olive-light uppercase">
          {itemsLabel.replace('{n}', String(category.productCount))}
        </span>
      </span>
    </Link>
  );
}

/** Koleksiyon kartı kataloğun bir kesitine kapı açar, satın alma sunmaz: fiyat, stok ve sepet yok. */
const COLLECTION_SCRIM = 'linear-gradient(180deg, transparent 34%, color-mix(in srgb, var(--color-ink-deep) 80%, transparent) 100%)';

interface CollectionCardProps {
  collection: StorefrontCollection;
  /** Üst etiket ("Koleksiyon") ve gidiş cümlesi — komponent metin taşımaz, çağıran sayfadan gelir. */
  labels: { tag: string; go: string; items: string };
  /**
   * Kampanyanın kısa hâli ("%15" · "3,00 €") — `null`/verilmemiş = kampanya yok, rozet çizilmez.
   * Cümlenin türetmesi çağıranda (`lib/storefront/campaign-note`): komponent para biçimini bilmez.
   */
  campaignValue?: string | null;
}

export function CollectionCard({ collection, labels, campaignValue = null }: CollectionCardProps) {
  return (
    <Link
      // Koleksiyon ayrı bir sayfa değil, katalogun bir hâli: süzgeç URL'de yaşar ve bağlantı paylaşılabilir kalır.
      href={{ pathname: '/catalog', query: { collection: collection.slug } }}
      className="relative block cursor-pointer overflow-hidden rounded-card bg-sand-250 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-menu"
      style={{ aspectRatio: RATIO_BAND }}
    >
      <FramedImage
        src={collection.image.url}
        alt={collection.name}
        ratio={RATIO_BAND}
        crop={collection.image.crop}
        frames={collection.image.frames}
        // İki sütunlu ızgarada ~623 px (içerik 1360 px'te durur).
        sizes="630px"
        className="absolute inset-0 h-full w-full !rounded-none"
        placeholder={<InitialMark name={collection.name} />}
      />
      <span className="pointer-events-none absolute inset-0" style={{ background: COLLECTION_SCRIM }} />
      <span className="pointer-events-none absolute inset-x-6 bottom-5.5 flex flex-col gap-1.5">
        <span className="font-sans text-photo-tag text-olive-light uppercase">{labels.tag}</span>
        <span className="font-serif text-h2 leading-tight text-on-image">{collection.name}</span>
        {collection.description && (
          <span className="font-sans text-body-sm leading-normal text-on-image-soft">{collection.description}</span>
        )}
        <span className="mt-0.5 font-sans text-control text-sand-50">
          {/* Kampanya sayaçla aynı satırda: kartın ölçüsü fotoğraf oranına bağlı ve yeni satır kartı uzatırdı. */}
          {labels.items.replace('{n}', String(collection.productCount))}
          {campaignValue === null ? null : ` · ${campaignValue}`} · {labels.go}
        </span>
      </span>
    </Link>
  );
}

/** Kart etiketleri çağıranın sözlüğünden gelir; yer işaretleri yer ailesinin metni olduğu için `StockMark`in kendi sözlüğünde. */
interface ProductCardLabels {
  addToCart: string;
  /** Çok varyantlı ürün: listeden eklenemez, detayda seçilir. */
  options: string;
  /** Çok varyantlıda fiyatın altındaki not ("başlangıç fiyatı — boy detayda seçilir"); verilmezse satır çizilmez. */
  priceFrom?: string;
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
 * Ürün kartı: tek boylu ürün listeden eklenir ve sepetteyse düğmenin yerini adet seçici alır; çok boylu ürün "Seçenekler →" ile
 * detaya gider, tükenmiş ürünün eylemi pasif ama kartı açılır. Bölgede olmayan ürün solar ve eylemi "Gelince haber ver" olur;
 * `soldOut` yalnız `out_of_stock` demektir, kargoyla gönderilebilen ürün tükendi görünmez.
 */
export function ProductCard({ product, locale, labels, compact = false }: ProductCardProps) {
  const isOffer = product.wasCents !== undefined;
  // "Bölgenizde şu an yok": ürün ağda var, müşterinin yerine ulaşamıyor. Tükendi DEĞİL — görsel
  // yarı solar (tamamen değil: ürün gerçek ve geri gelecek), fiyat sessizleşir, ad ink kalır.
  const away = product.stockStatus === 'elsewhere';
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-sand-200 bg-card">
      <Link href={productHref(product.slug)} className="relative cursor-pointer">
        <FramedImage
          src={product.image.url}
          alt={product.name}
          ratio={RATIO_SOURCE}
          crop={product.image.crop}
          frames={product.image.frames}
          /* Kart her yerde aynı ızgarada: masaüstü 4 sütun (~301 px, içerik 1360 px'te durur), mobil 2 sütun; yeni ızgara
             açılırsa bu değer de gözden geçirilir. */
          sizes={compact ? '50vw' : '310px'}
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
        {/* Dar kartta fiyat ve eylem iki satırda: aynı satırda üstü çizili fiyat ve "Seçenekler →" kart kenarından taşar, tam
            genişlik eylem 44px'i iki eksende de sağlar. Masaüstü kartı tek satırda. */}
        <div className={compact ? 'mt-1.5 flex flex-col items-stretch gap-2' : 'mt-1 flex items-center justify-between gap-2'}>
          <Price
            cents={product.priceCents}
            wasCents={product.wasCents}
            locale={locale}
            size={compact ? 'sm' : 'lg'}
            tone={away ? 'muted' : 'default'}
            stacked={compact}
          />
          <ProductCardAction product={product} locale={locale} labels={labels} compact={compact} />
        </div>
        {/* "başlangıç fiyatı" notu tasarımda YALNIZ masaüstü kartında var: mobilde kart zaten dar,
            iki satırlık bir açıklama ızgarayı düzensizleştirir ve "Seçenekler →" aynı şeyi söyler. */}
        {!compact && labels.priceFrom && product.purchaseMode === 'options' && !product.soldOut && (
          <span className="font-sans text-micro text-muted">{labels.priceFrom}</span>
        )}
      </div>
    </div>
  );
}

interface ProductCardActionProps {
  product: StorefrontProduct;
  locale: Locale;
  labels: Pick<ProductCardLabels, 'addToCart' | 'options'>;
  compact?: boolean;
}

/**
 * Kartın sepet eylemi — ürün ve fırsat kartı aynı denetimi kullanır: tükendi · haber ver · seçenekler · adet seçici · sepete ekle.
 */
function ProductCardAction({ product, locale, labels, compact = false }: ProductCardActionProps) {
  const { add, setQty, lineOf } = useCart();
  const away = product.stockStatus === 'elsewhere';
  /* Sepete eklenebilirlik iki şarta bağlı: eklenecek bir boy var ve o boy bu kanalda satılıyor. Bayrak değil kimlik tutulur ki
     tek kaynak hem iki düğmeyi hem eylemi beslesin. */
  const buyableVariantId = product.priceCents != null ? product.variantId : null;
  // Tek boylu ürün listeden eklenir; teklif kalemi ÇIPALI PARTİSİYLE girer (DOMAIN §5).
  const addToCart = () => {
    if (!buyableVariantId) return;
    add({ kind: 'variant', variantId: buyableVariantId, qty: 1, stockId: product.stockId });
  };
  const inCart = product.variantId ? lineOf({ variantId: product.variantId }) : null;
  return product.soldOut ? (
    <span
      aria-disabled
      className={buttonClass({
        size: compact ? 'cardSm' : 'card',
        fullWidth: compact,
        className: '!bg-disabled-fill !text-white cursor-not-allowed',
      })}
    >
      {labels.addToCart}
    </span>
  ) : away ? (
    /* Kartta tek eylem "haber ver": dar kartta iki düğme sığmaz ve müşterinin sorusu "ne zaman alabilirim". Haberin kalem
         mi bölge mi olduğunu düğme kendisi seçer. */
    <StockNoticeButton
      variantId={product.variantId}
      productName={product.name}
      locale={locale}
      /* Bölge notu alındıktan sonra düğmenin yerine detay köprüsü geçer, uzun onay cümlesi kartta taşardı. */
      productHref={productHref(product.slug)}
    />
  ) : product.purchaseMode === 'options' ? (
    /* `nowrap` şart: "Seçenekler" ile "→" iki satıra bölünürse düğme kartı dikey olarak şişirir. */
    <Link
      href={productHref(product.slug)}
      className={buttonClass({
        variant: 'secondary',
        size: compact ? 'cardSm' : 'card',
        fullWidth: compact,
        className: `!border-olive !text-olive whitespace-nowrap ${compact ? '' : 'flex-none'}`,
      })}
    >
      {labels.options}
    </Link>
  ) : inCart ? (
    /* Buton yerine adet seçici: 1'deyken "−" ürünü sepetten çıkarır ve düğme geri gelir; tavan sunucunun çözdüğü fırsat
         sınırı. */
    <QtyStepper
      value={inCart.qty}
      onChange={(next) => product.variantId && setQty({ kind: 'variant', variantId: product.variantId, stockId: inCart.stockId }, next)}
      min={0}
      max={inCart.limitCap}
      size={compact ? 'xs' : 'md'}
      fullWidth={compact}
    />
  ) : compact ? (
    /* Dar kartta eylem satırın tamamı: adlı düğme okunur ve 44px'i iki eksende sağlar; eklemede aynı kutuyu dolduran
         seçiciye döner, kart zıplamaz. */
    <button
      type="button"
      onClick={addToCart}
      disabled={!buyableVariantId}
      className={buttonClass({ size: 'cardSm', fullWidth: true, className: 'disabled:cursor-not-allowed disabled:opacity-50' })}
    >
      {labels.addToCart}
    </button>
  ) : (
    <button
      type="button"
      onClick={addToCart}
      disabled={!buyableVariantId}
      className={buttonClass({ size: 'card', className: 'disabled:cursor-not-allowed disabled:opacity-50' })}
    >
      {labels.addToCart}
    </button>
  );
}

interface OfferCardProps {
  offer: StorefrontOffer;
  locale: Locale;
  /** Rozet metni — sınır varsa "En fazla {n} adet", yoksa bölümün "Stokla sınırlı" notu; çağıran çözer. */
  limitLabel: string;
  actionLabels: Pick<ProductCardLabels, 'addToCart' | 'options'>;
}

export function OfferCard({ offer, locale, limitLabel, actionLabels }: OfferCardProps) {
  return (
    <div className="flex items-center gap-3.5 rounded-card border border-terracotta-line bg-card p-3.5 transition-shadow hover:shadow-menu">
      <Link href={productHref(offer.slug)} className="flex-none cursor-pointer">
        <FramedImage
          src={offer.image.url}
          alt={offer.name}
          ratio={1}
          crop={offer.image.crop}
          frames={offer.image.frames}
          sizes="92px"
          className="size-[92px] !rounded-[12px] bg-sand-100"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={productHref(offer.slug)}
          className="cursor-pointer font-sans text-body font-bold text-ink transition-colors hover:text-olive"
        >
          {offer.name}
        </Link>
        <span className="font-sans text-note text-muted">
          {[offer.unitLabel, offer.comparisonCents !== null ? formatComparison(offer.comparisonCents, locale) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <Price cents={offer.priceCents} wasCents={offer.wasCents} locale={locale} size="lg" />
        <div className="mt-0.5 flex items-center justify-between gap-2.5">
          <Badge tone="offer" variant="tint">
            {limitLabel}
          </Badge>
          <ProductCardAction product={offer} locale={locale} labels={actionLabels} />
        </div>
      </div>
    </div>
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
    <div
      className={[
        'flex items-center rounded-card border border-ink-raised-line bg-ink-raised text-cream',
        compact ? 'gap-3.5 p-4' : 'gap-5 p-6',
      ].join(' ')}
    >
      <FramedImage
        src={pack.image.url}
        alt={pack.name}
        ratio={1}
        crop={pack.image.crop}
        frames={pack.image.frames}
        sizes={compact ? '84px' : '130px'}
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
