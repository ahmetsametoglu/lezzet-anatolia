import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/customer/ui/badge';
import { SectionHeading } from '@/components/customer/ui/section';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { Declaration } from './components/declaration';
import { Gallery } from './components/gallery';
import { PurchasePanel } from './components/purchase-panel';
import { Reviews } from './components/reviews';
import type { ProductViewProps } from './product-types';

/**
 * Ürün detay — mobil düzeni (tasarım: `Musteri - Urun Detay.dc.html`, "Mobil").
 * Tek sütun: geri → galeri → başlık → satın alma → beyan → benzer ürünler.
 *
 * Mobil bu sayfanın ASIL biçimi: sosyal medya ve WhatsApp trafiği doğrudan buraya düşer, sayfa tek
 * başına ilk izlenim olabilir (`musteri-urun-detay.md §7`).
 *
 * Tasarımdaki akordeonlar bugün AÇIK: beyanlar satın alma öncesi erişilebilir olmak zorunda ve
 * kapanma durumunu taşıyacak bir client katmanı, bugün hiçbir şey kazandırmadan sayfayı bölerdi.
 * Kapanma davranışı, sayfa uzayınca (yorum bölümü geldiğinde) eklenir — başlıklar zaten görünür
 * olduğu için erişilebilirlik o zaman da bozulmaz.
 */
export function ProductMobile({ t, locale, product, selected, onSelect }: ProductViewProps) {
  return (
    <div className="flex flex-col">
      <nav className="px-4 pt-4">
        <Link href="/catalog" className="font-sans text-body-sm font-bold text-olive">
          {t.back}
        </Link>
      </nav>

      <section className="flex flex-col gap-4 px-4 pt-3 pb-7">
        <Gallery images={product.gallery} alt={product.name} compact />

        <div className="flex flex-col gap-1.5">
          {product.category && (
            <span className="font-sans text-eyebrow-sm text-olive uppercase">{product.category.name}</span>
          )}
          <h1 className="font-serif text-page-title-sm text-ink">{product.name}</h1>
          {/* Stok rozeti SEÇİLİ boyu anlatır — butonla çelişmemesi için. */}
          {selected && <Badge tone={selected.soldOut ? 'closed' : 'positive'}>{selected.soldOut ? t.soldOut : t.inStock}</Badge>}
        </div>

        {product.description && <p className="font-sans text-body text-body">{product.description}</p>}

        {selected && (
          <PurchasePanel t={t} locale={locale} variants={product.variants} selected={selected} onSelect={onSelect} compact />
        )}

        <div className="flex flex-col gap-1.5 rounded-soft bg-sand-100 px-4 py-3 font-sans text-note text-body">
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

        <Declaration t={t} locale={locale} declaration={product.declaration} netWeightG={selected?.netWeightG ?? null} compact />

        <Reviews t={t} compact />
      </section>

      {product.similar.length > 0 && (
        <section className="flex flex-col gap-4 bg-cream-deep px-4 py-7">
          <SectionHeading title={t.similar} compact />
          <div className="grid grid-cols-2 gap-3">
            {product.similar.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                locale={locale}
                labels={t.card}
                compact
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
