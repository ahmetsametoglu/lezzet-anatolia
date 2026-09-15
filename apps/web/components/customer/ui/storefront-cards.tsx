'use client';

import { RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatComparison } from '@/lib/storefront/format';
import type { StorefrontCategory, StorefrontProduct } from '@lezzet/application';
import type { StorefrontCollection, StorefrontOffer, StorefrontPackage } from '@/lib/storefront/storefront-types';
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

interface CategoryCardProps {
  category: StorefrontCategory;
  /** Mobil şeritte kategori dairesi; kırpma yine kare. */
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
        frames={category.image.frames}
        // Daire mobil şeritte 86 px; kart masaüstünde 6 sütunlu ızgarada ~167 px (içerik 1360 px'te durur).
        sizes={circle ? '86px' : '170px'}
        circle={circle}
        className={circle ? 'w-[86px]' : 'w-full'}
        placeholder={<InitialMark name={category.name} />}
      />
      <span className={['font-sans font-bold text-ink', circle ? 'text-micro' : 'text-body'].join(' ')}>{category.name}</span>
    </Link>
  );
}

/**
 * Koleksiyon bandı yalnız kataloğun bir kesitine kapı açar, satın alma sunmaz: fiyat, stok ve sepet yok. Tasarımın 16:7 çerçevesi
 * 16:9 kayıtlı kapaktan odak ve zoomla türer; gradyan `--color-ink` üzerinden `color-mix` ile kurulur ki marka tonuyla dönsün.
 */
const RATIO_COLLECTION_BAND = 16 / 7;
const BAND_SCRIM =
  'linear-gradient(90deg, color-mix(in srgb, var(--color-ink) 78%, transparent) 0%,' +
  ' color-mix(in srgb, var(--color-ink) 35%, transparent) 55%, transparent 100%)';

interface CollectionCardProps {
  collection: StorefrontCollection;
  /** Üst etiket ("Koleksiyon") ve gidiş cümlesi — komponent metin taşımaz, çağıran sayfadan gelir. */
  labels: { tag: string; go: string; items: string };
  /**
   * Kampanyanın kısa hâli ("%15" · "3,00 €") — `null`/verilmemiş = kampanya yok, rozet çizilmez.
   * Cümlenin türetmesi çağıranda (`lib/storefront/campaign-note`): komponent metin taşımaz ve
   * para biçimini de bilmez.
   */
  campaignValue?: string | null;
  compact?: boolean;
}

export function CollectionCard({ collection, labels, campaignValue = null, compact = false }: CollectionCardProps) {
  return (
    <Link
      // Koleksiyon ayrı bir sayfa değil, katalogun bir hâli: süzgeç URL'de yaşar ve bağlantı paylaşılabilir kalır.
      href={{ pathname: '/catalog', query: { collection: collection.slug } }}
      // Yarıçap `rounded-card` (18px): tasarım 22px çiziyor ama envanterde o kademe YOK ve dört
      // piksel için ölçeği bölmek, sayfadaki her kartın köşesini birbirinden ayırmak olurdu.
      className="relative block cursor-pointer overflow-hidden rounded-card transition-opacity hover:opacity-95"
      style={{ aspectRatio: RATIO_COLLECTION_BAND }}
    >
      <FramedImage
        src={collection.image.url}
        alt={collection.name}
        ratio={RATIO_COLLECTION_BAND}
        crop={collection.image.crop}
        frames={collection.image.frames}
        // Masaüstü iki sütun (~623 px, içerik 1360 px'te durur); kompakt hâlde ekran eni.
        sizes={compact ? '100vw' : '630px'}
        className="absolute inset-0 h-full w-full"
        placeholder={<InitialMark name={collection.name} />}
      />
      {/* Örtü ŞART, süs değil: başlık fotoğrafın üstünde duruyor ve kapağın açık bir bölgesine
          denk gelen bir koleksiyon adı okunamaz hâle gelirdi. */}
      <span className="absolute inset-0" style={{ background: BAND_SCRIM }} />
      <span className={['absolute flex flex-col gap-1.5', compact ? 'bottom-4 left-4' : 'bottom-6 left-7'].join(' ')}>
        <span className="font-sans text-micro font-semibold uppercase tracking-wider text-olive-light">{labels.tag}</span>
        <span className={['font-serif font-medium text-on-image', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>
          {collection.name}
        </span>
        <span className="font-sans text-note font-bold text-on-image">
          {/* Kampanya sayaçla aynı satırda: kartın ölçüsü fotoğraf oranına bağlı ve yeni satır bandı uzatırdı. */}
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
  /** Çok varyantlıda fiyatın altındaki not ("başlangıç fiyatı — boy detayda seçilir"). */
  priceFrom: string;
  /**
   * Çok varyantlıda fiyatın KENDİSİNİ saran şablon (`{price}'dan` · `dès {price}` · `ab {price}`).
   *
   * `priceFrom` notunun yerine geçmez, ONUNLA BİRLİKTE çalışır ve ayrımı cihaz belirliyor: not
   * yalnız masaüstünde çiziliyor (dar kartta iki satırlık açıklama ızgarayı bozar), oysa fiyatın
   * bir alt sınır olduğu bilgisi MOBİLDE DE gerekli — ölçüldü (09.08): 31 çok boylu üründen
   * 24'ünde kartta yazan fiyat en ucuz boyunki değildi ve mobilde hiçbir işaret yoktu.
   */
  fromPrice: string;
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
  const { add, setQty, lineOf } = useCart();
  // "Bölgenizde şu an yok": ürün ağda var, müşterinin yerine ulaşamıyor. Tükendi DEĞİL — görsel
  // yarı solar (tamamen değil: ürün gerçek ve geri gelecek), fiyat sessizleşir, ad ink kalır.
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
            /* Tükenmiş üründe "…'dan" YAZILMAZ: alt sınır bir davettir, satılamayan üründe davet
               yanlış okunur. Ölçüt `purchaseMode` — künyesi `variantCount > 1` ile aynı kümede
               olduğunu söylüyor, yani iki ayrı yerden iki farklı cevap çıkamaz. */
            fromTemplate={product.purchaseMode === 'options' && !product.soldOut ? labels.fromPrice : undefined}
          />
          {product.soldOut ? (
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
        frames={offer.image.frames}
        sizes={compact ? '72px' : '96px'}
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
