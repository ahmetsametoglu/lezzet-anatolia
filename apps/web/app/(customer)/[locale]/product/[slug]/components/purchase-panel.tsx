'use client';

import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontVariant } from '@/lib/storefront/storefront-types';
import { Badge } from '@/components/customer/ui/badge';
import { Price } from '@/components/customer/ui/price';
import { buttonClass } from '@/components/customer/ui/button';
import { QtyStepper } from '@/components/customer/ui/qty-stepper';
import { useCart } from '@/components/customer/cart/cart-context';
import type { Messages } from '../product-types';

/**
 * Satın alma — İKİ parça: boy seçimi (`VariantPicker`, içerik akışında) ve adet + ana aksiyon
 * (`PurchaseBar`).
 *
 * Ayrı olmalarının sebebi mobil: tasarım adet+ekle çubuğunu EKRANIN ALTINA SABİTLER — "sayfa
 * kaydırılırken hep görünür, WhatsApp/sosyal medyadan gelen trafik için tek dokunuş mesafesinde".
 * Boy seçimi ise akışta kalır. Tek bileşen olsalardı çubuk boy kartlarını da aşağı taşırdı.
 * Masaüstünde ikisi arka arkaya, sağ sütunda akar.
 *
 * Seçim SAHİBİ burası değil (`product-client`): boy değişince başlıktaki stok rozeti ve besin
 * tablosundaki net ağırlık da değişir.
 *
 * Sepete ekleme GERÇEKTİR (08.4): sepet servisi ve niyet deposu hazır. Ödeme adımı hâlâ yok
 * (07.4/07.5) ama o checkout'un işi — sepete atmak için ödemenin çalışması gerekmiyor.
 *
 * ── Tasarımdan BİLİNÇLİ SAPMA (28.07, kullanıcı kararı) ──────────────────────────────────────
 * Tasarım burada adet seçici + "Sepete ekle — {toplam}" düğmesini YAN YANA gösteriyor; ekleme
 * sonrası düğme 1,5 sn "Eklendi ✓" olup eski hâline dönüyor. İki sorunu var:
 *
 *   1. Dönen hâl yine "Sepete ekle" ve seçici hâlâ aynı sayıda duruyor — ikinci kez basan müşteri
 *      adedi İKİYE KATLIYOR ve bunu göremiyor (sepet adetleri toplar). "3 ekledim, hâlâ 3 yazıyor,
 *      olmadı galiba" refleksi tam bu tuzağa basıyor.
 *   2. Sepette olmayan bir şeyin "3 adedi" hiçbir yerde karşılığı olmayan bir sayı — ekleme öncesi
 *      adet sormak, henüz var olmayan bir şeyi ölçmek.
 *
 * Yerine TEK KONTROL modeli (katalog kartıyla aynı): önce yalnız "Sepete ekle" düğmesi vardır ve
 * her zaman 1 adet ekler. Kalem sepete girince düğme yerini AYNI KUTUYU dolduran adet seçicisine
 * bırakır; seçici artık gerçek adedi gösterir ve doğrudan onu düzenler (B2B elle giriş burada da
 * açık). 0'a inmek satırı çıkarır ve düğmeyi geri getirir.
 *
 * İki kontrol de satırın tamamını kaplar ve **piksel piksel aynı kutudur** — geçiş, bir düğmenin
 * başka bir düğmeye dönüşmesi gibi görünür. Çerçeve farkı düğmeye şeffaf kenarlık verilerek kapanır.
 *
 * Düğmenin yerine "Sepete git" KONMAZ: sepete gitmenin yolu başlıkta zaten var, çubuğa ikinci bir
 * kapı koymak aynı işi iki kez sunmaktır. "Eklendi ✓" de kaldırıldı — kalıcı mod değişimi 1,5
 * sn'lik bir etiketten güçlü bir onaydır, ikisi birlikte gürültü olurdu.
 */

/** Adet tavanı: teklifte partide kalan miktar, aksi halde makul bir üst sınır (B2B hacmi sığar). */
const MAX_QTY = 99;

const capOf = (v: StorefrontVariant) => (v.limitLabel ? Number(v.limitLabel) : MAX_QTY);

interface VariantPickerProps {
  t: Messages;
  locale: Locale;
  variants: StorefrontVariant[];
  selected: StorefrontVariant;
  onSelect: (variantId: string) => void;
  compact?: boolean;
}

/**
 * K22 · Boy seçimi. Fiyatın nerede gösterildiği varyant SAYISINA bağlıdır ve bu tasarımın kararıdır:
 *   çok boylu → fiyat her boy kartının içinde (kıyas kartlar arasında yapılır)
 *   tek boylu → seçilecek bir şey yok, fiyat tek başına durur ("7,50 € / 500 g · 15,00 €/kg")
 * İkisini birden göstermek fiyatı iki kez yazardı; hiçbirini göstermemek tek boylu ürünü fiyatsız
 * bırakırdı (ilk kodlamada bu oldu).
 */
export function VariantPicker({ t, locale, variants, selected, onSelect, compact = false }: VariantPickerProps) {
  const multi = variants.length > 1;

  /** "500 g · 15,00 €/kg" — boy adı ve kıyas fiyatı; ikisi de yoksa satır hiç çizilmez. */
  const unitLine = [selected.label, selected.comparisonCents !== null ? `${formatPrice(selected.comparisonCents, locale)}/kg` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-3">
      {/* Tek boylu üründe seçim adımı HİÇ gösterilmez (`musteri-urun-detay.md §2`) — yerine fiyat. */}
      {multi ? (
        <div className="flex flex-col gap-2.5">
          <span className={['font-sans font-bold text-ink', compact ? 'text-body-sm' : 'text-body'].join(' ')}>{t.chooseSize}</span>
          {/* Mobilde kartlar YAN YANA ve eşit paylı (tasarım `flex:1`) — alt alta dizmek boy
              karşılaştırmasını bozar, kıyas ancak yan yana yapılır. */}
          <div className={['flex', compact ? 'gap-2.5' : 'flex-wrap gap-3'].join(' ')}>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                aria-pressed={v.id === selected.id}
                className={[
                  'flex cursor-pointer flex-col gap-0.5 bg-card text-left transition-colors',
                  // 194 = tasarımın 150px İÇERİK genişliği + 40 ped + 4 çerçeve. Tasarım `content-box`,
                  // Tailwind `border-box` — aynı sayıyı yazmak kartı 44 px dar bırakıyordu (yaşandı).
                  compact ? 'flex-1 rounded-soft px-3.5 py-2.5' : 'min-w-[194px] rounded-card px-5 py-3.5',
                  v.id === selected.id ? 'border-2 border-olive' : 'border-2 border-sand-200 hover:border-sand-400',
                  v.soldOut ? 'opacity-55' : '',
                ].join(' ')}
              >
                <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body'].join(' ')}>{v.label}</span>
                {/* Fırsat rozeti FİYATIN YANINDA (tasarım): hangi boyun indirimli olduğu ancak o
                    boyun fiyatının yanında görünür — kartların altındaki ortak satır bunu söyleyemez. */}
                <span className="flex flex-wrap items-center gap-2">
                  <Price cents={v.priceCents} wasCents={v.wasCents} locale={locale} size="md" />
                  {v.wasCents !== undefined && (
                    <Badge tone="offer" variant="filled">
                      {t.offer}
                    </Badge>
                  )}
                </span>
                {v.comparisonCents !== null && (
                  <span className="font-sans text-micro text-muted">{formatPrice(v.comparisonCents, locale)}/kg</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2.5">
            <Price cents={selected.priceCents} wasCents={selected.wasCents} locale={locale} size="xl" />
            {selected.wasCents !== undefined && (
              <Badge tone="offer" variant="filled">
                {t.offer}
              </Badge>
            )}
          </span>
          {unitLine && <span className="font-sans text-micro text-muted">{unitLine}</span>}
        </div>
      )}

      {/* Adet sınırı KENDİ SATIRINDA durur (tasarım "İndirimli teklif" durumu): fiyatın altında tek
          bir çip. Fırsat rozetiyle yan yana dizilince iki kırmızı etiket birbirini bastırıyordu. */}
      {selected.limitLabel && <Badge tone="offer">{t.limit.replace('{n}', selected.limitLabel)}</Badge>}
    </div>
  );
}

interface PurchaseBarProps {
  t: Messages;
  selected: StorefrontVariant;
  /** Mobil: ekranın altına SABİT koyu çubuk. Masaüstü: sağ sütunda akan açık satır. */
  fixed?: boolean;
}

export function PurchaseBar({ t, selected, fixed = false }: PurchaseBarProps) {
  const { add, setQty: setCartQty, lineOf } = useCart();
  const cap = capOf(selected);
  const sellable = selected.priceCents !== null && !selected.soldOut;

  // SEÇİLİ BOYUN sepetteki satırı — boy değişince bu da değişir. Varyantlı üründe "3 adet" bilgisi
  // ürüne değil BOYA aittir: 500 g'dan 3 alıp 1 kg'a geçen müşteriye hâlâ 3 göstermek yalan olur.
  const inCart = sellable ? lineOf(selected.id) : null;

  // Ekleme HER ZAMAN 1 adettir; ayarlama eklendikten sonra yapılır. Öncesinde adet sormanın anlamı
  // yok: sepette olmayan bir şeyin "3 adedi" hiçbir yerde karşılığı olmayan bir sayıdır. Sepete
  // girdikten sonra ise aynı seçici gerçek adedi düzenler (B2B elle giriş orada da açık).
  const qty = inCart ? inCart.qty : 1;
  const setQty = (next: number) => inCart && setCartQty({ variantId: selected.id, stockId: inCart.stockId }, next);

  // Düğme TOPLAM YAZMAZ. Tasarımda yazıyordu çünkü ekleme öncesi adet seçilebiliyordu ("2 × 16,90"
  // gerçek bir hesaptı). Adet artık hep 1 olduğu için toplam birim fiyata eşit — yani düğme, hemen
  // üstündeki fiyatı ikinci kez basıyordu. Aynı sayıyı iki kez yazmak hiyerarşiyi de bozuyordu.
  const label = !sellable ? (selected.priceCents === null ? t.closed : t.soldOut) : t.addToCart;

  // Tek kontrol, tek kutu. İkisi de satırın tamamını kaplar ve aynı yüksekliktedir; çerçeve farkı
  // düğmeye ŞEFFAF kenarlık verilerek kapanır — yoksa geçişte kutu birkaç piksel zıplıyor.
  const control = inCart ? (
    <QtyStepper
      value={qty}
      onChange={setQty}
      // 0'a inmek satırı sepetten ÇIKARIR ve ekran ekleme moduna döner — "vazgeçtim" yolu bu.
      min={0}
      max={cap}
      size={fixed ? 'onDark' : 'lg'}
      fullWidth
    />
  ) : (
    <button
      type="button"
      onClick={() => add({ variantId: selected.id, qty: 1, stockId: selected.stockId })}
      disabled={!sellable}
      className={
        fixed
          ? 'w-full cursor-pointer rounded-soft border-[1.5px] border-transparent bg-olive-light px-5 py-3 font-sans text-body leading-tight font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50'
          : buttonClass({
              variant: 'primary',
              size: 'lg',
              fullWidth: true,
              // `text-lead`in 1.6 satır aralığı bir düğme etiketinde ~9 px fazladan yükseklik demek
              // (tasarım: 17/1.2). Seçici de aynı ölçüyü kullanır, iki kutu aynı kalır.
              className: 'border-2 border-transparent !px-4 !py-3 leading-tight whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50',
            })
      }
    >
      {label}
    </button>
  );

  // Masaüstünde kontrol sütunun YARISINI kaplar. Tam genişlik hem düğmeyi gereğinden iri yapıyor
  // hem de seçicinin üç bölgesini birbirinden koparıyordu — kutu daralınca oran kendiliğinden
  // düzeliyor. `min-w-56` dar sütunda kontrolün ezilmesini engeller.
  if (!fixed) return <div className="w-1/2 min-w-56">{control}</div>;

  // Sabit çubuk: sayfanın en altında DEĞİL, EKRANIN altında durur. Kaydırma boyunca yerinde kalır;
  // sayfanın alt boşluğu (`product.mobile`) çubuğun footer'ı örtmesini engeller.
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <div className="mx-auto max-w-[430px] rounded-card bg-ink px-3.5 py-3">{control}</div>
    </div>
  );
}
