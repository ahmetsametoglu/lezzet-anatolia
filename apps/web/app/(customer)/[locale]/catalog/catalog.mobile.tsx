import { CATALOG_SORTS } from '@lezzet/types';
import { EmptyState, FilterChip } from '@/components/customer/ui/filter-controls';
import { SortSelect } from '@/components/customer/ui/sort-select';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { LoadMore } from '@/components/customer/ui/load-more';
import { SCROLL_STRIP } from '@/components/customer/ui/scroll-strip';
import { SearchField } from '@/components/customer/ui/search-field';
import type { CatalogViewProps } from './catalog-types';
import { CartBar } from '@/components/customer/cart/cart-bar';

/**
 * Katalog — mobil düzeni (tasarım: `Musteri - Katalog.dc.html`, "Katalog Mobil").
 * Çipler yatay kaydırılan tek şerit, ürünler iki sütun. Tek elle gezme ve hızlı ekleme ana
 * kullanımdır (`musteri-katalog.md §7`) — bu yüzden süzgeçler başparmağın erişebildiği üst şeritte,
 * sıralama sonuç satırının hemen altında kalır.
 */
export function CatalogMobile({ t, locale, data, products, hasMore, loadingMore, onLoadMore, active, hrefFor, search }: CatalogViewProps) {
  return (
    <div className="flex flex-col pb-24">
      <section className="flex flex-col gap-3 px-4 pt-5 pb-3">
        <h1 className="font-serif text-page-title-sm text-ink">{data.activeCategory?.name ?? t.title}</h1>
        {/* Arama başlığın ALTINDA, tam genişlikte: dar ekranda başlıkla yan yana sığmaz. */}
        <SearchField placeholder={t.searchPlaceholder} clearLabel={t.searchClear} defaultValue={search} fullWidth />
      </section>

      <div className={`${SCROLL_STRIP} gap-2 px-4`}>
        <FilterChip label={t.all} href={hrefFor({ category: null })} active={!active.category} compact />
        {data.categories.map((c) => (
          <FilterChip key={c.id} label={c.name} href={hrefFor({ category: c.slug })} active={active.category === c.slug} compact />
        ))}
      </div>

      {/* Sonuç sayısı + süzgeç + sıralama TEK SATIR (tasarım). İki satıra bölmek dar ekranda
          ürünleri katlama aşağı iter; mobilde dikey yer en kıt kaynaktır. Bölünmesinin sebebi
          uzun etiketti — çare yerleşimi değiştirmek değil, mobilin kendi kısa metnini kullanmaktı. */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <span className="font-sans text-note text-muted">{t.count.replace('{n}', String(data.total))}</span>
        <span className="flex-1" />
        <FilterChip
          label={t.onlyShippableShort}
          href={hrefFor({ onlyShippable: !active.onlyShippable })}
          active={active.onlyShippable}
          tone="place"
          size="control"
          compact
        />
        <FilterChip label={t.onlyOffersShort} href={hrefFor({ onlyOffers: !active.onlyOffers })} active={active.onlyOffers} tone="offer" size="control" compact />
        <SortSelect
          label={t.sortLabel}
          currentLabel={t.sort[active.sort]}
          options={CATALOG_SORTS.map((s) => ({ label: t.sort[s], href: hrefFor({ sort: s }), active: active.sort === s }))}
          compact
        />
      </div>

      {products.length === 0 ? (
        <div className="px-4 pb-8">
          <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🔍" />
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 px-4 pt-1 pb-8">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.card, limit: null }} compact />
          ))}
        </section>
      )}

      <div className="px-4">
        <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} label={t.loadMore} loadingLabel={t.loading} />
      </div>

      {/* K21 — listeden ekleme yapıldıkça toplam burada canlı güncellenir. */}
      <CartBar locale={locale} />
    </div>
  );
}
