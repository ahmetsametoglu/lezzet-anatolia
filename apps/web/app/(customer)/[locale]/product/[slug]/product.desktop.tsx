import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { DeliveryLine } from '@/components/customer/delivery/delivery-line';
import { ColdChainMark, StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import { Badge } from '@/components/customer/ui/badge';
import { ShareButton } from '@/components/customer/ui/share-button';
import { formatDecimal } from '@/lib/storefront/format';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { Band } from '@/components/customer/ui/section';
import { Icon } from '@/components/customer/ui/icons';
import { variantNameOf } from '@/lib/storefront/variant-name';
import { AiAsk } from './components/ai-ask';
import { Declaration } from './components/declaration';
import { FamilyBlock } from './components/family-block';
import { Gallery } from './components/gallery';
import { LimitNote, PriceBox, PurchaseBar, VariantPicker } from './components/purchase-panel';
import { Stars } from './components/review-card';
import { Reviews } from './components/reviews';
import type { ProductViewProps } from './product-types';

/**
 * Ürün detay masaüstü düzeni: galeri ve yapışkan karar rafı (1fr / 470 px), künye bandı, yorumlar, benzer ürünler. Raf yapışkan,
 * çünkü müşteri künyeyi okurken boy, fiyat ve sepet düğmesi ekranda kalmalı.
 */
export function ProductDesktop({ t, locale, product, selected, onSelect, familyLabel, unavailable, reviews }: ProductViewProps) {
  /** "Bu adrese gönderemiyoruz" hâli eylem sırasını değiştirir; ölçüt tek yerde ki yer ve ağırlık kararı ayrışmasın. */
  const away = selected?.stockStatus === 'elsewhere';

  /** Çeşit kartları yalnız boy seçicisi de olan üründe sola iner: iki seçici birden rafta dururken raf galeriden uzuyordu. */
  const familyOnLeft = product.family.length > 0 && product.variants.length > 1;

  /**
   * Yapay zekâ sorusu kategoriden gelir, cümle BURADA kurulur: `{w}` seçili boydur ve seçim
   * ekranda değişiyor. Boy çözülemezse bölüm çizilmez — yarım bir soru göndermektense hiç sormamak.
   */
  const aiQuestion =
    product.aiQuestion && selected
      ? product.aiQuestion.replace('{n}', product.name).replace('{w}', variantNameOf(selected, t.size, locale))
      : null;

  /**
   * Teslimat satırı boy seçiminin ÜSTÜNDE durur (çeşitlerin altı, çeşit yoksa açıklamanın altı): kargo kısıtı sepete eklemeden
   * önce görünür. Bu adrese gönderilemeyen üründe kutu "yine de sepete ekle" düğmesini taşıdığı için boy seçiminin altına iner.
   */
  const delivery = (
    <DeliveryLine
      box
      locale={locale}
      shippable={product.shippable}
      status={selected?.stockStatus}
      fallback={t.assurance}
      blockedActions={
        away && selected ? (
          /**
           * Müşteri bu ürünü bu adrese alamıyor, o yüzden en güçlü teklif alternatiftir. Satın alma kapanmaz ama adı değişir,
           * çünkü artık uyarıya rağmen devam etmektir.
           */
          <span className="flex w-full flex-col gap-2">
            <Link
              href={{ pathname: '/catalog', query: { shippable: '1' } }}
              className={buttonClass({ variant: 'primary', size: 'md', fullWidth: true, className: '!text-note' })}
            >
              {t.assurance.seeShippable}
            </Link>
            <StockNoticeButton variantId={selected.id} productName={product.name} locale={locale} emphasis="panel" />
            {/* Üçüncül: nötr çerçeve + "Yine de sepete ekle". `w-full` sarmalayıcı, düğmenin
                kendi `w-1/2` kutusunu kutunun genişliğine açıyor. */}
            <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} deemphasized />
          </span>
        ) : selected?.stockStatus === 'shipping' ? undefined : (
          /**
           * Kargoyla gidebilen üründe çıkış düğmesi yok, çözülecek sorun yok. Teklif yalnız gerçek çıkmazda: yer rota dışında ve
           * ürün kargolanamıyor.
           */
          <Link href={{ pathname: '/catalog', query: { shippable: '1' } }} className={buttonClass({ size: 'sm', className: '!text-note' })}>
            {t.assurance.seeShippable}
          </Link>
        )
      }
    />
  );

  return (
    <div className="flex flex-col">
      <nav className="flex gap-1.5 px-12 pt-5 font-sans text-body-sm text-muted">
        <Link href="/catalog" className="font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
        {product.category && <span>· {product.category.name}</span>}
        <span>· {product.name}</span>
      </nav>

      {/* Solda ürünün kendisi, sağda 470 px'lik yapışkan karar rafı. */}
      <div className="grid grid-cols-[1fr_470px] items-start gap-11 px-12 pt-8 pb-9.5">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Gallery images={product.gallery} alt={product.name} labels={t.gallery} />
          {familyOnLeft && (
            <FamilyBlock t={t.family} locale={locale} members={product.family} currentUnavailable={unavailable} layout="grid" />
          )}
        </div>

        {/* Raf kaydırmada ekranda kalır: karar (boy · fiyat · sepet) künyeyi okurken de elin altında. */}
        <div className="sticky top-24 flex min-w-0 flex-col gap-4">
          {product.category && (
            <span className="font-sans text-caps-label tracking-[0.14em] text-olive uppercase">{product.category.name}</span>
          )}
          <div className="flex items-start justify-between gap-3.5">
            <h1 className="font-serif text-page-title leading-tight text-ink">{product.name}</h1>
            <ShareButton label={t.share} subject={{ subjectType: 'product', subjectId: product.id, productId: product.id }} />
          </div>

          {/* Stok rozeti SEÇİLİ boyu anlatır: bir boy tükenmişken "Stokta" yazmak, düğmesi "Tükendi"
              olan aynı ekranda kendi kendini yalanlar. Yere bağlı iki hâlde rozetin yerini yer
              işareti alır — orada yeşil "Stokta" hemen altındaki teslimat kutusuyla çelişirdi.
              Soğuk zincir işareti rozetin yanında (16.08): teslimatın değil ÜRÜNÜN künyesi. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Puan adın altında; yorumu olmayan üründe satır rozetlerle başlar. Sayı yorumlara götürür. */}
            {reviews.score.average !== null && (
              <a href="#reviews" className="mr-1.5 inline-flex cursor-pointer items-center gap-2.5 font-sans">
                <Stars value={reviews.score.stars ?? reviews.score.average} small />
                <span className="text-button text-ink">{formatDecimal(reviews.score.average, locale, 1)}</span>
                <span className="text-control font-normal text-muted transition-colors hover:text-olive">
                  · {t.reviews.countShort.replace('{count}', String(reviews.total))}
                </span>
              </a>
            )}
            {selected &&
              (selected.stockStatus === 'available' || selected.stockStatus === 'out_of_stock' ? (
                <Badge tone={selected.soldOut ? 'closed' : 'positive'}>{selected.soldOut ? t.soldOut : t.inStock}</Badge>
              ) : (
                <StockMark status={selected.stockStatus} locale={locale} size="lg" />
              ))}
            {product.coldChain && <ColdChainMark label={t.assurance.coldChainShort} />}
          </div>

          {/* Açıklama 15 px (tasarım 15,5): rafın genişliği 470 px ve 18 px'lik satır orada üç yerine
              beş satıra çıkıyordu. */}
          {product.description && <p className="font-sans text-body leading-relaxed text-body">{product.description}</p>}

          {/* Çeşit bloğu boy seçicisi YOKKEN rafta kalır; varken sola iner (yukarıdaki `familyOnLeft`). */}
          {!familyOnLeft && <FamilyBlock t={t.family} locale={locale} members={product.family} currentUnavailable={unavailable} />}

          {/* Boy seçicisi yalnız seçilecek bir şey varken çizilir; tek boyda fiyat kutusu zaten fiyatı söyler. */}
          {selected && product.variants.length > 1 && (
            <VariantPicker t={t} locale={locale} variants={product.variants} selected={selected} onSelect={onSelect} familyLabel={familyLabel} />
          )}

          {!away && delivery}

          {selected && (
            <>
              <PriceBox t={t} locale={locale} selected={selected}>
                {/* `elsewhere` hâlinde düğme kutuda DEĞİL, teslimat kutusunun içinde ve orada üçüncül. */}
                {!away && <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} flow />}
              </PriceBox>
              <LimitNote t={t} selected={selected} />
            </>
          )}

          {away && delivery}

          <span className="flex items-center gap-1.5 border-t border-sand-200 pt-3.25 font-sans text-field-label font-normal text-muted">
            <Icon name="box" size={14} />
            {t.assurance.sturdyBox}
          </span>
        </div>
      </div>

      {/* Künye kendi bandında ve üç eşit kart: sol sütunda dururken sayfanın en uzun bloğuydu ve
          rafın bittiği yerde sayfayı tek sütuna düşürüyordu (tasarım 20.09). */}
      {/* Zemin ve çizgi EKRANIN İKİ KENARINA uzanır (`Band`), içerik kabukta kalır: geniş ekranda
          kabuk genişliğinde kesilen kum blok, bandın yarıda bittiği izlenimi veriyordu. */}
      <Band surface="border-t border-sand-300 bg-sand-100" className="flex flex-col gap-4.5 px-12 py-8.5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-page-title-sm text-ink">{t.declaration.title}</h2>
          <span className="font-sans text-note text-muted">{t.declaration.note}</span>
        </div>
        <Declaration
          t={t}
          locale={locale}
          declaration={product.declaration}
          netQuantity={selected?.netQuantity ?? null}
          netUnit={selected?.netUnit ?? null}
        />
        {aiQuestion && <AiAsk t={t.ai} question={aiQuestion} />}
      </Band>

      <div className="px-12 py-9">
        <Reviews t={t} locale={locale} productId={product.id} productName={product.name} data={reviews} />
      </div>

      {product.similar.length > 0 && (
        <Band surface="border-t border-sand-275 bg-sand-50" className="flex flex-col gap-4 px-12 pt-8.5 pb-10.5">
          {/* Açıklama satırı YOK. Bir süre "aile üyeleri burada tekrar edilmez" yazıyordu; kural
              değişti (04.08 — her aileden bir temsilci gelebilir) ve cümle yalan oldu. Yerine
              yenisi konmadı: karışık bir liste kendini anlatır, kuralını anlatmasına gerek yok. */}
          {/* Başlık satırı `SectionHeading` DEĞİL: ürün detayın bant başlıkları tasarımda 25 px ve
              bağlantı altı çizili bir metin — ortak başlık 28 px'lik ana sayfa ölçüsünü taşıyor. */}
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-page-title-sm text-ink">{t.similar}</h2>
            <Link href="/catalog" className="cursor-pointer font-sans text-control font-semibold text-olive underline hover:text-olive-dark">
              {t.similarAll}
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-[18px]">
            {/* Kart katalogla ortak; `priceFrom` notu geçilmez, "boy detayda seçilir" bilgisini kartın kendi düğmesi veriyor. */}
            {product.similar.map((p) => (
              <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.card, priceFrom: undefined }} />
            ))}
          </div>
        </Band>
      )}
    </div>
  );
}
