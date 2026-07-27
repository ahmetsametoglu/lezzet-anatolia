import { CATALOG_SORTS } from '@/lib/storefront/storefront-types';
import { EmptyState, FilterChip, SortSelect } from '@/components/customer/ui/filter-controls';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import type { CatalogViewProps } from './catalog-types';

/**
 * Katalog — masaüstü düzeni (tasarım: `Musteri - Katalog.dc.html`, "Katalog Web").
 * Başlık → kategori çipleri → sonuç sayısı + süzgeç/sıralama → 4 sütun ürün ızgarası.
 *
 * Koleksiyon görünümünde yalnız BAŞLIK BANDI değişir, gerisi aynıdır (tasarımdaki "Durum:
 * koleksiyon görünümü" varyantı) — ayrı sayfa açılmaz.
 */
export function CatalogDesktop({ t, locale, data, active, hrefFor }: CatalogViewProps) {
  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-5 px-12 pt-9 pb-5">
        {data.activeCategory && <span className="font-sans text-eyebrow text-olive uppercase">{t.collection}</span>}
        <h1 className="font-serif text-page-title text-ink">{data.activeCategory?.name ?? t.title}</h1>

        <div className="flex flex-wrap gap-2.5">
          <FilterChip label={t.all} href={hrefFor({ category: null })} active={!active.category} />
          {data.categories.map((c) => (
            <FilterChip key={c.id} label={c.name} href={hrefFor({ category: c.slug })} active={active.category === c.slug} />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-sans text-note text-muted">{t.count.replace('{n}', String(data.total))}</span>
          <span className="flex-1" />
          <FilterChip label={t.onlyOffers} href={hrefFor({ onlyOffers: !active.onlyOffers })} active={active.onlyOffers} tone="offer" />
          <SortSelect
            label={t.sortLabel}
            options={CATALOG_SORTS.map((s) => ({ label: t.sort[s], href: hrefFor({ sort: s }), active: active.sort === s }))}
          />
        </div>
      </section>

      {data.products.length === 0 ? (
        <div className="px-12 pb-12">
          <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🔍" />
        </div>
      ) : (
        <section className="grid grid-cols-4 gap-[18px] px-12 pt-1 pb-12">
          {data.products.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.card, limit: null }} />
          ))}
        </section>
      )}
    </div>
  );
}
