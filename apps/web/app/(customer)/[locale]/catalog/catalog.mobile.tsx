import { CATALOG_SORTS } from '@/lib/storefront/storefront-types';
import { EmptyState, FilterChip, SortSelect } from '@/components/customer/ui/filter-controls';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import type { CatalogViewProps } from './catalog-types';

/**
 * Katalog — mobil düzeni (tasarım: `Musteri - Katalog.dc.html`, "Katalog Mobil").
 * Çipler yatay kaydırılan tek şerit, ürünler iki sütun. Tek elle gezme ve hızlı ekleme ana
 * kullanımdır (`musteri-katalog.md §7`) — bu yüzden süzgeçler başparmağın erişebildiği üst şeritte,
 * sıralama sonuç satırının hemen altında kalır.
 */
export function CatalogMobile({ t, locale, data, active, hrefFor }: CatalogViewProps) {
  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-3 px-4 pt-5 pb-3">
        <h1 className="font-serif text-page-title-sm text-ink">{data.activeCategory?.name ?? t.title}</h1>
      </section>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        <FilterChip label={t.all} href={hrefFor({ category: null })} active={!active.category} />
        {data.categories.map((c) => (
          <FilterChip key={c.id} label={c.name} href={hrefFor({ category: c.slug })} active={active.category === c.slug} />
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <span className="font-sans text-body-sm text-muted">{t.count.replace('{n}', String(data.total))}</span>
        <FilterChip label={t.onlyOffers} href={hrefFor({ onlyOffers: !active.onlyOffers })} active={active.onlyOffers} tone="offer" size="control" />
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        <SortSelect
          label={t.sortLabel}
          currentLabel={t.sort[active.sort]}
          options={CATALOG_SORTS.map((s) => ({ label: t.sort[s], href: hrefFor({ sort: s }), active: active.sort === s }))}
        />
      </div>

      {data.products.length === 0 ? (
        <div className="px-4 pb-8">
          <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🔍" />
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 px-4 pt-1 pb-8">
          {data.products.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.card, limit: null }} compact />
          ))}
        </section>
      )}
    </div>
  );
}
