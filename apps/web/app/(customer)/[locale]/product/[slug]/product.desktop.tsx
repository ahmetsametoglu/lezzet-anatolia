import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { DeliveryLine } from '@/components/customer/delivery/delivery-line';
import { StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import { Badge } from '@/components/customer/ui/badge';
import { SectionHeading } from '@/components/customer/ui/section';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { Declaration } from './components/declaration';
import { FamilyBlock } from './components/family-block';
import { Gallery } from './components/gallery';
import { PurchaseBar, VariantPicker } from './components/purchase-panel';
import { Reviews } from './components/reviews';
import type { ProductViewProps } from './product-types';

/**
 * Ürün detay — masaüstü düzeni (tasarım: `Musteri - Urun Detay.dc.html`, "Web").
 * Breadcrumb → iki sütun (galeri | satın alma) → beyan + yorumlar (1.2fr/1fr) → benzer ürünler.
 *
 * Alt ızgara tasarımdaki oranı korur. Yorum bölümü bugün yalnız boş hâliyle var ama YİNE DE çizilir:
 * kaldırılırsa beyan sütunu tek başına uzar, sağ taraf boşluk olarak kalır ve sayfa dengesizleşir —
 * tasarımın iki sütunlu ritmi de bozulur.
 */
export function ProductDesktop({ t, locale, product, selected, onSelect, familyLabel, unavailable, reviews }: ProductViewProps) {
  return (
    <div className="flex flex-col">
      <nav className="flex gap-1.5 px-12 pt-5 font-sans text-body-sm text-muted">
        <Link href="/catalog" className="font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
        {product.category && <span>· {product.category.name}</span>}
        <span>· {product.name}</span>
      </nav>

      <section className="grid grid-cols-2 gap-12 px-12 pt-6 pb-11">
        <Gallery images={product.gallery} alt={product.name} />

        <div className="flex flex-col gap-4.5">
          <div className="flex flex-col gap-2">
            {product.category && (
              <span className="font-sans text-eyebrow text-olive uppercase">{product.category.name}</span>
            )}
            <h1 className="font-serif text-page-title text-ink">{product.name}</h1>
            {/* Stok rozeti SEÇİLİ boyu anlatır: bir boy tükenmişken "Stokta" yazmak, butonu
                "Tükendi" gösteren aynı ekranda kendi kendini yalanlar.
                Yere bağlı iki hâlde (kargoyla / bölgenizde yok) rozetin yerini YER İŞARETİ alır:
                orada da yeşil "Stokta" yazmak, hemen altındaki kutuyla çelişirdi (19.7). */}
            {selected &&
              (selected.stockStatus === 'available' || selected.stockStatus === 'out_of_stock' ? (
                <Badge tone={selected.soldOut ? 'closed' : 'positive'}>{selected.soldOut ? t.soldOut : t.inStock}</Badge>
              ) : (
                <StockMark status={selected.stockStatus} locale={locale} />
              ))}
          </div>

          {product.description && <p className="font-sans text-lead text-body">{product.description}</p>}

          {/* Çeşit bloğu boy seçicinin ÜSTÜNDE: karar sırası "hangisi? → hangi boy?" (`§1b`). */}
          <FamilyBlock t={t.family} locale={locale} members={product.family} currentUnavailable={unavailable} />

          {selected && (
            <>
              <VariantPicker t={t} locale={locale} variants={product.variants} selected={selected} onSelect={onSelect} familyLabel={familyLabel} />
              <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} />
            </>
          )}

          {/* Kargo kısıtı sepete eklemeden ÖNCE görünür (`musteri-urun-detay.md §2`). Teslimat yeri
              biliniyorsa somut konuşur; bilinmiyorsa tasarımın genel vaatleri kalır. */}
          <DeliveryLine
            locale={locale}
            shippable={product.shippable}
            status={selected?.stockStatus}
            fallback={t.assurance}
            blockedActions={
              selected?.stockStatus === 'elsewhere' ? (
                /* "Bölgenizde şu an yok" hâlinin BİRİNCİL eylemi (tasarım): sepete ekleme yolu
                   yukarıda açık kalır, buradaki düğme bekleyişi kaydeder. */
                <StockNoticeButton variantId={selected.id} productName={product.name} locale={locale} emphasis="panel" />
              ) : (
                <Link href={{ pathname: '/catalog', query: { shippable: '1' } }} className={buttonClass({ size: 'sm', className: '!text-note' })}>
                  {t.assurance.seeShippable}
                </Link>
              )
            }
          />
        </div>
      </section>

      <section className="grid grid-cols-[1.2fr_1fr] gap-10 px-12 pb-11">
        <Declaration t={t} locale={locale} declaration={product.declaration} netWeightG={selected?.netWeightG ?? null} />
        <Reviews t={t} locale={locale} productId={product.id} productName={product.name} data={reviews} />
      </section>

      {product.similar.length > 0 && (
        <section className="flex flex-col gap-5 bg-cream-deep px-12 py-11">
          {/* Açıklama satırı YOK. Bir süre "aile üyeleri burada tekrar edilmez" yazıyordu; kural
              değişti (04.08 — her aileden bir temsilci gelebilir) ve cümle yalan oldu. Yerine
              yenisi konmadı: karışık bir liste kendini anlatır, kuralını anlatmasına gerek yok. */}
          <SectionHeading
            title={t.similar}
            action={product.category ? { label: `${product.category.name} →`, href: { pathname: '/catalog', query: { category: product.category.slug } } } : undefined}
          />
          <div className="grid grid-cols-4 gap-6">
            {product.similar.map((p) => (
              <ProductCard key={p.id} product={p} locale={locale} labels={t.card} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
