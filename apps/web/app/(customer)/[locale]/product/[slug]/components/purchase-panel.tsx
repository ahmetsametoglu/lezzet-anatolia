'use client';

import type { Locale } from '@lezzet/i18n';
import { formatComparison } from '@/lib/storefront/format';
import { variantNameOf } from '@/lib/storefront/variant-name';
import type { StorefrontVariant } from '@lezzet/application';
import { Badge } from '@/components/customer/ui/badge';
import { Price } from '@/components/customer/ui/price';
import { buttonClass } from '@/components/customer/ui/button';
import { QtyStepper } from '@/components/customer/ui/qty-stepper';
import { SCROLL_STRIP } from '@/components/customer/ui/scroll-strip';
import { useCart } from '@/components/customer/cart/cart-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { PlaceGate } from '@/components/customer/delivery/place-gate';
import type { Messages } from '../product-types';

/**
 * Satın alma iki parçadır, boy seçimi (`VariantPicker`) ve adet ile ana eylem (`PurchaseBar`), çünkü telefonda eylem akıştan ayrılır;
 * seçimin sahibi `product-client`tır. Tek kontrol modeli: önce yalnız 1 adet ekleyen "Sepete ekle", kalem sepete girince aynı kutuyu
 * dolduran adet seçicisi; iki ayrı kontrol ikinci basışta adedi fark ettirmeden katlardı.
 */

/**
 * Boy kartlarının masaüstü sütun sayısı: seçim en fazla iki satır sürer ve bir satırda üçten fazla kart olmaz, dört boy bu yüzden ikiye
 * iki bölünür. Yediden itibaren seçim tek satırlık yatay şeride geçer.
 */
function sizeColumns(count: number): number {
  if (count <= 3) return count;
  return count === 4 ? 2 : 3;
}

/** Izgaranın iki satıra sığdığı son sayı; üstünde şerit. */
const SIZE_SCROLL_AT = 7;

/** Adet tavanı: teklifte partide kalan miktar, aksi halde makul bir üst sınır (B2B hacmi sığar). */
const MAX_QTY = 99;

/** Boyun adet tavanı; telefon görünümünün yapışkan barı da okur ki iki görünüm aynı tavanda dursun. */
export const capOf = (v: StorefrontVariant) => (v.limitLabel ? Number(v.limitLabel) : MAX_QTY);

interface VariantPickerProps {
  t: Messages;
  locale: Locale;
  variants: StorefrontVariant[];
  selected: StorefrontVariant;
  onSelect: (variantId: string) => void;
  /**
   * Bakılan çeşidin aile içi etiketi ("Fıstıklı") — yalnız aileli üründe dolu.
   *
   * Boy başlığına bağlam ekler ("Fıstıklı çeşidin boyları"): hemen üstte çeşit kartları varken
   * çıplak "Boy seçin" başlığı hangi çeşidin boyu olduğunu söylemiyordu ve iki seçici arka arkaya
   * durduğu için tam da karışması istenmeyen yer burasıydı.
   */
  familyLabel?: string | null;
  compact?: boolean;
}

// Boyun müşteriye görünen adı `lib/storefront/variant-name.ts`te; telefon görünümünün boy çipleri de aynı kuralı okur.

/**
 * Boy seçimi: çok boylu üründe fiyat her boy kartının içindedir, çünkü kıyas kartlar arasında yapılır; tek boylu üründe seçilecek bir
 * şey yoktur ve fiyat kendi kutusunda durur.
 */
export function VariantPicker({ t, locale, variants, selected, onSelect, familyLabel = null, compact = false }: VariantPickerProps) {
  const multi = variants.length > 1;
  // Şerit YALNIZ masaüstünde: mobil zaten iki sütunlu ızgarada akıyor ve orada satır sayısı serbest.
  const scrolls = !compact && variants.length >= SIZE_SCROLL_AT;

  /** "500 g · 15,00 €/kg" — boy adı ve kıyas fiyatı; ikisi de yoksa satır hiç çizilmez. */
  const unitLine = [
    variantNameOf(selected, t.size, locale),
    selected.comparisonCents !== null && selected.comparisonUnit !== null
      ? formatComparison(selected.comparisonCents, selected.comparisonUnit, locale)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-3">
      {/* Tek boylu üründe seçim adımı hiç gösterilmez; yerine fiyat. */}
      {multi ? (
        <div className="flex flex-col gap-2.5">
          <span className="flex flex-col gap-0.5">
            <span className={['font-sans font-bold text-ink', compact ? 'text-body-sm' : 'text-body-sm'].join(' ')}>{t.chooseSize}</span>
            {familyLabel && (
              <span className="font-sans text-micro text-muted">{t.family.sizesOf.replace('{label}', familyLabel)}</span>
            )}
          </span>
          {/* Telefonda kartlar iki sütunlu ızgarada, çünkü dört boy tek satırda 390 px ekranı taşırır; komşu kartlar yine yan
              yana kıyaslanır. */}
          <div
            className={compact ? 'grid grid-cols-2 gap-2.5' : scrolls ? `${SCROLL_STRIP} gap-2.25` : 'grid gap-2.25'}
            // Sütun sayısı kart sayısından türer (`sizeColumns`): satır sayısı ikiyi, satırdaki kart
            // sayısı üçü geçmez. `auto-fit` bunu yapamıyordu — genişlik yettiği sürece dördüncü kartı
            // da aynı satıra alıyor, yetmediğinde tek kartlık ikinci satır bırakıyordu.
            style={compact || scrolls ? undefined : { gridTemplateColumns: `repeat(${sizeColumns(variants.length)}, minmax(0, 1fr))` }}
          >
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                aria-pressed={v.id === selected.id}
                className={[
                  'flex cursor-pointer flex-col gap-0.5 bg-card text-left transition-colors',
                  // 194 = tasarımın 150 px içerik genişliği + 40 ped + 4 çerçeve: tasarım `content-box`, Tailwind `border-box` ölçer.
                  compact ? 'rounded-soft px-3.5 py-2.5' : 'rounded-soft px-3.25 py-2.75',
                  // Şeritte kart sabit 158 px ve bu ölçü KASITLI: 470 px'lik rafta üçüncü kart
                  // kenarda kesilir, yani "devamı var" görünür. 150 px'te üç kart rafı tam
                  // dolduruyor ve şerit kaydırılabilir olduğunu hiçbir şeyle söylemiyordu.
                  scrolls ? 'w-[158px] flex-none' : '',
                  v.id === selected.id ? 'border-2 border-olive' : 'border-2 border-sand-200 hover:border-sand-400',
                  v.soldOut ? 'opacity-55' : '',
                ].join(' ')}
              >
                {/* Masaüstünde satırlar sıkı: token satır yükseklikleri kartı tasarımdan 14px uzatıyordu. */}
                <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-control leading-tight'].join(' ')}>
                  {variantNameOf(v, t.size, locale)}
                </span>
                {/* Fırsat rozeti FİYATIN YANINDA (tasarım): hangi boyun indirimli olduğu ancak o
                    boyun fiyatının yanında görünür — kartların altındaki ortak satır bunu söyleyemez. */}
                <span className={['flex flex-wrap items-center gap-2', compact ? '' : '[&_span]:leading-tight'].join(' ')}>
                  <Price cents={v.priceCents} wasCents={v.wasCents} locale={locale} size="md" />
                  {v.wasCents !== undefined && (
                    <Badge tone="offer" variant="filled">
                      {t.offer}
                    </Badge>
                  )}
                </span>
                {v.comparisonCents !== null && v.comparisonUnit !== null && (
                  <span className={['font-sans text-micro text-muted', compact ? '' : 'leading-tight'].join(' ')}>
                    {formatComparison(v.comparisonCents, v.comparisonUnit, locale)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2.5">
            <Price cents={selected.priceCents} wasCents={selected.wasCents} locale={locale} size="hero" />
            {selected.wasCents !== undefined && (
              <Badge tone="offer" variant="filled">
                {t.offer}
              </Badge>
            )}
          </span>
          {unitLine && <span className="font-sans text-micro text-muted">{unitLine}</span>}
        </div>
      )}

      {/* Adet sınırı fiyatın altında kendi satırında tek çiptir, çünkü fırsat rozetiyle yan yana iki kırmızı etiket birbirini
          bastırır; masaüstünde çip fiyat kutusunun altındadır (`LimitNote`). */}
      {compact && selected.limitLabel && <Badge tone="offer">{t.limit.replace('{n}', selected.limitLabel)}</Badge>}
    </div>
  );
}

/**
 * Fiyat kutusu: fiyat, birim satırı ve satın alma kontrolü tek kutuda; seçici yalnız seçilecek bir şey varken çizilir, fiyat her hâlde
 * burada ve kontrolle aynı hizada durur.
 */
export function PriceBox({ t, locale, selected, children }: { t: Messages; locale: Locale; selected: StorefrontVariant; children?: React.ReactNode }) {
  /** "500 g tepsi · 15,00 €/kg" — boy adı ve kıyas fiyatı; ikisi de yoksa satır hiç çizilmez. */
  const unitLine = [
    variantNameOf(selected, t.size, locale),
    selected.comparisonCents !== null && selected.comparisonUnit !== null
      ? formatComparison(selected.comparisonCents, selected.comparisonUnit, locale)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center gap-4 rounded-control border border-sand-200 bg-card px-4 py-3.5">
      <span className="flex flex-none flex-col gap-0.5 [&_span]:leading-tight">
        <span className="flex flex-wrap items-center gap-2">
          <Price cents={selected.priceCents} wasCents={selected.wasCents} locale={locale} size="xl" />
          {selected.wasCents !== undefined && (
            <Badge tone="offer" variant="filled">
              {t.offer}
            </Badge>
          )}
        </span>
        {unitLine && <span className="font-sans text-field-label font-normal text-muted">{unitLine}</span>}
      </span>
      {children && <div className="min-w-0 flex-1">{children}</div>}
    </div>
  );
}

/** Adet sınırı çipi kutunun altında kendi satırındadır, çünkü iki uyarı yan yana birbirini bastırır. */
export function LimitNote({ t, selected }: { t: Messages; selected: StorefrontVariant }) {
  if (!selected.limitLabel) return null;
  return (
    <span className="w-max">
      <Badge tone="offer">{t.limit.replace('{n}', selected.limitLabel)}</Badge>
    </span>
  );
}

interface PurchaseBarProps {
  t: Messages;
  locale: Locale;
  selected: StorefrontVariant;
  /**
   * Ürün yalnız kapıya teslim edilebiliyor mu (`!product.shippable`, soğuk zincir); yer bilinmiyorken satın alınabilirliği söylenemez
   * ve eylem yerini posta kodu isteğine bırakır (`PlaceGate`).
   */
  routeOnly?: boolean;
  /** Telefon akış yerleşimi: kontrol tam genişlik, karar bölgesinin son satırıdır. */
  flow?: boolean;
}

export function PurchaseBar({ t, locale, selected, routeOnly = false, flow = false }: PurchaseBarProps) {
  const { add, setQty: setCartQty, lineOf } = useCart();
  const { place, ready } = useDeliveryPlace();
  const cap = capOf(selected);
  const sellable = selected.priceCents !== null && !selected.soldOut;

  /**
   * Yer sorulmadan satın alma eylemi yalnız rota-only üründe çizilmez, çünkü kargolanabilen ürün her yere gider. `ready` beklenir ki
   * kodu kayıtlı müşteri bir an "önce posta kodu" görmesin.
   */
  const gated = routeOnly && ready && !place;

  // SEÇİLİ BOYUN sepetteki satırı — boy değişince bu da değişir. Varyantlı üründe "3 adet" bilgisi
  // ürüne değil BOYA aittir: 500 g'dan 3 alıp 1 kg'a geçen müşteriye hâlâ 3 göstermek yalan olur.
  const inCart = sellable ? lineOf({ variantId: selected.id }) : null;

  // Ekleme her zaman 1 adettir ve adet sonra aynı seçicide düzenlenir; sepette olmayan bir şeyin adedi karşılıksız bir sayıdır.
  const qty = inCart ? inCart.qty : 1;
  const setQty = (next: number) => inCart && setCartQty({ kind: 'variant', variantId: selected.id, stockId: inCart.stockId }, next);

  // Düğme toplam yazmaz: adet hep 1 olduğu için toplam birim fiyata eşittir ve hemen üstündeki fiyatı ikinci kez basardı.
  const label = !sellable ? (selected.priceCents === null ? t.closed : t.soldOut) : t.addToCart;

  // Tek kontrol, tek kutu. İkisi de satırın tamamını kaplar ve aynı yüksekliktedir; çerçeve farkı
  // düğmeye ŞEFFAF kenarlık verilerek kapanır — yoksa geçişte kutu birkaç piksel zıplıyor.
  const control = gated ? (
    <PlaceGate locale={locale} />
  ) : inCart ? (
    <QtyStepper
      value={qty}
      onChange={setQty}
      // 0'a inmek satırı sepetten ÇIKARIR ve ekran ekleme moduna döner — "vazgeçtim" yolu bu.
      min={0}
      max={cap}
      size="lg"
      fullWidth
    />
  ) : (
    <button
      type="button"
      onClick={() => add({ kind: 'variant', variantId: selected.id, qty: 1, stockId: selected.stockId })}
      disabled={!sellable}
      className={buttonClass({
        variant: 'primary',
        size: 'lg',
        fullWidth: true,
        // `text-lead`in 1.6 satır aralığı bir düğme etiketinde ~9 px fazladan yükseklik demek
        // (tasarım: 17/1.2). Seçici de aynı ölçüyü kullanır, iki kutu aynı kalır.
        className: 'border-2 border-transparent !px-4 !py-3 leading-tight whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50',
      })}
    >
      {label}
    </button>
  );

  // Masaüstünde kontrol sütunun yarısını kaplar, çünkü tam genişlik düğmeyi iri yapar ve seçicinin üç bölgesini koparır; telefon
  // akışında tam genişliktir, çünkü dar ekranda yarım düğme küçük bir yetimdir.
  return <div className={flow ? 'w-full' : 'w-1/2 min-w-56'}>{control}</div>;
}
