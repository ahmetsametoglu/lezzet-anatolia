import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/customer/ui/badge';
import { SectionHeading } from '@/components/customer/ui/section';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { Declaration } from './components/declaration';
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
export function ProductDesktop({ t, locale, product, selected, onSelect }: ProductViewProps) {
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
                "Tükendi" gösteren aynı ekranda kendi kendini yalanlar. */}
            {selected && <Badge tone={selected.soldOut ? 'closed' : 'positive'}>{selected.soldOut ? t.soldOut : t.inStock}</Badge>}
          </div>

          {product.description && <p className="font-sans text-lead text-body">{product.description}</p>}

          {selected && (
            <>
              <VariantPicker t={t} locale={locale} variants={product.variants} selected={selected} onSelect={onSelect} />
              <PurchaseBar t={t} selected={selected} />
            </>
          )}

          {/* Kargo kısıtı sepete eklemeden ÖNCE görünür (`musteri-urun-detay.md §2`). */}
          <div className="flex flex-wrap gap-5 rounded-soft bg-sand-100 px-4.5 py-3.5 font-sans text-control font-normal text-body">
            {product.shippable ? (
              <>
                <span>{t.assurance.coldChain}</span>
                <span>{t.assurance.doorstep}</span>
                <span>{t.assurance.shippable}</span>
              </>
            ) : (
              <span>{t.assurance.notShippable}</span>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[1.2fr_1fr] gap-10 px-12 pb-11">
        <Declaration t={t} locale={locale} declaration={product.declaration} netWeightG={selected?.netWeightG ?? null} />
        <Reviews t={t} />
      </section>

      {product.similar.length > 0 && (
        <section className="flex flex-col gap-5 bg-cream-deep px-12 py-11">
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
